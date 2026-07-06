import type { HomeContext } from '../core/paths.js';
import type { ClientRegistryEntry } from '../core/registry.js';
import type { Catalog } from '../core/catalog.js';
import { detectClients } from '../core/scanner.js';
import {
  executeInstall,
  planInstall,
  type ExecuteInstallResult,
  type ExecutePorts,
  type InstallPlan,
  type WouldWriteEntry,
} from '../core/installer.js';
import { ConfirmationRequiredError, NothingToInstallError } from './errors.js';
import type { PackingMode } from '../core/packing.js';

export interface InstallCommandOptions {
  clients?: string[];
  skills?: string[];
  all?: boolean;
  project?: string;
  writePointers?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  noBackup?: boolean;
  force?: boolean;
  /**
   * Passed straight through to planInstall (no default applied here —
   * see installer.ts's PlanInstallOptions.packing doc comment). The
   * CLI's `--packing` option default ('auto') is what actually makes
   * real end-user installs packing-aware; this adapter stays a neutral
   * pass-through so its own tests (and any other caller) keep the
   * pre-0.2.0 always-tree behavior when they don't ask for otherwise.
   */
  packing?: 'auto' | PackingMode;
  inlineThreshold?: number;
}

export interface InstallSelection {
  clients: string[];
  skills: string[];
}

/**
 * Turn `--client`/`--skill`/`--all` into concrete id lists (spec §5
 * `install`): explicit `--client`/`--skill` always win; `--all` fills in
 * whichever side wasn't given explicitly (all DETECTED, installable —
 * i.e. non-scan-only — clients; all catalog skill names). This lets
 * `install --client claude-code --all --yes` mean "claude-code, every
 * bundled skill" without --all clobbering the explicit client choice.
 */
export function resolveInstallSelection(
  opts: Pick<InstallCommandOptions, 'clients' | 'skills' | 'all'>,
  detected: Array<{ id: string; detected: boolean; strategy: string }>,
  catalog: Catalog,
): InstallSelection {
  const clients =
    opts.clients && opts.clients.length > 0
      ? opts.clients
      : opts.all
        ? detected.filter((d) => d.detected && d.strategy !== 'scan-only').map((d) => d.id)
        : [];

  const skills =
    opts.skills && opts.skills.length > 0
      ? opts.skills
      : opts.all
        ? catalog.skills.map((s) => s.name)
        : [];

  return { clients, skills };
}

export type InstallCommandResult =
  | { dryRun: true; plan: InstallPlan; wouldWrite: WouldWriteEntry[] }
  | { dryRun: false; plan: InstallPlan; result: ExecuteInstallResult };

/**
 * Adapter over planInstall/executeInstall (spec §5 `install`): builds
 * the plan from resolved clients/skills, then either previews it
 * (--dry-run, no --yes required) or executes for real. Non-interactive
 * writes require --yes (spec §9 invariant 4); the pointer-write consent
 * port is fixed up front — `approve-all` only when BOTH --write-pointers
 * AND --yes are given, `reject-all` otherwise (never a per-file prompt
 * in non-interactive mode). Rejected pointer writes are still listed in
 * the plan/result so the caller can print the suggested snippet.
 */
export async function runInstall(
  ctx: HomeContext,
  registry: readonly ClientRegistryEntry[],
  catalog: Catalog,
  opts: InstallCommandOptions,
): Promise<InstallCommandResult> {
  const detected = await detectClients(ctx);
  const selection = resolveInstallSelection(opts, detected, catalog);

  if (selection.clients.length === 0 || selection.skills.length === 0) {
    throw new NothingToInstallError();
  }

  const plan = await planInstall(ctx, {
    clients: selection.clients,
    skills: selection.skills,
    catalog,
    registry,
    projectDir: opts.project,
    packing: opts.packing,
    inlineThreshold: opts.inlineThreshold,
  });

  const rejectAllPorts: ExecutePorts = { confirmPointerWrite: async () => false };

  if (opts.dryRun) {
    const result = await executeInstall(ctx, plan, rejectAllPorts, { dryRun: true });
    return { dryRun: true, plan, wouldWrite: result.wouldWrite };
  }

  if (!opts.yes) {
    throw new ConfirmationRequiredError('install (write to disk)');
  }

  const approveAll = Boolean(opts.writePointers && opts.yes);
  const ports: ExecutePorts = { confirmPointerWrite: async () => approveAll };

  const result = await executeInstall(ctx, plan, ports, {
    noBackup: opts.noBackup,
    force: opts.force,
  });

  return { dryRun: false, plan, result };
}

/** Pretty summary (spec §5): plan preview for --dry-run, performed/skipped counts + suggested pointer snippets otherwise. */
export function formatInstallResult(result: InstallCommandResult): string {
  if (result.dryRun) {
    const lines = ['Dry run — no files were written. Planned writes:', ''];
    for (const entry of result.wouldWrite) {
      const packingSuffix = entry.packing ? ` (${entry.packing})` : '';
      lines.push(`  [${entry.kind}]${packingSuffix} ${entry.destPath}`);
    }
    if (result.wouldWrite.length === 0) lines.push('  (nothing to write — already up to date)');
    return lines.join('\n');
  }

  const { result: execResult } = result;
  const lines = [
    `Performed ${execResult.performed.length} write(s); skipped ${execResult.skipped.length}.`,
    `Backup(s): ${execResult.backups.length > 0 ? execResult.backups.map((b) => b.id).join(', ') : 'none'}`,
  ];

  const skippedPointers = execResult.skipped.filter((a) => a.kind === 'write-pointer-block');
  for (const action of skippedPointers) {
    if (action.kind !== 'write-pointer-block') continue;
    lines.push(
      '',
      `Pointer write skipped for ${action.destPath}. Add this manually if you want it there:`,
      '',
      action.block,
    );
  }

  return lines.join('\n');
}
