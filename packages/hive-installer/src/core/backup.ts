import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HomeContext } from './paths.js';
import { joinHome } from './paths.js';
import { PathGuard } from './guard.js';
import { chmod, cp, mkdir, rm, symlink, writeFile } from './fsops.js';
import { INSTALLER_VERSION } from '../version.js';
import { computeInstalledTreeHash, readInstallManifest } from './installManifest.js';

/**
 * A single backed-up file or symlink. `type`/`target`/`mode` and the
 * top-level `roots`/`emptyDirs` fields on Manifest are additive
 * extensions beyond the literal schema quoted in spec §8
 * (`{relPath, absPath, sha256, size}` /
 * `{createdAt, installerVersion, label, entries, absent}`) — they're
 * required to reproduce symlinks and exec bits, handle empty dirs, and
 * give a true byte-identical restore (see restore() below).
 */
export interface ManifestEntry {
  relPath: string;
  absPath: string;
  type: 'file' | 'symlink';
  /** File mode bits (e.g. 0o755). 0 for symlink entries (mode is meaningless there). */
  mode: number;
  /**
   * For `type: 'file'`: sha256 of file content. For `type: 'symlink'`:
   * sha256 of the UTF-8 target string (there's no separate payload
   * artifact for a symlink to corrupt — the target is the manifest
   * itself — but hashing it uniformly keeps verification generic).
   */
  sha256: string;
  size: number;
  /** Only present for `type: 'symlink'`: the raw readlink() target. */
  target?: string;
}

export interface Manifest {
  createdAt: string;
  installerVersion: string;
  label: string;
  entries: ManifestEntry[];
  /** Absolute paths passed to snapshot() that did not exist at snapshot time. */
  absent: string[];
  /** Relative-to-home paths of directories that were empty at snapshot time. */
  emptyDirs: string[];
  /** Absolute paths passed to snapshot() (both present and absent ones). */
  roots: string[];
}

export interface SnapshotResult {
  id: string;
  dir: string;
  manifest: Manifest;
}

export interface RestorePlan {
  writes: Array<{ relPath: string; absPath: string }>;
  deletes: string[];
}

export interface RestoreOptions {
  dryRun?: boolean;
  force?: boolean;
  guard?: PathGuard;
}

export interface SnapshotOptions {
  guard?: PathGuard;
}

export interface BackupListEntry {
  id: string;
  label?: string;
  createdAt?: string;
  installerVersion?: string;
  entryCount: number;
  valid: boolean;
}

export class RestoreVerificationError extends Error {
  readonly backupId: string;
  readonly mismatchedRelPaths: string[];

  constructor(backupId: string, mismatchedRelPaths: string[]) {
    super(
      `Backup "${backupId}" failed payload verification for: ${mismatchedRelPaths.join(', ')}. ` +
        'Pass { force: true } to restore anyway.',
    );
    this.name = 'RestoreVerificationError';
    this.backupId = backupId;
    this.mismatchedRelPaths = mismatchedRelPaths;
  }
}

/**
 * Thrown when restore() would need to delete a path recorded as
 * `absent` (i.e. it didn't exist at snapshot time) but the path's
 * *current* content can't be confirmed safe to remove: either its
 * .hive-install.json tree hash no longer matches what's on disk
 * (possible manual edits since install), or there's no
 * .hive-install.json at all (the path may hold unrelated user data).
 */
export class RestoreDeletionRefusalError extends Error {
  readonly absPath: string;
  readonly reason: 'tree-hash-mismatch' | 'no-install-manifest';

  constructor(absPath: string, reason: 'tree-hash-mismatch' | 'no-install-manifest') {
    super(
      `Refusing to delete "${absPath}" during restore: ` +
        (reason === 'tree-hash-mismatch'
          ? 'its current contents no longer match the recorded .hive-install.json tree hash (possible manual edits).'
          : 'no .hive-install.json manifest was found there — treating it as user data.') +
        ' Pass { force: true } to override.',
    );
    this.name = 'RestoreDeletionRefusalError';
    this.absPath = absPath;
    this.reason = reason;
  }
}

function backupsRoot(ctx: HomeContext): string {
  return joinHome(ctx, '.hive-skills', 'backups');
}

function defaultGuard(ctx: HomeContext): PathGuard {
  return new PathGuard([ctx.home]);
}

function randomSuffix(): string {
  return randomBytes(2).toString('hex'); // 4 hex chars
}

