import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HomeContext } from './paths.js';
import { joinHome } from './paths.js';
import {
  CLIENT_REGISTRY,
  resolveGlobalSkillLocation,
  rulesForPlatform,
  type ClientRegistryEntry,
  type Confidence,
  type GlobalLocationKind,
  type Strategy,
} from './registry.js';

export interface DetectedClient {
  id: string;
  name: string;
  strategy: Strategy;
  detected: boolean;
  /** Absolute paths that matched a detect rule (empty when not detected). */
  matchedPaths: string[];
  confidence?: Confidence;
}

export type InstalledSkillKind = 'skill-dir' | 'rules-file' | 'agents-md';

export interface InstalledSkill {
  name: string;
  path: string;
  kind: InstalledSkillKind;
  files: number;
  bytes: number;
  /** chars/4, rounded — same convention as tools/hive.py's toks(). */
  tokensEst: number;
}

const SKIPPED_DIR_NAMES = new Set(['node_modules', '.git']);
const MAX_DEPTH = 6;
/** OS junk that is neither a skill nor a rules file — never listed, never counted. */
const JUNK_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
/**
 * Extensions whose content counts toward the chars/4 token estimate. The
 * estimate approximates *loadable knowledge text*; binary/media assets in a
 * skill dir (images, video, archives) still count toward `bytes`/`files` but
 * would wildly inflate a token figure that informs conversion proposals.
 */
const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.rst', '.py', '.js', '.mjs', '.cjs', '.ts',
  '.json', '.yaml', '.yml', '.toml', '.sh', '.html', '.css', '.csv', '.xml',
]);

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}
const MONOLITH_NAME_RE = /^(AGENTS|GEMINI)\.md$/i;

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.stat(absPath);
    return true;
  } catch {
    return false;
  }
}

function isWithin(resolvedTarget: string, resolvedRoot: string): boolean {
  if (resolvedTarget === resolvedRoot) return true;
  const withSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return resolvedTarget.startsWith(withSep);
}

/**
 * Recursively count files/bytes under `dir`. Skips node_modules/.git,
 * caps recursion at MAX_DEPTH, and never follows a symlink that resolves
 * outside `root` (the top-level directory this walk started from).
 */
async function walkDir(
  root: string,
  dir: string,
  depth: number,
): Promise<{ files: number; bytes: number; textBytes: number }> {
  if (depth > MAX_DEPTH) return { files: 0, bytes: 0, textBytes: 0 };

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { files: 0, bytes: 0, textBytes: 0 };
  }

  let files = 0;
  let bytes = 0;
  let textBytes = 0;

  for (const entry of entries) {
    if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
    if (JUNK_FILE_NAMES.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      let real: string;
      try {
        real = await fs.realpath(abs);
      } catch {
        continue;
      }
      const rootReal = await fs.realpath(root).catch(() => root);
      if (!isWithin(real, rootReal)) continue; // never follow symlinks out of root

      let st;
      try {
        st = await fs.stat(real);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        const sub = await walkDir(root, abs, depth + 1);
        files += sub.files;
        bytes += sub.bytes;
        textBytes += sub.textBytes;
      } else if (st.isFile()) {
        files += 1;
        bytes += st.size;
        if (isTextFile(entry.name)) textBytes += st.size;
      }
      continue;
    }

    if (entry.isDirectory()) {
      const sub = await walkDir(root, abs, depth + 1);
      files += sub.files;
      bytes += sub.bytes;
      textBytes += sub.textBytes;
    } else if (entry.isFile()) {
      const st = await fs.stat(abs);
      files += 1;
      bytes += st.size;
      if (isTextFile(entry.name)) textBytes += st.size;
    }
  }

  return { files, bytes, textBytes };
}

function tokensEstOf(textBytes: number): number {
  return Math.round(textBytes / 4);
}

/**
 * Scan a single resolved path (file or directory) and return the
 * InstalledSkill entries found there. `kind` disambiguates a directory's
 * entries as either one-subdir-per-skill or one-file-per-rule; it is
 * ignored when `absPath` resolves to a single file (a monolith rules
 * file, classified as 'agents-md' or 'rules-file' by its basename).
 */
export async function scanPath(
  _ctx: HomeContext,
  absPath: string,
  kind: GlobalLocationKind,
): Promise<InstalledSkill[]> {
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return [];
  }

  if (stat.isFile()) {
    const name = path.basename(absPath);
    if (JUNK_FILE_NAMES.has(name)) return [];
    const fileKind: InstalledSkillKind = MONOLITH_NAME_RE.test(name)
      ? 'agents-md'
      : 'rules-file';
    return [
      {
        name,
        path: absPath,
        kind: fileKind,
        files: 1,
        bytes: stat.size,
        tokensEst: isTextFile(name) || MONOLITH_NAME_RE.test(name) ? tokensEstOf(stat.size) : 0,
      },
    ];
  }

  if (!stat.isDirectory()) return [];

  let entries;
  try {
    entries = await fs.readdir(absPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: InstalledSkill[] = [];
  for (const entry of entries) {
    if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
    if (JUNK_FILE_NAMES.has(entry.name)) continue;
    const childAbs = path.join(absPath, entry.name);

    if (entry.isDirectory()) {
      const { files, bytes, textBytes } = await walkDir(childAbs, childAbs, 0);
      results.push({
        name: entry.name,
        path: childAbs,
        kind: kind === 'skill-dirs' ? 'skill-dir' : 'rules-file',
        files,
        bytes,
        tokensEst: tokensEstOf(textBytes),
      });
    } else if (entry.isFile()) {
      const st = await fs.stat(childAbs);
      results.push({
        name: entry.name,
        path: childAbs,
        kind: 'rules-file',
        files: 1,
        bytes: st.size,
        tokensEst: isTextFile(entry.name) ? tokensEstOf(st.size) : 0,
      });
    }
  }
  return results;
}

export async function detectClients(ctx: HomeContext): Promise<DetectedClient[]> {
  const results: DetectedClient[] = [];

  for (const entry of CLIENT_REGISTRY) {
    const matchedPaths = await matchDetectRules(ctx, entry);
    results.push({
      id: entry.id,
      name: entry.name,
      strategy: entry.strategy,
      detected: matchedPaths.length > 0,
      matchedPaths,
      confidence: entry.confidence,
    });
  }

  return results;
}

async function matchDetectRules(
  ctx: HomeContext,
  entry: ClientRegistryEntry,
): Promise<string[]> {
  const matched: string[] = [];
  const rules = rulesForPlatform(entry, ctx.platform);

  for (const rule of rules) {
    if (rule.type === 'exists') {
      const abs = joinHome(ctx, ...rule.relPath.split('/'));
      if (await pathExists(abs)) matched.push(abs);
      continue;
    }

    // rule.type === 'glob'
    const dirAbs = joinHome(ctx, ...rule.relDir.split('/'));
    let entries;
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirEntry of entries) {
      if (dirEntry.name.startsWith(rule.prefix)) {
        matched.push(path.join(dirAbs, dirEntry.name));
      }
    }
  }

  return matched;
}

export async function scanSkills(
  ctx: HomeContext,
  client: ClientRegistryEntry,
): Promise<InstalledSkill[]> {
  const globalAbs = resolveGlobalSkillLocation(ctx, client);
  if (!globalAbs) return [];
  const kind = client.globalLocationKind ?? 'skill-dirs';
  return scanPath(ctx, globalAbs, kind);
}
