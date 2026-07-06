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
import {
  type Catalog,
  type CatalogSkill,
  getCatalogSkill,
  resolveSkillAssetSrcDir,
  resolveSkillComposableDir,
} from './catalog.js';
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
import { stripGeneratedMarker } from './bundleMarker.js';
import { selectPackingMode, type PackingMode } from './packing.js';

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

/**
 * Thrown by planInstall (packing-modes.md v2 item 2, "HARD-FAILS if the
 * skill has no BUNDLE.md") when a skill selected for bundle-inline
 * packing has no compiled BUNDLE.md to inline. This is a build/catalog
 * defect (every skill's `hive.py compile` output should always include
 * one) — surfaced as a typed, fail-fast error rather than silently
 * installing an empty or missing SKILL.md.
 */
export class MissingBundleError extends Error {
  readonly skillName: string;
  readonly bundlePath: string;
  constructor(skillName: string, bundlePath: string) {
    super(
      `Cannot generate an inline SKILL.md for "${skillName}": no BUNDLE.md found at "${bundlePath}". ` +
        'Regenerate the skill\'s compiled artifacts (`hive.py compile`), or force tree packing for this ' +
        'install (`--packing tree`).',
    );
    this.name = 'MissingBundleError';
    this.skillName = skillName;
    this.bundlePath = bundlePath;
  }
}

// --- Plan types ---------------------------------------------------------

/** A bundled non-knowledge asset dir (spec §9) to materialize at the installed skill dir's root, e.g. { name: 'scripts', srcDir: '.../assets-src/scripts' } -> `<destSkillDir>/scripts`. */
export interface AssetSrcDir {
  name: string;
  srcDir: string;
}

export interface CopyTreeAction {
  kind: 'copy-tree' | 'upgrade';
  clientId: string;
  skillName: string;
  srcComposableDir: string;
  destSkillDir: string;
  /** Non-knowledge asset dirs to copy into destSkillDir's root alongside composable/ and SKILL.md. Empty for skills with no bundled assets. */
  assetSrcDirs: AssetSrcDir[];
  /** Always 'tree' — carried on the action so callers (e.g. a plan preview) can read the packing mode uniformly across action kinds. */
  packing: 'tree';
}

export interface WriteSkillShimAction {
  kind: 'write-skill-shim';
  clientId: string;
  skillName: string;
  destPath: string;
  content: string;
}

/**
 * Packing-modes.md's `bundle-inline` mode (v2 items 2-3): installs a
 * single SKILL.md — frontmatter (name, upstream-verbatim description)
 * plus the compiled BUNDLE.md body, marker stripped — at the skill's
 * root, alongside any materialized non-knowledge asset dirs. No
 * composable/ tree and no separate shim: this action's `content` IS the
 * whole installed SKILL.md.
 */
export interface WriteInlineSkillAction {
  kind: 'write-inline-skill';
  clientId: string;
  skillName: string;
  destSkillDir: string;
  content: string;
  assetSrcDirs: AssetSrcDir[];
  packing: 'bundle-inline';
}

