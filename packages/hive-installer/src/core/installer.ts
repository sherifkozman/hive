import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HomeContext } from './paths.js';
import {
  CLIENT_REGISTRY,
  resolveGlobalSkillLocation,
  resolvePayloadLocation,
  resolvePointerFile,
  resolveProjectPointerFile,
  type ClientRegistryEntry,
} from './registry.js';
import { type Catalog, type CatalogSkill, getCatalogSkill, resolveSkillComposableDir } from './catalog.js';
import { collectTreeEntries, hashEntries } from './hashTree.js';
import {
  computeInstalledTreeHash,
  INSTALL_MANIFEST_FILENAME,
  readInstallManifest,
  type InstallManifest,
} from './installManifest.js';
import { PathGuard } from './guard.js';
import { atomicReplaceDir, atomicWriteFile } from './atomic.js';
import { snapshot, type SnapshotResult } from './backup.js';
import { withLock } from './lock.js';
import { renderPointerBlock, renderPointerDiff, upsertManagedBlock } from './pointer.js';
import { INSTALLER_VERSION } from '../version.js';

// --- Errors -----------------------------------------------------------

export class UnknownClientError extends Error {
  readonly clientId: string;
  constructor(clientId: string) {
    super(`Unknown client id: "${clientId}"`);
    this.name = 'UnknownClientError';
    this.clientId = clientId;
  }
}

export class UnknownSkillError extends Error {
  readonly skillName: string;
  constructor(skillName: string) {
    super(`Unknown skill: "${skillName}" (not present in the bundled catalog)`);
    this.name = 'UnknownSkillError';
    this.skillName = skillName;
  }
}

/** Thrown by planInstall when opts.clients includes one or more scan-only clients (spec §4). */
export class UnsupportedClientError extends Error {
  readonly clientIds: string[];
  constructor(clientIds: string[]) {
    super(
      `The following clients are scan-only in this version and cannot be installed to: ${clientIds.join(', ')}`,
    );
    this.name = 'UnsupportedClientError';
    this.clientIds = clientIds;
  }
}

/**
 * Thrown by executeInstall when a skill's destination directory already
 * exists, is non-empty, and carries no .hive-install.json — i.e. it
 * isn't a prior Hive install, so overwriting it could destroy unrelated
 * user data. Mirrors backup.ts's RestoreDeletionRefusalError: refuse by
 * default, require `force: true` to proceed.
 */
export class ForeignSkillDirError extends Error {
  readonly destSkillDir: string;
  constructor(destSkillDir: string) {
    super(
      `Refusing to overwrite "${destSkillDir}": it already exists but has no .hive-install.json ` +
        '(not a prior Hive install — may be unrelated user data). Pass { force: true } to overwrite anyway.',
    );
    this.name = 'ForeignSkillDirError';
    this.destSkillDir = destSkillDir;
  }
}

// --- Plan types ---------------------------------------------------------

export interface CopyTreeAction {
  kind: 'copy-tree' | 'upgrade';
  clientId: string;
  skillName: string;
  srcComposableDir: string;
  destSkillDir: string;
}

export interface WriteSkillShimAction {
  kind: 'write-skill-shim';
  clientId: string;
  skillName: string;
  destPath: string;
  content: string;
}

export interface WriteInstallManifestAction {
  kind: 'write-install-manifest';
  clientId: string;
  skillName: string;
  destPath: string;
  skillVersion: string;
}

export interface WritePointerBlockAction {
  kind: 'write-pointer-block';
  clientId: string;
  destPath: string;
  block: string;
}

export interface SkipIdenticalAction {
  kind: 'skip-identical';
  clientId: string;
  skillName: string;
  destSkillDir: string;
}

export type InstallAction =
  | CopyTreeAction
  | WriteSkillShimAction
  | WriteInstallManifestAction
  | WritePointerBlockAction
  | SkipIdenticalAction;

export interface InstallPlan {
  actions: InstallAction[];
}

export interface PlanInstallOptions {
  clients: string[];
  skills: string[];
  /** Required for payload-project-pointer clients' (e.g. cursor) project-level pointer file. */
  projectDir?: string;
  /** Defaults to the built-in CLIENT_REGISTRY; pass a merged registry for --registry support. */
  registry?: readonly ClientRegistryEntry[];
  /** The bundled skill catalog (assets/manifest.json), sources of truth for versions/paths. */
  catalog: Catalog;
}

// --- SKILL.md shim template ----------------------------------------------

