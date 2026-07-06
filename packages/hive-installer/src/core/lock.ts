import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HomeContext } from './paths.js';
import { joinHome } from './paths.js';
import { PathGuard } from './guard.js';
import { rm as guardedRm, mkdir as guardedMkdir } from './fsops.js';

const DEFAULT_STALE_MS = 15 * 60 * 1000; // 15 minutes (task brief: "age < 15min")

interface LockFileContents {
  pid: number;
  acquiredAt: string;
}

export interface LockHandle {
  release(): Promise<void>;
}

export interface AcquireLockOptions {
  /** Age after which a lock is considered stale regardless of pid liveness. */
  staleMs?: number;
  guard?: PathGuard;
}

export class LockError extends Error {
  readonly lockPath: string;
  readonly holder?: LockFileContents;

  constructor(lockPath: string, holder?: LockFileContents) {
    super(
      `Another hive-skills process holds the lock at ${lockPath}` +
        (holder ? ` (pid ${holder.pid}, acquired ${holder.acquiredAt})` : ''),
    );
    this.name = 'LockError';
    this.lockPath = lockPath;
    this.holder = holder;
  }
}

function lockPathFor(ctx: HomeContext): string {
  return joinHome(ctx, '.hive-skills', '.lock');
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we can't signal it — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readLockFile(lockPath: string): Promise<LockFileContents | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    if (typeof raw?.pid === 'number' && typeof raw?.acquiredAt === 'string') {
      return raw as LockFileContents;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function isStale(holder: LockFileContents | undefined, staleMs: number): boolean {
  if (!holder) return true; // unreadable/corrupt lock file: treat as stale
  if (!isProcessAlive(holder.pid)) return true;
  const age = Date.now() - Date.parse(holder.acquiredAt);
  return Number.isNaN(age) || age > staleMs;
}

/**
 * Acquire the installer's cross-process lock at
 * ~/.hive-skills/.lock (via ctx — never the real home directly). Retries
 * once after removing a stale lock (dead pid, or older than `staleMs`);
 * throws LockError if a live, fresh lock is already held.
 */
export async function acquireLock(
  ctx: HomeContext,
  options: AcquireLockOptions = {},
): Promise<LockHandle> {
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const guard = options.guard ?? new PathGuard([ctx.home]);
  const lockPath = lockPathFor(ctx);

  await guardedMkdir(guard, path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    const ourPid = process.pid;
    const payload: LockFileContents = { pid: ourPid, acquiredAt: new Date().toISOString() };

    let fh;
    try {
      fh = await fs.open(lockPath, 'wx');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

      const holder = await readLockFile(lockPath);
      if (isStale(holder, staleMs)) {
        await guardedRm(guard, lockPath, { force: true, recursive: false });
        continue; // retry the acquire
      }
      throw new LockError(lockPath, holder);
    }

    try {
      await fh.writeFile(JSON.stringify(payload));
    } finally {
      await fh.close();
    }

    return {
      release: async () => {
        const current = await readLockFile(lockPath);
        if (current && current.pid === ourPid) {
          await guardedRm(guard, lockPath, { force: true, recursive: false });
        }
        // If the lock no longer contains our pid, someone else has since
        // taken it over (e.g. a stale takeover race) — don't delete it.
      },
    };
  }

  throw new LockError(lockPath);
}

/** Where the lock file would live for this ctx, without acquiring it (e.g. for doctor checks). */
export { lockPathFor as resolveLockPath };

/**
 * Run `fn` while holding the installer's cross-process lock, releasing
 * it afterward whether `fn` resolves or throws. The convenience wrapper
 * requested alongside acquireLock/release (spec §9.1b: a single
 * lockfile under ~/.hive-skills/.lock prevents concurrent runs from
 * interleaving writes) — callers that don't need the handle directly
 * should prefer this over manual acquire/try/finally/release.
 */
export async function withLock<T>(
  ctx: HomeContext,
  fn: () => Promise<T>,
  options: AcquireLockOptions = {},
): Promise<T> {
  const handle = await acquireLock(ctx, options);
  try {
    return await fn();
  } finally {
    await handle.release();
  }
}
