#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, CommanderError } from 'commander';
import pc from 'picocolors';
import { INSTALLER_VERSION } from './version.js';
import { resolveContext, type GlobalCliOptions } from './context.js';
import { mapCoreError } from './commands/errors.js';
import { formatScanTable, runScan } from './commands/scan.js';
import { formatCatalogTable, runList } from './commands/list.js';
import { formatInstallResult, runInstall } from './commands/install.js';
import { formatProposeSummary, runPropose } from './commands/propose.js';
import { formatDoctorReport, runDoctor } from './commands/doctor.js';
import { formatBackupResult, runBackup } from './commands/backup.js';
import { formatRestoreList, formatRestorePlan, runRestoreApply, runRestoreList } from './commands/restore.js';
import { createClackPorts, runWizard } from './wizard.js';

/** Repeatable-option accumulator (`--client foo --client bar` -> ['foo','bar']). */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/**
 * Every subcommand action shares this shape: resolve global options ->
 * try the adapter -> print JSON or the pretty formatter -> map thrown
 * core errors to a friendly message + exit code (T7's friendly-error
 * layer). `doctor` does not use this — its exit code comes from the
 * DoctorResult itself, not from whether it threw.
 */
async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const mapped = mapCoreError(err);
    console.error(pc.red(mapped.message));
    if (mapped.hint) console.error(pc.dim(`hint: ${mapped.hint}`));
    process.exitCode = mapped.exitCode;
  }
}

/**
 * Builds the commander program (T7). Exported separately from the
 * process-executing `main()` below so tests can drive it directly via
 * `program.parseAsync([...])` without spawning a subprocess — commander
 * subcommands only inherit `exitOverride()` when it's called BEFORE
 * `.command(...)` registers them (copyInheritedSettings runs at
 * registration time), so it must be the first thing set on `program`.
 */
