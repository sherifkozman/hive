import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { main as bundleAssets, assetsDir, packageRoot, repoRoot } from '../scripts/bundle-assets.mjs';

const execFileAsync = promisify(execFile);

interface ManifestSkill {
  name: string;
  category: string;
  version: string;
  minis: number;
  bundleTokens: number;
  description: string;
  path: string;
  assetDirs?: string[];
}

interface ManifestFile {
  relPath: string;
  sha256: string;
  size: number;
}

interface Manifest {
  generatedAt: string;
  hiveCommit: string;
  skills: ManifestSkill[];
  files: ManifestFile[];
}

async function sha256File(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash('sha256').update(buf).digest('hex');
}

async function listFilesRecursive(dir: string): Promise<string[]> {
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
      out.push(...(await listFilesRecursive(abs)));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

let manifest: Manifest;

beforeAll(async () => {
  // Run the real bundling logic against the REAL repo (packageRoot/repoRoot
  // are fixed by the script's own file location, independent of vitest's
  // cwd). Writes only ever land under this package's assets/ dir.
  await bundleAssets();
  const raw = await fs.readFile(path.join(assetsDir, 'manifest.json'), 'utf8');
  manifest = JSON.parse(raw) as Manifest;
}, 30_000);

describe('bundle-assets: manifest', () => {
  it('lists all 13 bundled skills', () => {
    expect(manifest.skills.length).toBe(13);
  });

  it('records generatedAt and hiveCommit', () => {
    expect(typeof manifest.generatedAt).toBe('string');
    expect(new Date(manifest.generatedAt).toString()).not.toBe('Invalid Date');
    expect(typeof manifest.hiveCommit).toBe('string');
    expect(manifest.hiveCommit.length).toBeGreaterThan(0);
  });

  it('spot-checks claude-api has 56 minis', () => {
    const claudeApi = manifest.skills.find((s) => s.name === 'claude-api');
    expect(claudeApi).toBeDefined();
    expect(claudeApi?.category).toBe('converted');
    expect(claudeApi?.minis).toBe(56);
    expect(claudeApi?.bundleTokens).toBeGreaterThan(0);
    expect(claudeApi?.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(claudeApi?.path).toBe('skills/converted/claude-api');
  });

  it('every skill has a non-empty, markdown-stripped description', () => {
    for (const skill of manifest.skills) {
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.description).not.toMatch(/[`*]/);
    }
  });

  it('covers all three categories', () => {
    const categories = new Set(manifest.skills.map((s) => s.category));
    expect(categories).toEqual(new Set(['authored', 'converted', 'meta']));
  });

  it('includes vendored PROVENANCE.md and LICENSE files from skills/sources', () => {
    const relPaths = manifest.files.map((f) => f.relPath);
    expect(relPaths).toContain('skills/sources/anthropic/PROVENANCE.md');
    expect(relPaths).toContain('skills/sources/financial-analyst/PROVENANCE.md');
    expect(relPaths).toContain('skills/sources/anthropic/claude-api/LICENSE.txt');
  });

  it('includes tools/hive.py, LICENSE, THIRD_PARTY_NOTICES.md', () => {
    const relPaths = manifest.files.map((f) => f.relPath);
    expect(relPaths).toContain('tools/hive.py');
    expect(relPaths).toContain('LICENSE');
    expect(relPaths).toContain('THIRD_PARTY_NOTICES.md');
  });

  it('does not list manifest.json among its own files entries', () => {
    expect(manifest.files.map((f) => f.relPath)).not.toContain('manifest.json');
  });

  it('pdf skill entry records assetDirs: ["scripts"], mirroring its vendored source scripts/ dir', () => {
    const pdf = manifest.skills.find((s) => s.name === 'pdf');
    expect(pdf).toBeDefined();
    expect(pdf?.assetDirs).toEqual(['scripts']);
  });

  it('bundles pdf scripts/ as assets-src, one file per vendored script (8 files), byte-identical to the source', async () => {
    const relPaths = manifest.files.map((f) => f.relPath).filter((p) => p.startsWith('skills/converted/pdf/assets-src/scripts/'));
    expect(relPaths.length).toBe(8);
    expect(relPaths).toContain('skills/converted/pdf/assets-src/scripts/check_fillable_fields.py');

    const bundled = await fs.readFile(
      path.join(assetsDir, 'skills/converted/pdf/assets-src/scripts/check_fillable_fields.py'),
      'utf8',
    );
    const source = await fs.readFile(
      path.join(repoRoot, 'skills/sources/anthropic/pdf/scripts/check_fillable_fields.py'),
      'utf8',
    );
    expect(bundled).toBe(source);
  });

  it('a skill with no matching vendored source (financial-analysis) has no assetDirs', () => {
    const fa = manifest.skills.find((s) => s.name === 'financial-analysis');
    expect(fa).toBeDefined();
    expect(fa?.assetDirs ?? []).toEqual([]);
  });

  it('claude-api (converted, vendored source has per-language sample dirs, none hidden) records every non-hidden top-level source dir', () => {
    const claudeApi = manifest.skills.find((s) => s.name === 'claude-api');
    expect(claudeApi).toBeDefined();
    expect(claudeApi?.assetDirs?.sort()).toEqual(
      ['csharp', 'curl', 'go', 'java', 'php', 'python', 'ruby', 'shared', 'typescript'].sort(),
    );
  });

  it('every manifest file entry exists on disk with a matching sha256 and size', async () => {
    expect(manifest.files.length).toBeGreaterThan(0);
    for (const entry of manifest.files) {
      const abs = path.join(assetsDir, ...entry.relPath.split('/'));
      const stat = await fs.stat(abs);
      expect(stat.size).toBe(entry.size);
      expect(await sha256File(abs)).toBe(entry.sha256);
    }
  });

  it('the files list matches every file actually on disk under assets/ (besides manifest.json itself)', async () => {
    const onDisk = (await listFilesRecursive(assetsDir))
      .map((abs) => path.relative(assetsDir, abs).split(path.sep).join('/'))
      .filter((rel) => rel !== 'manifest.json')
      .sort();
    const listed = manifest.files.map((f) => f.relPath).sort();
    expect(onDisk).toEqual(listed);
  });
});

describe('bundle-assets: package.json wiring', () => {
  it('build and prepack scripts invoke bundle-assets.mjs', async () => {
    const pkgRaw = await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    expect(pkg.scripts.build).toContain('scripts/bundle-assets.mjs');
    expect(pkg.scripts.prepack).toContain('build');
  });
});

describe('bundle-assets: npm pack file list (golden)', () => {
  const distDir = path.join(packageRoot, 'dist');

  beforeAll(async () => {
    // Rebuild dist/ deterministically via the project's own tsup binary
    // (not `pnpm run build`, which would recurse through prepack/lifecycle
    // noise that pollutes `npm pack --dry-run --json`'s stdout).
    const tsupBin = path.join(packageRoot, 'node_modules', '.bin', 'tsup');
    await execFileAsync(tsupBin, [], { cwd: packageRoot });
    await bundleAssets();
  }, 60_000);

  it('shebang: dist/cli.js first line is the node shebang', async () => {
    const raw = await fs.readFile(path.join(distDir, 'cli.js'), 'utf8');
    expect(raw.split('\n')[0]).toBe('#!/usr/bin/env node');
  });

  it('matches exactly: dist/** + assets/** (per manifest) + README/package.json/LICENSE, no extras, no missing', async () => {
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      { cwd: packageRoot },
    );
    const packResult = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const packedFiles = packResult[0]?.files;
    expect(packedFiles).toBeDefined();
    const actual = new Set((packedFiles ?? []).map((f) => f.path));

    const distFiles = (await listFilesRecursive(distDir)).map(
      (abs) => `dist/${path.relative(distDir, abs).split(path.sep).join('/')}`,
    );
    const expected = new Set<string>([
      'package.json',
      'README.md',
      'LICENSE',
      'assets/manifest.json',
      ...manifest.files.map((f) => `assets/${f.relPath}`),
      ...distFiles,
    ]);

    const extras = [...actual].filter((p) => !expected.has(p));
    const missing = [...expected].filter((p) => !actual.has(p));
    expect(extras).toEqual([]);
    expect(missing).toEqual([]);
    expect(actual).toEqual(expected);
  }, 60_000);
});

