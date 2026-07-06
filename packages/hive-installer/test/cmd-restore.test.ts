import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { snapshot } from '../src/core/backup.js';
import { UnknownBackupError } from '../src/commands/errors.js';
import {
  formatRestoreList,
  formatRestorePlan,
  runRestoreApply,
  runRestoreList,
} from '../src/commands/restore.js';

let tmp: string;
let homeDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-cmd-restore-'));
  homeDir = path.join(tmp, 'home');
  await mkdir(homeDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function ctx() {
  return resolveHomeContext({ homeFlag: homeDir, platform: 'linux' });
}

describe('runRestoreList', () => {
  it('empty when no backups exist', async () => {
    const result = await runRestoreList(ctx());
    expect(result.backups).toEqual([]);
  });

  it('lists an existing backup', async () => {
    const skillDir = path.join(homeDir, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'x'.repeat(20));
    await snapshot(ctx(), 'preinstall', [skillDir]);

    const result = await runRestoreList(ctx());
    expect(result.backups.length).toBe(1);
    expect(result.backups[0]?.valid).toBe(true);
  });
});

describe('runRestoreApply', () => {
  it('throws UnknownBackupError for an id not in listBackups()', async () => {
    await expect(runRestoreApply(ctx(), { backupId: 'does-not-exist' })).rejects.toThrow(UnknownBackupError);
  });

  it('restores a known backup (dry-run: no writes)', async () => {
    const skillDir = path.join(homeDir, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'original');
    const backup = await snapshot(ctx(), 'preinstall', [skillDir]);

    await writeFile(path.join(skillDir, 'SKILL.md'), 'mutated');
    const plan = await runRestoreApply(ctx(), { backupId: backup.id, dryRun: true });
    expect(plan.writes.length).toBeGreaterThan(0);
    // dry-run: file is untouched.
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')).toBe('mutated');
  });
});

describe('formatRestoreList', () => {
  it('handles an empty list', () => {
    expect(formatRestoreList({ backups: [] })).toBe('No backups found.');
  });

  it('renders id/createdAt/label/entryCount per backup', () => {
    const text = formatRestoreList({
      backups: [{ id: 'abc', createdAt: '2026-01-01T00:00:00.000Z', label: 'preinstall', entryCount: 3, valid: true }],
    });
    expect(text).toContain('abc');
    expect(text).toContain('preinstall');
    expect(text).toContain('3 entrie(s)');
  });

  it('flags a corrupt backup', () => {
    const text = formatRestoreList({ backups: [{ id: 'bad', entryCount: 0, valid: false }] });
    expect(text).toContain('CORRUPT');
  });
});

describe('formatRestorePlan', () => {
  it('renders writes/deletes counts and paths', () => {
    const text = formatRestorePlan(
      { writes: [{ relPath: 'a', absPath: '/x/a' }], deletes: ['/x/b'] },
      { dryRun: true },
    );
    expect(text).toContain('Dry run');
    expect(text).toContain('/x/a');
    expect(text).toContain('/x/b');
  });
});
