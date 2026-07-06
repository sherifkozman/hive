import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PathGuard } from './guard.js';

/**
 * Atomic "stage then rename" primitives (plan-review item 7): write to a
 * temp sibling path, then fs.rename() into place. Rename within the same
 * directory is atomic on POSIX filesystems, so a reader never observes a
 * partially-written destination. Only the destination is guard-checked.
 */

function stagingSuffix(): string {
  return randomBytes(4).toString('hex');
}

/** Atomically write `data` to `destAbsPath` (a file). */
export async function atomicWriteFile(
  guard: PathGuard,
  destAbsPath: string,
  data: string | Uint8Array,
): Promise<void> {
  await guard.assertWritable(destAbsPath);
  const dir = path.dirname(destAbsPath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.hive-tmp-${stagingSuffix()}-${path.basename(destAbsPath)}`);
  try {
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, destAbsPath);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Atomically replace a directory at `destAbsPath`: `populate(stagingDir)`
 * fills a fresh sibling directory, then the old destination (if any) is
 * removed and the staging dir is renamed into its place. If `populate`
 * throws, the destination is left untouched and the staging dir is
 * cleaned up — callers never observe a half-populated destination.
 */
export async function atomicReplaceDir(
  guard: PathGuard,
  destAbsPath: string,
  populate: (stagingDir: string) => Promise<void>,
): Promise<void> {
  await guard.assertWritable(destAbsPath);
  const parent = path.dirname(destAbsPath);
  await fs.mkdir(parent, { recursive: true });
  const stagingDir = path.join(parent, `.hive-staging-${stagingSuffix()}`);
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    await populate(stagingDir);
  } catch (err) {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  // Never delete the old tree before the new one is in place (council review,
  // run aa810191): move it aside with a rename (atomic), swap the staging dir
  // in, then discard the old tree. A crash mid-sequence leaves either the old
  // tree at destAbsPath, or the old tree in the .hive-trash- sibling — never
  // "both gone".
  const destExists = await fs.lstat(destAbsPath).then(
    () => true,
    () => false,
  );
  const trashDir = path.join(parent, `.hive-trash-${stagingSuffix()}`);
  if (destExists) await fs.rename(destAbsPath, trashDir);
  try {
    await fs.rename(stagingDir, destAbsPath);
  } catch (err) {
    if (destExists) await fs.rename(trashDir, destAbsPath).catch(() => {}); // roll back
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  if (destExists) await fs.rm(trashDir, { recursive: true, force: true }).catch(() => {});
}
