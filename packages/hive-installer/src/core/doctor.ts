import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { HomeContext } from './paths.js';
import { joinHome } from './paths.js';
import {
  CLIENT_REGISTRY,
  resolveGlobalSkillLocation,
  resolvePayloadLocation,
  resolvePointerFile,
  resolveProjectPointerFile,
  type ClientRegistryEntry,
} from './registry.js';
import { detectClients } from './scanner.js';
import { PathGuard } from './guard.js';
import { computeInstalledTreeHash, INSTALL_MANIFEST_FILENAME, readInstallManifest } from './installManifest.js';
import { listBackups } from './backup.js';
import { getCatalogSkill, type Catalog } from './catalog.js';
import { isOlderVersion, isValidSemver } from './semver.js';
import { MANAGED_BLOCK_END, MANAGED_BLOCK_START } from './pointer.js';
import { BUNDLE_GENERATED_MARKER } from './bundleMarker.js';
import { selectPackingMode, type PackingMode } from './packing.js';

const execFileAsync = promisify(execFile);

/**
 * doctor() (spec §7): a battery of health checks, each independently
 * `ok` | `warn` | `fail`. Only `fail` findings flip the process exit
 * code — everything else (missing optional python3, drifted/stale
 * installs, corrupt backups) is advisory. See each check* function below
 * for which category a given finding lands in and why.
 */

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  exitCode: 0 | 1;
}

export interface DoctorPorts {
  /** Defaults to `() => process.version`. Test seam — real callers never override this. */
  nodeVersion?: () => string;
  /** Defaults to spawning `python3 --version`; resolves to raw stdout, or undefined if not found. Test seam. */
  probePython?: () => Promise<string | undefined>;
}

export interface DoctorOptions {
  registry?: readonly ClientRegistryEntry[];
  /** Default true (spawns `python3 --version`). false skips the probe entirely (recorded as warn: skipped). */
  python?: boolean;
  /**
   * The bundled skill catalog (assets/manifest.json). Not in the literal
   * spec §7 checklist, but required to compare an installed skill's
   * version against "the bundled catalog version" for the upgrade hint
   * (spec §7 item 6) — without it, that one sub-check is simply omitted
   * (every other check still runs). Same "explicit, never resolved
   * internally" seam as installer.ts's PlanInstallOptions.catalog.
   */
  catalog?: Catalog;
  /**
   * Project dir for resolving a payload-project-pointer client's (e.g.
   * cursor) project-level pointer file in the dangling-pointer-block
   * check below. Without it, only home-relative pointer files (gemini,
   * windsurf) are checked — matches planInstall's "no projectDir -> skip
   * gracefully" treatment of the same client family.
   */
  projectDir?: string;
  ports?: DoctorPorts;
}

const MIN_NODE_MAJOR = 18;
const MIN_PYTHON: readonly [number, number] = [3, 11];
// Re-exported for backward compatibility — this constant used to be defined
// here directly; it now lives in bundleMarker.ts (shared with installer.ts).
export { BUNDLE_GENERATED_MARKER };

// --- node ---------------------------------------------------------------

function parseNodeMajor(version: string): number | undefined {
  const match = /^v?(\d+)\./.exec(version.trim());
  return match?.[1] ? Number(match[1]) : undefined;
}

function checkNodeVersion(ports: DoctorPorts): DoctorCheck {
  const version = (ports.nodeVersion ?? (() => process.version))();
  const major = parseNodeMajor(version);

  if (major === undefined) {
    return { id: 'node-version', status: 'warn', detail: `Could not parse Node version "${version}"` };
  }
  if (major < MIN_NODE_MAJOR) {
    return {
      id: 'node-version',
      status: 'fail',
      detail: `Node ${version} detected; hive-skills requires >= ${MIN_NODE_MAJOR}`,
      fix: `Upgrade Node.js to >= ${MIN_NODE_MAJOR}`,
    };
  }
  return { id: 'node-version', status: 'ok', detail: `Node ${version}` };
}

// --- python3 (optional dep; never fails, per spec §7 item 2) ------------

