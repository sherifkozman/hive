import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import type { PathGuard } from './guard.js';

/**
 * Every filesystem *write* in this package must go through one of these
 * functions (never raw node:fs) so PathGuard#assertWritable is the single
 * choke point for safety invariant #1 (spec §9). Reads are unrestricted;
 * only the destination of a write/copy/delete is guarded — `cp`'s source
 * may legitimately live outside every allowed root (e.g. bundled assets).
 *
 * PathGuard#assertWritable is async (it canonicalizes via realpath), so
 * every function here MUST `await` it before touching disk — calling it
 * without awaiting would let the write race ahead of the guard decision.
 *
 * TOCTOU hardening (council review, run aa810191): when the target's parent
 * chain does not exist yet, the initial check canonicalizes only the nearest
 * existing ancestor — a parent created as an outside-pointing symlink AFTER
 * that check would go unnoticed. So the write helpers create parents first
 * and then RE-ASSERT the guard (parents now exist, so realpath resolves the
 * full chain), and writeFile opens with O_NOFOLLOW so the final component
 * cannot be a symlink. Residual risk, accepted and documented: a same-user
 * process swapping a parent directory for a symlink in the window between
 * the re-check and the syscall can still redirect the write; closing that
 * needs per-component openat() semantics Node does not expose. The attacker
 * in that scenario already runs as the user and owns every target this tool
 * could write to.
 */

/** Create missing parents, then re-run the guard now that realpath can resolve the full chain. */
async function ensureParentsAndRecheck(guard: PathGuard, absPath: string): Promise<void> {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await guard.assertWritable(absPath);
}

export interface WriteFileOptions {
  mode?: number;
}

export async function writeFile(
  guard: PathGuard,
  absPath: string,
  data: string | Uint8Array,
  options: WriteFileOptions = {},
): Promise<void> {
  await guard.assertWritable(absPath); // fail fast before creating any dirs
  await ensureParentsAndRecheck(guard, absPath);
  // O_NOFOLLOW: refuse to write through a symlink at the final component.
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
  const handle = await fs.open(absPath, flags, options.mode ?? 0o644);
  try {
    await handle.writeFile(data);
    if (options.mode !== undefined) await handle.chmod(options.mode);
  } finally {
    await handle.close();
  }
}

export interface MkdirOptions {
  recursive?: boolean;
}

export async function mkdir(
  guard: PathGuard,
  absPath: string,
  options: MkdirOptions = { recursive: true },
): Promise<void> {
  await guard.assertWritable(absPath);
  await fs.mkdir(absPath, { recursive: options.recursive ?? true });
  // Re-verify now that the full chain exists; if a raced-in symlink parent
  // redirected the creation, undo it rather than leave an escaped dir.
  try {
    await guard.assertWritable(absPath);
  } catch (err) {
    await fs.rm(absPath, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export interface CpOptions {
  recursive?: boolean;
}

/**
 * Copy a file or directory tree to `destAbsPath`. Only `destAbsPath` is
 * guard-checked; `srcAbsPath` may be outside every allowed root (reads
 * are unrestricted).
 */
export async function cp(
  guard: PathGuard,
  srcAbsPath: string,
  destAbsPath: string,
  options: CpOptions = {},
): Promise<void> {
  await guard.assertWritable(destAbsPath);
  await ensureParentsAndRecheck(guard, destAbsPath);
  await fs.cp(srcAbsPath, destAbsPath, {
    recursive: options.recursive ?? true,
    force: true,
    errorOnExist: false,
    // Symlinks are copied as symlinks (not dereferenced) — this is
    // fs.cp's default, spelled out here since backup.ts relies on it.
    dereference: false,
  });
}

export interface RmOptions {
  recursive?: boolean;
  force?: boolean;
}

export async function rm(
  guard: PathGuard,
  absPath: string,
  options: RmOptions = {},
): Promise<void> {
  await guard.assertWritable(absPath);
  await fs.rm(absPath, {
    recursive: options.recursive ?? true,
    force: options.force ?? true,
  });
}

export async function chmod(
  guard: PathGuard,
  absPath: string,
  mode: number,
): Promise<void> {
  await guard.assertWritable(absPath);
  await fs.chmod(absPath, mode);
}

/**
 * Create (or replace) a symlink at `destAbsPath` pointing at `target`.
 * Any existing file/symlink at destAbsPath is removed first (fs.symlink
 * refuses to overwrite). `target` is stored verbatim (relative or
 * absolute, whatever the caller supplies) — see backup.ts's symlink
 * manifest entries.
 */
export async function symlink(
  guard: PathGuard,
  target: string,
  destAbsPath: string,
): Promise<void> {
  await guard.assertWritable(destAbsPath);
  await ensureParentsAndRecheck(guard, destAbsPath);
  await fs.rm(destAbsPath, { force: true });
  await fs.symlink(target, destAbsPath);
}
