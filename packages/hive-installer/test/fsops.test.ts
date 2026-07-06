import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm as nodeRm, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GuardViolation } from '../src/core/guard.js';
import { PathGuard } from '../src/core/guard.js';
import { cp, mkdir, rm, writeFile, chmod } from '../src/core/fsops.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-fsops-'));
});

afterEach(async () => {
  await nodeRm(tmp, { recursive: true, force: true });
});

describe('fsops', () => {
  it('writeFile writes inside an allowed root', async () => {
    const guard = new PathGuard([tmp]);
    const target = path.join(tmp, 'a', 'b.txt');
    await writeFile(guard, target, 'hello');
    expect(await readFile(target, 'utf8')).toBe('hello');
  });

  it('writeFile throws GuardViolation for a path outside the allowlist', async () => {
    const guard = new PathGuard([path.join(tmp, 'allowed-only')]);
    const target = path.join(tmp, 'not-allowed', 'b.txt');
    await expect(writeFile(guard, target, 'nope')).rejects.toThrow(
      GuardViolation,
    );
    await expect(stat(target)).rejects.toThrow();
  });

  it('mkdir creates a directory inside an allowed root', async () => {
    const guard = new PathGuard([tmp]);
    const dir = path.join(tmp, 'nested', 'dir');
    await mkdir(guard, dir);
    expect((await stat(dir)).isDirectory()).toBe(true);
  });

  it('mkdir throws GuardViolation outside the allowlist', async () => {
    const guard = new PathGuard([path.join(tmp, 'allowed-only')]);
    await expect(mkdir(guard, path.join(tmp, 'other'))).rejects.toThrow(
      GuardViolation,
    );
  });

  it('cp copies a file when destination is allowed, regardless of source location', async () => {
    const guard = new PathGuard([path.join(tmp, 'dest-root')]);
    const srcDir = path.join(tmp, 'src-outside-allowlist');
    await nodeRm(srcDir, { recursive: true, force: true });
    const { mkdir: rawMkdir, writeFile: rawWriteFile } = await import(
      'node:fs/promises'
    );
    await rawMkdir(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'source.txt');
    await rawWriteFile(srcFile, 'payload');

    const destFile = path.join(tmp, 'dest-root', 'copy.txt');
    await cp(guard, srcFile, destFile);
    expect(await readFile(destFile, 'utf8')).toBe('payload');
  });

  it('cp throws GuardViolation when the destination is outside the allowlist', async () => {
    const guard = new PathGuard([path.join(tmp, 'dest-root')]);
    const srcFile = path.join(tmp, 'source.txt');
    await writeFile(new PathGuard([tmp]), srcFile, 'payload');
    await expect(
      cp(guard, srcFile, path.join(tmp, 'elsewhere', 'copy.txt')),
    ).rejects.toThrow(GuardViolation);
  });

  it('rm removes a file inside an allowed root', async () => {
    const guard = new PathGuard([tmp]);
    const target = path.join(tmp, 'to-delete.txt');
    await writeFile(guard, target, 'bye');
    await rm(guard, target);
    await expect(stat(target)).rejects.toThrow();
  });

  it('rm removes a directory recursively inside an allowed root', async () => {
    const guard = new PathGuard([tmp]);
    const dir = path.join(tmp, 'dir-to-delete');
    await writeFile(guard, path.join(dir, 'nested.txt'), 'x');
    await rm(guard, dir, { recursive: true });
    await expect(stat(dir)).rejects.toThrow();
  });

  it('rm throws GuardViolation outside the allowlist', async () => {
    const guard = new PathGuard([path.join(tmp, 'allowed-only')]);
    await expect(rm(guard, path.join(tmp, 'other.txt'))).rejects.toThrow(
      GuardViolation,
    );
  });

  it('chmod changes mode bits inside an allowed root', async () => {
    const guard = new PathGuard([tmp]);
    const target = path.join(tmp, 'mode.txt');
    await writeFile(guard, target, 'x');
    await chmod(guard, target, 0o600);
    const mode = (await stat(target)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('chmod throws GuardViolation outside the allowlist', async () => {
    const otherGuard = new PathGuard([path.join(tmp, 'allowed-only')]);
    await expect(chmod(otherGuard, path.join(tmp, 'x'), 0o600)).rejects.toThrow(
      GuardViolation,
    );
  });
});
