import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { main as bundleAssets, packageRoot } from '../scripts/bundle-assets.mjs';

const execFileAsync = promisify(execFile);

/**
 * Proves the shipped tarball is actually self-sufficient (spec §5/G2:
 * `npm pack` + `node <tarball> --help`/`scan --json` must work from the
 * tarball alone) — this is the one test in the suite that never touches
 * `src/` at runtime, only the packed `dist/` + `assets/` a real `npm
 * install hive-skills` would extract. Serial/long-timeout: it runs a
 * real tsup build, a real `npm pack`, and a real `tar -x` before any
 * assertion.
 */

let extractedCliPath: string;
let workDir: string;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function runCli(args: string[], extraEnv: Record<string, string> = {}): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [extractedCliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

beforeAll(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hive-pack-e2e-'));

  // Real build (tsup binary directly, like bundle-assets.test.ts's golden
  // test — NOT `pnpm run build`, which recurses through lifecycle noise
  // that pollutes `npm pack`'s stdout).
  const tsupBin = path.join(packageRoot, 'node_modules', '.bin', 'tsup');
  await execFileAsync(tsupBin, [], { cwd: packageRoot });
  await bundleAssets();

  // A REAL (non-dry-run) `npm pack`, writing the tarball into workDir
  // rather than the package root.
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--ignore-scripts', '--json', `--pack-destination=${workDir}`],
    { cwd: packageRoot },
  );
  const packResult = JSON.parse(stdout) as Array<{ filename: string }>;
  const tarballName = packResult[0]?.filename;
  if (!tarballName) throw new Error('npm pack produced no tarball filename');
  const tarballPath = path.join(workDir, tarballName);

  const extractDir = path.join(workDir, 'extracted');
  await fs.mkdir(extractDir, { recursive: true });
  await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractDir]);

  extractedCliPath = path.join(extractDir, 'package', 'dist', 'cli.js');
  if (!(await pathExists(extractedCliPath))) {
    throw new Error(`extracted tarball has no dist/cli.js at ${extractedCliPath}`);
  }
}, 120_000);

afterAll(async () => {
  if (workDir) await fs.rm(workDir, { recursive: true, force: true });
});

describe('packed tarball: --help', () => {
  it('exits 0 and prints usage', () => {
    const { status, stdout } = runCli(['--help']);
    expect(status).toBe(0);
    expect(stdout).toContain('Usage: hive-skills');
  });
});

describe('packed tarball: scan --json', () => {
  it('detects fake clients in a fixture --home', async () => {
    const fixtureHome = path.join(workDir, 'fixture-scan');
    await fs.mkdir(path.join(fixtureHome, '.claude'), { recursive: true });
    await fs.mkdir(path.join(fixtureHome, '.codex'), { recursive: true });

    const { status, stdout } = runCli(['scan', '--json', '--home', fixtureHome]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as { clients: Array<{ id: string; detected: boolean }> };
    expect(parsed.clients.find((c) => c.id === 'claude-code')?.detected).toBe(true);
    expect(parsed.clients.find((c) => c.id === 'codex')?.detected).toBe(true);
    expect(parsed.clients.find((c) => c.id === 'gemini')?.detected).toBe(false);
  });
});

describe('packed tarball: install --client claude-code --all --yes', () => {
  it('installs every bundled skill for real, from the packed assets alone', async () => {
    const fixtureHome = path.join(workDir, 'fixture-install');
    await fs.mkdir(path.join(fixtureHome, '.claude'), { recursive: true });

    const { status, stdout } = runCli([
      'install',
      '--client',
      'claude-code',
      '--all',
      '--yes',
      '--home',
      fixtureHome,
    ]);
    expect(status).toBe(0);
    expect(stdout).toContain('Performed');

    const skillsDir = path.join(fixtureHome, '.claude', 'skills');
    const entries = await fs.readdir(skillsDir);
    const installed = entries.filter((e) => e.startsWith('hive-'));
    expect(installed.length).toBeGreaterThan(0);

    for (const skillDir of installed) {
      const abs = path.join(skillsDir, skillDir);
      expect(await pathExists(path.join(abs, '.hive-install.json'))).toBe(true);
      expect(await pathExists(path.join(abs, 'SKILL.md'))).toBe(true);
      expect(await pathExists(path.join(abs, 'composable', 'INDEX.md'))).toBe(true);
    }

    // Regression test for the dead-script-path bug: hive-pdf's minis reference
    // `scripts/check_fillable_fields.py` (and siblings) by relative path (CCS
    // spec §9, non-knowledge assets referenced by path). Prove the installed
    // artifact actually carries the referenced script, not just the .md tree.
    const pdfDir = path.join(skillsDir, 'hive-pdf');
    expect(await pathExists(pdfDir)).toBe(true);
    expect(await pathExists(path.join(pdfDir, 'scripts', 'check_fillable_fields.py'))).toBe(true);
  });
});

describe('packed tarball: doctor --json', () => {
  it('exits 0 on the freshly-installed fixture', async () => {
    const fixtureHome = path.join(workDir, 'fixture-install'); // reuses the install fixture above
    const { status, stdout } = runCli(['doctor', '--json', '--home', fixtureHome]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as { exitCode: number; checks: unknown[] };
    expect(parsed.exitCode).toBe(0);
    expect(parsed.checks.length).toBeGreaterThan(0);
  });
});

describe('packed tarball: restore --list', () => {
  it('shows the automatic pre-install backup', async () => {
    const fixtureHome = path.join(workDir, 'fixture-install'); // install ran a pre-install backup automatically
    const { status, stdout } = runCli(['restore', '--list', '--json', '--home', fixtureHome]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as { backups: Array<{ id: string; label?: string }> };
    expect(parsed.backups.length).toBeGreaterThan(0);
    expect(parsed.backups[0]?.label).toBe('preinstall');
  });
});
