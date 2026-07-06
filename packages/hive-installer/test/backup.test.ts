import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import {
  listBackups,
  restore,
  RestoreVerificationError,
  snapshot,
} from '../src/core/backup.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-backup-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function sha256File(p: string): Promise<string> {
  const buf = await readFile(p);
  return createHash('sha256').update(buf).digest('hex');
}

/** Recursively hash every file under `dir`, keyed by path relative to `dir`. */
async function hashTree(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  async function walk(current: string) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        out.set(path.relative(dir, abs), await sha256File(abs));
      }
    }
  }
  await walk(dir);
  return out;
}

describe('snapshot', () => {
  it('creates a backup dir named <ISO8601-no-colons>-<label> with a manifest', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'hello');

    const result = await snapshot(ctx, 'preinstall', [skillDir]);

    expect(result.id).toMatch(/^[0-9T-]+\.\d{3}Z-preinstall$/);
    expect(result.id).not.toContain(':');

    const backupDir = path.join(tmp, '.hive-skills', 'backups', result.id);
    const manifestRaw = await readFile(path.join(backupDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw);

    expect(manifest.label).toBe('preinstall');
    expect(typeof manifest.createdAt).toBe('string');
    expect(typeof manifest.installerVersion).toBe('string');
    expect(manifest.entries.length).toBe(1);
    expect(manifest.entries[0].relPath).toBe(
      path.join('.claude', 'skills', 'hive-foo', 'SKILL.md'),
    );
    expect(manifest.entries[0].sha256).toBe(
      await sha256File(path.join(skillDir, 'SKILL.md')),
    );
    expect(manifest.entries[0].size).toBe(5);
    expect(manifest.absent).toEqual([]);
  });

  it('records nonexistent snapshot paths in `absent` rather than throwing', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const missing = path.join(tmp, '.codex', 'skills', 'nope');

    const result = await snapshot(ctx, 'preinstall', [missing]);
    const manifestRaw = await readFile(
      path.join(tmp, '.hive-skills', 'backups', result.id, 'manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestRaw);

    expect(manifest.entries).toEqual([]);
    expect(manifest.absent).toEqual([missing]);
  });

  it('preserves nested directories and empty directories in the payload', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-nested');
    await mkdir(path.join(skillDir, 'composable', 'mini'), { recursive: true });
    await mkdir(path.join(skillDir, 'composable', 'empty-dir'), { recursive: true });
    await writeFile(path.join(skillDir, 'composable', 'mini', '00-core.md'), 'core');

    const result = await snapshot(ctx, 'preinstall', [skillDir]);
    const payloadRoot = path.join(tmp, '.hive-skills', 'backups', result.id, 'payload');
    const emptyDirAbs = path.join(
      payloadRoot,
      '.claude',
      'skills',
      'hive-nested',
      'composable',
      'empty-dir',
    );
    expect((await stat(emptyDirAbs)).isDirectory()).toBe(true);
  });
});

describe('listBackups', () => {
  it('lists all created backups', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'v1');

    const a = await snapshot(ctx, 'first', [skillDir]);
    const b = await snapshot(ctx, 'second', [skillDir]);

    const backups = await listBackups(ctx);
    const ids = backups.map((entry) => entry.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(backups.find((entry) => entry.id === a.id)?.label).toBe('first');
  });

  it('returns [] when the backups dir does not exist yet', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    expect(await listBackups(ctx)).toEqual([]);
  });
});

describe('restore', () => {
  it('byte-identical round-trip: snapshot -> mutate -> restore', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(path.join(skillDir, 'composable', 'mini'), { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'original skill body');
    await writeFile(
      path.join(skillDir, 'composable', 'mini', '00-core.md'),
      'original core content',
    );

    const before = await hashTree(skillDir);
    const backup = await snapshot(ctx, 'preinstall', [skillDir]);

    // Mutate: overwrite existing file, add a new file.
    await writeFile(path.join(skillDir, 'SKILL.md'), 'MUTATED');
    await writeFile(path.join(skillDir, 'composable', 'new-file.md'), 'new stuff');

    const plan = await restore(ctx, backup.id, {});
    expect(plan.writes.length).toBeGreaterThan(0);

    const after = await hashTree(skillDir);
    expect(after).toEqual(before);
    // The file created after the snapshot must be gone post-restore.
    await expect(
      stat(path.join(skillDir, 'composable', 'new-file.md')),
    ).rejects.toThrow();
  });

  it('restoring a pre-install (absent) backup deletes the tree that was created', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-new');

    // Nothing exists yet -> snapshot records it as `absent`.
    const backup = await snapshot(ctx, 'preinstall', [skillDir]);

    // "Install": create the skill dir after the backup.
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'freshly installed');

    const plan = await restore(ctx, backup.id, {});
    expect(plan.deletes).toContain(skillDir);
    await expect(stat(skillDir)).rejects.toThrow();
  });

  it('dry-run performs zero filesystem writes', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'original');

    const backup = await snapshot(ctx, 'preinstall', [skillDir]);
    await writeFile(path.join(skillDir, 'SKILL.md'), 'mutated');

    const beforeWholeTree = await hashTree(tmp);
    const plan = await restore(ctx, backup.id, { dryRun: true });
    const afterWholeTree = await hashTree(tmp);

    expect(plan.writes.length).toBeGreaterThan(0);
    expect(afterWholeTree).toEqual(beforeWholeTree);
    // Mutation must still be in place — dry run did not restore it.
    expect(await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')).toBe('mutated');
  });

  it('refuses to restore on payload hash mismatch unless force is set', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'original');

    const backup = await snapshot(ctx, 'preinstall', [skillDir]);

    // Corrupt the backup payload after the fact.
    const payloadFile = path.join(
      tmp,
      '.hive-skills',
      'backups',
      backup.id,
      'payload',
      '.claude',
      'skills',
      'hive-foo',
      'SKILL.md',
    );
    await writeFile(payloadFile, 'TAMPERED');

    await expect(restore(ctx, backup.id, {})).rejects.toThrow(
      RestoreVerificationError,
    );

    // With force: true, restore proceeds despite the mismatch.
    const plan = await restore(ctx, backup.id, { force: true });
    expect(plan.writes.length).toBeGreaterThan(0);
    expect(await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')).toBe('TAMPERED');
  });

  it('preserves file mode bits through backup and restore', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    const filePath = path.join(skillDir, 'run.sh');
    await writeFile(filePath, '#!/bin/sh\necho hi\n');
    const { chmod } = await import('node:fs/promises');
    await chmod(filePath, 0o750);

    const backup = await snapshot(ctx, 'preinstall', [skillDir]);
    await chmod(filePath, 0o644);

    await restore(ctx, backup.id, {});
    const mode = (await stat(filePath)).mode & 0o777;
    expect(mode).toBe(0o750);
  });

  it('throws for an unknown backup id', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    await expect(restore(ctx, 'does-not-exist', {})).rejects.toThrow();
  });
});
