import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GuardViolation, PathGuard } from '../src/core/guard.js';
import { atomicReplaceDir, atomicWriteFile } from '../src/core/atomic.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-atomic-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('atomicWriteFile', () => {
  it('writes content at the destination and leaves no temp files behind', async () => {
    const guard = new PathGuard([tmp]);
    const dest = path.join(tmp, 'a', 'b.txt');
    await atomicWriteFile(guard, dest, 'hello');
    expect(await readFile(dest, 'utf8')).toBe('hello');
    expect(await readdir(path.join(tmp, 'a'))).toEqual(['b.txt']);
  });

  it('overwrites an existing file atomically', async () => {
    const guard = new PathGuard([tmp]);
    const dest = path.join(tmp, 'b.txt');
    await atomicWriteFile(guard, dest, 'v1');
    await atomicWriteFile(guard, dest, 'v2');
    expect(await readFile(dest, 'utf8')).toBe('v2');
    expect(await readdir(tmp)).toEqual(['b.txt']);
  });

  it('throws GuardViolation for a destination outside the allowlist, without writing', async () => {
    const guard = new PathGuard([path.join(tmp, 'allowed-only')]);
    const dest = path.join(tmp, 'other', 'b.txt');
    await expect(atomicWriteFile(guard, dest, 'x')).rejects.toThrow(GuardViolation);
    await expect(stat(dest)).rejects.toThrow();
  });
});

describe('atomicReplaceDir', () => {
  it('populates a staging dir then renames it into place', async () => {
    const guard = new PathGuard([tmp]);
    const dest = path.join(tmp, 'skill-dir');
    await atomicReplaceDir(guard, dest, async (staging) => {
      await writeFile(path.join(staging, 'SKILL.md'), 'v1');
    });
    expect(await readFile(path.join(dest, 'SKILL.md'), 'utf8')).toBe('v1');
  });

  it('fully replaces prior content at the destination (not merged)', async () => {
    const guard = new PathGuard([tmp]);
    const dest = path.join(tmp, 'skill-dir');
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, 'old.md'), 'old');

    await atomicReplaceDir(guard, dest, async (staging) => {
      await writeFile(path.join(staging, 'new.md'), 'new');
    });

    expect(await readdir(dest)).toEqual(['new.md']);
  });

  it('leaves the destination untouched and cleans up staging if populate() throws', async () => {
    const guard = new PathGuard([tmp]);
    const dest = path.join(tmp, 'skill-dir');
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, 'old.md'), 'old');

    await expect(
      atomicReplaceDir(guard, dest, async () => {
        throw new Error('populate failed');
      }),
    ).rejects.toThrow('populate failed');

    expect(await readdir(dest)).toEqual(['old.md']);
    const siblings = await readdir(tmp);
    expect(siblings.filter((name) => name.includes('staging'))).toEqual([]);
  });

  it('throws GuardViolation for a destination outside the allowlist, without calling populate', async () => {
    const guard = new PathGuard([path.join(tmp, 'allowed-only')]);
    const dest = path.join(tmp, 'other-dir');
    let called = false;
    await expect(
      atomicReplaceDir(guard, dest, async () => {
        called = true;
      }),
    ).rejects.toThrow(GuardViolation);
    expect(called).toBe(false);
  });
});
