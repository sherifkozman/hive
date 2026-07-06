import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HomeContext } from './paths.js';
import { joinHome } from './paths.js';
import { PathGuard } from './guard.js';
import { chmod, cp, mkdir, rm, writeFile } from './fsops.js';
import { INSTALLER_VERSION } from '../version.js';

/**
 * A single backed-up file. `mode` and the top-level `roots`/`emptyDirs`
 * fields on Manifest are additive extensions beyond the literal schema
 * quoted in spec §8 (`{relPath, absPath, sha256, size}` /
 * `{createdAt, installerVersion, label, entries, absent}`) — they're
 * required to satisfy "preserve file mode bits", "handle empty dirs",
 * and a true byte-identical restore (see restore() below). Documented as
 * a deviation in the task handoff.
 */
export interface ManifestEntry {
  relPath: string;
  absPath: string;
  sha256: string;
  size: number;
  mode: number;
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

function backupsRoot(ctx: HomeContext): string {
  return joinHome(ctx, '.hive-skills', 'backups');
}

function defaultGuard(ctx: HomeContext): PathGuard {
  return new PathGuard([ctx.home]);
}

function makeBackupId(label: string, now: Date): string {
  // ISO8601 with milliseconds, colon-free (filesystem-safe on every platform).
  const safeIso = now.toISOString().replace(/:/g, '-');
  return `${safeIso}-${label}`;
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
    sha256: await sha256Of(buf),
    size: st.size,
    mode: st.mode & 0o777,
  });
}

async function snapshotDir(
  ctx: HomeContext,
  guard: PathGuard,
  srcDir: string,
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
    // v0.1: symlinks inside a snapshotted tree are neither followed nor
    // copied (documented assumption — no test coverage for symlinked
    // skill content today; revisit if that becomes a real scenario).
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await snapshotDir(ctx, guard, abs, payloadRoot, entries, emptyDirs);
    } else if (entry.isFile()) {
      await snapshotFile(ctx, guard, abs, payloadRoot, entries);
    }
  }
}

/**
 * Snapshot `paths` (files or directories, absolute) into
 * ~/.hive-skills/backups/<ISO8601-no-colons>-<label>/. Paths that don't
 * exist are recorded in `manifest.absent` rather than throwing — this is
 * what lets restore() later remove a tree that install created.
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
      await snapshotDir(ctx, guard, resolved, payloadDir, entries, emptyDirs);
    } else if (st.isFile()) {
      await snapshotFile(ctx, guard, resolved, payloadDir, entries);
    } else {
      // Symlink or other special file passed directly as a snapshot root:
      // not supported in v0.1 (see snapshotDir's symlink note above).
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
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * Build (and optionally execute) the restore plan for backup `id`.
 *
 * A true byte-identical round-trip requires more than replaying
 * `entries`: any file created under a snapshotted *directory* root after
 * the snapshot (and not present in the manifest) must also be removed,
 * or the "restored" tree would still differ from what was captured. So
 * for every non-absent root, the plan also deletes any current file
 * under that root that isn't one of the manifest's entries.
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

  const mismatches: string[] = [];
  for (const entry of manifest.entries) {
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
      if (!entryAbsSet.has(currentFile)) extraDeletes.push(currentFile);
    }
  }

  const writes = manifest.entries.map((e) => ({ relPath: e.relPath, absPath: e.absPath }));
  const deletes = [...manifest.absent, ...extraDeletes];

  if (options.dryRun) {
    return { writes, deletes };
  }

  const guard = options.guard ?? defaultGuard(ctx);

  for (const relDir of manifest.emptyDirs ?? []) {
    await mkdir(guard, joinHome(ctx, ...relDir.split(path.sep)), { recursive: true });
  }

  for (const entry of manifest.entries) {
    const payloadFile = path.join(payloadRoot, entry.relPath);
    await cp(guard, payloadFile, entry.absPath, { recursive: false });
    await chmod(guard, entry.absPath, entry.mode ?? 0o644);
  }

  for (const absPath of manifest.absent) {
    await rm(guard, absPath, { recursive: true, force: true });
  }
  for (const extra of extraDeletes) {
    await rm(guard, extra, { recursive: true, force: true });
  }

  return { writes, deletes };
}