function makeBackupId(label: string, now: Date): string {
  // ISO8601 with milliseconds, colon-free (filesystem-safe on every
  // platform), plus a random suffix so two snapshots landing in the same
  // millisecond (e.g. concurrent calls) never collide.
  const safeIso = now.toISOString().replace(/:/g, '-');
  return `${safeIso}-${label}-${randomSuffix()}`;
}

async function sha256Of(buf: Uint8Array): Promise<string> {
  return createHash('sha256').update(buf).digest('hex');
}

async function snapshotFile(
  ctx: HomeContext,
  guard: PathGuard,
  absFile: string,
  payloadRoot: string,
  entries: ManifestEntry[],
): Promise<void> {
  const relPath = path.relative(ctx.home, absFile);
  const [buf, st] = await Promise.all([fs.readFile(absFile), fs.stat(absFile)]);
  const dest = path.join(payloadRoot, relPath);
  await cp(guard, absFile, dest, { recursive: false });
  entries.push({
    relPath,
    absPath: absFile,
    type: 'file',
    sha256: await sha256Of(buf),
    size: st.size,
    mode: st.mode & 0o777,
  });
}

/** Is resolvedTarget equal to or nested under resolvedRoot? Both must already be resolved. */
function isWithinRoot(resolvedTarget: string, resolvedRoot: string): boolean {
  if (resolvedTarget === resolvedRoot) return true;
  const withSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return resolvedTarget.startsWith(withSep);
}

/**
 * Does the symlink at `absLink` resolve to somewhere at-or-inside
 * `snapshotRoot`? Broken symlinks (unresolvable) are treated as
 * "outside" — they're skipped, matching the historical no-follow policy
 * for anything we can't safely reason about.
 */
async function symlinkResolvesInsideRoot(absLink: string, snapshotRoot: string): Promise<boolean> {
  let real: string;
  try {
    real = await fs.realpath(absLink);
  } catch {
    return false;
  }
  const realRoot = await fs.realpath(snapshotRoot).catch(() => snapshotRoot);
  return isWithinRoot(real, realRoot);
}

async function snapshotSymlink(
  ctx: HomeContext,
  absLink: string,
  snapshotRoot: string,
  entries: ManifestEntry[],
): Promise<void> {
  // Symlinks whose resolution stays inside the snapshot root are
  // captured and restored as symlinks; symlinks resolving outside (or
  // broken ones) remain skipped — a symlink is a pointer we don't own,
  // and capturing one that escapes the tree we were asked to back up
  // could otherwise smuggle an arbitrary path into the manifest.
  if (!(await symlinkResolvesInsideRoot(absLink, snapshotRoot))) return;

  const relPath = path.relative(ctx.home, absLink);
  const target = await fs.readlink(absLink);
  const contentForHash = Buffer.from(target, 'utf8');
  entries.push({
    relPath,
    absPath: absLink,
    type: 'symlink',
    target,
    mode: 0,
    size: contentForHash.length,
    sha256: await sha256Of(contentForHash),
  });
}

async function snapshotDir(
  ctx: HomeContext,
  guard: PathGuard,
  srcDir: string,
  snapshotRoot: string,
  payloadRoot: string,
  entries: ManifestEntry[],
  emptyDirs: string[],
): Promise<void> {
  let dirEntries;
  try {
    dirEntries = await fs.readdir(srcDir, { withFileTypes: true });
  } catch {
    return;
  }

  if (dirEntries.length === 0) {
    const relDir = path.relative(ctx.home, srcDir);
    emptyDirs.push(relDir);
    await mkdir(guard, path.join(payloadRoot, relDir), { recursive: true });
    return;
  }

  for (const entry of dirEntries) {
    const abs = path.join(srcDir, entry.name);
    if (entry.isSymbolicLink()) {
      await snapshotSymlink(ctx, abs, snapshotRoot, entries);
    } else if (entry.isDirectory()) {
      await snapshotDir(ctx, guard, abs, snapshotRoot, payloadRoot, entries, emptyDirs);
    } else if (entry.isFile()) {
      await snapshotFile(ctx, guard, abs, payloadRoot, entries);
    }
  }
}

/**
 * Snapshot `paths` (files, directories, or symlinks — absolute) into
 * ~/.hive-skills/backups/<ISO8601-no-colons>-<label>-<4charsuffix>/.
 * Paths that don't exist are recorded in `manifest.absent` rather than
 * throwing — this is what lets restore() later remove a tree that
 * install created.
 */
