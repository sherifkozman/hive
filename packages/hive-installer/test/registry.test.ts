import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import {
  CLIENT_REGISTRY,
  getClientById,
  mergeRegistry,
  resolveGlobalSkillLocation,
  resolvePayloadLocation,
  resolvePointerFile,
  rulesForPlatform,
  type ClientRegistryEntry,
  type Confidence,
  type Strategy,
} from '../src/core/registry.js';

// spec §4 corrected table (registry restructure, 2026-07-05 dual review).
const EXPECTED_IDS = [
  'claude-code',
  'codex',
  'opencode',
  'vscode-copilot',
  'cline',
  'agents-dir',
  'gemini',
  'windsurf',
  'cursor',
  'roo',
  'zed',
  'continue',
  'claude-desktop',
];

const VALID_STRATEGIES: Strategy[] = [
  'native-skills',
  'payload-pointer',
  'payload-project-pointer',
  'scan-only',
];

const VALID_CONFIDENCE: Confidence[] = ['verified', 'docs', 'assumed'];

describe('CLIENT_REGISTRY', () => {
  it('has exactly the 13 ids from spec §4 (corrected table), in order', () => {
    expect(CLIENT_REGISTRY.map((e) => e.id)).toEqual(EXPECTED_IDS);
  });

  it('every entry has a name, valid strategy, at least one detect rule, provenance, and confidence', () => {
    for (const entry of CLIENT_REGISTRY) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(VALID_STRATEGIES).toContain(entry.strategy);
      expect(entry.detect.length).toBeGreaterThan(0);
      expect(entry.provenance.length).toBeGreaterThan(0);
      expect(VALID_CONFIDENCE).toContain(entry.confidence);
    }
  });

  it('ids are unique', () => {
    const ids = CLIENT_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('claude-code is native-skills with skillLocations.global set, observed-local/verified', () => {
    const entry = getClientById('claude-code');
    expect(entry?.strategy).toBe('native-skills');
    expect(entry?.skillLocations.global).toBe('.claude/skills');
    expect(entry?.provenance).toBe('observed-local');
    expect(entry?.confidence).toBe('verified');
  });

  it('codex is native-skills with a payload-pointer fallback (AGENTS.md payload only if the skills dir is uncreatable)', () => {
    const entry = getClientById('codex')!;
    expect(entry.strategy).toBe('native-skills');
    expect(entry.skillLocations.global).toBe('.codex/skills');
    expect(entry.fallback?.strategy).toBe('payload-pointer');
    expect(entry.fallback?.payloadPath).toBe('.codex/hive-skills');
    expect(entry.pointerFile).toBe('.codex/AGENTS.md');
  });

  it('opencode is native-skills with skillLocations.global under .config/opencode/skills', () => {
    const entry = getClientById('opencode')!;
    expect(entry.strategy).toBe('native-skills');
    expect(entry.skillLocations.global).toBe('.config/opencode/skills');
  });

  it('vscode-copilot flips to native-skills with a personal skill dir and a --project location', () => {
    const entry = getClientById('vscode-copilot')!;
    expect(entry.strategy).toBe('native-skills');
    expect(entry.skillLocations.global).toBe('.copilot/skills');
    expect(entry.skillLocations.project).toBe('.github/skills');
  });

  it('vscode-copilot detection covers .copilot, .vscode/extensions, and .vscode-insiders/extensions', () => {
    const entry = getClientById('vscode-copilot')!;
    const rules = rulesForPlatform(entry, 'darwin');
    expect(rules.some((r) => r.type === 'exists' && r.relPath === '.copilot')).toBe(true);
    expect(
      rules.some((r) => r.type === 'glob' && r.relDir === '.vscode/extensions' && r.prefix === 'github.copilot'),
    ).toBe(true);
    expect(
      rules.some(
        (r) => r.type === 'glob' && r.relDir === '.vscode-insiders/extensions' && r.prefix === 'github.copilot',
      ),
    ).toBe(true);
  });

  it('cline is native-skills with skillLocations.global under .cline/skills', () => {
    const entry = getClientById('cline')!;
    expect(entry.strategy).toBe('native-skills');
    expect(entry.skillLocations.global).toBe('.cline/skills');
  });

  it('cline detect rules include Documents/Cline/Rules as evidence only — never an install target', () => {
    const entry = getClientById('cline')!;
    const rules = rulesForPlatform(entry, 'darwin');
    expect(rules.some((r) => r.type === 'exists' && r.relPath === 'Documents/Cline/Rules')).toBe(true);
    expect(entry.skillLocations.global).not.toContain('Documents');
    expect(entry.payloadPath ?? '').not.toContain('Documents');
  });

  it('agents-dir is a new native-skills entry for the shared ~/.agents dir, observed-local/verified', () => {
    const entry = getClientById('agents-dir')!;
    expect(entry).toBeTruthy();
    expect(entry.strategy).toBe('native-skills');
    expect(entry.detect.some((r) => r.type === 'exists' && r.relPath === '.agents')).toBe(true);
    expect(entry.skillLocations.global).toBe('.agents/skills');
    expect(entry.provenance).toBe('observed-local');
    expect(entry.confidence).toBe('verified');
  });

  it('gemini and windsurf keep strategy payload-pointer', () => {
    expect(getClientById('gemini')?.strategy).toBe('payload-pointer');
    expect(getClientById('windsurf')?.strategy).toBe('payload-pointer');
  });

  it('cursor is payload-project-pointer with a payload dir, no global pointer file, and a project pointer filename', () => {
    const entry = getClientById('cursor')!;
    expect(entry.strategy).toBe('payload-project-pointer');
    expect(entry.payloadPath).toBe('.cursor/hive-skills');
    expect(entry.pointerFile).toBeUndefined();
    expect(entry.skillLocations.project).toBe('.cursor/rules');
    expect(entry.projectPointerFile).toBe('hive-skills.mdc');
  });

  it('roo, zed, continue, claude-desktop are scan-only', () => {
    for (const id of ['roo', 'zed', 'continue', 'claude-desktop']) {
      expect(getClientById(id)?.strategy).toBe('scan-only');
    }
  });

  it('zed notes cite zed.dev/docs/ai/skills', () => {
    expect(getClientById('zed')?.notes ?? '').toMatch(/zed\.dev\/docs\/ai\/skills/);
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

  it('returns undefined for entries with no global skill location (zed)', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    const entry = getClientById('zed')!;
    expect(resolveGlobalSkillLocation(ctx, entry)).toBeUndefined();
  });
});

describe('resolvePayloadLocation', () => {
  it('resolves a payload-project-pointer client payload dir under ctx.home (cursor)', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    const entry = getClientById('cursor')!;
    expect(entry.strategy).toBe('payload-project-pointer');
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

  it('returns undefined for clients without a pointer file (claude-code, cursor)', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    expect(resolvePointerFile(ctx, getClientById('claude-code')!)).toBeUndefined();
    expect(resolvePointerFile(ctx, getClientById('cursor')!)).toBeUndefined();
  });
});

describe('mergeRegistry', () => {
  it('overrides a single field on an existing entry, leaving the rest untouched', () => {
    const merged = mergeRegistry(CLIENT_REGISTRY, {
      codex: { skillLocations: { global: '.codex/custom-skills' } },
    });
    const codex = merged.find((e) => e.id === 'codex')!;
    expect(codex.skillLocations.global).toBe('.codex/custom-skills');
    expect(codex.strategy).toBe('native-skills'); // untouched
    expect(codex.name).toBe(getClientById('codex')!.name); // untouched

    // Every other entry is unaffected.
    const others = merged.filter((e) => e.id !== 'codex');
    const originalOthers = CLIENT_REGISTRY.filter((e) => e.id !== 'codex');
    expect(others).toEqual(originalOthers);
  });

  it('appends a new client id not present in the builtins', () => {
    const newClient: ClientRegistryEntry = {
      id: 'my-custom-client',
      name: 'My Custom Client',
      detect: [{ type: 'exists', relPath: '.my-client' }],
      skillLocations: { global: '.my-client/skills' },
      globalLocationKind: 'skill-dirs',
      strategy: 'native-skills',
      provenance: 'observed-local',
      confidence: 'assumed',
    };
    const merged = mergeRegistry(CLIENT_REGISTRY, { 'my-custom-client': newClient });
    expect(merged.length).toBe(CLIENT_REGISTRY.length + 1);
    expect(merged.find((e) => e.id === 'my-custom-client')).toEqual(newClient);
  });

  it('does not mutate the builtins array passed in', () => {
    const before = JSON.parse(JSON.stringify(CLIENT_REGISTRY));
    mergeRegistry(CLIENT_REGISTRY, { codex: { skillLocations: { global: '.codex/other' } } });
    expect(JSON.parse(JSON.stringify(CLIENT_REGISTRY))).toEqual(before);
  });
});
