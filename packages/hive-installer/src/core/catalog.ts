import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Reader for assets/manifest.json (written by scripts/bundle-assets.mjs,
 * T2.5). This is the bridge between the bundled skill assets shipped in
 * the npm package and the install engine (installer.ts) / doctor
 * (doctor.ts): both need to know which skills exist, their version and
 * description, and where their composable/ tree lives on disk.
 *
 * `assetsRoot` is always supplied explicitly by the caller — never
 * resolved here from import.meta.url or similar — for the same reason
 * paths.ts's HomeContext is always explicit: it is the seam that makes
 * fixture-based testing (a temp assets/ dir, never the real bundled one)
 * possible, and it sidesteps the fact that this module's own file lives
 * at a different relative depth from assets/ depending on whether it's
 * running from src/ (tests) or bundled into dist/cli.js (production) —
 * a later task (CLI wiring) resolves the real path once, at the single
 * call site that knows which case it's in.
 */

export interface CatalogSkill {
  name: string;
  category: string;
  version: string;
  minis: number;
  bundleTokens: number;
  description: string;
  /** Forward-slash path relative to assetsRoot, e.g. "skills/converted/claude-api". */
  path: string;
}

export interface CatalogFileEntry {
  relPath: string;
  sha256: string;
  size: number;
}

export interface Catalog {
  generatedAt: string;
  hiveCommit: string;
  skills: CatalogSkill[];
  files: CatalogFileEntry[];
  /** Absolute path to the assets/ directory this catalog was loaded from. */
  assetsRoot: string;
}

export class CatalogLoadError extends Error {
  readonly assetsRoot: string;

  constructor(assetsRoot: string, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to load bundled skill catalog from "${path.join(assetsRoot, 'manifest.json')}": ${causeMessage}`);
    this.name = 'CatalogLoadError';
    this.assetsRoot = assetsRoot;
  }
}

interface ManifestOnDisk {
  generatedAt: string;
  hiveCommit: string;
  skills: CatalogSkill[];
  files: CatalogFileEntry[];
}

/** Load and parse `<assetsRoot>/manifest.json`. */
export async function loadCatalog(assetsRoot: string): Promise<Catalog> {
  const manifestPath = path.join(assetsRoot, 'manifest.json');
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf8');
  } catch (err) {
    throw new CatalogLoadError(assetsRoot, err);
  }

  let parsed: ManifestOnDisk;
  try {
    parsed = JSON.parse(raw) as ManifestOnDisk;
  } catch (err) {
    throw new CatalogLoadError(assetsRoot, err);
  }

  return { ...parsed, assetsRoot };
}

export function getCatalogSkill(catalog: Catalog, name: string): CatalogSkill | undefined {
  return catalog.skills.find((skill) => skill.name === name);
}

/** Absolute path to a catalog skill's bundled composable/ directory. */
export function resolveSkillComposableDir(catalog: Catalog, skill: CatalogSkill): string {
  return path.join(catalog.assetsRoot, ...skill.path.split('/'), 'composable');
}
