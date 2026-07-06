import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { CLIENT_REGISTRY } from '../src/core/registry.js';
import { UnknownClientError } from '../src/core/installer.js';
import { formatBackupResult, runBackup } from '../src/commands/backup.js';

let tmp: string;
let homeDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-cmd-backup-'));
  homeDir = path.join(tmp, 'home');
  await mkdir(homeDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function ctx() {
  return resolveHomeContext({ homeFlag: homeDir, platform: 'linux' });
}

describe('runBackup', () => {
  it('throws UnknownClientError for an unregistered client id', async () => {
    await expect(runBackup(ctx(), CLIENT_REGISTRY, { clients: ['not-real'] })).rejects.toThrow(UnknownClientError);
  });

  it('reports skipped when a client has nothing present on disk', async () => {
    const outcomes = await runBackup(ctx(), CLIENT_REGISTRY, { clients: ['claude-code'] });
    expect(outcomes).toEqual([{ clientId: 'claude-code', skippedReason: 'nothing-to-back-up' }]);
  });

  it('snapshots an existing skill dir for the given client', async () => {
    await mkdir(path.join(homeDir, '.claude', 'skills', 'hive-foo'), { recursive: true });
    await writeFile(path.join(homeDir, '.claude', 'skills', 'hive-foo', 'SKILL.md'), 'x'.repeat(50));

    const outcomes = await runBackup(ctx(), CLIENT_REGISTRY, { clients: ['claude-code'] });
    expect(outcomes.length).toBe(1);
    expect(outcomes[0]?.snapshot).toBeDefined();
    expect(outcomes[0]?.snapshot?.manifest.entries.length).toBeGreaterThan(0);
  });

  it('defaults to every detected client when --client is omitted', async () => {
    await mkdir(path.join(homeDir, '.claude'), { recursive: true });
    await mkdir(path.join(homeDir, '.codex'), { recursive: true });
    const outcomes = await runBackup(ctx(), CLIENT_REGISTRY, {});
    const ids = outcomes.map((o) => o.clientId).sort();
    expect(ids).toEqual(['claude-code', 'codex']);
  });
});

describe('formatBackupResult', () => {
  it('renders a line per client', () => {
    const text = formatBackupResult([
      { clientId: 'claude-code', skippedReason: 'nothing-to-back-up' },
    ]);
    expect(text).toContain('claude-code: nothing to back up');
  });

  it('handles an empty outcome list', () => {
    expect(formatBackupResult([])).toBe('No clients selected.');
  });
});
