import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PathGuard } from './guard.js';

/**
 * Every filesystem *write* in this package must go through one of these
 * functions (never raw node:fs) so PathGuard#assertWritable is the single
 * choke point for safety invariant #1 (spec §9). Reads are unrestricted;
 * only the destination of a write/copy/delete is guarded — `cp`'s source
 * may legitimately live outside every allowed root (e.g. bundled assets).
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
  guard.assertWritable(absPath);
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
  guard.assertWritable(absPath);
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
  guard.assertWritable(destAbsPath);
  await fs.mkdir(path.dirname(destAbsPath), { recursive: true });
  await fs.cp(srcAbsPath, destAbsPath, {
    recursive: options.recursive ?? true,
    force: true,
    errorOnExist: false,
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
  guard.assertWritable(absPath);
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
  guard.assertWritable(absPath);
  await fs.chmod(absPath, mode);
}
