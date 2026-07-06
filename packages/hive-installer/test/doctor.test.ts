import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { loadCatalog, type Catalog } from '../src/core/catalog.js';
import { executeInstall, planInstall, type ExecutePorts } from '../src/core/installer.js';
import { snapshot } from '../src/core/backup.js';
import { renderPointerBlock } from '../src/core/pointer.js';
import { BUNDLE_GENERATED_MARKER, doctor, formatDoctorReport, type DoctorCheck } from '../src/core/doctor.js';

let tmp: string;
let homeDir: string;
let assetsDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-doctor-'));
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

async function makeCatalog(
  skillOpts: Array<{ category: string; name: string; version?: string }>,
): Promise<Catalog> {
  const skills = [];
  for (const opts of skillOpts) {
    const composableDir = path.join(assetsDir, 'skills', opts.category, opts.name, 'composable');
    await mkdir(path.join(composableDir, 'mini'), { recursive: true });
    await writeFile(path.join(composableDir, 'INDEX.md'), `# ${opts.name}\n\nA test skill.\n`);
    await writeFile(path.join(composableDir, 'mini', '00-core.md'), 'core content');
    await writeFile(path.join(composableDir, 'BUNDLE.md'), `${BUNDLE_GENERATED_MARKER}\nbundle content\n`);
    await writeFile(path.join(composableDir, 'VERSION'), opts.version ?? '1.0.0');
    skills.push({
      name: opts.name,
      category: opts.category,
      version: opts.version ?? '1.0.0',
      minis: 1,
      bundleTokens: 10,
      description: 'A test skill.',
      path: `skills/${opts.category}/${opts.name}`,
    });
  }
  await writeFile(
    path.join(assetsDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date(0).toISOString(), hiveCommit: 'test', skills, files: [] }),
  );
  return loadCatalog(assetsDir);
}

const alwaysConfirm: ExecutePorts = { confirmPointerWrite: async () => true };

function find(checks: DoctorCheck[], id: string): DoctorCheck | undefined {
  return checks.find((c) => c.id === id);
}

describe('doctor: node version', () => {
  it('ok when Node >= 18', async () => {
    const result = await doctor(ctx(), { python: false, ports: { nodeVersion: () => 'v20.10.0' } });
    expect(find(result.checks, 'node-version')?.status).toBe('ok');
  });

  it('fail when Node < 18, and sets exitCode 1', async () => {
    const result = await doctor(ctx(), { python: false, ports: { nodeVersion: () => 'v16.20.0' } });
    expect(find(result.checks, 'node-version')?.status).toBe('fail');
    expect(result.exitCode).toBe(1);
  });
});

describe('doctor: python3 (never fails)', () => {
  it('skipped -> warn, when python: false', async () => {
    const result = await doctor(ctx(), { python: false });
    const check = find(result.checks, 'python3');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('skipped');
  });

  it('warn when not found', async () => {
    const result = await doctor(ctx(), { ports: { probePython: async () => undefined } });
    const check = find(result.checks, 'python3');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('not found');
  });

  it('ok when found and >= 3.11', async () => {
    const result = await doctor(ctx(), { ports: { probePython: async () => 'Python 3.11.4' } });
    expect(find(result.checks, 'python3')?.status).toBe('ok');
  });

  it('warn (not fail) when found but < 3.11', async () => {
    const result = await doctor(ctx(), { ports: { probePython: async () => 'Python 3.9.0' } });
    const check = find(result.checks, 'python3');
    expect(check?.status).toBe('warn');
    expect(result.exitCode).toBe(0);
  });
});