/**
 * Renders the SKILL.md shim installed alongside a skill's composable/
 * tree (spec §4's install-artifact diagram). Pure + unit-tested: the
 * frontmatter `description` is the catalog description plus a fixed
 * "load INDEX.md first" hint; the body tells the consuming agent to read
 * composable/INDEX.md and apply the CCS coverage rule (spec §10).
 */
export function renderSkillShim(skill: CatalogSkill): string {
  const description = `${skill.description} Load composable/INDEX.md first.`;
  return [
    '---',
    `name: hive-${skill.name}`,
    `description: ${description}`,
    '---',
    '',
    'Read `composable/INDEX.md` first — it is the knowledge-free loading menu for this skill.',
    '',
    'Then apply the CCS coverage rule (spec `docs/SPEC.md` §10): if the task needs less than',
    "~60% of this skill's minis, load `composable/00-core.md` (if present) plus the specific",
    'minis the INDEX points you to. Otherwise load `composable/BUNDLE.md` (or a matching file',
    'under `composable/presets/`) in one read instead of loading minis one at a time.',
    '',
  ].join('\n');
}

// --- Plan-time virtual tree hash ------------------------------------------

/**
 * The tree hash a skill install WOULD have once written: the bundled
 * composable/ source tree (read-only — nothing written here) plus the
 * to-be-generated SKILL.md shim, hashed exactly as computeInstalledTreeHash
 * would hash the real destSkillDir afterward (same algorithm, same
 * relative paths, same manifest-file exclusion — there's nothing to
 * exclude here since the manifest itself isn't part of the virtual set).
 * This is what lets planInstall decide skip-identical/upgrade/copy-tree
 * up front, with zero filesystem writes (dry-run correctness).
 */
async function computeVirtualInstalledTreeHash(
  srcComposableDir: string,
  shimContent: string,
): Promise<string> {
  const composableEntries = await collectTreeEntries(srcComposableDir);
  const prefixed = composableEntries.map((entry) => ({
    relPath: path.join('composable', entry.relPath),
    content: entry.content,
  }));
  const shimEntry = { relPath: 'SKILL.md', content: Buffer.from(shimContent, 'utf8') };
  return hashEntries([...prefixed, shimEntry]);
}

// --- planInstall ----------------------------------------------------------

export async function planInstall(ctx: HomeContext, opts: PlanInstallOptions): Promise<InstallPlan> {
  const registry = opts.registry ?? CLIENT_REGISTRY;

  const entries: ClientRegistryEntry[] = opts.clients.map((id) => {
    const entry = registry.find((candidate) => candidate.id === id);
    if (!entry) throw new UnknownClientError(id);
    return entry;
  });

  const unsupported = entries.filter((entry) => entry.strategy === 'scan-only').map((entry) => entry.id);
  if (unsupported.length > 0) {
    throw new UnsupportedClientError(unsupported);
  }

  const skills: CatalogSkill[] = opts.skills.map((name) => {
    const skill = getCatalogSkill(opts.catalog, name);
    if (!skill) throw new UnknownSkillError(name);
    return skill;
  });

  const actions: InstallAction[] = [];

  for (const entry of entries) {
    const isPayloadFamily = entry.strategy === 'payload-pointer' || entry.strategy === 'payload-project-pointer';
    const baseDir = isPayloadFamily ? resolvePayloadLocation(ctx, entry) : resolveGlobalSkillLocation(ctx, entry);
    if (!baseDir) {
      throw new Error(
        `Client "${entry.id}" (strategy "${entry.strategy}") has no resolvable install location`,
      );
    }

    for (const skill of skills) {
      const destSkillDir = path.join(baseDir, `hive-${skill.name}`);
      const srcComposableDir = resolveSkillComposableDir(opts.catalog, skill);
      const shimContent = renderSkillShim(skill);
      const newTreeHash = await computeVirtualInstalledTreeHash(srcComposableDir, shimContent);
      const existingManifest = await readInstallManifest(destSkillDir);

      if (existingManifest && existingManifest.treeSha256 === newTreeHash) {
        actions.push({ kind: 'skip-identical', clientId: entry.id, skillName: skill.name, destSkillDir });
        continue;
      }

      const treeActionKind: 'copy-tree' | 'upgrade' = existingManifest ? 'upgrade' : 'copy-tree';
      actions.push({
        kind: treeActionKind,
        clientId: entry.id,
        skillName: skill.name,
        srcComposableDir,
        destSkillDir,
      });
      actions.push({
        kind: 'write-skill-shim',
        clientId: entry.id,
        skillName: skill.name,
        destPath: path.join(destSkillDir, 'SKILL.md'),
        content: shimContent,
      });
      actions.push({
        kind: 'write-install-manifest',
        clientId: entry.id,
        skillName: skill.name,
        destPath: path.join(destSkillDir, INSTALL_MANIFEST_FILENAME),
        skillVersion: skill.version,
      });
    }

    if (skills.length === 0) continue;

    // ONE pointer-block action per client (not per skill).
    if (entry.strategy === 'payload-pointer') {
      const pointerFile = resolvePointerFile(ctx, entry);
      if (pointerFile) {
        actions.push({
          kind: 'write-pointer-block',
          clientId: entry.id,
          destPath: pointerFile,
          block: renderPointerBlock(baseDir),
        });
      }
    } else if (entry.strategy === 'payload-project-pointer' && opts.projectDir) {
      const pointerFile = resolveProjectPointerFile(opts.projectDir, entry);
      if (pointerFile) {
        actions.push({
          kind: 'write-pointer-block',
          clientId: entry.id,
          destPath: pointerFile,
          block: renderPointerBlock(baseDir),
        });
      }
      // No projectDir: the tree install above still stands on its own;
      // the pointer can be added later with `install --project <dir>`
      // (that re-run sees identical skill trees -> all skip-identical,
      // and just adds the pointer action this time).
    }
  }

  return { actions };
}