async function defaultProbePython(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('python3', ['--version']);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

function parsePythonVersion(raw: string): [number, number, number] | undefined {
  const match = /Python\s+(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function checkPython(opts: DoctorOptions): Promise<DoctorCheck> {
  if (opts.python === false) {
    return { id: 'python3', status: 'warn', detail: 'python3 check skipped' };
  }

  const raw = await (opts.ports?.probePython ?? defaultProbePython)();
  if (raw === undefined) {
    return {
      id: 'python3',
      status: 'warn',
      detail: 'python3 not found (optional — needed for `hive.py lint`/`parity`/`compile`)',
      fix: `Install Python >= ${MIN_PYTHON.join('.')} to enable those checks/conversions.`,
    };
  }

  const parsed = parsePythonVersion(raw);
  if (!parsed) {
    return { id: 'python3', status: 'warn', detail: `Could not parse python3 version from "${raw}"` };
  }

  const [major, minor] = parsed;
  const meetsMin = major > MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor >= MIN_PYTHON[1]);
  if (!meetsMin) {
    return {
      id: 'python3',
      status: 'warn',
      detail: `${raw} found; hive.py needs >= ${MIN_PYTHON.join('.')} (optional dep)`,
      fix: `Upgrade to Python >= ${MIN_PYTHON.join('.')}.`,
    };
  }
  return { id: 'python3', status: 'ok', detail: raw };
}

// --- per detected client: readable config dir + writable skill location ---

async function pathReadable(p: string): Promise<boolean> {
  try {
    await fs.access(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Probe writability by actually writing (and immediately removing) a
 * temp file. If `dir` itself didn't exist yet, it's removed again after
 * the probe (best-effort) so `doctor` — a diagnostic command — doesn't
 * leave behind a persistent, empty side effect. This matters beyond
 * tidiness: checkClients() probes every detected client's skill/payload
 * location, and if that probe *created* the directory permanently, a
 * later check in the same doctor() run (checkPointerBlocks, which asks
 * "does this client's payload dir exist") would always see it as
 * present — silently defeating that check. Any newly-created *parent*
 * directories from a multi-level `mkdir(dir, {recursive:true})` are not
 * unwound (only `dir` itself); in practice a detected client's config
 * dir already exists, so `dir`'s immediate parent does too.
 */
async function probeWritable(guard: PathGuard, dir: string): Promise<boolean> {
  const existedBefore = await fs.stat(dir).then(
    () => true,
    () => false,
  );
  try {
    await guard.assertWritable(dir);
    await fs.mkdir(dir, { recursive: true });
    const probeFile = path.join(dir, `.hive-doctor-probe-${process.pid}-${Date.now()}`);
    await fs.writeFile(probeFile, '');
    await fs.unlink(probeFile);
    if (!existedBefore) {
      await fs.rmdir(dir).catch(() => {}); // best-effort; leave it if something else raced in
    }
    return true;
  } catch {
    return false;
  }
}

async function checkClients(ctx: HomeContext, registry: readonly ClientRegistryEntry[]): Promise<DoctorCheck[]> {
  const detected = await detectClients(ctx);
  const guard = new PathGuard([ctx.home]);
  const checks: DoctorCheck[] = [];

  for (const d of detected) {
    if (!d.detected) continue;
    const entry = registry.find((candidate) => candidate.id === d.id);
    if (!entry) continue;

    // Unreadable *detection evidence* is a warn, not a fail: the client stays
    // fully installable as long as its skill location works (checked below).
    // macOS TCC routinely blocks headless reads of ~/Documents-based evidence
    // paths even though they exist and detection matched on a sibling path.
    const readability = await Promise.all(
      d.matchedPaths.map(async (p) => ({ p, readable: await pathReadable(p) })),
    );
    const unreadable = readability.filter((r) => !r.readable).map((r) => r.p);
    checks.push({
      id: `client-readable:${entry.id}`,
      status: unreadable.length === 0 ? 'ok' : 'warn',
      detail:
        unreadable.length === 0
          ? `${entry.name}: config dir(s) readable`
          : `${entry.name}: detection-evidence path(s) not readable (${unreadable.join(', ')})`,
      ...(unreadable.length === 0
        ? {}
        : {
            fix:
              `Not blocking: the client was detected via its other paths. If this is macOS privacy ` +
              `protection (e.g. ~/Documents), grant your terminal Files access or ignore.`,
          }),
    });

    if (entry.strategy === 'scan-only') continue;

    const installDir =
      entry.strategy === 'payload-pointer' || entry.strategy === 'payload-project-pointer'
        ? resolvePayloadLocation(ctx, entry)
        : resolveGlobalSkillLocation(ctx, entry);
    if (!installDir) continue;

    const writable = await probeWritable(guard, installDir);
    checks.push({
      id: `client-writable:${entry.id}`,
      status: writable ? 'ok' : 'fail',
      detail: writable
        ? `${entry.name}: skill location writable (${installDir})`
        : `${entry.name}: skill location NOT writable (${installDir})`,
      ...(writable ? {} : { fix: `Check permissions on ${installDir}` }),
    });
  }

  return checks;
}

// --- per installed Hive skill ---------------------------------------------

/** `content` with a leading `---\n...\n---` YAML frontmatter block removed (or `content` unchanged if it doesn't open with one). */
function stripFrontmatter(content: string): string {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return content;
  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) return content;
  return lines.slice(endIdx + 1).join('\n');
}

async function checkOneInstalledSkill(
  entry: ClientRegistryEntry,
  skillDir: string,
  catalog: Catalog | undefined,
): Promise<DoctorCheck> {
  const id = `skill:${entry.id}:${path.basename(skillDir)}`;
  const manifest = await readInstallManifest(skillDir);

  if (!manifest) {
    return {
      id,
      status: 'warn',
      detail: `${entry.name}: ${path.basename(skillDir)} has no ${INSTALL_MANIFEST_FILENAME} (corrupted, or not a Hive-managed install)`,
      fix: `Re-install this skill, or remove ${skillDir} if it's unrelated.`,
    };
  }

  const issues: string[] = [];

  // Common to every packing mode: the tree hash covers whatever shape was
  // actually installed (inline SKILL.md + assets, or the full composable/
  // tree + shim) — installer.ts's virtual-hash computation mirrors
  // whichever shape planInstall chose, so this one check needs no
  // mode-awareness at all.
  if ((await computeInstalledTreeHash(skillDir)) !== manifest.treeSha256) {
    issues.push('tree modified since install');
  }

  // packing-modes.md v2 item 3: manifests written before this field
  // existed (every pre-0.2.0 install) carry no `packing` at all — the only
  // shape that ever existed then was `tree`, so that's the correct default.
  const packingMode: PackingMode = manifest.packing ?? 'tree';

  if (packingMode === 'bundle-inline') {
    // Inline installs have no composable/INDEX.md — check SKILL.md's body
    // (post-frontmatter content) is present and non-empty instead.
    const skillMdRaw = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8').catch(() => undefined);
    if (skillMdRaw === undefined) {
      issues.push('SKILL.md missing');
    } else if (stripFrontmatter(skillMdRaw).trim().length === 0) {
      issues.push('SKILL.md body is empty (frontmatter only)');
    }
  } else {
    const versionRaw = await fs.readFile(path.join(skillDir, 'composable', 'VERSION'), 'utf8').catch(() => undefined);
    if (versionRaw === undefined || !isValidSemver(versionRaw)) {
      issues.push(`VERSION missing or invalid (${versionRaw?.trim() ?? 'absent'})`);
    }

    const indexExists = await fs.access(path.join(skillDir, 'composable', 'INDEX.md')).then(
      () => true,
      () => false,
    );
    if (!indexExists) issues.push('composable/INDEX.md missing');

    const bundleRaw = await fs
      .readFile(path.join(skillDir, 'composable', 'BUNDLE.md'), 'utf8')
      .catch(() => undefined);
    if (bundleRaw === undefined) {
      issues.push('composable/BUNDLE.md missing');
    } else if (!bundleRaw.includes(BUNDLE_GENERATED_MARKER)) {
      issues.push('composable/BUNDLE.md missing the generated marker (hand-edited?)');
    }
  }

  let fix: string | undefined;
  if (catalog) {
    const catalogSkill = getCatalogSkill(catalog, manifest.skillName);
    if (catalogSkill) {
      if (isOlderVersion(manifest.skillVersion, catalogSkill.version)) {
        issues.push(`upgrade available: installed ${manifest.skillVersion}, bundled ${catalogSkill.version}`);
        fix = `Re-run install for "${manifest.skillName}" to upgrade to ${catalogSkill.version}.`;
      }

      // packing-modes.md v2 item 5: the "differs from current default"
      // hint fires ONLY on auto installs — an explicit `--packing` force
      // is a deliberate choice, not staleness. "Current default" here means
      // the CLI/wizard auto rule; programmatic planInstall callers that omit
      // opts.packing get legacy tree behavior on purpose, so their receipts
      // (packing recorded, forced false) and pre-0.2.0 receipts (no packing
      // field) both receive an ADVISORY hint phrased to make that explicit
      // rather than implying misconfiguration (council review 9b914712,
      // med #2).
      const packingForced = manifest.packingForced ?? false;
      if (!packingForced) {
        const currentDefault = selectPackingMode(catalogSkill, {}).mode;
        if (currentDefault !== packingMode) {
          const legacy = manifest.packing === undefined;
          issues.push(
            `packing: installed as ${packingMode}${legacy ? ' (pre-0.2.0 install)' : ''}; ` +
              `the CLI's auto rule would now choose ${currentDefault} for this skill`,
          );
          fix = fix ?? `Re-run install for "${manifest.skillName}" to switch to ${currentDefault} packing (optional).`;
        }
      }
    }
  }

  if (issues.length === 0) {
    return {
      id,
      status: 'ok',
      detail: `${entry.name}: hive-${manifest.skillName} v${manifest.skillVersion} healthy`,
    };
  }

  return {
    id,
    status: 'warn',
    detail: `${entry.name}: hive-${manifest.skillName} v${manifest.skillVersion} — ${issues.join('; ')}`,
    ...(fix ? { fix } : {}),
  };
}

async function checkInstalledSkills(
  ctx: HomeContext,
  registry: readonly ClientRegistryEntry[],
  catalog: Catalog | undefined,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const seenLocations = new Set<string>();

  for (const entry of registry) {
    const locations = [resolveGlobalSkillLocation(ctx, entry), resolvePayloadLocation(ctx, entry)].filter(
      (p): p is string => p !== undefined,
    );

    for (const loc of locations) {
      // gemini/windsurf/cursor: global skill location and payload dir are
      // literally the same path — dedupe so we don't double-report.
      if (seenLocations.has(loc)) continue;
      seenLocations.add(loc);

      let dirEntries;
      try {
        dirEntries = await fs.readdir(loc, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const dirEntry of dirEntries) {
        if (!dirEntry.isDirectory() || !dirEntry.name.startsWith('hive-')) continue;
        checks.push(await checkOneInstalledSkill(entry, path.join(loc, dirEntry.name), catalog));
      }
    }
  }

  return checks;
}

// --- dangling pointer blocks -----------------------------------------

/**
 * A client's rules/pointer file (GEMINI.md, memories/global_rules.md, a
 * project .cursor/rules/*.mdc) can end up with the hive-skills managed
 * block present while the payload dir it points at no longer exists —
 * e.g. after restoring a pre-install backup that intentionally leaves
 * the block behind (installer.ts's documented pointer-backup-scope
 * decision: a freshly-created pointer file isn't backed up, so restore
 * can't touch it, but it also can't remove a now-stale block). Flag it
 * so the user knows to clean it up or re-run install.
 */
async function checkPointerBlocks(
  ctx: HomeContext,
  registry: readonly ClientRegistryEntry[],
  projectDir: string | undefined,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const seenFiles = new Set<string>();

  for (const entry of registry) {
    const pointerFiles: string[] = [];
    const homePointer = resolvePointerFile(ctx, entry);
    if (homePointer) pointerFiles.push(homePointer);
    if (projectDir) {
      const projectPointer = resolveProjectPointerFile(projectDir, entry);
      if (projectPointer) pointerFiles.push(projectPointer);
    }

    for (const pointerFile of pointerFiles) {
      if (seenFiles.has(pointerFile)) continue;
      seenFiles.add(pointerFile);

      const content = await fs.readFile(pointerFile, 'utf8').catch(() => undefined);
      if (content === undefined) continue; // no pointer file -> nothing to flag
      if (!content.includes(MANAGED_BLOCK_START) || !content.includes(MANAGED_BLOCK_END)) continue; // no block -> check not emitted

      const payloadDir = resolvePayloadLocation(ctx, entry);
      // "Populated" not just "exists": restore-uninstall of the last skill leaves an
      // empty payload root behind (restore never removes the parent dir it didn't
      // record), so an empty payload is just as dangling as an absent one.
      const payloadPopulated = payloadDir
        ? await fs.readdir(payloadDir).then(
            (names) => names.some((n) => n.startsWith('hive-')),
            () => false,
          )
        : false;

      const id = `dangling-pointer-block:${entry.id}`;
      if (payloadPopulated) {
        checks.push({
          id,
          status: 'ok',
          detail: `${entry.name}: managed block in ${pointerFile} matches a populated payload dir (${payloadDir})`,
        });
      } else {
        checks.push({
          id,
          status: 'warn',
          detail:
            `${entry.name}: ${pointerFile} contains the hive-skills managed block, but its payload dir ` +
            `(${payloadDir ?? 'unknown'}) is missing or contains no hive-* skills`,
          fix:
            `Remove the block between \`${MANAGED_BLOCK_START}\` and \`${MANAGED_BLOCK_END}\` in ${pointerFile}, ` +
            `or re-run install to recreate ${payloadDir ?? 'the payload dir'}.`,
        });
      }
    }
  }

  return checks;
}

// --- backups dir ------------------------------------------------------

async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSizeBytes(abs);
    } else if (entry.isFile()) {
      total += (await fs.stat(abs).catch(() => undefined))?.size ?? 0;
    }
  }
  return total;
}

async function checkBackups(ctx: HomeContext): Promise<DoctorCheck> {
  const backupsDir = joinHome(ctx, '.hive-skills', 'backups');
  const guard = new PathGuard([ctx.home]);

  if (!(await probeWritable(guard, backupsDir))) {
    return {
      id: 'backups-dir',
      status: 'fail',
      detail: `Backups directory not writable: ${backupsDir}`,
      fix: `Check permissions on ${backupsDir}`,
    };
  }

  const backups = await listBackups(ctx);
  const corrupt = backups.filter((b) => !b.valid);
  const sizeMb = ((await dirSizeBytes(backupsDir)) / (1024 * 1024)).toFixed(1);
  const summary = `${backups.length} backup(s), ${sizeMb} MiB total`;

  if (corrupt.length > 0) {
    return {
      id: 'backups-dir',
      status: 'warn',
      detail: `${summary}; ${corrupt.length} corrupt manifest(s): ${corrupt.map((b) => b.id).join(', ')}`,
      fix: 'Corrupt backups cannot be restored; safe to delete manually if not needed.',
    };
  }

  return {
    id: 'backups-dir',
    status: 'ok',
    detail: `${summary} (backups grow unbounded by design — prune manually if desired)`,
  };
}

// --- doctor() ---------------------------------------------------------

export async function doctor(ctx: HomeContext, opts: DoctorOptions = {}): Promise<DoctorResult> {
  const registry = opts.registry ?? CLIENT_REGISTRY;
  const ports = opts.ports ?? {};

  const checks: DoctorCheck[] = [
    checkNodeVersion(ports),
    await checkPython(opts),
    ...(await checkClients(ctx, registry)),
    ...(await checkInstalledSkills(ctx, registry, opts.catalog)),
    ...(await checkPointerBlocks(ctx, registry, opts.projectDir)),
    await checkBackups(ctx),
  ];

  const exitCode: 0 | 1 = checks.some((check) => check.status === 'fail') ? 1 : 0;
  return { checks, exitCode };
}

// --- pretty printer -----------------------------------------------------

const STATUS_LABEL: Record<CheckStatus, string> = { ok: 'OK', warn: 'WARN', fail: 'FAIL' };

/** Plain-text report (no color codes — the CLI layer applies those). JSON callers should just use DoctorResult directly. */
export function formatDoctorReport(result: DoctorResult): string {
  const lines = result.checks.map((check) => {
    const label = `[${STATUS_LABEL[check.status]}]`;
    const base = `${label.padEnd(6)} ${check.id}: ${check.detail}`;
    return check.fix ? `${base}\n       fix: ${check.fix}` : base;
  });

  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const check of result.checks) counts[check.status]++;
  lines.push('', `${counts.ok} ok, ${counts.warn} warn, ${counts.fail} fail`);

  return lines.join('\n');
}