export async function snapshot(
  ctx: HomeContext,
  label: string,
  paths: string[],
  options: SnapshotOptions = {},
): Promise<SnapshotResult> {
  const guard = options.guard ?? defaultGuard(ctx);
  const now = new Date();
  const id = makeBackupId(label, now);
  const backupDir = path.join(backupsRoot(ctx), id);
  const payloadDir = path.join(backupDir, 'payload');

  await mkdir(guard, payloadDir, { recursive: true });

  const entries: ManifestEntry[] = [];
  const absent: string[] = [];
  const emptyDirs: string[] = [];
  const roots: string[] = [];

  for (const targetPath of paths) {
    const resolved = path.resolve(targetPath);
    roots.push(resolved);

    let st;
    try {
      st = await fs.lstat(resolved);
    } catch {
      absent.push(resolved);
      continue;
    }

    if (st.isDirectory()) {
      await snapshotDir(ctx, guard, resolved, resolved, payloadDir, entries, emptyDirs);
    } else if (st.isFile()) {
      await snapshotFile(ctx, guard, resolved, payloadDir, entries);
    } else {
      // A symlink (or other special file, e.g. socket/FIFO/device)
      // passed directly as a snapshot root: not supported in v0.1 — a
      // root-level symlink has no enclosing "snapshot root" to stay
      // inside of, so there's no containment check that would make the
      // "capture only if it resolves inside" policy meaningful here.
      absent.push(resolved);
    }
  }

  const manifest: Manifest = {
    createdAt: now.toISOString(),
    installerVersion: INSTALLER_VERSION,
    label,
    entries,
    absent,
    emptyDirs,
    roots,
  };

  await writeFile(
    guard,
    path.join(backupDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  return { id, dir: backupDir, manifest };
}

export async function listBackups(ctx: HomeContext): Promise<BackupListEntry[]> {
  const root = backupsRoot(ctx);
  let dirEntries;
  try {
    dirEntries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: BackupListEntry[] = [];
  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, 'manifest.json');
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as Manifest;
      out.push({
        id: entry.name,
        label: manifest.label,
        createdAt: manifest.createdAt,
        installerVersion: manifest.installerVersion,
        entryCount: manifest.entries.length,
        valid: true,
      });
    } catch {
      out.push({ id: entry.name, entryCount: 0, valid: false });
    }
  }

  out.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return out;
}

async function listCurrentFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listCurrentFiles(abs)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * Build (and, unless dryRun, execute) the restore plan for backup `id`.
 *
 * Ordering / safety (spec §9, task handoff items 2 & 4 of the plan-review
 * round):
 *  1. Verify sha256 of every file-type payload entry BEFORE any mutation
 *     (fail fast — a corrupt backup must not cause a half-applied restore).
 *  2. Verify it's safe to delete every `absent` root BEFORE any mutation
 *     too: if the path currently exists, its .hive-install.json tree hash
 *     must match reality (or, lacking a manifest, it's treated as
 *     unrelated user data) — otherwise refuse unless force:true.
 *  3. Apply writes (files + symlinks + empty dirs).
 *  4. Apply deletes LAST: `absent` roots, then any stray file created
 *     under a *kept* root after the snapshot (byte-identical round-trip).
 *
 * TODO(install-engine task): this restore() treats every file entry
 * uniformly (payload hash must match, or force:true). A pointer/rules
 * file (AGENTS.md, GEMINI.md, global_rules.md, ...) is different in kind
 * — the *live* file may have been edited by the user, or by hand-editing
 * around Hive's managed block, since the backup was taken. Restoring
 * over such a file when its current content differs from both the
 * backed-up content AND Hive's expected managed-block shape should
 * require force:true with a clearer, pointer-specific error (not just
 * the generic RestoreVerificationError, which is about payload
 * corruption, not user edits). That "managed block" concept doesn't
 * exist yet in this codebase — it's introduced by the install engine
 * (a later task) — so this is intentionally out of scope here.
 */