export function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();

  program
    .name('hive-skills')
    .description('Interactive installer for Hive CCS skills across AI coding clients')
    .version(INSTALLER_VERSION)
    .option('--home <dir>', 'override the resolved home directory (testing/CI seam)')
    .option('--registry <jsonfile>', 'path to a registry override JSON document, deep-merged over the built-ins')
    .option('--json', 'machine-readable JSON output where applicable')
    .option('--dry-run', 'preview writes without performing them')
    .option('--yes', 'confirm non-interactive writes')
    .option('--no-backup', 'skip the automatic pre-mutation backup')
    .option('--force', 'override safety refusals (foreign dirs, hash mismatches, deletions)')
    .option('--project <dir>', 'project directory, for project-scoped clients (e.g. cursor)');

  // Global options live on `program` itself; each subcommand reads them
  // from this closure rather than commander's optsWithGlobals(), which
  // would silently clobber `restore --backup <id>`'s own `backup`
  // property with the root's `--no-backup` boolean of the same name.
  const globalOpts = (): GlobalCliOptions => program.opts<GlobalCliOptions>();

  program
    .command('scan')
    .description('detect installed AI coding clients and scan their existing skills/rules')
    .action(async () => {
      await runAction(async () => {
        const opts = globalOpts();
        const resolved = await resolveContext(opts);
        const result = await runScan(resolved.ctx, resolved.registry);
        console.log(opts.json ? JSON.stringify(result, null, 2) : formatScanTable(result));
      });
    });

  program
    .command('list')
    .description('list the bundled skill catalog')
    .action(async () => {
      await runAction(async () => {
        const opts = globalOpts();
        const resolved = await resolveContext(opts);
        const rows = runList(resolved.catalog);
        console.log(opts.json ? JSON.stringify(rows, null, 2) : formatCatalogTable(rows));
      });
    });

  program
    .command('install')
    .description('install bundled skills into detected clients')
    .option('--client <id>', 'client id to install into (repeatable)', collect, [] as string[])
    .option('--skill <name>', 'skill name to install (repeatable)', collect, [] as string[])
    .option(
      '--all',
      'fill in whichever of --client/--skill was omitted with every detected+installable client / every bundled skill',
    )
    .option('--write-pointers', 'non-interactive consent to write pointer-file managed blocks (requires --yes)')
    .action(async (cmdOpts: { client: string[]; skill: string[]; all?: boolean; writePointers?: boolean }) => {
      await runAction(async () => {
        const opts = globalOpts();
        const resolved = await resolveContext(opts);
        const result = await runInstall(resolved.ctx, resolved.registry, resolved.catalog, {
          clients: cmdOpts.client,
          skills: cmdOpts.skill,
          all: cmdOpts.all,
          project: opts.project,
          writePointers: cmdOpts.writePointers,
          yes: opts.yes,
          dryRun: opts.dryRun,
          noBackup: opts.backup === false,
          force: opts.force,
        });
        console.log(opts.json ? JSON.stringify(result, null, 2) : formatInstallResult(result));
      });
    });

  program
    .command('propose')
    .description("generate a conversion-proposal doc for a client's existing skills/rules")
    .option('--client <id>', 'client id to scan (repeatable; default: every detected client)', collect, [] as string[])
    .option('--out <file>', 'output file (default ./hive-conversion-proposals.md)')
    .action(async (cmdOpts: { client: string[]; out?: string }) => {
      await runAction(async () => {
        const opts = globalOpts();
        const resolved = await resolveContext(opts);
        const result = await runPropose(resolved.ctx, resolved.registry, resolved.catalog, {
          clients: cmdOpts.client,
          out: cmdOpts.out,
        });
        console.log(
          opts.json
            ? JSON.stringify({ candidates: result.candidates, outPath: result.outPath }, null, 2)
            : formatProposeSummary(result),
        );
      });
    });

  program
    .command('doctor')
    .description('health-check installed skills and client configuration')
    .action(async () => {
      const opts = globalOpts();
      try {
        const resolved = await resolveContext(opts);
        const result = await runDoctor(resolved.ctx, resolved.registry, resolved.catalog, { project: opts.project });
        console.log(opts.json ? JSON.stringify(result, null, 2) : formatDoctorReport(result));
        // doctor's exit code is data (spec §5/§7: 1 only on a `fail`
        // finding, `warn` stays 0), never derived from whether it threw.
        process.exitCode = result.exitCode;
      } catch (err) {
        const mapped = mapCoreError(err);
        console.error(pc.red(mapped.message));
        if (mapped.hint) console.error(pc.dim(`hint: ${mapped.hint}`));
        process.exitCode = mapped.exitCode;
      }
    });

  program
    .command('backup')
    .description('snapshot client skill/payload/pointer state now')
    .option('--client <id>', 'client id to back up (repeatable; default: every detected client)', collect, [] as string[])
    .action(async (cmdOpts: { client: string[] }) => {
      await runAction(async () => {
        const opts = globalOpts();
        const resolved = await resolveContext(opts);
        const outcomes = await runBackup(resolved.ctx, resolved.registry, { clients: cmdOpts.client });
        console.log(opts.json ? JSON.stringify(outcomes, null, 2) : formatBackupResult(outcomes));
      });
    });

  program
    .command('restore')
    .description('list backups, or restore one')
    .option('--list', 'list available backups')
    .option('--backup <id>', 'backup id to restore')
    .action(async (cmdOpts: { list?: boolean; backup?: string }) => {
      await runAction(async () => {
        const opts = globalOpts();
        const resolved = await resolveContext(opts);

        if (!cmdOpts.backup || cmdOpts.list) {
          const result = await runRestoreList(resolved.ctx);
          console.log(opts.json ? JSON.stringify(result, null, 2) : formatRestoreList(result));
          return;
        }

        const plan = await runRestoreApply(resolved.ctx, {
          backupId: cmdOpts.backup,
          force: opts.force,
          dryRun: opts.dryRun,
        });
        console.log(opts.json ? JSON.stringify(plan, null, 2) : formatRestorePlan(plan, { dryRun: opts.dryRun }));
      });
    });

  // Default action (spec §5): no subcommand given. Interactive TTY ->
  // the wizard; non-interactive (e.g. piped/CI) -> print help and exit 0
  // rather than hang waiting on prompts that can never be answered.
  program.action(async () => {
    const opts = globalOpts();
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      program.outputHelp();
      return;
    }
    await runAction(async () => {
      const resolved = await resolveContext(opts);
      await runWizard(
        { ctx: resolved.ctx, registry: resolved.registry, catalog: resolved.catalog, projectDir: opts.project },
        createClackPorts(),
      );
    });
  });

  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      process.exitCode = err.exitCode;
      return;
    }
    throw err;
  }
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
