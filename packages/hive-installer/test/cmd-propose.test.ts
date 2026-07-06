import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { CLIENT_REGISTRY } from '../src/core/registry.js';
import { loadCatalog, type Catalog } from '../src/core/catalog.js';
import { formatProposeSummary, runPropose } from '../src/commands/propose.js';

let tmp: string;
let homeDir: string;
let assetsDir: string;
let outDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-cmd-propose-'));
  homeDir = path.join(tmp, 'home');
  assetsDir = path.join(tmp, 'assets');
  outDir = path.join(tmp, 'out');
  await mkdir(homeDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function ctx() {
  return resolveHomeContext({ homeFlag: homeDir, platform: 'linux' });
}

async function makeCatalog(): Promise<Catalog> {
  await writeFile(
    path.join(assetsDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date(0).toISOString(), hiveCommit: 'test', skills: [], files: [] }),
  );
  return loadCatalog(assetsDir);
}

describe('runPropose', () => {
  it('defaults clients to every detected client when --client is omitted', async () => {
    await mkdir(path.join(homeDir, '.claude', 'skills', 'my-rule'), { recursive: true });
    await writeFile(path.join(homeDir, '.claude', 'skills', 'my-rule', 'x.md'), 'x'.repeat(21000));

    const catalog = await makeCatalog();
    const result = await runPropose(ctx(), CLIENT_REGISTRY, catalog, {
      out: path.join(outDir, 'proposals.md'),
      now: () => '2026-01-01T00:00:00.000Z',
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]?.classification).toBe('strong');
  });

  it('writes the rendered doc to --out, guarded to that file\'s parent dir only', async () => {
    const catalog = await makeCatalog();
    const outPath = path.join(outDir, 'nested', 'proposals.md');
    const result = await runPropose(ctx(), CLIENT_REGISTRY, catalog, {
      clients: [],
      out: outPath,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    expect(result.outPath).toBe(path.resolve(outPath));
    const written = await readFile(outPath, 'utf8');
    expect(written).toContain('Hive Conversion Proposals');
    expect(written).toContain('2026-01-01T00:00:00.000Z');
  });

  it('defaults --out to ./hive-conversion-proposals.md when not given', async () => {
    const catalog = await makeCatalog();
    const originalCwd = process.cwd();
    process.chdir(outDir);
    try {
      const result = await runPropose(ctx(), CLIENT_REGISTRY, catalog, { clients: [] });
      // Compare via realpath: process.cwd() resolves symlinks (e.g. macOS's
      // /tmp -> /private/tmp) even though outDir itself (built from
      // os.tmpdir()) may not be pre-resolved.
      const { realpath } = await import('node:fs/promises');
      expect(await realpath(result.outPath)).toBe(
        path.join(await realpath(outDir), 'hive-conversion-proposals.md'),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe('formatProposeSummary', () => {
  it('counts candidates by classification and reports the out path', () => {
    const text = formatProposeSummary({
      outPath: '/tmp/proposals.md',
      doc: '',
      candidates: [
        { clientId: 'claude-code', clientName: 'Claude Code', sourcePath: '/a', tokensEst: 6000, classification: 'strong', rationale: 'r' },
        { clientId: 'claude-code', clientName: 'Claude Code', sourcePath: '/b', tokensEst: 3000, classification: 'borderline', rationale: 'r' },
      ],
    });
    expect(text).toContain('2 candidate(s) scanned: 1 strong, 1 borderline, 0 keep-as-is.');
    expect(text).toContain('/tmp/proposals.md');
  });
});
