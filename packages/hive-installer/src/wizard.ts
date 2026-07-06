import * as clack from '@clack/prompts';
import type { Option as ClackOption } from '@clack/prompts';
import type { HomeContext } from './core/paths.js';
import type { ClientRegistryEntry } from './core/registry.js';
import type { Catalog } from './core/catalog.js';
import { detectClients } from './core/scanner.js';
import { executeInstall, planInstall, type ExecuteInstallResult, type InstallAction } from './core/installer.js';
import { scanForCandidates, renderProposalDoc, type ProposalCandidate } from './core/proposals.js';
import { PathGuard } from './core/guard.js';
import { writeFile } from './core/fsops.js';
import { snapshot } from './core/backup.js';
import { resolveGlobalSkillLocation, resolvePayloadLocation, resolvePointerFile } from './core/registry.js';
import path from 'node:path';

/**
 * Sentinel returned by every WizardPorts prompt method on cancellation
 * (Ctrl-C / Esc). A dedicated symbol (rather than reusing @clack's own
 * `isCancel`-checked symbol) keeps runWizard() decoupled from @clack:
 * scripted test ports never import @clack at all, and createClackPorts()
 * is the only place that ever calls `clack.isCancel`.
 */
export const WIZARD_CANCEL = Symbol('wizard-cancel');
export type Cancelable<T> = T | typeof WIZARD_CANCEL;

export interface WizardSelectOption<T> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface WizardMultiselectArgs<T> {
  message: string;
  options: WizardSelectOption<T>[];
  initialValues?: T[];
}

export interface WizardSelectArgs<T> {
  message: string;
  options: WizardSelectOption<T>[];
}

export interface WizardConfirmArgs {
  message: string;
  initialValue?: boolean;
}

/**
 * Every prompt runWizard() needs, abstracted behind plain async
 * functions (T7 requirement): unit tests script this interface directly
 * with mocks — no fake TTY, no @clack involved. createClackPorts() is
 * the only real implementation, used by cli.ts's default action.
 */
export interface WizardPorts {
  intro(message: string): void;
  outro(message: string): void;
  note(message: string, title?: string): void;
  spinnerStart(message: string): void;
  spinnerStop(message: string): void;
  multiselect<T>(args: WizardMultiselectArgs<T>): Promise<Cancelable<T[]>>;
  select<T>(args: WizardSelectArgs<T>): Promise<Cancelable<T>>;
  confirm(args: WizardConfirmArgs): Promise<Cancelable<boolean>>;
}

/** Real @clack/prompts-backed ports — the only module that imports @clack directly. */
export function createClackPorts(): WizardPorts {
  let sp: ReturnType<typeof clack.spinner> | undefined;

  return {
    intro: (message) => clack.intro(message),
    outro: (message) => clack.outro(message),
    note: (message, title) => clack.note(message, title),
    spinnerStart: (message) => {
      sp = clack.spinner();
      sp.start(message);
    },
    spinnerStop: (message) => {
      sp?.stop(message);
    },
    multiselect: async <T,>(args: WizardMultiselectArgs<T>): Promise<Cancelable<T[]>> => {
      // @clack/prompts' Option<Value> is a conditional type keyed on
      // whether Value extends its Primitive union; that conditional
      // can't resolve for our still-generic T, so TS won't structurally
      // match WizardSelectOption<T> against it even though every
      // concrete instantiation this module actually uses (T = string)
      // is compatible. Cast through the library's own exported type.
      const result = await clack.multiselect({
        message: args.message,
        options: args.options as unknown as ClackOption<T>[],
        initialValues: args.initialValues,
        required: false,
      });
      return clack.isCancel(result) ? WIZARD_CANCEL : result;
    },
    select: async <T,>(args: WizardSelectArgs<T>): Promise<Cancelable<T>> => {
      const result = await clack.select({
        message: args.message,
        options: args.options as unknown as ClackOption<T>[],
      });
      return clack.isCancel(result) ? WIZARD_CANCEL : result;
    },
    confirm: async (args) => {
      const result = await clack.confirm({ message: args.message, initialValue: args.initialValue });
      return clack.isCancel(result) ? WIZARD_CANCEL : result;
    },
  };
}

export type WizardAction = 'install' | 'propose' | 'backup' | 'doctor';

