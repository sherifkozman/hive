import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRegistryOverride, resolveAssetsRoot, resolveContext } from '../src/context.js';

describe('resolveAssetsRoot', () => {
  it('defaults to <package root>/assets, derived from this module location', () => {
    const root = resolveAssetsRoot({});
    expect(path.basename(root)).toBe('assets');
    // src/context.ts -> '..' -> package root -> 'assets'.
    expect(root).toBe(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'assets'));
  });

  it('HIVE_SKILLS_ASSETS overrides the default and is path.resolve-d', () => {
    const root = resolveAssetsRoot({ HIVE_SKILLS_ASSETS: './somewhere/assets' });
    expect(root).toBe(path.resolve('./somewhere/assets'));
  });

  it('ignores a blank HIVE_SKILLS_ASSETS', () => {
    const root = resolveAssetsRoot({ HIVE_SKILLS_ASSETS: '   ' });
    expect(path.basename(root)).toBe('assets');
  });
});

describe('loadRegistryOverride', () => {
  let tmp: string;

  it('returns undefined when no flag is given', async () => {
    expect(await loadRegistryOverride(undefined)).toBeUndefined();
  });

  it('reads and parses a JSON override file', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-context-'));
    try {
      const file = path.join(tmp, 'registry.json');
      await writeFile(file, JSON.stringify({ 'claude-code': { confidence: 'assumed' } }));
      expect(await loadRegistryOverride(file)).toEqual({ 'claude-code': { confidence: 'assumed' } });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('resolveContext', () => {
  let tmp: string;
  let homeDir: string;
  let assetsDir: string;

  async function makeAssets(dir: string) {
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ generatedAt: new Date(0).toISOString(), hiveCommit: 'test', skills: [], files: [] }),
    );
  }

  it('resolves ctx/registry/catalog from --home, --registry, and an explicit assetsRoot', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-context-resolve-'));
    try {
      homeDir = path.join(tmp, 'home');
      assetsDir = path.join(tmp, 'assets');
      await mkdir(homeDir, { recursive: true });
      await makeAssets(assetsDir);

      const registryFile = path.join(tmp, 'registry.json');
      await writeFile(registryFile, JSON.stringify({ 'claude-code': { confidence: 'assumed' } }));

      const resolved = await resolveContext(
        { home: homeDir, registry: registryFile },
        { assetsRoot: assetsDir, env: {} },
      );

      expect(resolved.ctx.home).toBe(path.resolve(homeDir));
      expect(resolved.assetsRoot).toBe(assetsDir);
      expect(resolved.catalog.skills).toEqual([]);
      const claudeCode = resolved.registry.find((e) => e.id === 'claude-code');
      expect(claudeCode?.confidence).toBe('assumed');
      // Untouched fields survive the merge.
      expect(claudeCode?.strategy).toBe('native-skills');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('honors HIVE_SKILLS_REGISTRY when --registry is not passed', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-context-envreg-'));
    try {
      homeDir = path.join(tmp, 'home');
      assetsDir = path.join(tmp, 'assets');
      await mkdir(homeDir, { recursive: true });
      await makeAssets(assetsDir);

      const registryFile = path.join(tmp, 'registry.json');
      await writeFile(registryFile, JSON.stringify({ codex: { confidence: 'assumed' } }));

      const resolved = await resolveContext(
        { home: homeDir },
        { assetsRoot: assetsDir, env: { HIVE_SKILLS_REGISTRY: registryFile } },
      );

      expect(resolved.registry.find((e) => e.id === 'codex')?.confidence).toBe('assumed');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('a --registry flag wins over HIVE_SKILLS_REGISTRY', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-context-regwins-'));
    try {
      homeDir = path.join(tmp, 'home');
      assetsDir = path.join(tmp, 'assets');
      await mkdir(homeDir, { recursive: true });
      await makeAssets(assetsDir);

      const flagFile = path.join(tmp, 'flag.json');
      const envFile = path.join(tmp, 'env.json');
      await writeFile(flagFile, JSON.stringify({ codex: { confidence: 'verified' } }));
      await writeFile(envFile, JSON.stringify({ codex: { confidence: 'assumed' } }));

      const resolved = await resolveContext(
        { home: homeDir, registry: flagFile },
        { assetsRoot: assetsDir, env: { HIVE_SKILLS_REGISTRY: envFile } },
      );

      expect(resolved.registry.find((e) => e.id === 'codex')?.confidence).toBe('verified');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('with no --registry/env override, returns the built-in registry unchanged', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-context-noreg-'));
    try {
      homeDir = path.join(tmp, 'home');
      assetsDir = path.join(tmp, 'assets');
      await mkdir(homeDir, { recursive: true });
      await makeAssets(assetsDir);

      const resolved = await resolveContext({ home: homeDir }, { assetsRoot: assetsDir, env: {} });
      expect(resolved.registry.length).toBeGreaterThan(0);
      expect(resolved.registry.find((e) => e.id === 'claude-code')?.confidence).toBe('verified');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