describe('doctor: per-client readable/writable', () => {
  it('reports ok for a detected, readable, writable client', async () => {
    await mkdir(path.join(homeDir, '.claude'), { recursive: true });
    const result = await doctor(ctx(), { python: false });
    expect(find(result.checks, 'client-readable:claude-code')?.status).toBe('ok');
    expect(find(result.checks, 'client-writable:claude-code')?.status).toBe('ok');
  });

  it('does not report checks for an undetected client', async () => {
    const result = await doctor(ctx(), { python: false });
    expect(find(result.checks, 'client-readable:claude-code')).toBeUndefined();
  });

  it('fails when the skill location is not writable, and sets exitCode 1', async () => {
    await mkdir(path.join(homeDir, '.claude', 'skills'), { recursive: true });
    await chmod(path.join(homeDir, '.claude', 'skills'), 0o500); // read+execute only
    try {
      const result = await doctor(ctx(), { python: false });
      expect(find(result.checks, 'client-writable:claude-code')?.status).toBe('fail');
      expect(result.exitCode).toBe(1);
    } finally {
      await chmod(path.join(homeDir, '.claude', 'skills'), 0o700); // restore for cleanup
    }
  });

  it('does not check writability for a scan-only client', async () => {
    await mkdir(path.join(homeDir, '.continue'), { recursive: true });
    const result = await doctor(ctx(), { python: false });
    expect(find(result.checks, 'client-readable:continue')?.status).toBe('ok');
    expect(find(result.checks, 'client-writable:continue')).toBeUndefined();
  });
});

describe('doctor: installed skills', () => {
  it('reports ok for a freshly, cleanly installed skill', async () => {
    const catalog = await makeCatalog([{ category: 'authored', name: 'foo' }]);
    const plan = await planInstall(ctx(), { clients: ['claude-code'], skills: ['foo'], catalog });
    await executeInstall(ctx(), plan, alwaysConfirm, {});

    const result = await doctor(ctx(), { python: false, catalog });
    const check = find(result.checks, 'skill:claude-code:hive-foo');
    expect(check?.status).toBe('ok');
    expect(check?.detail).toContain('healthy');
  });

  it('warns when the tree was modified after install (hash mismatch)', async () => {
    const catalog = await makeCatalog([{ category: 'authored', name: 'foo' }]);
    const plan = await planInstall(ctx(), { clients: ['claude-code'], skills: ['foo'], catalog });
    await executeInstall(ctx(), plan, alwaysConfirm, {});

    const destDir = path.join(homeDir, '.claude', 'skills', 'hive-foo');
    await writeFile(path.join(destDir, 'composable', 'mini', '00-core.md'), 'tampered content');

    const result = await doctor(ctx(), { python: false, catalog });
    const check = find(result.checks, 'skill:claude-code:hive-foo');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('modified since install');
  });

  it('warns when BUNDLE.md is missing the generated marker (hand-edited)', async () => {
    const catalog = await makeCatalog([{ category: 'authored', name: 'foo' }]);
    const plan = await planInstall(ctx(), { clients: ['claude-code'], skills: ['foo'], catalog });
    await executeInstall(ctx(), plan, alwaysConfirm, {});

    const destDir = path.join(homeDir, '.claude', 'skills', 'hive-foo');
    await writeFile(path.join(destDir, 'composable', 'BUNDLE.md'), 'hand edited, no marker');

    const result = await doctor(ctx(), { python: false, catalog });
    expect(find(result.checks, 'skill:claude-code:hive-foo')?.detail).toContain('generated marker');
  });

  it('warns with an upgrade hint when installed version is older than the bundled catalog', async () => {
    const catalog1 = await makeCatalog([{ category: 'authored', name: 'foo', version: '1.0.0' }]);
    const plan = await planInstall(ctx(), { clients: ['claude-code'], skills: ['foo'], catalog: catalog1 });
    await executeInstall(ctx(), plan, alwaysConfirm, {});

    const catalog2 = await makeCatalog([{ category: 'authored', name: 'foo', version: '2.0.0' }]);
    const result = await doctor(ctx(), { python: false, catalog: catalog2 });
    const check = find(result.checks, 'skill:claude-code:hive-foo');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('upgrade available');
    expect(check?.fix).toContain('2.0.0');
  });

  it('does not fail (only warn) for a stale/tampered install — exitCode stays 0', async () => {
    const catalog = await makeCatalog([{ category: 'authored', name: 'foo' }]);
    const plan = await planInstall(ctx(), { clients: ['claude-code'], skills: ['foo'], catalog });
    await executeInstall(ctx(), plan, alwaysConfirm, {});
    const destDir = path.join(homeDir, '.claude', 'skills', 'hive-foo');
    await writeFile(path.join(destDir, 'composable', 'mini', '00-core.md'), 'tampered');

    const result = await doctor(ctx(), { python: false, catalog });
    expect(result.exitCode).toBe(0);
  });

  it('warns when a hive-* dir exists with no .hive-install.json', async () => {
    await mkdir(path.join(homeDir, '.claude', 'skills', 'hive-orphan'), { recursive: true });
    const result = await doctor(ctx(), { python: false });
    const check = find(result.checks, 'skill:claude-code:hive-orphan');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('no .hive-install.json');
  });

  it('does not double-report a payload client whose global location equals its payload path (gemini)', async () => {
    const catalog = await makeCatalog([{ category: 'authored', name: 'foo' }]);
    const plan = await planInstall(ctx(), { clients: ['gemini'], skills: ['foo'], catalog });
    await executeInstall(ctx(), plan, alwaysConfirm, {});

    const result = await doctor(ctx(), { python: false, catalog });
    const matches = result.checks.filter((c) => c.id === 'skill:gemini:hive-foo');
    expect(matches.length).toBe(1);
  });
});

