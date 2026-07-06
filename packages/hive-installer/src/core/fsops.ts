import { promises as fs } from 'node:fs';
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
 */

export interface WriteFileOptions {
  mode?: number;
}

export async function writeFile(
  guard: PathGuard,
  absPath: string,
  data: string | Uint8Array,
  options: WriteFileOptions = {},
): Promise<void> {
  await guard.assertWritable(absPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, data, options.mode !== undefined ? { mode: options.mode } : undefined);
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
  await fs.mkdir(path.dirname(destAbsPath), { recursive: true });
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
  await fs.mkdir(path.dirname(destAbsPath), { recursive: true });
  await fs.rm(destAbsPath, { force: true });
  await fs.symlink(target, destAbsPath);
}
