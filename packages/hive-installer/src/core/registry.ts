import type { HomeContext } from './paths.js';
import { joinHome } from './paths.js';

/**
 * Install strategy per spec §4:
 * - native-skills: client has a first-class skills directory.
 * - payload-pointer: rules-based client; CCS tree goes to a payload dir
 *   we own, pointer snippet is proposed (never silently written).
 * - scan-only: v0.1 detects/scans/proposes but does not install.
 *
 * Note: spec §4 prose spells this strategy "payload+pointer"; this
 * package's string-literal id uses a hyphen ("payload-pointer") per the
 * task brief, since "+" is an awkward character in a TS union/id string.
 * Same concept, different literal spelling — tracked as a deviation.
 */
export type Strategy = 'native-skills' | 'payload-pointer' | 'scan-only';

export type Confidence = 'high' | 'medium' | 'low';

/**
 * How scanSkills() should interpret a resolved global skill location:
 * - skill-dirs: the location is a directory whose entries are
 *   subdirectories, one per skill (kind: 'skill-dir' in scanner.ts).
 * - rule-files: the location is a directory whose entries are files,
 *   one per rule (kind: 'rules-file' in scanner.ts).
 * A location that resolves to a single file (not a directory) — an
 * AGENTS.md/GEMINI.md-style monolith — is handled directly by the
 * scanner regardless of this field.
 */
export type GlobalLocationKind = 'skill-dirs' | 'rule-files';

export type DetectRule =
  | {
      type: 'exists';
      /** Path relative to $HOME whose mere existence signals the client is installed. */
      relPath: string;
      /** Platforms this rule applies to; omitted = all platforms. */
      platforms?: NodeJS.Platform[];
    }
  | {
      type: 'glob';
      /** Directory relative to $HOME to scan (non-recursive). */
      relDir: string;
      /** Entry-name prefix (without a trailing '*') that counts as a match. */
      prefix: string;
      platforms?: NodeJS.Platform[];
    };

export interface SkillLocations {
  /** Relative to $HOME. Absent when the client has no home-relative install target. */
  global?: string;
  /** Relative to a caller-supplied project dir (resolved by a later task via --project). */
  project?: string;
}

export interface FallbackStrategy {
  strategy: Strategy;
  /** Relative to $HOME. */
  payloadPath?: string;
}

export interface ClientRegistryEntry {
  id: string;
  name: string;
  detect: DetectRule[];
  skillLocations: SkillLocations;
  globalLocationKind?: GlobalLocationKind;
  strategy: Strategy;
  /** e.g. codex: native-skills if `.codex/skills` already exists, else payload-pointer. */
  fallback?: FallbackStrategy;
  /** Relative to $HOME. Set for payload-pointer clients (the CCS tree destination we own). */
  payloadPath?: string;
  /** Relative to $HOME. The rules file a pointer snippet may be proposed for. */
  pointerFile?: string;
  /** Present when the client's on-disk convention is fast-moving / best-effort. */
  confidence?: Confidence;
  notes?: string;
}

/**
 * The client registry — spec §4 table, verbatim. Pure data; detection,
 * scanning, and install strategy all read from this single source.
 */
