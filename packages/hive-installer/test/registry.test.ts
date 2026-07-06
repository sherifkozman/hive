import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import {
  CLIENT_REGISTRY,
  getClientById,
  resolveGlobalSkillLocation,
  resolvePayloadLocation,
  resolvePointerFile,
  rulesForPlatform,
  type Strategy,
} from '../src/core/registry.js';

const EXPECTED_IDS = [
  'claude-code',
  'codex',
  'cursor',
  'gemini',
  'windsurf',
  'opencode',
  'vscode-copilot',
  'cline',
  'roo',
  'zed',
  'continue',
  'claude-desktop',
];

const VALID_STRATEGIES: Strategy[] = [
  'native-skills',
  'payload-pointer',
  'scan-only',
];

describe('CLIENT_REGISTRY', () => {
  it('has exactly the 12 ids from spec §4, in order', () => {
    expect(CLIENT_REGISTRY.map((e) => e.id)).toEqual(EXPECTED_IDS);
  });

  it('every entry has a name, valid strategy, and at least one detect rule', () => {
    for (const entry of CLIENT_REGISTRY) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(VALID_STRATEGIES).toContain(entry.strategy);
      expect(entry.detect.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = CLIENT_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('claude-code is native-skills with skillLocations.global set', () => {
    const entry = getClientById('claude-code');
    expect(entry?.strategy).toBe('native-skills');
    expect(entry?.skillLocations.global).toBe('.claude/skills');
  });

  it('vscode-copilot is scan-only with no home-relative global skill location', () => {
    const entry = getClientById('vscode-copilot');
    expect(entry?.strategy).toBe('scan-only');
    expect(entry?.skillLocations.global).toBeUndefined();
    expect(entry?.skillLocations.project).toBeTruthy();
  });

  it('claude-desktop detect rule is darwin-only', () => {
    const entry = getClientById('claude-desktop');
    expect(entry).toBeTruthy();
    const darwinRules = rulesForPlatform(entry!, 'darwin');
    const linuxRules = rulesForPlatform(entry!, 'linux');
    expect(darwinRules.length).toBeGreaterThan(0);
    expect(linuxRules.length).toBe(0);
  });

  it('getClientById returns undefined for an unknown id', () => {
    expect(getClientById('nonexistent')).toBeUndefined();
  });
});

describe('rulesForPlatform', () => {
  it('includes platform-agnostic rules on every platform', () => {
    const entry = getClientById('claude-code')!;
    for (const platform of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      expect(rulesForPlatform(entry, platform).length).toBeGreaterThan(0);
    }
  });
});

describe('resolveGlobalSkillLocation', () => {
  it('resolves claude-code global skill location under ctx.home', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    const entry = getClientById('claude-code')!;
    expect(resolveGlobalSkillLocation(ctx, entry)).toBe(
      path.join('/fixture/home', '.claude', 'skills'),
    );
  });

  it('returns undefined for entries with no global skill location (vscode-copilot)', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    const entry = getClientById('vscode-copilot')!;
    expect(resolveGlobalSkillLocation(ctx, entry)).toBeUndefined();
  });
});

describe('resolvePayloadLocation', () => {
  it('resolves a payload-pointer client payload dir under ctx.home', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    const entry = getClientById('cursor')!;
    expect(entry.strategy).toBe('payload-pointer');
    expect(resolvePayloadLocation(ctx, entry)).toBe(
      path.join('/fixture/home', '.cursor', 'hive-skills'),
    );
  });

  it('returns undefined for a native-skills client with no separate payload path', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    const entry = getClientById('claude-code')!;
    expect(resolvePayloadLocation(ctx, entry)).toBeUndefined();
  });
});

describe('resolvePointerFile', () => {
  it('resolves the gemini pointer file (GEMINI.md) under ctx.home', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    const entry = getClientById('gemini')!;
    const pointer = resolvePointerFile(ctx, entry);
    expect(pointer).toBe(path.join('/fixture/home', '.gemini', 'GEMINI.md'));
  });

  it('returns undefined for clients without a pointer file (claude-code)', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    const entry = getClientById('claude-code')!;
    expect(resolvePointerFile(ctx, entry)).toBeUndefined();
  });
});

describe('codex fallback strategy', () => {
  it('codex records a native-skills primary strategy with a payload-pointer fallback', () => {
    const entry = getClientById('codex')!;
    expect(entry.strategy).toBe('native-skills');
    expect(entry.fallback?.strategy).toBe('payload-pointer');
    expect(entry.fallback?.payloadPath).toBe('.codex/hive-skills');
  });
});
