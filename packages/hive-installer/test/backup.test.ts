import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmod as nodeChmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink as nodeSymlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { computeInstalledTreeHash, INSTALL_MANIFEST_FILENAME } from '../src/core/installManifest.js';
import {
  listBackups,
  restore,
  RestoreDeletionRefusalError,
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

/**
 * Recursively describe every file/symlink under `dir`, keyed by path
 * relative to `dir`: files map to their sha256, symlinks map to their
 * `symlink:<target>` marker (so a byte-identical comparison also checks
 * symlink targets, not just regular file content).
 */
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
      if (entry.isSymbolicLink()) {
        out.set(path.relative(dir, abs), `symlink:${await readlink(abs)}`);
      } else if (entry.isDirectory()) {
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
  it('creates a backup dir named <ISO8601-no-colons>-<label>-<4charsuffix> with a manifest', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'hello');

    const result = await snapshot(ctx, 'preinstall', [skillDir]);

    expect(result.id).toMatch(/^[0-9T-]+\.\d{3}Z-preinstall-[0-9a-f]{4}$/);
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
    expect(manifest.entries[0].type).toBe('file');
    expect(manifest.entries[0].sha256).toBe(
      await sha256File(path.join(skillDir, 'SKILL.md')),
    );
    expect(manifest.entries[0].size).toBe(5);
    expect(manifest.absent).toEqual([]);
  });

  it('two snapshots with the same label in the same millisecond get different ids', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'v1');

    // Same label; the random suffix must disambiguate even if the clock
    // happens to return the same millisecond for both calls.
    const results = await Promise.all([
      snapshot(ctx, 'same-label', [skillDir]),
      snapshot(ctx, 'same-label', [skillDir]),
    ]);
    expect(results[0].id).not.toBe(results[1].id);
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

  it('records a symlink entry with its target, not its dereferenced content', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-linked');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'real.md'), 'real content');
    await nodeSymlink('real.md', path.join(skillDir, 'alias.md'));

    const result = await snapshot(ctx, 'preinstall', [skillDir]);
    const symlinkEntry = result.manifest.entries.find((e) => e.relPath.endsWith('alias.md'));
    expect(symlinkEntry?.type).toBe('symlink');
    expect(symlinkEntry?.target).toBe('real.md');
  });

  it('skips a symlink whose resolution escapes the snapshot root (never captured)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-escape');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'a'.repeat(10));

    const outsideDir = path.join(tmp, 'outside-the-skill-dir');
    await mkdir(outsideDir, { recursive: true });
    await writeFile(path.join(outsideDir, 'secret.txt'), 'not ours');
    await nodeSymlink(path.join(outsideDir, 'secret.txt'), path.join(skillDir, 'escape-link'));

    const result = await snapshot(ctx, 'preinstall', [skillDir]);
    expect(result.manifest.entries.some((e) => e.relPath.endsWith('escape-link'))).toBe(false);
    expect(result.manifest.entries.some((e) => e.relPath.endsWith('SKILL.md'))).toBe(true);
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
  it('byte-identical round-trip: snapshot -> mutate -> restore, including an executable file and a symlink', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(path.join(skillDir, 'composable', 'mini'), { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'original skill body');
    await writeFile(
      path.join(skillDir, 'composable', 'mini', '00-core.md'),
      'original core content',
    );
    await writeFile(path.join(skillDir, 'run.sh'), '#!/bin/sh\necho hi\n');
    await nodeChmod(path.join(skillDir, 'run.sh'), 0o755);
    await writeFile(path.join(skillDir, 'real.md'), 'real content');
    await nodeSymlink('real.md', path.join(skillDir, 'alias.md'));

    const before = await hashTree(skillDir);
    const backup = await snapshot(ctx, 'preinstall', [skillDir]);

    // Mutate: overwrite existing file, add a new file, break the exec bit.
    await writeFile(path.join(skillDir, 'SKILL.md'), 'MUTATED');
    await writeFile(path.join(skillDir, 'composable', 'new-file.md'), 'new stuff');
    await nodeChmod(path.join(skillDir, 'run.sh'), 0o644);

    const plan = await restore(ctx, backup.id, {});
    expect(plan.writes.length).toBeGreaterThan(0);

    const after = await hashTree(skillDir);
    expect(after).toEqual(before);
    // The file created after the snapshot must be gone post-restore.
    await expect(
      stat(path.join(skillDir, 'composable', 'new-file.md')),
    ).rejects.toThrow();
    // Exec bit reproduced.
    expect((await stat(path.join(skillDir, 'run.sh'))).mode & 0o777).toBe(0o755);
    // Symlink target reproduced exactly.
    expect(await readlink(path.join(skillDir, 'alias.md'))).toBe('real.md');
  });

  it('restoring a pre-install (absent) backup deletes the tree when its install manifest hash matches', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-new');

    // Nothing exists yet -> snapshot records it as `absent`.
    const backup = await snapshot(ctx, 'preinstall', [skillDir]);

    // "Install": create the skill dir after the backup, with a valid
    // .hive-install.json whose treeSha256 matches the tree it describes.
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'freshly installed');
    const treeSha256 = await computeInstalledTreeHash(skillDir);
    await writeFile(
      path.join(skillDir, INSTALL_MANIFEST_FILENAME),
      JSON.stringify({
        skillName: 'hive-new',
        skillVersion: '1.0.0',
        treeSha256,
        installerVersion: '0.1.0',
        installedAt: new Date(0).toISOString(),
      }),
    );

    const plan = await restore(ctx, backup.id, {});
    expect(plan.deletes).toContain(skillDir);
    await expect(stat(skillDir)).rejects.toThrow();
  });

  it('refuses to delete an absent-entry path whose tree no longer matches its install manifest hash, without force', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-new');
    const backup = await snapshot(ctx, 'preinstall', [skillDir]);

    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'freshly installed');
    await writeFile(
      path.join(skillDir, INSTALL_MANIFEST_FILENAME),
      JSON.stringify({
        skillName: 'hive-new',
        skillVersion: '1.0.0',
        treeSha256: 'deadbeef'.repeat(8), // deliberately wrong
        installerVersion: '0.1.0',
        installedAt: new Date(0).toISOString(),
      }),
    );

    await expect(restore(ctx, backup.id, {})).rejects.toThrow(
      RestoreDeletionRefusalError,
    );
    await expect(stat(skillDir)).resolves.toBeTruthy(); // untouched

    const plan = await restore(ctx, backup.id, { force: true });
    expect(plan.deletes).toContain(skillDir);
    await expect(stat(skillDir)).rejects.toThrow();
  });

  it('refuses to delete an absent-entry path with no install manifest, without force (treated as user data)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-new');
    const backup = await snapshot(ctx, 'preinstall', [skillDir]);

    // Something now occupies this path, but with no .hive-install.json —
    // could be the user's own unrelated directory.
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'not-ours.txt'), 'user data');

    await expect(restore(ctx, backup.id, {})).rejects.toThrow(
      RestoreDeletionRefusalError,
    );
    await expect(stat(skillDir)).resolves.toBeTruthy(); // untouched

    const plan = await restore(ctx, backup.id, { force: true });
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

  it('verifies ALL payload hashes before any mutation (fails fast, no partial writes)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'a.md'), 'a-content');
    await writeFile(path.join(skillDir, 'b.md'), 'b-content');

    const backup = await snapshot(ctx, 'preinstall', [skillDir]);

    // Corrupt only ONE of the two payload files.
    const payloadB = path.join(
      tmp,
      '.hive-skills',
      'backups',
      backup.id,
      'payload',
      '.claude',
      'skills',
      'hive-foo',
      'b.md',
    );
    await writeFile(payloadB, 'TAMPERED');

    // Mutate the live files so we can tell whether restore touched them.
    await writeFile(path.join(skillDir, 'a.md'), 'a-mutated');
    await writeFile(path.join(skillDir, 'b.md'), 'b-mutated');

    await expect(restore(ctx, backup.id, {})).rejects.toThrow(RestoreVerificationError);

    // Neither file was touched — verification ran before any write.
    expect(await readFile(path.join(skillDir, 'a.md'), 'utf8')).toBe('a-mutated');
    expect(await readFile(path.join(skillDir, 'b.md'), 'utf8')).toBe('b-mutated');
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
    await nodeChmod(filePath, 0o750);

    const backup = await snapshot(ctx, 'preinstall', [skillDir]);
    await nodeChmod(filePath, 0o644);

    await restore(ctx, backup.id, {});
    const mode = (await stat(filePath)).mode & 0o777;
    expect(mode).toBe(0o750);
  });

  it('throws for an unknown backup id', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    await expect(restore(ctx, 'does-not-exist', {})).rejects.toThrow();
  });

  it('deletes of absent entries happen after all writes (writes ordered before deletes in the plan)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const existingDir = path.join(tmp, '.claude', 'skills', 'hive-existing');
    const newDir = path.join(tmp, '.claude', 'skills', 'hive-new');
    await mkdir(existingDir, { recursive: true });
    await writeFile(path.join(existingDir, 'SKILL.md'), 'v1');

    // existingDir is present (-> entries/writes); newDir is absent (-> deletes).
    const backup = await snapshot(ctx, 'preinstall', [existingDir, newDir]);

    await mkdir(newDir, { recursive: true });
    const treeSha256 = await computeInstalledTreeHash(newDir);
    await writeFile(
      path.join(newDir, INSTALL_MANIFEST_FILENAME),
      JSON.stringify({
        skillName: 'hive-new',
        skillVersion: '1.0.0',
        treeSha256,
        installerVersion: '0.1.0',
        installedAt: new Date(0).toISOString(),
      }),
    );

    const plan = await restore(ctx, backup.id, {});
    expect(plan.writes.some((w) => w.absPath.startsWith(existingDir))).toBe(true);
    expect(plan.deletes).toContain(newDir);
    await expect(stat(path.join(existingDir, 'SKILL.md'))).resolves.toBeTruthy();
    await expect(stat(newDir)).rejects.toThrow();
  });
});