export async function restore(
  ctx: HomeContext,
  id: string,
  options: RestoreOptions = {},
): Promise<RestorePlan> {
  const backupDir = path.join(backupsRoot(ctx), id);
  const manifestPath = path.join(backupDir, 'manifest.json');
  const payloadRoot = path.join(backupDir, 'payload');

  let manifest: Manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Manifest;
  } catch {
    throw new Error(`Backup not found: "${id}" (no manifest at ${manifestPath})`);
  }

  // --- 1. Verify payload integrity for every file entry, up front. ---
  const mismatches: string[] = [];
  for (const entry of manifest.entries) {
    if (entry.type !== 'file') continue;
    const payloadFile = path.join(payloadRoot, entry.relPath);
    let buf: Buffer;
    try {
      buf = await fs.readFile(payloadFile);
    } catch {
      mismatches.push(entry.relPath);
      continue;
    }
    if ((await sha256Of(buf)) !== entry.sha256) {
      mismatches.push(entry.relPath);
    }
  }
  if (mismatches.length > 0 && !options.force) {
    throw new RestoreVerificationError(id, mismatches);
  }

  // --- 2. Verify it's safe to delete every absent root, up front. ---
  if (!options.force) {
    for (const absPath of manifest.absent) {
      let st;
      try {
        st = await fs.lstat(absPath);
      } catch {
        continue; // already gone; nothing to refuse
      }
      if (st.isDirectory()) {
        const installManifest = await readInstallManifest(absPath);
        if (!installManifest) {
          throw new RestoreDeletionRefusalError(absPath, 'no-install-manifest');
        }
        const currentHash = await computeInstalledTreeHash(absPath);
        if (currentHash !== installManifest.treeSha256) {
          throw new RestoreDeletionRefusalError(absPath, 'tree-hash-mismatch');
        }
      } else {
        // A file (or symlink) absent-entry has no .hive-install.json
        // concept to check against — treat conservatively as user data.
        throw new RestoreDeletionRefusalError(absPath, 'no-install-manifest');
      }
    }
  }

  // --- Build the plan (read-only from here until the dryRun check). ---
  const entryAbsSet = new Set(manifest.entries.map((e) => e.absPath));
  const extraDeletes: string[] = [];
  for (const root of manifest.roots ?? []) {
    if (manifest.absent.includes(root)) continue;
    let st;
    try {
      st = await fs.lstat(root);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const currentFile of await listCurrentFiles(root)) {
      if (entryAbsSet.has(currentFile)) continue;
      // A symlink whose target escapes the snapshot root was intentionally
      // NOT captured by snapshotDir (containment rule), so it is not an
      // "extra" post-snapshot file — deleting it would destroy user data the
      // backup never owned (council review, run aa810191).
      const linkStat = await fs.lstat(currentFile).catch(() => undefined);
      if (linkStat?.isSymbolicLink() && !(await symlinkResolvesInsideRoot(currentFile, root))) {
        continue;
      }
      extraDeletes.push(currentFile);
    }
  }

  const writes = manifest.entries.map((e) => ({ relPath: e.relPath, absPath: e.absPath }));
  const deletes = [...manifest.absent, ...extraDeletes];

  if (options.dryRun) {
    return { writes, deletes };
  }

  const guard = options.guard ?? defaultGuard(ctx);

  // Defense-in-depth (council review, run aa810191): manifest.json is an
  // on-disk file that could be hand-edited or crafted. Every mutation below
  // already flows through `guard`, but validate the *entire* target set up
  // front so a rogue path fails before any partial mutation is applied,
  // rather than mid-way through the write loop.
  const allTargets = [
    ...(manifest.emptyDirs ?? []).map((d) => joinHome(ctx, ...d.split(path.sep))),
    ...manifest.entries.map((e) => e.absPath),
    ...deletes,
  ];
  for (const target of allTargets) {
    await guard.assertWritable(target);
  }

  // --- 3. Writes. ---
  for (const relDir of manifest.emptyDirs ?? []) {
    await mkdir(guard, joinHome(ctx, ...relDir.split(path.sep)), { recursive: true });
  }

  for (const entry of manifest.entries) {
    if (entry.type === 'symlink') {
      await symlink(guard, entry.target ?? '', entry.absPath);
      continue;
    }
    const payloadFile = path.join(payloadRoot, entry.relPath);
    await cp(guard, payloadFile, entry.absPath, { recursive: false });
    await chmod(guard, entry.absPath, entry.mode ?? 0o644);
  }

  // --- 4. Deletes, last. ---
  for (const absPath of manifest.absent) {
    await rm(guard, absPath, { recursive: true, force: true });
  }
  for (const extra of extraDeletes) {
    await rm(guard, extra, { recursive: true, force: true });
  }

  return { writes, deletes };
}