describe('doctor: dangling pointer blocks', () => {
  it('warns when the managed block is present but its payload dir does not exist', async () => {
    await mkdir(path.join(homeDir, '.gemini'), { recursive: true });
    const payloadDir = path.join(homeDir, '.gemini', 'hive-skills');
    await writeFile(
      path.join(homeDir, '.gemini', 'GEMINI.md'),
      `my rules\n\n${renderPointerBlock(payloadDir)}\n`,
    );
    // payloadDir deliberately never created (simulates restore-uninstall
    // of a fresh install, which leaves the block behind by design).

    const result = await doctor(ctx(), { python: false });
    const check = find(result.checks, 'dangling-pointer-block:gemini');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain(payloadDir);
    expect(check?.fix).toContain('# >>> hive-skills >>>');
  });

  it('ok when the managed block is present and its payload dir contains a hive-* skill', async () => {
    await mkdir(path.join(homeDir, '.gemini'), { recursive: true });
    const payloadDir = path.join(homeDir, '.gemini', 'hive-skills');
    await mkdir(path.join(payloadDir, 'hive-foo'), { recursive: true });
    await writeFile(
      path.join(homeDir, '.gemini', 'GEMINI.md'),
      `my rules\n\n${renderPointerBlock(payloadDir)}\n`,
    );

    const result = await doctor(ctx(), { python: false });
    expect(find(result.checks, 'dangling-pointer-block:gemini')?.status).toBe('ok');
  });

  it('does not emit a check when the pointer file has no managed block', async () => {
    await mkdir(path.join(homeDir, '.gemini'), { recursive: true });
    await writeFile(path.join(homeDir, '.gemini', 'GEMINI.md'), 'just my own rules, no hive block\n');

    const result = await doctor(ctx(), { python: false });
    expect(find(result.checks, 'dangling-pointer-block:gemini')).toBeUndefined();
  });

  it('does not emit a check when the pointer file does not exist at all', async () => {
    await mkdir(path.join(homeDir, '.gemini'), { recursive: true });
    const result = await doctor(ctx(), { python: false });
    expect(find(result.checks, 'dangling-pointer-block:gemini')).toBeUndefined();
  });

  // Regression for the motivating scenario: restore-uninstall of the last
  // skill removes only the recorded hive-<skill> subdir, never the payload
  // root atomicReplaceDir created — so an empty payload root must read as
  // dangling, not ok.
  it('install -> restore-uninstall leaves an empty payload root, which is reported as dangling (warn)', async () => {
    const catalog = await makeCatalog([{ category: 'authored', name: 'foo' }]);
    const plan = await planInstall(ctx(), { clients: ['gemini'], skills: ['foo'], catalog });
    const installResult = await executeInstall(ctx(), plan, alwaysConfirm, {});

    const { restore } = await import('../src/core/backup.js');
    await restore(ctx(), installResult.backups[0]!.id, {});

    const skillDir = path.join(homeDir, '.gemini', 'hive-skills', 'hive-foo');
    const payloadRoot = path.join(homeDir, '.gemini', 'hive-skills');
    await expect(stat(skillDir)).rejects.toThrow(); // the skill itself is gone
    await expect(stat(payloadRoot)).resolves.toBeTruthy(); // but the empty parent lingers

    const gemini = await readFile(path.join(homeDir, '.gemini', 'GEMINI.md'), 'utf8');
    expect(gemini).toContain('# >>> hive-skills >>>'); // block left behind, as designed

    const doctorResult = await doctor(ctx(), { python: false, catalog });
    expect(find(doctorResult.checks, 'dangling-pointer-block:gemini')?.status).toBe('warn');
  });
});

