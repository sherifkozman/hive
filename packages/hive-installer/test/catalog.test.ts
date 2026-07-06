import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CatalogLoadError,
  getCatalogSkill,
  loadCatalog,
  resolveSkillAssetSrcDir,
  resolveSkillComposableDir,
  type Catalog,
} from '../src/core/catalog.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-catalog-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const fixtureManifest = {
  generatedAt: '2026-07-05T00:00:00.000Z',
  hiveCommit: 'deadbeef',
  skills: [
    {
      name: 'code-review',
      category: 'authored',
      version: '1.0.0',
      minis: 9,
      bundleTokens: 4521,
      description: 'Review code for bugs and cleanups.',
      path: 'skills/authored/code-review',
      assetDirs: ['scripts'],
    },
  ],
  files: [{ relPath: 'skills/authored/code-review/composable/INDEX.md', sha256: 'abc', size: 10 }],
};

describe('loadCatalog', () => {
  it('loads and parses assets/manifest.json, attaching assetsRoot', async () => {
    await writeFile(path.join(tmp, 'manifest.json'), JSON.stringify(fixtureManifest));
    const catalog = await loadCatalog(tmp);
    expect(catalog.assetsRoot).toBe(tmp);
    expect(catalog.hiveCommit).toBe('deadbeef');
    expect(catalog.skills.length).toBe(1);
  });

  it('throws CatalogLoadError when manifest.json is missing', async () => {
    await mkdir(tmp, { recursive: true });
    await expect(loadCatalog(tmp)).rejects.toThrow(CatalogLoadError);
  });

  it('throws CatalogLoadError when manifest.json is corrupt', async () => {
    await writeFile(path.join(tmp, 'manifest.json'), 'not json{{{');
    await expect(loadCatalog(tmp)).rejects.toThrow(CatalogLoadError);
  });
});

describe('getCatalogSkill / resolveSkillComposableDir', () => {
  let catalog: Catalog;

  beforeEach(async () => {
    await writeFile(path.join(tmp, 'manifest.json'), JSON.stringify(fixtureManifest));
    catalog = await loadCatalog(tmp);
  });

  it('finds a skill by name', () => {
    const skill = getCatalogSkill(catalog, 'code-review');
    expect(skill?.version).toBe('1.0.0');
  });

  it('returns undefined for an unknown skill name', () => {
    expect(getCatalogSkill(catalog, 'nope')).toBeUndefined();
  });

  it('resolves the absolute composable dir from the forward-slash path field', () => {
    const skill = getCatalogSkill(catalog, 'code-review')!;
    const dir = resolveSkillComposableDir(catalog, skill);
    expect(dir).toBe(path.join(tmp, 'skills', 'authored', 'code-review', 'composable'));
  });

  it('passes assetDirs through from the manifest', () => {
    const skill = getCatalogSkill(catalog, 'code-review')!;
    expect(skill.assetDirs).toEqual(['scripts']);
  });

  it('resolves the absolute assets-src dir for a named asset dir', () => {
    const skill = getCatalogSkill(catalog, 'code-review')!;
    const dir = resolveSkillAssetSrcDir(catalog, skill, 'scripts');
    expect(dir).toBe(
      path.join(tmp, 'skills', 'authored', 'code-review', 'assets-src', 'scripts'),
    );
  });
});