export const CLIENT_REGISTRY: readonly ClientRegistryEntry[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    detect: [{ type: 'exists', relPath: '.claude' }],
    skillLocations: { global: '.claude/skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'native-skills',
    confidence: 'high',
  },
  {
    id: 'codex',
    name: 'Codex',
    detect: [{ type: 'exists', relPath: '.codex' }],
    skillLocations: { global: '.codex/skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'native-skills',
    fallback: { strategy: 'payload-pointer', payloadPath: '.codex/hive-skills' },
    pointerFile: '.codex/AGENTS.md',
    confidence: 'medium',
    notes:
      'native-skills if .codex/skills already exists, else falls back to payload+pointer under .codex/hive-skills.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    detect: [{ type: 'exists', relPath: '.cursor' }],
    skillLocations: { global: '.cursor/hive-skills', project: '.cursor/rules' },
    globalLocationKind: 'skill-dirs',
    strategy: 'payload-pointer',
    payloadPath: '.cursor/hive-skills',
    confidence: 'medium',
    notes: 'Project rule file write only via --project; no home-relative pointer file.',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    detect: [{ type: 'exists', relPath: '.gemini' }],
    skillLocations: { global: '.gemini/hive-skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'payload-pointer',
    payloadPath: '.gemini/hive-skills',
    pointerFile: '.gemini/GEMINI.md',
    confidence: 'medium',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    detect: [{ type: 'exists', relPath: '.codeium/windsurf' }],
    skillLocations: { global: '.codeium/windsurf/hive-skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'payload-pointer',
    payloadPath: '.codeium/windsurf/hive-skills',
    pointerFile: '.codeium/windsurf/memories/global_rules.md',
    confidence: 'low',
    notes: 'global_rules.md location is best-effort; Windsurf memory conventions move fast.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    detect: [
      { type: 'exists', relPath: '.config/opencode', platforms: ['darwin', 'linux'] },
      { type: 'exists', relPath: 'AppData/Roaming/opencode', platforms: ['win32'] },
    ],
    skillLocations: { global: '.config/opencode/hive-skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'payload-pointer',
    payloadPath: '.config/opencode/hive-skills',
    pointerFile: '.config/opencode/AGENTS.md',
    confidence: 'low',
    notes: 'win32 config path is a best-effort guess; unvalidated (spec §11).',
  },
  {
    id: 'vscode-copilot',
    name: 'VS Code (GitHub Copilot)',
    detect: [{ type: 'glob', relDir: '.vscode/extensions', prefix: 'github.copilot' }],
    skillLocations: { project: '.github/instructions' },
    strategy: 'scan-only',
    confidence: 'medium',
    notes: 'Install only available via --project; no home-relative skill location in v0.1.',
  },
  {
    id: 'cline',
    name: 'Cline',
    detect: [
      { type: 'glob', relDir: '.vscode/extensions', prefix: 'saoudrizwan.claude-dev' },
      { type: 'exists', relPath: 'Documents/Cline/Rules' },
    ],
    skillLocations: { global: 'Documents/Cline/Rules' },
    globalLocationKind: 'rule-files',
    strategy: 'payload-pointer',
    payloadPath: 'Documents/Cline/Rules/hive-skills',
    confidence: 'low',
    notes: 'Documents/Cline/Rules is a rule-files directory (one file per rule), not skill subdirs.',
  },
  {
    id: 'roo',
    name: 'Roo Code',
    detect: [
      { type: 'glob', relDir: '.vscode/extensions', prefix: 'rooveterinaryinc.' },
      { type: 'exists', relPath: '.roo' },
    ],
    skillLocations: { global: '.roo/rules' },
    globalLocationKind: 'rule-files',
    strategy: 'scan-only',
    confidence: 'low',
  },
  {
    id: 'zed',
    name: 'Zed',
    detect: [
      { type: 'exists', relPath: '.config/zed' },
      { type: 'exists', relPath: 'Library/Application Support/Zed', platforms: ['darwin'] },
    ],
    skillLocations: { project: '.rules' },
    strategy: 'scan-only',
    confidence: 'low',
    notes: 'Project-scoped .rules file only; no home-relative install target.',
  },
  {
    id: 'continue',
    name: 'Continue',
    detect: [{ type: 'exists', relPath: '.continue' }],
    skillLocations: { global: '.continue/rules' },
    globalLocationKind: 'rule-files',
    strategy: 'scan-only',
    confidence: 'medium',
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    detect: [
      {
        type: 'exists',
        relPath: 'Library/Application Support/Claude',
        platforms: ['darwin'],
      },
    ],
    skillLocations: {},
    strategy: 'scan-only',
    confidence: 'medium',
    notes: 'Skills managed in-app; darwin-only detection in v0.1 (spec §11 — no Windows validation).',
  },
] as const;

export function getClientById(id: string): ClientRegistryEntry | undefined {
  return CLIENT_REGISTRY.find((entry) => entry.id === id);
}

/** Filter an entry's detect rules down to the ones applicable on `platform`. */
export function rulesForPlatform(
  entry: ClientRegistryEntry,
  platform: NodeJS.Platform,
): DetectRule[] {
  return entry.detect.filter((rule) => !rule.platforms || rule.platforms.includes(platform));
}

export function resolveGlobalSkillLocation(
  ctx: HomeContext,
  entry: ClientRegistryEntry,
): string | undefined {
  if (!entry.skillLocations.global) return undefined;
  return joinHome(ctx, ...entry.skillLocations.global.split('/'));
}

export function resolvePayloadLocation(
  ctx: HomeContext,
  entry: ClientRegistryEntry,
): string | undefined {
  if (!entry.payloadPath) return undefined;
  return joinHome(ctx, ...entry.payloadPath.split('/'));
}

export function resolvePointerFile(
  ctx: HomeContext,
  entry: ClientRegistryEntry,
): string | undefined {
  if (!entry.pointerFile) return undefined;
  return joinHome(ctx, ...entry.pointerFile.split('/'));
}
