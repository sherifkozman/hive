import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { CLIENT_REGISTRY } from '../src/core/registry.js';
import { formatScanTable, runScan } from '../src/commands/scan.js';

let tmp: string;
let homeDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-cmd-scan-'));
  homeDir = path.join(tmp, 'home');
  await mkdir(homeDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function ctx() {
  return resolveHomeContext({ homeFlag: homeDir, platform: 'linux' });
}

describe('runScan', () => {
  it('reports every registry client, detected: false for absent ones', async () => {
    const result = await runScan(ctx(), CLIENT_REGISTRY);
    expect(result.clients.length).toBe(CLIENT_REGISTRY.length);
    expect(result.clients.every((c) => c.detected === false)).toBe(true);
    expect(result.clients.every((c) => c.skills.length === 0)).toBe(true);
  });

  it('marks a detected client and reports its existing skills', async () => {
    await mkdir(path.join(homeDir, '.claude', 'skills', 'my-existing-skill'), { recursive: true });
    await writeFile(
      path.join(homeDir, '.claude', 'skills', 'my-existing-skill', 'SKILL.md'),
      'x'.repeat(400),
    );

    const result = await runScan(ctx(), CLIENT_REGISTRY);
    const claudeCode = result.clients.find((c) => c.id === 'claude-code');
    expect(claudeCode?.detected).toBe(true);
    expect(claudeCode?.strategy).toBe('native-skills');
    expect(claudeCode?.skills.map((s) => s.name)).toContain('my-existing-skill');
    expect(claudeCode?.skills[0]?.tokensEst).toBeGreaterThan(0);
  });

  it('carries the registry confidence tier through', async () => {
    const result = await runScan(ctx(), CLIENT_REGISTRY);
    const gemini = result.clients.find((c) => c.id === 'gemini');
    expect(gemini?.confidence).toBe('verified');
  });
});

describe('formatScanTable', () => {
  it('renders a marker line per client plus a detected-count summary', () => {
    const table = formatScanTable({
      clients: [
        { id: 'claude-code', name: 'Claude Code', detected: true, strategy: 'native-skills', confidence: 'verified', skills: [] },
        { id: 'codex', name: 'Codex', detected: false, strategy: 'native-skills', confidence: 'verified', skills: [] },
      ],
    });
    expect(table).toContain('Claude Code');
    expect(table).toContain('Codex');
    expect(table).toContain('1 of 2 known client(s) detected.');
  });

  it('indents scanned skill rows under their client', () => {
    const table = formatScanTable({
      clients: [
        {
          id: 'claude-code',
          name: 'Claude Code',
          detected: true,
          strategy: 'native-skills',
          confidence: 'verified',
          skills: [{ name: 'my-skill', path: '/x', kind: 'skill-dir', tokensEst: 42 }],
        },
      ],
    });
    expect(table).toContain('my-skill');
    expect(table).toContain('42 tokens');
  });
});
