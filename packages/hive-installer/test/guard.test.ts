import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GuardViolation, PathGuard } from '../src/core/guard.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-guard-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('PathGuard', () => {
  it('allows a path exactly equal to an allowed root', async () => {
    const root = path.join(tmp, 'home');
    await mkdir(root, { recursive: true });
    const guard = new PathGuard([root]);
    await expect(guard.assertWritable(root)).resolves.toBeUndefined();
  });

  it('allows a path nested under an allowed root, even if it does not exist yet', async () => {
    const root = path.join(tmp, 'home');
    await mkdir(root, { recursive: true });
    const guard = new PathGuard([root]);
    await expect(
      guard.assertWritable(path.join(root, '.claude', 'skills', 'foo', 'SKILL.md')),
    ).resolves.toBeUndefined();
  });

  it('throws GuardViolation for a path outside every allowed root', async () => {
    const root = path.join(tmp, 'home');
    const outside = path.join(tmp, 'not-home', 'passwd');
    await mkdir(root, { recursive: true });
    const guard = new PathGuard([root]);
    await expect(guard.assertWritable(outside)).rejects.toThrow(GuardViolation);
  });

  it('rejects a sibling directory that merely shares a prefix (no separator boundary)', async () => {
    const root = path.join(tmp, 'home');
    await mkdir(root, { recursive: true });
    const guard = new PathGuard([root]);
    // root + '-evil' shares the string prefix `root` but is NOT inside it.
    await expect(guard.assertWritable(`${root}-evil/file`)).rejects.toThrow(
      GuardViolation,
    );
  });

  it('normalizes ../ traversal before checking containment', async () => {
    const root = path.join(tmp, 'home', '.claude');
    await mkdir(root, { recursive: true });
    const guard = new PathGuard([root]);
    await expect(
      guard.assertWritable(path.join(root, '..', '..', '..', 'etc', 'passwd')),
    ).rejects.toThrow(GuardViolation);
  });

  it('resolves relative allowed roots and target paths against cwd', async () => {
    const guard = new PathGuard(['relative-root']);
    expect(await guard.isAllowed(path.join('relative-root', 'file.txt'))).toBe(true);
    expect(await guard.isAllowed('other-root/file.txt')).toBe(false);
  });

  it('isAllowed returns a boolean without throwing', async () => {
    const root = path.join(tmp, 'home');
    await mkdir(root, { recursive: true });
    const guard = new PathGuard([root]);
    expect(await guard.isAllowed(path.join(root, 'x'))).toBe(true);
    expect(await guard.isAllowed(path.join(tmp, 'not-home'))).toBe(false);
  });

  it('supports multiple allowed roots', async () => {
    const home = path.join(tmp, 'home');
    const backups = path.join(tmp, 'backups');
    await mkdir(home, { recursive: true });
    await mkdir(backups, { recursive: true });
    const guard = new PathGuard([home, backups]);
    expect(await guard.isAllowed(path.join(backups, '2026-01-01', 'manifest.json'))).toBe(
      true,
    );
    expect(await guard.isAllowed(path.join(tmp, 'other'))).toBe(false);
  });

  it('GuardViolation carries the offending (resolved, non-canonicalized) path and allowed roots', async () => {
    const root = path.join(tmp, 'home');
    await mkdir(root, { recursive: true });
    const outside = path.join(tmp, 'not-home', 'passwd');
    const guard = new PathGuard([root]);
    try {
      await guard.assertWritable(outside);
      throw new Error('expected assertWritable to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GuardViolation);
      const violation = err as GuardViolation;
      expect(violation.path).toBe(path.resolve(outside));
      expect(violation.allowedRoots).toEqual([path.resolve(root)]);
    }
  });

  describe('symlink canonicalization', () => {
    it('blocks a write that traverses a symlink escaping the allowed root', async () => {
      const jail = path.join(tmp, 'jail');
      const outside = path.join(tmp, 'outside');
      await mkdir(jail, { recursive: true });
      await mkdir(outside, { recursive: true });
      await symlink(outside, path.join(jail, 'escape'), 'dir');

      const guard = new PathGuard([jail]);
      const target = path.join(jail, 'escape', 'evil.txt');
      await expect(guard.assertWritable(target)).rejects.toThrow(GuardViolation);
    });

    it('does not falsely block a target reached through a symlinked-but-legitimate root', async () => {
      const realHome = path.join(tmp, 'real-home');
      await mkdir(realHome, { recursive: true });
      const homeLink = path.join(tmp, 'home-link');
      await symlink(realHome, homeLink, 'dir');

      const guard = new PathGuard([homeLink]);
      const target = path.join(homeLink, '.claude', 'skills', 'foo', 'SKILL.md');
      await expect(guard.assertWritable(target)).resolves.toBeUndefined();
    });

    it('allows a write to the symlinked root itself', async () => {
      const realHome = path.join(tmp, 'real-home');
      await mkdir(realHome, { recursive: true });
      const homeLink = path.join(tmp, 'home-link');
      await symlink(realHome, homeLink, 'dir');

      const guard = new PathGuard([homeLink]);
      await expect(guard.assertWritable(path.join(homeLink, 'SKILL.md'))).resolves.toBeUndefined();
    });
  });
});