export type WizardOutcome =
  | { outcome: 'cancelled' }
  | { outcome: 'no-clients-detected' }
  | { outcome: 'no-clients-selected' }
  | { outcome: 'no-skills-selected' }
  | { outcome: 'declined-plan' }
  | { outcome: 'installed'; result: ExecuteInstallResult }
  | { outcome: 'proposed'; candidates: ProposalCandidate[]; outPath: string }
  | { outcome: 'backed-up'; clientIds: string[] }
  | { outcome: 'doctor-run' };

export interface WizardDeps {
  ctx: HomeContext;
  registry: readonly ClientRegistryEntry[];
  catalog: Catalog;
  projectDir?: string;
  /** Test seam: defaults to `() => new Date().toISOString()` (used only by the propose action). */
  now?: () => string;
}

function renderActionLine(action: InstallAction): string {
  const destPath = 'destPath' in action ? action.destPath : action.destSkillDir;
  return `  [${action.kind}] ${destPath}`;
}

async function pathExists(p: string): Promise<boolean> {
  const fs = await import('node:fs/promises');
  return fs
    .stat(p)
    .then(() => true)
    .catch(() => false);
}

/**
 * The interactive wizard (spec §5): scan → pick clients → pick skills →
 * pick an action → (per action) confirm + execute → outro summary. Every
 * prompt goes through `ports`, so the whole flow is unit-testable with a
 * scripted WizardPorts mock; cancellation at any prompt exits cleanly
 * with `{ outcome: 'cancelled' }` and writes nothing.
 */
export async function runWizard(deps: WizardDeps, ports: WizardPorts): Promise<WizardOutcome> {
  ports.intro('hive-skills — install Hive CCS skills into your AI coding clients');

  ports.spinnerStart('Scanning for AI coding clients...');
  const detected = await detectClients(deps.ctx);
  ports.spinnerStop('Scan complete.');

  const seen = detected.filter((d) => d.detected);
  if (seen.length === 0) {
    ports.note('No supported AI coding clients were detected on this machine.');
    ports.outro('Nothing to do.');
    return { outcome: 'no-clients-detected' };
  }

  const clientChoice = await ports.multiselect<string>({
    message: 'Which clients should Hive skills be installed into?',
    options: seen.map((d) => ({
      value: d.id,
      label: d.name,
      hint: d.strategy === 'scan-only' ? 'scan-only in this version — cannot install' : d.strategy,
      disabled: d.strategy === 'scan-only',
    })),
    initialValues: seen.filter((d) => d.strategy !== 'scan-only').map((d) => d.id),
  });
  if (clientChoice === WIZARD_CANCEL) {
    ports.outro('Cancelled — nothing written.');
    return { outcome: 'cancelled' };
  }
  if (clientChoice.length === 0) {
    ports.note('No installable clients selected.');
    ports.outro('Nothing written.');
    return { outcome: 'no-clients-selected' };
  }

  const skillChoice = await ports.multiselect<string>({
    message: 'Which skills should be installed?',
    options: deps.catalog.skills.map((s) => ({
      value: s.name,
      label: s.name,
      hint: s.name === 'ccs-skill-creator' ? 'meta-skill: converts existing skills to CCS form' : s.category,
    })),
    initialValues: deps.catalog.skills.map((s) => s.name),
  });
  if (skillChoice === WIZARD_CANCEL) {
    ports.outro('Cancelled — nothing written.');
    return { outcome: 'cancelled' };
  }
  if (skillChoice.length === 0) {
    ports.note('No skills selected.');
    ports.outro('Nothing written.');
    return { outcome: 'no-skills-selected' };
  }

  const action = await ports.select<WizardAction>({
    message: 'What would you like to do with the selected clients?',
    options: [
      { value: 'install', label: 'Install skills' },
      { value: 'propose', label: 'Generate conversion proposals for their existing skills/rules' },
      { value: 'backup', label: 'Backup only (no install)' },
      { value: 'doctor', label: 'Run doctor (health check)' },
    ],
  });
  if (action === WIZARD_CANCEL) {
    ports.outro('Cancelled — nothing written.');
    return { outcome: 'cancelled' };
  }

  switch (action) {
    case 'install':
      return runInstallAction(deps, ports, clientChoice, skillChoice);
    case 'propose':
      return runProposeAction(deps, ports, clientChoice);
    case 'backup':
      return runBackupAction(deps, ports, clientChoice);
    case 'doctor':
      return runDoctorAction(deps, ports);
  }
}