// --- executeInstall ---------------------------------------------------

export interface ExecutePorts {
  confirmPointerWrite: (file: string, diff: string) => Promise<boolean>;
}

export interface ExecuteInstallOptions {
  dryRun?: boolean;
  noBackup?: boolean;
  force?: boolean;
}

export interface WouldWriteEntry {
  kind: InstallAction['kind'];
  destPath: string;
}

export interface ExecuteInstallResult {
  performed: InstallAction[];
  skipped: InstallAction[];
  backups: SnapshotResult[];
  dryRun: boolean;
  wouldWrite: WouldWriteEntry[];
}

interface SkillUnit {
  clientId: string;
  skillName: string;
  tree?: CopyTreeAction;
  shim?: WriteSkillShimAction;
  manifest?: WriteInstallManifestAction;
}

function groupPlan(plan: InstallPlan): {
  skillUnits: SkillUnit[];
  skipActions: SkipIdenticalAction[];
  pointerActions: WritePointerBlockAction[];
} {
  const unitsByKey = new Map<string, SkillUnit>();
  const skipActions: SkipIdenticalAction[] = [];
  const pointerActions: WritePointerBlockAction[] = [];

  for (const action of plan.actions) {
    if (action.kind === 'skip-identical') {
      skipActions.push(action);
      continue;
    }
    if (action.kind === 'write-pointer-block') {
      pointerActions.push(action);
      continue;
    }

    const key = `${action.clientId} ${action.skillName}`;
    const unit: SkillUnit = unitsByKey.get(key) ?? { clientId: action.clientId, skillName: action.skillName };
    if (action.kind === 'copy-tree' || action.kind === 'upgrade') unit.tree = action;
    else if (action.kind === 'write-skill-shim') unit.shim = action;
    else if (action.kind === 'write-install-manifest') unit.manifest = action;
    unitsByKey.set(key, unit);
  }

  return { skillUnits: [...unitsByKey.values()], skipActions, pointerActions };
}

function actionDestPath(action: InstallAction): string {
  return 'destPath' in action ? action.destPath : action.destSkillDir;
}

function isWithinDir(absPath: string, dir: string): boolean {
  const resolvedPath = path.resolve(absPath);
  const resolvedDir = path.resolve(dir);
  if (resolvedPath === resolvedDir) return true;
  return resolvedPath.startsWith(resolvedDir.endsWith(path.sep) ? resolvedDir : resolvedDir + path.sep);
}

