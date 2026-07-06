import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { acquireLock, LockError, withLock } from '../src/core/lock.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-lock-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('acquireLock', () => {
  it('creates a lock file under ~/.hive-skills/.lock containing our pid', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const handle = await acquireLock(ctx);
    const lockPath = path.join(tmp, '.hive-skills', '.lock');
    const raw = JSON.parse(await readFile(lockPath, 'utf8'));
    expect(raw.pid).toBe(process.pid);
    expect(typeof raw.acquiredAt).toBe('string');
    await handle.release();
  });

  it('throws LockError when the lock is already held (fresh, alive pid)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const handle = await acquireLock(ctx);
    await expect(acquireLock(ctx)).rejects.toThrow(LockError);
    await handle.release();
  });

  it('release() removes the lock file, allowing a subsequent acquire', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const handle = await acquireLock(ctx);
    await handle.release();
    const lockPath = path.join(tmp, '.hive-skills', '.lock');
    await expect(stat(lockPath)).rejects.toThrow();

    const second = await acquireLock(ctx);
    await second.release();
  });

  it('auto-removes and re-acquires a lock that is stale by age (own pid, but old timestamp + staleMs:1)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const lockDir = path.join(tmp, '.hive-skills');
    await mkdir(lockDir, { recursive: true });
    await writeFile(
      path.join(lockDir, '.lock'),
      JSON.stringify({ pid: process.pid, acquiredAt: new Date(0).toISOString() }),
    );

    const handle = await acquireLock(ctx, { staleMs: 1 });
    const raw = JSON.parse(await readFile(path.join(lockDir, '.lock'), 'utf8'));
    expect(raw.pid).toBe(process.pid);
    await handle.release();
  });

  it('auto-removes and re-acquires a lock held by a pid that no longer exists', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const lockDir = path.join(tmp, '.hive-skills');
    await mkdir(lockDir, { recursive: true });
    // A pid extremely unlikely to be alive on any platform.
    const deadPid = 999999999;
    await writeFile(
      path.join(lockDir, '.lock'),
      JSON.stringify({ pid: deadPid, acquiredAt: new Date().toISOString() }),
    );

    const handle = await acquireLock(ctx, { staleMs: 60 * 60 * 1000 });
    const raw = JSON.parse(await readFile(path.join(lockDir, '.lock'), 'utf8'));
    expect(raw.pid).toBe(process.pid);
    await handle.release();
  });

  it('release() is a no-op if the lock file no longer contains our pid (avoids deleting someone else\'s lock)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const handle = await acquireLock(ctx);
    const lockPath = path.join(tmp, '.hive-skills', '.lock');
    // Simulate another process having taken over the lock file after a
    // stale-takeover race (contrived for the test).
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 123456, acquiredAt: new Date().toISOString() }),
    );
    await handle.release();
    // The (different) lock file must still be there.
    await expect(stat(lockPath)).resolves.toBeTruthy();
  });

  it('flows through HomeContext (fixture home), never the real ~/.hive-skills', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const handle = await acquireLock(ctx);
    await expect(stat(path.join(tmp, '.hive-skills', '.lock'))).resolves.toBeTruthy();
    await handle.release();
  });
});

describe('withLock', () => {
  it('acquires, runs fn, and releases the lock on success', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const lockPath = path.join(tmp, '.hive-skills', '.lock');

    let sawLockHeld = false;
    const result = await withLock(ctx, async () => {
      sawLockHeld = await stat(lockPath).then(() => true, () => false);
      return 'done';
    });

    expect(sawLockHeld).toBe(true);
    expect(result).toBe('done');
    await expect(stat(lockPath)).rejects.toThrow(); // released afterward
  });

  it('releases the lock even if fn throws', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const lockPath = path.join(tmp, '.hive-skills', '.lock');

    await expect(
      withLock(ctx, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(stat(lockPath)).rejects.toThrow(); // still released

    // A subsequent withLock must be able to acquire cleanly.
    await withLock(ctx, async () => {});
  });

  it('propagates LockError when the lock is already held', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const handle = await acquireLock(ctx);
    await expect(withLock(ctx, async () => 'unreachable')).rejects.toThrow(LockError);
    await handle.release();
  });
});
