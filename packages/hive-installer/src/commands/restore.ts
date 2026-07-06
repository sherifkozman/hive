import type { HomeContext } from '../core/paths.js';
import { listBackups, restore, type BackupListEntry, type RestorePlan } from '../core/backup.js';
import { UnknownBackupError } from './errors.js';

export interface RestoreListResult {
  backups: BackupListEntry[];
}

/** Adapter over listBackups() (spec §5/§8 `restore --list`): newest-first, as listBackups() already sorts. */
export async function runRestoreList(ctx: HomeContext): Promise<RestoreListResult> {
  return { backups: await listBackups(ctx) };
}

export function formatRestoreList(result: RestoreListResult): string {
  if (result.backups.length === 0) return 'No backups found.';
  const lines = result.backups.map((b) => {
    const label = b.valid
      ? `${b.id}  ${b.createdAt ?? '(unknown date)'}  label=${b.label ?? '(none)'}  ${b.entryCount} entrie(s)`
      : `${b.id}  CORRUPT (manifest unreadable)`;
    return label;
  });
  return [...lines, '', `${result.backups.length} backup(s).`].join('\n');
}

export interface RestoreApplyOptions {
  backupId: string;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Adapter over restore() (spec §5/§8 `restore --backup <id>`): validates
 * the id against listBackups() first so an unknown id gets a friendly
 * `UnknownBackupError` (mapped by mapCoreError) instead of restore()'s
 * generic "no manifest" Error.
 */
export async function runRestoreApply(ctx: HomeContext, opts: RestoreApplyOptions): Promise<RestorePlan> {
  const known = await listBackups(ctx);
  if (!known.some((b) => b.id === opts.backupId)) {
    throw new UnknownBackupError(opts.backupId);
  }
  return restore(ctx, opts.backupId, { force: opts.force, dryRun: opts.dryRun });
}

export function formatRestorePlan(plan: RestorePlan, opts: { dryRun?: boolean }): string {
  const lines = [opts.dryRun ? 'Dry run — no files were written.' : 'Restore applied.'];
  lines.push(`Writes: ${plan.writes.length}`, ...plan.writes.map((w) => `  + ${w.absPath}`));
  lines.push(`Deletes: ${plan.deletes.length}`, ...plan.deletes.map((d) => `  - ${d}`));
  return lines.join('\n');
}