async function hasForeignContent(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function executeInstall(
  ctx: HomeContext,
  plan: InstallPlan,
  ports: ExecutePorts,
  opts: ExecuteInstallOptions = {},
): Promise<ExecuteInstallResult> {
  const { skillUnits, skipActions, pointerActions } = groupPlan(plan);

  if (opts.dryRun) {
    const skillActions: InstallAction[] = skillUnits.flatMap((unit) =>
      [unit.tree, unit.shim, unit.manifest].filter(
        (a): a is CopyTreeAction | WriteSkillShimAction | WriteInstallManifestAction => a !== undefined,
      ),
    );
    const wouldWrite: WouldWriteEntry[] = [...skillActions, ...pointerActions].map((action) => ({
      kind: action.kind,
      destPath: actionDestPath(action),
    }));

    return { performed: [], skipped: [...skipActions], backups: [], dryRun: true, wouldWrite };
  }

  return withLock(
    ctx,
    async () => {
      // Pre-flight validation BEFORE any backup/mutation (fail fast, no
      // partial state — mirrors backup.ts's restore() ordering).
      if (!opts.force) {
        for (const unit of skillUnits) {
          if (!unit.tree) continue;
          const existingManifest = await readInstallManifest(unit.tree.destSkillDir);
          if (!existingManifest && (await hasForeignContent(unit.tree.destSkillDir))) {
            throw new ForeignSkillDirError(unit.tree.destSkillDir);
          }
        }
      }

      const pointerRootsOutsideHome = [
        ...new Set(
          pointerActions
            .map((action) => action.destPath)
            .filter((destPath) => !isWithinDir(destPath, ctx.home))
            .map((destPath) => path.dirname(destPath)),
        ),
      ];
      const guard = new PathGuard([ctx.home, ...pointerRootsOutsideHome]);

      const backups: SnapshotResult[] = [];
      if (!opts.noBackup) {
        const treeDests = skillUnits.filter((unit) => unit.tree).map((unit) => unit.tree!.destSkillDir);

        // Pointer files: only back up ones that already exist. A
        // not-yet-existing pointer file is deliberately left OUT of the
        // backup rather than recorded as an `absent` entry — backup.ts's
        // restore() has no concept of a "managed block" (see its own
        // TODO) and would delete the *entire* file on restore, destroying
        // the block this install is about to add along with it. Skipping
        // it here means uninstalling a skill tree via restore never
        // touches a pointer file this install created from scratch.
        // Pointer files that DID pre-exist are still backed up (and would
        // be fully reverted, block included, by a restore of this same
        // backup) — a known limitation, not fixed here; see backup.ts's
        // restore() doc comment for the follow-up.
        const pointerTargets: string[] = [];
        for (const action of pointerActions) {
          const exists = await fs.access(action.destPath).then(
            () => true,
            () => false,
          );
          if (exists) pointerTargets.push(action.destPath);
        }

        const backupTargets = [...new Set([...treeDests, ...pointerTargets])];
        if (backupTargets.length > 0) {
          backups.push(await snapshot(ctx, 'preinstall', backupTargets, { guard }));
        }
      }

      const performed: InstallAction[] = [];
      const skipped: InstallAction[] = [...skipActions];

      for (const unit of skillUnits) {
        if (!unit.tree) continue;
        const { destSkillDir, srcComposableDir } = unit.tree;
        const shimContent = unit.shim?.content ?? '';

        await atomicReplaceDir(guard, destSkillDir, async (stagingDir) => {
          await fs.cp(srcComposableDir, path.join(stagingDir, 'composable'), { recursive: true });
          await fs.writeFile(path.join(stagingDir, 'SKILL.md'), shimContent, 'utf8');
        });
        performed.push(unit.tree);
        if (unit.shim) performed.push(unit.shim);

        if (unit.manifest) {
          const treeSha256 = await computeInstalledTreeHash(destSkillDir);
          const manifestPayload: InstallManifest = {
            skillName: unit.skillName,
            skillVersion: unit.manifest.skillVersion,
            treeSha256,
            installerVersion: INSTALLER_VERSION,
            installedAt: new Date().toISOString(),
          };
          await atomicWriteFile(
            guard,
            unit.manifest.destPath,
            JSON.stringify(manifestPayload, null, 2) + '\n',
          );
          performed.push(unit.manifest);
        }
      }

      for (const action of pointerActions) {
        const existingRaw = await fs.readFile(action.destPath, 'utf8').catch(() => undefined);
        const nextContent = upsertManagedBlock(existingRaw ?? '', action.block);

        if (existingRaw !== undefined && nextContent === existingRaw) {
          skipped.push(action); // Already up to date; nothing to confirm or write.
          continue;
        }

        const diff = renderPointerDiff(existingRaw, nextContent, action.destPath);
        const confirmed = await ports.confirmPointerWrite(action.destPath, diff);
        if (!confirmed) {
          skipped.push(action);
          continue;
        }

        await atomicWriteFile(guard, action.destPath, nextContent);
        performed.push(action);
      }

      return { performed, skipped, backups, dryRun: false, wouldWrite: [] };
    },
    { staleMs: 30 * 60 * 1000 },
  );
}
