#!/usr/bin/env node
// Asset bundling (T2.5, spec §3): copies everything an offline install needs
// into assets/ at build/prepack time, plus assets/manifest.json describing
// what was bundled. Read-only on the repo side (git query only); all writes
// land under this package's assets/ directory.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(packageRoot, '..', '..');
const assetsDir = path.join(packageRoot, 'assets');

const SKILL_CATEGORIES = ['authored', 'converted', 'meta'];

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function walkFiles(dir, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(abs, out);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

/** Strip the light markdown this repo's INDEX.md prose uses: `code`, **bold**, *italic*, [text](url). */
function stripMarkdownInline(text) {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

/** First `.`/`!`/`?`-terminated sentence of a (whitespace-collapsed) paragraph. */
function firstSentence(paragraph) {
  const collapsed = stripMarkdownInline(paragraph.replace(/\s+/g, ' ').trim());
  const match = collapsed.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : collapsed).trim();
}

/**
 * Description = first sentence of the INDEX.md body (everything after the
 * H1 title line), stripped of markdown. Every INDEX.md in this repo opens
 * with `# Title` then a blank line then either a skill-specific summary
 * paragraph or (for skills without one) the standard "Loading policy: ..."
 * paragraph — either way, "first sentence of the body" is well-defined.
 */
async function extractDescription(indexPath) {
  const raw = await fs.readFile(indexPath, 'utf8');
  const lines = raw.split('\n');

  let i = 0;
  while (i < lines.length && !/^#\s/.test(lines[i])) i++;
  i++; // past the title line
  while (i < lines.length && lines[i].trim() === '') i++;

  const paragraphLines = [];
  while (i < lines.length && lines[i].trim() !== '') {
    paragraphLines.push(lines[i]);
    i++;
  }

  return firstSentence(paragraphLines.join(' '));
}

/** Copy skills/{authored,converted,meta}/*\/composable into assets/skills/... */
async function copySkillTrees() {
  const copied = [];
  for (const category of SKILL_CATEGORIES) {
    const categoryDir = path.join(repoRoot, 'skills', category);
    for (const name of await listDirs(categoryDir)) {
      const src = path.join(categoryDir, name, 'composable');
      if (!(await pathExists(src))) continue;
      const destSkillDir = path.join(assetsDir, 'skills', category, name);
      const dest = path.join(destSkillDir, 'composable');
      await fs.mkdir(destSkillDir, { recursive: true });
      await fs.cp(src, dest, { recursive: true });
      copied.push({ category, name, destSkillDir, composableDir: dest });
    }
  }
  return copied;
}

/**
 * Find a converted/authored skill's vendored source root under
 * skills/sources, if one exists: either skills/sources/<name>/ directly
 * (a single-skill origin, e.g. financial-analyst) or
 * skills/sources/<origin>/<name>/ (a multi-skill origin, e.g. anthropic).
 * A SKILL.md at that candidate root is the marker of "this is a vendored
 * skill root", not just a coincidentally-named directory. Never hardcodes
 * an origin name — walks whatever origins actually exist.
 */
async function findVendoredSourceRoot(sourcesDir, name) {
  const direct = path.join(sourcesDir, name);
  if (await pathExists(path.join(direct, 'SKILL.md'))) return direct;

  for (const origin of await listDirs(sourcesDir)) {
    const candidate = path.join(sourcesDir, origin, name);
    if (await pathExists(path.join(candidate, 'SKILL.md'))) return candidate;
  }
  return null;
}

/** Every .md file bundled for a skill (INDEX.md, BUNDLE.md, mini/*.md, presets/*.md), concatenated. */
async function readComposableContent(composableDir) {
  const files = [];
  await walkFiles(composableDir, files);
  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const contents = await Promise.all(mdFiles.map((f) => fs.readFile(f, 'utf8')));
  return contents.join('\n');
}

/**
 * True iff `content` references `dirName` as a relative path — e.g.
 * `scripts/foo.py`, `` `scripts/` ``, or a markdown link target
 * `(../../shared/y.md)`. Word-boundary before the name (so `scripts`
 * doesn't match inside `test-scripts/`), then a literal `/`.
 */
function referencesDir(content, dirName) {
  const escaped = dirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![A-Za-z0-9_])${escaped}/`);
  return re.test(content);
}

/**
 * Non-knowledge assets (spec §9): a converted/authored skill's minis may
 * reference sibling files by relative path (e.g. `scripts/foo.py`) that
 * live in the vendored source, not in the CCS composable/ tree — those
 * paths must ship or the reference is dead once installed. Reference-based
 * rule, no per-skill hardcoding: a top-level directory in the matching
 * vendored source root ships iff the skill's own compiled composable
 * content (INDEX.md/BUNDLE.md/mini/*.md/presets/*.md) references it by
 * relative path (see referencesDir above) — NOT merely "every dir exists",
 * which would also sweep in a source's already-converted knowledge dirs
 * (e.g. claude-api's per-language `.md` folders, whose content is already
 * losslessly carried by this skill's own minis) that happen to sit next to
 * genuine non-knowledge assets. Shipped dirs land under
 * assets/skills/<category>/<name>/assets-src/<dirName>/, name recorded on
 * the skill's manifest entry so the installer knows what to materialize.
 */
async function copyAssetDirs(copiedSkills) {
  const sourcesDir = path.join(repoRoot, 'skills', 'sources');
  const assetDirsBySkill = new Map();

  for (const { category, name, destSkillDir, composableDir } of copiedSkills) {
    const sourceRoot = await findVendoredSourceRoot(sourcesDir, name);
    if (!sourceRoot) continue;

    const dirNames = await listDirs(sourceRoot);
    if (dirNames.length === 0) continue;

    const composableContent = await readComposableContent(composableDir);
    const referenced = dirNames.filter((dirName) => referencesDir(composableContent, dirName));
    if (referenced.length === 0) continue;

    for (const dirName of referenced) {
      const src = path.join(sourceRoot, dirName);
      const dest = path.join(destSkillDir, 'assets-src', dirName);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.cp(src, dest, { recursive: true });
    }
    assetDirsBySkill.set(`${category}/${name}`, referenced);
  }
  return assetDirsBySkill;
}

/** tools/hive.py + top-level license/provenance files (spec §3). */
async function copyToolingAndLicenses() {
  await copyFile(path.join(repoRoot, 'tools', 'hive.py'), path.join(assetsDir, 'tools', 'hive.py'));
  await copyFile(path.join(repoRoot, 'LICENSE'), path.join(assetsDir, 'LICENSE'));
  await copyFile(
    path.join(repoRoot, 'THIRD_PARTY_NOTICES.md'),
    path.join(assetsDir, 'THIRD_PARTY_NOTICES.md'),
  );
}

/**
 * Every skills/sources/**\/PROVENANCE.md and vendored LICENSE* file:
 * licenses travel with what they license (spec §3), preserving the
 * relative path so they land alongside the vendored material they cover.
 */
async function copyVendoredSourceLicenses() {
  const sourcesDir = path.join(repoRoot, 'skills', 'sources');
  const allFiles = [];
  await walkFiles(sourcesDir, allFiles);
  const matches = allFiles.filter((abs) => {
    const base = path.basename(abs);
    return base === 'PROVENANCE.md' || /^LICENSE/i.test(base);
  });
  for (const src of matches) {
    const rel = path.relative(repoRoot, src);
    await copyFile(src, path.join(assetsDir, rel));
  }
}

async function buildSkillMetadata(copiedSkills, assetDirsBySkill) {
  const out = [];
  for (const { category, name, composableDir } of copiedSkills) {
    const [description, bundleRaw, versionRaw, miniEntries] = await Promise.all([
      extractDescription(path.join(composableDir, 'INDEX.md')),
      fs.readFile(path.join(composableDir, 'BUNDLE.md'), 'utf8').catch(() => ''),
      fs.readFile(path.join(composableDir, 'VERSION'), 'utf8').catch(() => ''),
      fs.readdir(path.join(composableDir, 'mini')).catch(() => []),
    ]);

    const assetDirs = assetDirsBySkill.get(`${category}/${name}`);

    out.push({
      name,
      category,
      version: versionRaw.trim(),
      minis: miniEntries.filter((f) => f.endsWith('.md')).length,
      bundleTokens: Math.round(bundleRaw.length / 4),
      description,
      path: `skills/${category}/${name}`,
      ...(assetDirs ? { assetDirs } : {}),
    });
  }
  out.sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)));
  return out;
}

async function computeFilesManifest() {
  const all = [];
  await walkFiles(assetsDir, all);
  const out = [];
  for (const abs of all) {
    const rel = path.relative(assetsDir, abs).split(path.sep).join('/');
    const buf = await fs.readFile(abs);
    out.push({ relPath: rel, sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length });
  }
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

async function getHiveCommit() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    return stdout.trim();
  } catch (err) {
    console.warn('[bundle-assets] warning: could not determine git commit:', err.message);
    return 'unknown';
  }
}

async function main() {
  await fs.rm(assetsDir, { recursive: true, force: true });
  await fs.mkdir(assetsDir, { recursive: true });

  const copiedSkills = await copySkillTrees();
  const assetDirsBySkill = await copyAssetDirs(copiedSkills);
  await copyToolingAndLicenses();
  await copyVendoredSourceLicenses();

  const [skills, hiveCommit] = await Promise.all([
    buildSkillMetadata(copiedSkills, assetDirsBySkill),
    getHiveCommit(),
  ]);
  const files = await computeFilesManifest();

  const manifest = {
    generatedAt: new Date().toISOString(),
    hiveCommit,
    skills,
    files,
  };

  await fs.writeFile(
    path.join(assetsDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  console.log(
    `[bundle-assets] wrote assets/manifest.json: ${skills.length} skills, ${files.length} files`,
  );
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error('[bundle-assets] failed:', err);
    process.exitCode = 1;
  });
}

export { main, packageRoot, repoRoot, assetsDir };