async function runInstallAction(
  deps: WizardDeps,
  ports: WizardPorts,
  clients: string[],
  skills: string[],
): Promise<WizardOutcome> {
  const plan = await planInstall(deps.ctx, {
    clients,
    skills,
    catalog: deps.catalog,
    registry: deps.registry,
    projectDir: deps.projectDir,
  });

  // A plan can be non-empty yet carry only `skip-identical` actions (every
  // selected skill is already installed and unchanged) — that's not a
  // real write, so it shouldn't prompt the user to "confirm" a no-op.
  const hasRealWork = plan.actions.some((a) => a.kind !== 'skip-identical');
  if (!hasRealWork) {
    ports.note('Nothing to do — every selected skill is already up to date for every selected client.');
    ports.outro('Nothing written.');
    return { outcome: 'declined-plan' };
  }

  ports.note(plan.actions.map(renderActionLine).join('\n'), 'Planned writes');
  const proceed = await ports.confirm({
    message: `Proceed with ${plan.actions.length} planned change(s)?`,
    initialValue: true,
  });
  if (proceed === WIZARD_CANCEL || proceed === false) {
    ports.outro('Cancelled — nothing written.');
    return { outcome: proceed === WIZARD_CANCEL ? 'cancelled' : 'declined-plan' };
  }

  const result = await executeInstall(
    deps.ctx,
    plan,
    {
      confirmPointerWrite: async (file, diff) => {
        ports.note(diff, `Pointer write: ${file}`);
        const ok = await ports.confirm({ message: `Write the managed block to ${file}?`, initialValue: true });
        return ok === true;
      },
    },
    {},
  );

  ports.outro(
    `Installed: performed ${result.performed.length} write(s), skipped ${result.skipped.length}. ` +
      `Backup(s): ${result.backups.length > 0 ? result.backups.map((b) => b.id).join(', ') : 'none'}.`,
  );

  return { outcome: 'installed', result };
}

async function runProposeAction(deps: WizardDeps, ports: WizardPorts, clients: string[]): Promise<WizardOutcome> {
  const candidates = await scanForCandidates(deps.ctx, clients, { registry: deps.registry });
  const generatedAt = (deps.now ?? (() => new Date().toISOString()))();
  const doc = renderProposalDoc(candidates, { generatedAt, catalog: deps.catalog });

  const outPath = path.resolve('hive-conversion-proposals.md');
  const guard = new PathGuard([path.dirname(outPath)]);
  await writeFile(guard, outPath, doc);

  ports.outro(`Wrote ${candidates.length} candidate(s) to ${outPath}.`);
  return { outcome: 'proposed', candidates, outPath };
}

async function runBackupAction(deps: WizardDeps, ports: WizardPorts, clients: string[]): Promise<WizardOutcome> {
  for (const clientId of clients) {
    const entry = deps.registry.find((candidate) => candidate.id === clientId);
    if (!entry) continue;

    const targets = [
      resolveGlobalSkillLocation(deps.ctx, entry),
      resolvePayloadLocation(deps.ctx, entry),
      resolvePointerFile(deps.ctx, entry),
    ].filter((p): p is string => p !== undefined);

    const existing: string[] = [];
    for (const target of targets) {
      if (await pathExists(target)) existing.push(target);
    }
    if (existing.length > 0) await snapshot(deps.ctx, 'manual', existing);
  }

  ports.outro(`Backed up ${clients.length} client(s).`);
  return { outcome: 'backed-up', clientIds: clients };
}

async function runDoctorAction(deps: WizardDeps, ports: WizardPorts): Promise<WizardOutcome> {
  const { doctor, formatDoctorReport } = await import('./core/doctor.js');
  const result = await doctor(deps.ctx, { registry: deps.registry, catalog: deps.catalog, projectDir: deps.projectDir });
  ports.note(formatDoctorReport(result), 'Doctor report');
  ports.outro(`Doctor finished: exit code ${result.exitCode}.`);
  return { outcome: 'doctor-run' };
}
