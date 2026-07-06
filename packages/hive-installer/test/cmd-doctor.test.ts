import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { CLIENT_REGISTRY } from '../src/core/registry.js';
import { loadCatalog, type Catalog } from '../src/core/catalog.js';
import { formatDoctorReport, runDoctor } from '../src/commands/doctor.js';

let tmp: string;
let homeDir: string;
let assetsDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-cmd-doctor-'));
  homeDir = path.join(tmp, 'home');
  assetsDir = path.join(tmp, 'assets');
  await mkdir(homeDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
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

describe('runDoctor (command adapter)', () => {
  it('wires registry/catalog/projectDir through to core doctor()', async () => {
    const catalog = await makeCatalog();
    const result = await runDoctor(ctx(), CLIENT_REGISTRY, catalog, {});
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.exitCode).toBe(0);
  });

  it('re-exports formatDoctorReport from core, unchanged', async () => {
    const catalog = await makeCatalog();
    const result = await runDoctor(ctx(), CLIENT_REGISTRY, catalog, {});
    const text = formatDoctorReport(result);
    expect(text).toMatch(/\d+ ok, \d+ warn, \d+ fail/);
  });
});
