import path from 'node:path';
import type { HomeContext } from './paths.js';
import { joinHome } from './paths.js';

/**
 * Install strategy:
 * - native-skills: client has a first-class skills directory.
 * - payload-pointer: rules-based client; CCS tree goes to a payload dir
 *   we own, a pointer snippet is proposed (never silently written) for a
 *   home-relative rules file (GEMINI.md, global_rules.md, ...).
 * - payload-project-pointer: like payload-pointer, but the client has NO
 *   home-relative rules file to point at (e.g. Cursor's global rules
 *   live in app settings, not on disk) — only a project-level pointer
 *   file is offered, via --project.
 * - scan-only: v0.1 detects/scans/proposes but does not install.
 *
 * Note: spec §4 prose spells the second strategy "payload+pointer"; this
 * package's string-literal id uses a hyphen ("payload-pointer") since
 * "+" is an awkward character in a TS union/id string. Same concept,
 * different literal spelling — tracked as a deviation.
 */
export type Strategy =
  | 'native-skills'
  | 'payload-pointer'
  | 'payload-project-pointer'
  | 'scan-only';

/**
 * How confident we are in an entry's paths/strategy:
 * - verified: observed on a real machine and/or corroborated by fetched
 *   vendor docs.
 * - docs: taken from vendor documentation, not independently observed
 *   on a real machine this session.
 * - assumed: best-effort guess from naming conventions; not verified.
 */
export type Confidence = 'verified' | 'docs' | 'assumed';

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
  /** Relative to $HOME. Set for payload-pointer(-family) clients (the CCS tree destination we own). */
  payloadPath?: string;
  /** Relative to $HOME. The rules file a pointer snippet may be proposed for. */
  pointerFile?: string;
  /**
   * Filename (not a full path) of the pointer file to write *inside*
   * `skillLocations.project` for a payload-project-pointer client (e.g.
   * cursor: project = '.cursor/rules', projectPointerFile = 'hive-skills.mdc').
   */
  projectPointerFile?: string;
  confidence: Confidence;
  /** sourceUrl (fetched vendor docs) or 'observed-local' (confirmed on a real machine this session). */
  provenance: string;
  notes?: string;
}

const VSCODE_EXTENSION_DIRS = ['.vscode/extensions', '.vscode-insiders/extensions'] as const;

function vscodeExtensionDetectRules(prefix: string): DetectRule[] {
  return VSCODE_EXTENSION_DIRS.map((relDir) => ({ type: 'glob', relDir, prefix }) as const);
}

/**
 * The client registry. Data-driven core for detection, scanning, and
 * install strategy. Corrected 2026-07-05 against real vendor docs
 * (opencode.ai, docs.cline.bot, code.visualstudio.com, zed.dev — fetched
 * this session) and a read-only probe of this machine's actual $HOME
 * (see per-entry `provenance`).
 */