export interface WriteInstallManifestAction {
  kind: 'write-install-manifest';
  clientId: string;
  skillName: string;
  destPath: string;
  skillVersion: string;
  packing: PackingMode;
  /** True iff an explicit --packing (not the size-rule "auto") chose `packing`. */
  packingForced: boolean;
  inlineThreshold: number;
  /** The bundled catalog's `hiveCommit` at install time (packing-modes.md v2 item 5: "pins a repo commit"). */
  catalogHash: string;
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
  | WriteInlineSkillAction
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
  /**
   * Packing mode selection (docs/packing-modes.md). Omitting this field
   * entirely — the historical, pre-0.2.0 call shape — preserves the
   * original always-tree behavior for backward compatibility: existing
   * callers that never asked for packing awareness keep getting exactly
   * what they got before. Passing 'auto' (the CLI/wizard's own explicit
   * default) applies the size rule; passing a concrete PackingMode forces
   * it for every skill in this call.
   */
  packing?: 'auto' | PackingMode;
  /** Overrides packing.ts's DEFAULT_INLINE_THRESHOLD for the size rule. */
  inlineThreshold?: number;
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

// --- Inline SKILL.md (bundle-inline packing mode) -------------------------

/**
 * YAML-safe double-quoted scalar: wraps `value` in double quotes,
 * escaping backslashes and double quotes, and collapsing newlines to
 * literal `\n` escapes (a frontmatter `description:` value must stay a
 * single YAML line here — unlike the upstream sources this repo reads,
 * which may use a block-literal `|-` scalar, this generator always emits
 * the simpler quoted-scalar form, valid for any input including
 * multi-line ones like claude-api's).
 */
function yamlQuoteScalar(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

/**
 * Renders a bundle-inline install's SKILL.md (packing-modes.md v2 items
 * 2-3): frontmatter `name: hive-<skill>` + `description` (the skill's
 * upstream-verbatim `sourceDescription`, falling back to `description`
 * when a skill has no vendored source — see catalog.ts), YAML-safely
 * quoted/escaped, followed by the compiled BUNDLE.md body with the
 * generated-marker line stripped. HARD-FAILS with MissingBundleError if
 * the skill has no BUNDLE.md at all (packing-modes.md v2 item 2) — this
 * is the ONE thing that can't be pure, since it needs to read the file
 * that would be missing.
 */
export async function renderInlineSkillMd(catalog: Catalog, skill: CatalogSkill): Promise<string> {
  const composableDir = resolveSkillComposableDir(catalog, skill);
  const bundlePath = path.join(composableDir, 'BUNDLE.md');
  let bundleRaw: string;
  try {
    bundleRaw = await fs.readFile(bundlePath, 'utf8');
  } catch {
    throw new MissingBundleError(skill.name, bundlePath);
  }

  const description = skill.sourceDescription ?? skill.description;
  const body = stripGeneratedMarker(bundleRaw).replace(/^\n+/, '');

  return [
    '---',
    `name: hive-${skill.name}`,
    `description: ${yamlQuoteScalar(description)}`,
    '---',
    '',
    body,
  ].join('\n');
}

/** Same shape as computeVirtualInstalledTreeHash, for a bundle-inline install: SKILL.md (the inline content) + materialized asset dirs, no composable/ prefix. */
async function computeVirtualInlineTreeHash(content: string, assetSrcDirs: AssetSrcDir[]): Promise<string> {
  const skillEntry = { relPath: 'SKILL.md', content: Buffer.from(content, 'utf8') };

  const assetEntries = [];
  for (const { name, srcDir } of assetSrcDirs) {
    const entries = await collectTreeEntries(srcDir);
    for (const entry of entries) {
      assetEntries.push({ relPath: path.join(name, entry.relPath), content: entry.content });
    }
  }

  return hashEntries([skillEntry, ...assetEntries]);
}

// --- Plan-time virtual tree hash ------------------------------------------

/**
 * The tree hash a skill install WOULD have once written: the bundled
 * composable/ source tree, any bundled non-knowledge asset dirs (read-only
 * — nothing written here), plus the to-be-generated SKILL.md shim, hashed
 * exactly as computeInstalledTreeHash would hash the real destSkillDir
 * afterward (same algorithm, same relative paths — each assetSrcDirs entry
 * is prefixed with its own `name` the same way executeInstall copies it to
 * `<destSkillDir>/<name>`; same manifest-file exclusion — there's nothing
 * to exclude here since the manifest itself isn't part of the virtual
 * set). This is what lets planInstall decide skip-identical/upgrade/
 * copy-tree up front, with zero filesystem writes (dry-run correctness) —
 * and, critically, what keeps that decision correct once a skill has
 * bundled assets: omitting them here would make every such skill look
 * permanently "upgraded" (asset content never factored into the
 * comparison) or, worse, permanently "skip-identical" after an asset-only
 * change actually shipped.
 */
async function computeVirtualInstalledTreeHash(
  srcComposableDir: string,
  shimContent: string,
  assetSrcDirs: AssetSrcDir[],
): Promise<string> {
  const composableEntries = await collectTreeEntries(srcComposableDir);
  const prefixed = composableEntries.map((entry) => ({
    relPath: path.join('composable', entry.relPath),
    content: entry.content,
  }));
  const shimEntry = { relPath: 'SKILL.md', content: Buffer.from(shimContent, 'utf8') };

  const assetEntries = [];
  for (const { name, srcDir } of assetSrcDirs) {
    const entries = await collectTreeEntries(srcDir);
    for (const entry of entries) {
      assetEntries.push({ relPath: path.join(name, entry.relPath), content: entry.content });
    }
  }

  return hashEntries([...prefixed, shimEntry, ...assetEntries]);
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
      const assetSrcDirs: AssetSrcDir[] = (skill.assetDirs ?? []).map((name) => ({
        name,
        srcDir: resolveSkillAssetSrcDir(opts.catalog, skill, name),
      }));

      // Backward compat (see PlanInstallOptions.packing's doc comment):
      // omitting `opts.packing` entirely defaults to 'tree', not 'auto' —
      // only a caller that explicitly opts in (the CLI's `--packing`
      // default of 'auto', or an explicit override) gets size-rule-aware
      // packing.
      const packingResult = selectPackingMode(skill, {
        packing: opts.packing ?? 'tree',
        inlineThreshold: opts.inlineThreshold,
      });

      const existingManifest = await readInstallManifest(destSkillDir);
      const manifestAction: WriteInstallManifestAction = {
        kind: 'write-install-manifest',
        clientId: entry.id,
        skillName: skill.name,
        destPath: path.join(destSkillDir, INSTALL_MANIFEST_FILENAME),
        skillVersion: skill.version,
        packing: packingResult.mode,
        packingForced: packingResult.forced,
        inlineThreshold: packingResult.inlineThreshold,
        catalogHash: opts.catalog.hiveCommit,
      };

      if (packingResult.mode === 'bundle-inline') {
        const inlineContent = await renderInlineSkillMd(opts.catalog, skill);
        const newTreeHash = await computeVirtualInlineTreeHash(inlineContent, assetSrcDirs);

        if (existingManifest && existingManifest.treeSha256 === newTreeHash) {
          actions.push({ kind: 'skip-identical', clientId: entry.id, skillName: skill.name, destSkillDir });
          continue;
        }

        actions.push({
          kind: 'write-inline-skill',
          clientId: entry.id,
          skillName: skill.name,
          destSkillDir,
          content: inlineContent,
          assetSrcDirs,
          packing: 'bundle-inline',
        });
        actions.push(manifestAction);
        continue;
      }

      const srcComposableDir = resolveSkillComposableDir(opts.catalog, skill);
      const shimContent = renderSkillShim(skill);
      const newTreeHash = await computeVirtualInstalledTreeHash(srcComposableDir, shimContent, assetSrcDirs);

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
        assetSrcDirs,
        packing: 'tree',
      });
      actions.push({
        kind: 'write-skill-shim',
        clientId: entry.id,
        skillName: skill.name,
        destPath: path.join(destSkillDir, 'SKILL.md'),
        content: shimContent,
      });
      actions.push(manifestAction);
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
  /** Present for the action that installs the skill's content (copy-tree/upgrade/write-inline-skill) — lets a plan preview show the packing mode directly (spec: "plan preview shows mode"). */
  packing?: PackingMode;
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
  inlineSkill?: WriteInlineSkillAction;
  manifest?: WriteInstallManifestAction;
}