describe('doctor: backups', () => {
  it('ok with zero backups yet', async () => {
    const result = await doctor(ctx(), { python: false });
    const check = find(result.checks, 'backups-dir');
    expect(check?.status).toBe('ok');
    expect(check?.detail).toContain('0 backup(s)');
  });

  it('ok and reports count/size after some backups exist', async () => {
    const skillDir = path.join(homeDir, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'x'.repeat(100));
    await snapshot(ctx(), 'preinstall', [skillDir]);
    await snapshot(ctx(), 'preinstall', [skillDir]);

    const result = await doctor(ctx(), { python: false });
    const check = find(result.checks, 'backups-dir');
    expect(check?.status).toBe('ok');
    expect(check?.detail).toContain('2 backup(s)');
  });

  it('warns (not fails) on a corrupt backup manifest', async () => {
    const backupDir = path.join(homeDir, '.hive-skills', 'backups', 'corrupt-one');
    await mkdir(backupDir, { recursive: true });
    await writeFile(path.join(backupDir, 'manifest.json'), 'not json{{{');

    const result = await doctor(ctx(), { python: false });
    const check = find(result.checks, 'backups-dir');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('corrupt-one');
    expect(result.exitCode).toBe(0);
  });
});

describe('doctor: exitCode aggregation', () => {
  it('exitCode is 1 if ANY check fails, even when others are ok/warn', async () => {
    await mkdir(path.join(homeDir, '.claude', 'skills'), { recursive: true });
    await chmod(path.join(homeDir, '.claude', 'skills'), 0o500);
    try {
      const result = await doctor(ctx(), { ports: { probePython: async () => undefined } }); // python -> warn
      expect(result.checks.some((c) => c.status === 'warn')).toBe(true);
      expect(result.checks.some((c) => c.status === 'fail')).toBe(true);
      expect(result.exitCode).toBe(1);
    } finally {
      await chmod(path.join(homeDir, '.claude', 'skills'), 0o700);
    }
  });

  it('exitCode is 0 when nothing fails, even with several warns', async () => {
    const result = await doctor(ctx(), { ports: { probePython: async () => undefined } });
    expect(result.exitCode).toBe(0);
  });
});

describe('formatDoctorReport', () => {
  it('renders a labeled line per check plus a summary line, and includes fix hints', async () => {
    const result = await doctor(ctx(), { python: false });
    const report = formatDoctorReport(result);
    expect(report).toContain('[OK]');
    expect(report).toMatch(/\d+ ok, \d+ warn, \d+ fail/);
  });

  it('includes fix hints on their own line when present', async () => {
    const result = await doctor(ctx(), { python: false, ports: { nodeVersion: () => 'v16.0.0' } });
    const report = formatDoctorReport(result);
    expect(report).toContain('[FAIL]');
    expect(report).toContain('fix:');
  });
});