export const CLIENT_REGISTRY: readonly ClientRegistryEntry[] = [
  // --- native-skills (first-class skills directory) ---
  {
    id: 'claude-code',
    name: 'Claude Code',
    detect: [{ type: 'exists', relPath: '.claude' }],
    skillLocations: { global: '.claude/skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'native-skills',
    confidence: 'verified',
    provenance: 'observed-local',
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
    confidence: 'verified',
    provenance: 'observed-local',
    notes:
      'Native ~/.codex/skills observed locally with existing skills present. The payload+pointer ' +
      'fallback (~/.codex/hive-skills, pointer at ~/.codex/AGENTS.md) is used only if the skills dir ' +
      "can't be created — it is NOT the default path.",
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    detect: [
      { type: 'exists', relPath: '.config/opencode', platforms: ['darwin', 'linux'] },
      { type: 'exists', relPath: 'AppData/Roaming/opencode', platforms: ['win32'] },
    ],
    skillLocations: { global: '.config/opencode/skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'native-skills',
    confidence: 'docs',
    provenance:
      'https://opencode.ai/docs/skills (fetched 2026-07-05: "Global definitions are loaded from ' +
      '~/.config/opencode/skills/*/SKILL.md, ~/.claude/skills/*/SKILL.md, and ~/.agents/skills/*/SKILL.md")',
    notes:
      'OpenCode also reads ~/.claude/skills and ~/.agents/skills as additional global locations — ' +
      'installing to the claude-code or agents-dir entries benefits OpenCode too. win32 config path is ' +
      'a best-effort guess, unvalidated (spec §11).',
  },
  {
    id: 'vscode-copilot',
    name: 'VS Code (GitHub Copilot)',
    detect: [{ type: 'exists', relPath: '.copilot' }, ...vscodeExtensionDetectRules('github.copilot')],
    skillLocations: { global: '.copilot/skills', project: '.github/skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'native-skills',
    confidence: 'verified',
    provenance:
      'observed-local (~/.copilot exists); https://code.visualstudio.com/docs/agent-customization/agent-skills ' +
      '(fetched 2026-07-05: personal skills at ~/.copilot/skills/, ~/.claude/skills/, ~/.agents/skills/; ' +
      'project skills at .github/skills/, .claude/skills/, .agents/skills/)',
    notes: 'Detection also matches the VS Code Insiders extensions dir (~/.vscode-insiders/extensions).',
  },
  {
    id: 'cline',
    name: 'Cline',
    detect: [
      { type: 'exists', relPath: '.cline' },
      { type: 'exists', relPath: 'Documents/Cline/Rules' },
      ...vscodeExtensionDetectRules('saoudrizwan.claude-dev'),
    ],
    skillLocations: { global: '.cline/skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'native-skills',
    confidence: 'docs',
    provenance:
      'https://docs.cline.bot/customization/skills (fetched 2026-07-05: global skills at ~/.cline/skills/)',
    notes:
      'Documents/Cline/Rules (confirmed present locally) is a separate, rules-only location (pre-existing ' +
      'Cline convention), used here as detection evidence only — Hive installs to ~/.cline/skills/, never ' +
      'to Documents/Cline/Rules. Detection also matches the VS Code Insiders extensions dir.',
  },
  {
    id: 'agents-dir',
    name: 'Shared agents dir (~/.agents)',
    detect: [{ type: 'exists', relPath: '.agents' }],
    skillLocations: { global: '.agents/skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'native-skills',
    confidence: 'verified',
    provenance: 'observed-local',
    notes:
      '~/.agents/skills confirmed present locally. Cross-client shared convention: OpenCode, VS Code ' +
      'Copilot, and Zed docs (opencode.ai/docs/skills, code.visualstudio.com/docs/agent-customization/' +
      'agent-skills, zed.dev/docs/ai/skills — all fetched 2026-07-05) all describe ~/.agents/skills/ as an ' +
      'additional global location they read, so installing here benefits multiple clients from one write.',
  },
  // --- payload-pointer / payload-project-pointer (rules-based clients) ---
  {
    id: 'gemini',
    name: 'Gemini CLI',
    detect: [{ type: 'exists', relPath: '.gemini' }],
    skillLocations: { global: '.gemini/hive-skills' },
    globalLocationKind: 'skill-dirs',
    strategy: 'payload-pointer',
    payloadPath: '.gemini/hive-skills',
    pointerFile: '.gemini/GEMINI.md',
    confidence: 'verified',
    provenance: 'observed-local (~/.gemini/GEMINI.md exists)',
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
    confidence: 'assumed',
    provenance:
      'observed-local (~/.codeium/windsurf exists); the memories/global_rules.md pointer path itself is unverified',
    notes: 'Windsurf memory-file conventions move fast; doctor should surface this as a low-confidence path.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    detect: [{ type: 'exists', relPath: '.cursor' }],
    skillLocations: { global: '.cursor/hive-skills', project: '.cursor/rules' },
    globalLocationKind: 'skill-dirs',
    strategy: 'payload-project-pointer',
    payloadPath: '.cursor/hive-skills',
    projectPointerFile: 'hive-skills.mdc',
    confidence: 'docs',
    provenance: 'reported (2026-07-05 review): Cursor global rules live in app settings, not a file',
    notes:
      'No home-relative pointer file — Cursor has no global rules file on disk to point at. Only a ' +
      'project-level pointer (.cursor/rules/hive-skills.mdc) is offered, via --project.',
  },
  // --- scan-only (v0.1 detects/scans/proposes but does not install) ---
  {
    id: 'roo',
    name: 'Roo Code',
    detect: [{ type: 'exists', relPath: '.roo' }, ...vscodeExtensionDetectRules('rooveterinaryinc.')],
    skillLocations: { global: '.roo/rules' },
    globalLocationKind: 'rule-files',
    strategy: 'scan-only',
    confidence: 'assumed',
    provenance: 'assumed from Roo Code / VS Code extension naming conventions; not independently verified',
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
    confidence: 'docs',
    provenance:
      'https://zed.dev/docs/ai/skills (fetched 2026-07-05: Zed now supports skills at ~/.agents/skills/ ' +
      'global and <worktree>/.agents/skills/ project)',
    notes:
      'zed.dev/docs/ai/skills confirms Zed now has real skills support (global ~/.agents/skills/, project ' +
      '<worktree>/.agents/skills/ — the same shared convention as the agents-dir entry above), but this ' +
      'entry is kept scan-only in v0.1 by deliberate decision, to avoid double-installing through both ' +
      'this entry and the shared agents-dir entry; revisit once the install engine can dedupe shared ' +
      'targets across clients.',
  },
  {
    id: 'continue',
    name: 'Continue',
    detect: [{ type: 'exists', relPath: '.continue' }],
    skillLocations: { global: '.continue/rules' },
    globalLocationKind: 'rule-files',
    strategy: 'scan-only',
    confidence: 'assumed',
    provenance: 'assumed from Continue conventions (.continue/rules/); not independently verified this session',
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
    confidence: 'verified',
    provenance: 'observed-local',
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

/**
 * Resolve the project-relative pointer file path for a
 * payload-project-pointer client (e.g. cursor), given the project dir a
 * later `--project <dir>` flag supplies. Returns undefined when the
 * entry has no project location or no projectPointerFile filename.
 */
export function resolveProjectPointerFile(
  projectDir: string,
  entry: ClientRegistryEntry,
): string | undefined {
  if (!entry.skillLocations.project || !entry.projectPointerFile) return undefined;
  return path.join(projectDir, ...entry.skillLocations.project.split('/'), entry.projectPointerFile);
}

/**
 * Recursively merge `override` onto `base`: plain nested objects are
 * merged key-by-key; arrays and primitives are replaced wholesale when
 * present in `override`. `undefined` values in `override` are ignored
 * (they don't clobber a base value).
 */
function deepMergeObject<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = (base as Record<string, unknown>)[key];
    if (isPlainObject(value) && isPlainObject(baseValue)) {
      result[key] = deepMergeObject(baseValue, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A registry override document: keyed by client id. An id that matches a
 * builtin entry is deep-merged onto it (partial); an id that does NOT
 * match a builtin is treated as a brand-new client and must supply at
 * least name/detect/skillLocations/strategy. This is the merge logic
 * behind a future `--registry <file>` / `HIVE_SKILLS_REGISTRY` flag (not
 * wired up yet — that's a later task); this function is what it will call.
 */
export type RegistryOverrideDocument = Record<string, Partial<ClientRegistryEntry>>;

export function mergeRegistry(
  builtins: readonly ClientRegistryEntry[],
  overridePartialJson: unknown,
): ClientRegistryEntry[] {
  if (overridePartialJson === undefined || overridePartialJson === null) {
    return [...builtins];
  }
  if (!isPlainObject(overridePartialJson)) {
    throw new Error('mergeRegistry: override must be a JSON object keyed by client id');
  }

  const byId = new Map<string, ClientRegistryEntry>(builtins.map((entry) => [entry.id, entry]));
  const overrides = overridePartialJson as RegistryOverrideDocument;

  for (const [id, partial] of Object.entries(overrides)) {
    const existing = byId.get(id);
    if (existing) {
      byId.set(
        id,
        deepMergeObject(existing as unknown as Record<string, unknown>, partial as Record<string, unknown>) as unknown as ClientRegistryEntry,
      );
      continue;
    }

    if (!partial.name || !partial.strategy || !partial.detect || !partial.skillLocations) {
      throw new Error(
        `mergeRegistry: new client "${id}" override must include at least name, detect, skillLocations, and strategy`,
      );
    }

    byId.set(id, {
      confidence: 'assumed',
      provenance: 'user-provided override',
      ...partial,
      id,
    } as ClientRegistryEntry);
  }

  return [...byId.values()];
}
