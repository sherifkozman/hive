import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashTree } from '../src/core/hashTree.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-hashtree-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('hashTree', () => {
  it('is deterministic for the same content', async () => {
    await writeFile(path.join(tmp, 'a.md'), 'hello');
    await mkdir(path.join(tmp, 'sub'), { recursive: true });
    await writeFile(path.join(tmp, 'sub', 'b.md'), 'world');

    const first = await hashTree(tmp);
    const second = await hashTree(tmp);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is independent of directory read order (sorted by relPath)', async () => {
    await writeFile(path.join(tmp, 'z.md'), '1');
    await writeFile(path.join(tmp, 'a.md'), '2');

    const tmp2 = await mkdtemp(path.join(os.tmpdir(), 'hive-hashtree-'));
    await writeFile(path.join(tmp2, 'a.md'), '2');
    await writeFile(path.join(tmp2, 'z.md'), '1');

    expect(await hashTree(tmp)).toBe(await hashTree(tmp2));
    await rm(tmp2, { recursive: true, force: true });
  });

  it('changes when any file content changes', async () => {
    await writeFile(path.join(tmp, 'a.md'), 'hello');
    const before = await hashTree(tmp);
    await writeFile(path.join(tmp, 'a.md'), 'hello!');
    const after = await hashTree(tmp);
    expect(after).not.toBe(before);
  });

  it('changes when a file is added or removed', async () => {
    await writeFile(path.join(tmp, 'a.md'), 'hello');
    const before = await hashTree(tmp);
    await writeFile(path.join(tmp, 'b.md'), 'new');
    const after = await hashTree(tmp);
    expect(after).not.toBe(before);
  });

  it('excludes files listed in options.exclude', async () => {
    await writeFile(path.join(tmp, 'a.md'), 'hello');
    const before = await hashTree(tmp, { exclude: ['.hive-install.json'] });
    await writeFile(path.join(tmp, '.hive-install.json'), '{"anything":"goes"}');
    const after = await hashTree(tmp, { exclude: ['.hive-install.json'] });
    expect(after).toBe(before);
  });

  it('incorporates a symlink by hashing its target string', async () => {
    await writeFile(path.join(tmp, 'a.md'), 'hello');
    const before = await hashTree(tmp);
    await symlink('a.md', path.join(tmp, 'link.md'));
    const after = await hashTree(tmp);
    expect(after).not.toBe(before);
  });
});
