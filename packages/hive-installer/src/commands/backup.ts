import { promises as fs } from 'node:fs';
import type { HomeContext } from '../core/paths.js';
import type { ClientRegistryEntry } from '../core/registry.js';
import { detectClients } from '../core/scanner.js';
import { resolveGlobalSkillLocation, resolvePayloadLocation, resolvePointerFile } from '../core/registry.js';
import { snapshot, type SnapshotResult } from '../core/backup.js';
import { UnknownClientError } from '../core/installer.js';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export interface BackupCommandOptions {
  clients?: string[];
}

export interface BackupClientOutcome {
  clientId: string;
  snapshot?: SnapshotResult;
  skippedReason?: 'nothing-to-back-up';
}

/**
 * Adapter over snapshot() (spec §5/§8 `backup`): snapshots every path a
 * client actually occupies right now (global skill dir, payload dir,
 * pointer file — whichever exist), one snapshot per client. Defaults to
 * every DETECTED client when --client is omitted; a client with nothing
 * present on disk yet is reported skipped rather than producing an empty
 * backup.
 */
export async function runBackup(
  ctx: HomeContext,
  registry: readonly ClientRegistryEntry[],
  opts: BackupCommandOptions = {},
): Promise<BackupClientOutcome[]> {
  const clientIds =
    opts.clients && opts.clients.length > 0
      ? opts.clients
      : (await detectClients(ctx)).filter((d) => d.detected).map((d) => d.id);

  const outcomes: BackupClientOutcome[] = [];

  for (const clientId of clientIds) {
    const entry = registry.find((candidate) => candidate.id === clientId);
    if (!entry) throw new UnknownClientError(clientId);

    const candidates = [
      resolveGlobalSkillLocation(ctx, entry),
      resolvePayloadLocation(ctx, entry),
      resolvePointerFile(ctx, entry),
    ].filter((p): p is string => p !== undefined);

    const existing: string[] = [];
    for (const candidate of candidates) {
      if (await pathExists(candidate)) existing.push(candidate);
    }

    if (existing.length === 0) {
      outcomes.push({ clientId, skippedReason: 'nothing-to-back-up' });
      continue;
    }

    outcomes.push({ clientId, snapshot: await snapshot(ctx, 'manual', existing) });
  }

  return outcomes;
}

export function formatBackupResult(outcomes: BackupClientOutcome[]): string {
  const lines = outcomes.map((o) =>
    o.snapshot
      ? `${o.clientId}: backed up as ${o.snapshot.id} (${o.snapshot.manifest.entries.length} file(s)) at ${o.snapshot.dir}`
      : `${o.clientId}: nothing to back up (no skill/payload/pointer files present)`,
  );
  return lines.length > 0 ? lines.join('\n') : 'No clients selected.';
}
