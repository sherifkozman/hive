import { describe, expect, it } from 'vitest';
import { CatalogLoadError } from '../src/core/catalog.js';
import { GuardViolation } from '../src/core/guard.js';
import {
  ForeignSkillDirError,
  MissingBundleError,
  UnknownClientError,
  UnknownSkillError,
  UnsupportedClientError,
} from '../src/core/installer.js';
import { LockError } from '../src/core/lock.js';
import { RestoreDeletionRefusalError, RestoreVerificationError } from '../src/core/backup.js';
import {
  ConfirmationRequiredError,
  NothingToInstallError,
  UnknownBackupError,
  mapCoreError,
} from '../src/commands/errors.js';

describe('mapCoreError', () => {
  it('maps UnknownClientError with a scan hint', () => {
    const mapped = mapCoreError(new UnknownClientError('bogus'));
    expect(mapped.message).toContain('bogus');
    expect(mapped.hint).toContain('scan');
    expect(mapped.exitCode).toBe(1);
  });

  it('maps UnknownSkillError with a list hint', () => {
    const mapped = mapCoreError(new UnknownSkillError('bogus'));
    expect(mapped.hint).toContain('list');
  });

  it('maps UnsupportedClientError with a propose hint', () => {
    const mapped = mapCoreError(new UnsupportedClientError(['roo']));
    expect(mapped.message).toContain('roo');
    expect(mapped.hint).toContain('propose');
  });

  it('maps ForeignSkillDirError with a --force hint', () => {
    const mapped = mapCoreError(new ForeignSkillDirError('/tmp/x'));
    expect(mapped.hint).toContain('--force');
  });

  it('maps MissingBundleError with a compile/--packing tree hint', () => {
    const mapped = mapCoreError(new MissingBundleError('foo', '/tmp/x/BUNDLE.md'));
    expect(mapped.message).toContain('foo');
    expect(mapped.message).toContain('BUNDLE.md');
    expect(mapped.hint).toContain('--packing tree');
    expect(mapped.exitCode).toBe(1);
  });

  it('maps RestoreVerificationError with a --force hint', () => {
    const mapped = mapCoreError(new RestoreVerificationError('abc', ['x.txt']));
    expect(mapped.hint).toContain('--force');
  });

  it('maps RestoreDeletionRefusalError with a --force hint', () => {
    const mapped = mapCoreError(new RestoreDeletionRefusalError('/tmp/x', 'no-install-manifest'));
    expect(mapped.hint).toContain('--force');
  });

  it('maps LockError with a wait/remove hint', () => {
    const mapped = mapCoreError(new LockError('/tmp/.lock'));
    expect(mapped.hint).toMatch(/wait|stale/i);
  });

  it('maps GuardViolation with an out-of-bounds hint', () => {
    const mapped = mapCoreError(new GuardViolation('/etc/passwd', ['/tmp/home']));
    expect(mapped.hint).toContain('outside');
  });

  it('maps CatalogLoadError with a rebuild hint', () => {
    const mapped = mapCoreError(new CatalogLoadError('/tmp/assets', new Error('ENOENT')));
    expect(mapped.hint).toContain('pnpm run build');
  });

  it('maps ConfirmationRequiredError with a --yes/--dry-run hint', () => {
    const mapped = mapCoreError(new ConfirmationRequiredError('install'));
    expect(mapped.message).toContain('install');
    expect(mapped.hint).toContain('--yes');
  });

  it('maps NothingToInstallError with no hint required', () => {
    const mapped = mapCoreError(new NothingToInstallError());
    expect(mapped.exitCode).toBe(1);
  });

  it('maps UnknownBackupError with the backup id in the message', () => {
    const mapped = mapCoreError(new UnknownBackupError('abc-123'));
    expect(mapped.message).toContain('abc-123');
  });

  it('falls back to a plain Error message with no hint', () => {
    const mapped = mapCoreError(new Error('something broke'));
    expect(mapped.message).toBe('something broke');
    expect(mapped.hint).toBeUndefined();
    expect(mapped.exitCode).toBe(1);
  });

  it('stringifies a non-Error throw', () => {
    const mapped = mapCoreError('just a string');
    expect(mapped.message).toBe('just a string');
    expect(mapped.exitCode).toBe(1);
  });
});
