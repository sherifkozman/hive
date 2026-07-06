import { CatalogLoadError } from '../core/catalog.js';
import { GuardViolation } from '../core/guard.js';
import {
  ForeignSkillDirError,
  UnknownClientError,
  UnknownSkillError,
  UnsupportedClientError,
} from '../core/installer.js';
import { LockError } from '../core/lock.js';
import { RestoreDeletionRefusalError, RestoreVerificationError } from '../core/backup.js';

/**
 * Thrown by command adapters (never core) when a non-interactive write
 * was requested without `--yes` (spec §9 invariant 4: "non-interactive
 * requires --yes for any write").
 */
export class ConfirmationRequiredError extends Error {
  constructor(action: string) {
    super(`Refusing to ${action} without --yes (non-interactive writes require explicit confirmation).`);
    this.name = 'ConfirmationRequiredError';
  }
}

/** Thrown by `install` when neither an explicit --client/--skill nor --all resolves to anything. */
export class NothingToInstallError extends Error {
  constructor() {
    super('Nothing to install: pass --client/--skill explicitly, or --all.');
    this.name = 'NothingToInstallError';
  }
}

/** Thrown by `restore` when the requested backup id isn't one of listBackups()'s entries. */
export class UnknownBackupError extends Error {
  readonly backupId: string;
  constructor(backupId: string) {
    super(`Unknown backup id: "${backupId}". Run \`hive-skills restore --list\` to see available backups.`);
    this.name = 'UnknownBackupError';
    this.backupId = backupId;
  }
}

export interface MappedError {
  message: string;
  hint?: string;
  exitCode: number;
}

/**
 * Friendly-error layer (T7): every core error class the CLI can surface,
 * mapped to a plain message + an actionable hint, so a user never sees a
 * raw stack trace for an expected failure mode. Falls through to the raw
 * `Error#message` (no hint) for anything unrecognized, and stringifies
 * non-Error throws as a last resort — this function never throws itself.
 */
export function mapCoreError(err: unknown): MappedError {
  if (err instanceof UnknownClientError) {
    return { message: err.message, hint: 'Run `hive-skills scan` to see valid client ids.', exitCode: 1 };
  }
  if (err instanceof UnknownSkillError) {
    return { message: err.message, hint: 'Run `hive-skills list` to see the bundled skill catalog.', exitCode: 1 };
  }
  if (err instanceof UnsupportedClientError) {
    return {
      message: err.message,
      hint: 'These clients are scan-only in this version; try `hive-skills propose` instead of `install`.',
      exitCode: 1,
    };
  }
  if (err instanceof ForeignSkillDirError) {
    return { message: err.message, hint: 'Pass --force to overwrite, if you are sure it is safe to.', exitCode: 1 };
  }
  if (err instanceof RestoreVerificationError) {
    return { message: err.message, hint: 'Pass --force to restore anyway.', exitCode: 1 };
  }
  if (err instanceof RestoreDeletionRefusalError) {
    return { message: err.message, hint: 'Pass --force to override.', exitCode: 1 };
  }
  if (err instanceof LockError) {
    return {
      message: err.message,
      hint: 'Wait for the other hive-skills process to finish, or remove the stale lock file.',
      exitCode: 1,
    };
  }
  if (err instanceof GuardViolation) {
    return {
      message: err.message,
      hint: 'This path is outside every location hive-skills is allowed to write to.',
      exitCode: 1,
    };
  }
  if (err instanceof CatalogLoadError) {
    return {
      message: err.message,
      hint: 'Run `pnpm run build` (or reinstall the package) to regenerate assets/manifest.json.',
      exitCode: 1,
    };
  }
  if (err instanceof ConfirmationRequiredError) {
    return { message: err.message, hint: 'Re-run with --yes to proceed, or --dry-run to preview.', exitCode: 1 };
  }
  if (err instanceof NothingToInstallError) {
    return { message: err.message, hint: undefined, exitCode: 1 };
  }
  if (err instanceof UnknownBackupError) {
    return { message: err.message, exitCode: 1 };
  }
  if (err instanceof Error) {
    return { message: err.message, exitCode: 1 };
  }
  return { message: String(err), exitCode: 1 };
}