/** The unit's install destination, regardless of which packing mode produced it. */
function unitDestDir(unit: SkillUnit): string | undefined {
  return unit.tree?.destSkillDir ?? unit.inlineSkill?.destSkillDir;
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
    else if (action.kind === 'write-inline-skill') unit.inlineSkill = action;
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
      [unit.tree, unit.shim, unit.inlineSkill, unit.manifest].filter(
        (a): a is CopyTreeAction | WriteSkillShimAction | WriteInlineSkillAction | WriteInstallManifestAction =>
          a !== undefined,
      ),
    );
    const wouldWrite: WouldWriteEntry[] = [...skillActions, ...pointerActions].map((action) => ({
      kind: action.kind,
      destPath: actionDestPath(action),
      ...('packing' in action ? { packing: action.packing } : {}),
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
          const destDir = unitDestDir(unit);
          if (!destDir) continue;
          const existingManifest = await readInstallManifest(destDir);
          if (!existingManifest && (await hasForeignContent(destDir))) {
            throw new ForeignSkillDirError(destDir);
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
        const treeDests = skillUnits.map((unit) => unitDestDir(unit)).filter((d): d is string => d !== undefined);

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
        let destSkillDir: string | undefined;

        if (unit.tree) {
          const { destSkillDir: dir, srcComposableDir, assetSrcDirs } = unit.tree;
          const shimContent = unit.shim?.content ?? '';
          destSkillDir = dir;

          await atomicReplaceDir(guard, dir, async (stagingDir) => {
            await fs.cp(srcComposableDir, path.join(stagingDir, 'composable'), { recursive: true });
            await fs.writeFile(path.join(stagingDir, 'SKILL.md'), shimContent, 'utf8');
            for (const { name, srcDir } of assetSrcDirs) {
              await fs.cp(srcDir, path.join(stagingDir, name), { recursive: true });
            }
          });
          performed.push(unit.tree);
          if (unit.shim) performed.push(unit.shim);
        } else if (unit.inlineSkill) {
          const { destSkillDir: dir, content, assetSrcDirs } = unit.inlineSkill;
          destSkillDir = dir;

          await atomicReplaceDir(guard, dir, async (stagingDir) => {
            await fs.writeFile(path.join(stagingDir, 'SKILL.md'), content, 'utf8');
            for (const { name, srcDir } of assetSrcDirs) {
              await fs.cp(srcDir, path.join(stagingDir, name), { recursive: true });
            }
          });
          performed.push(unit.inlineSkill);
        } else {
          continue;
        }

        if (unit.manifest) {
          const treeSha256 = await computeInstalledTreeHash(destSkillDir);
          const manifestPayload: InstallManifest = {
            skillName: unit.skillName,
            skillVersion: unit.manifest.skillVersion,
            treeSha256,
            installerVersion: INSTALLER_VERSION,
            installedAt: new Date().toISOString(),
            packing: unit.manifest.packing,
            packingForced: unit.manifest.packingForced,
            inlineThreshold: unit.manifest.inlineThreshold,
            catalogHash: unit.manifest.catalogHash,
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
