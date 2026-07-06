import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveHomeContext, type HomeContext } from './core/paths.js';
import { CLIENT_REGISTRY, mergeRegistry, type ClientRegistryEntry } from './core/registry.js';
import { loadCatalog, type Catalog } from './core/catalog.js';

/**
 * Global CLI flags every subcommand shares (spec §5): --home/--registry
 * resolve the operating context; --json/--dry-run/--yes/--force/--project
 * are read directly by each command adapter. `backup` mirrors commander's
 * `--no-backup` (commander sets `opts.backup = false` when the flag is
 * passed; the field is `true`/absent otherwise).
 */
export interface GlobalCliOptions {
  home?: string;
  registry?: string;
  json?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  backup?: boolean;
  force?: boolean;
  project?: string;
}

/**
 * Absolute path to the bundled assets/ directory (skills, tools/hive.py,
 * licenses — scripts/bundle-assets.mjs's output). Resolved relative to
 * THIS module's own location: once tsup bundles the whole CLI into a
 * single dist/cli.js (splitting disabled, see tsup.config.ts),
 * `import.meta.url` at runtime is that one output file's URL regardless
 * of which source file this code was authored in, so `..` from `dist/`
 * lands on the package root and `assets` is dist's sibling — correct for
 * the shipped package. `HIVE_SKILLS_ASSETS` lets tests substitute a
 * fixture assets/ dir instead of requiring a real `pnpm run build` first,
 * the same seam `HIVE_SKILLS_HOME` gives paths.ts for the home directory.
 */
export function resolveAssetsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.HIVE_SKILLS_ASSETS?.trim();
  if (override) return path.resolve(override);
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
}

/** Read and parse a `--registry <jsonfile>` override document, if given. */
export async function loadRegistryOverride(registryFlag: string | undefined): Promise<unknown> {
  if (!registryFlag) return undefined;
  const raw = await fs.readFile(path.resolve(registryFlag), 'utf8');
  return JSON.parse(raw);
}

export interface ResolvedContext {
  ctx: HomeContext;
  registry: ClientRegistryEntry[];
  catalog: Catalog;
  assetsRoot: string;
}

export interface ResolveContextOptions {
  /** Override the resolved assets root (test seam); defaults to resolveAssetsRoot(env). */
  assetsRoot?: string;
  /** Environment to read HIVE_SKILLS_HOME / HIVE_SKILLS_ASSETS / HIVE_SKILLS_REGISTRY from. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

/**
 * The one place every subcommand turns global CLI flags into the
 * (HomeContext, registry, catalog) triple the core engines need. A
 * `HIVE_SKILLS_REGISTRY` env var is honored the same way `--registry`
 * is (env as a fallback default, flag wins) — mirrors paths.ts's
 * `--home` > `HIVE_SKILLS_HOME` > default precedence.
 */
export async function resolveContext(
  opts: GlobalCliOptions,
  resolveOpts: ResolveContextOptions = {},
): Promise<ResolvedContext> {
  const env = resolveOpts.env ?? process.env;
  const ctx = resolveHomeContext({ homeFlag: opts.home, env });

  const registryFlag = opts.registry ?? env.HIVE_SKILLS_REGISTRY?.trim();
  const overrideDoc = await loadRegistryOverride(registryFlag);
  const registry = mergeRegistry(CLIENT_REGISTRY, overrideDoc);

  const assetsRoot = resolveOpts.assetsRoot ?? resolveAssetsRoot(env);
  const catalog = await loadCatalog(assetsRoot);

  return { ctx, registry, catalog, assetsRoot };
}
