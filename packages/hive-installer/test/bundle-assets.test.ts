import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  main as bundleAssets,
  assetsDir,
  packageRoot,
  repoRoot,
  referencesDir,
  parseSkillMdDescription,
  stripGeneratedMarker,
} from '../scripts/bundle-assets.mjs';

const execFileAsync = promisify(execFile);

interface ManifestSkill {
  name: string;
  category: string;
  version: string;
  minis: number;
  bundleTokens: number;
  description: string;
  sourceDescription: string;
  descriptionSource: 'upstream' | 'index-fallback';
  path: string;
  assetDirs?: string[];
}

interface ManifestFile {
  relPath: string;
  sha256: string;
  size: number;
}

interface Manifest {
  generatedAt: string;
  hiveCommit: string;
  skills: ManifestSkill[];
  files: ManifestFile[];
}

async function sha256File(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash('sha256').update(buf).digest('hex');
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(abs)));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

let manifest: Manifest;

beforeAll(async () => {
  // Run the real bundling logic against the REAL repo (packageRoot/repoRoot
  // are fixed by the script's own file location, independent of vitest's
  // cwd). Writes only ever land under this package's assets/ dir.
  await bundleAssets();
  const raw = await fs.readFile(path.join(assetsDir, 'manifest.json'), 'utf8');
  manifest = JSON.parse(raw) as Manifest;
}, 30_000);

describe('bundle-assets: manifest', () => {
  it('lists all 13 bundled skills', () => {
    expect(manifest.skills.length).toBe(13);
  });

  it('records generatedAt and hiveCommit', () => {
    expect(typeof manifest.generatedAt).toBe('string');
    expect(new Date(manifest.generatedAt).toString()).not.toBe('Invalid Date');
    expect(typeof manifest.hiveCommit).toBe('string');
    expect(manifest.hiveCommit.length).toBeGreaterThan(0);
  });

  it('spot-checks claude-api has 56 minis', () => {
    const claudeApi = manifest.skills.find((s) => s.name === 'claude-api');
    expect(claudeApi).toBeDefined();
    expect(claudeApi?.category).toBe('converted');
    expect(claudeApi?.minis).toBe(56);
    expect(claudeApi?.bundleTokens).toBeGreaterThan(0);
    expect(claudeApi?.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(claudeApi?.path).toBe('skills/converted/claude-api');
  });

  it('every skill has a non-empty, markdown-stripped description', () => {
    for (const skill of manifest.skills) {
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.description).not.toMatch(/[`*]/);
    }
  });

  it('covers all three categories', () => {
    const categories = new Set(manifest.skills.map((s) => s.category));
    expect(categories).toEqual(new Set(['authored', 'converted', 'meta']));
  });

  it('includes vendored PROVENANCE.md and LICENSE files from skills/sources', () => {
    const relPaths = manifest.files.map((f) => f.relPath);
    expect(relPaths).toContain('skills/sources/anthropic/PROVENANCE.md');
    expect(relPaths).toContain('skills/sources/financial-analyst/PROVENANCE.md');
    expect(relPaths).toContain('skills/sources/anthropic/claude-api/LICENSE.txt');
  });

  it('includes tools/hive.py, LICENSE, THIRD_PARTY_NOTICES.md', () => {
    const relPaths = manifest.files.map((f) => f.relPath);
    expect(relPaths).toContain('tools/hive.py');
    expect(relPaths).toContain('LICENSE');
    expect(relPaths).toContain('THIRD_PARTY_NOTICES.md');
  });

  it('does not list manifest.json among its own files entries', () => {
    expect(manifest.files.map((f) => f.relPath)).not.toContain('manifest.json');
  });

  it('pdf skill entry records assetDirs: ["scripts"], mirroring its vendored source scripts/ dir', () => {
    const pdf = manifest.skills.find((s) => s.name === 'pdf');
    expect(pdf).toBeDefined();
    expect(pdf?.assetDirs).toEqual(['scripts']);
  });

  it('bundles pdf scripts/ as assets-src, one file per vendored script (8 files), byte-identical to the source', async () => {
    const relPaths = manifest.files.map((f) => f.relPath).filter((p) => p.startsWith('skills/converted/pdf/assets-src/scripts/'));
    expect(relPaths.length).toBe(8);
    expect(relPaths).toContain('skills/converted/pdf/assets-src/scripts/check_fillable_fields.py');

    const bundled = await fs.readFile(
      path.join(assetsDir, 'skills/converted/pdf/assets-src/scripts/check_fillable_fields.py'),
      'utf8',
    );
    const source = await fs.readFile(
      path.join(repoRoot, 'skills/sources/anthropic/pdf/scripts/check_fillable_fields.py'),
      'utf8',
    );
    expect(bundled).toBe(source);
  });

  it('a skill with no matching vendored source (financial-analysis) has no assetDirs', () => {
    const fa = manifest.skills.find((s) => s.name === 'financial-analysis');
    expect(fa).toBeDefined();
    expect(fa?.assetDirs ?? []).toEqual([]);
  });

  it('claude-api (converted; its composable minis no longer reference the vendored per-language dirs) has no assetDirs', () => {
    // Was: every one of claude-api's 9 vendored per-language dirs (csharp, curl,
    // go, java, php, python, ruby, shared, typescript) appeared as a stale
    // `<dir>/` path token in mini/*.md — leftovers from the pre-conversion flat
    // source layout (e.g. "read from `csharp/`", "see `shared/tool-use-concepts.md`")
    // even though that content was losslessly carried into sibling minis
    // (e.g. shared/tool-use-concepts.md -> mini/17-tool-use-concepts.md). The
    // reference-based rule correctly shipped all 9 dirs for that reason, but
    // the reason was a bug: an installed skill has no `shared/`/`csharp/`/etc.
    // directories, so every one of those paths was dead once installed.
    // Fixed in skills/converted/claude-api (bumped 1.0.0 -> 1.0.1): every
    // stale cross-reference now points at its sibling mini instead (verified
    // by content, not filename guessing); parity vs skills/sources/anthropic/claude-api
    // stayed at 100.4% (was 99.9%) and every source heading still fuzzy-matches.
    // With no more `<dir>/` tokens in its composable content, the
    // reference-based rule correctly ships none of the 9 dirs as assets.
    const claudeApi = manifest.skills.find((s) => s.name === 'claude-api');
    expect(claudeApi).toBeDefined();
    expect(claudeApi?.assetDirs ?? []).toEqual([]);
  });

  it('mcp-builder ships only scripts/ (referenced), NOT reference/ (present in the vendored source, but never mentioned by path in the composable content)', () => {
    const mcpBuilder = manifest.skills.find((s) => s.name === 'mcp-builder');
    expect(mcpBuilder).toBeDefined();
    expect(mcpBuilder?.assetDirs).toEqual(['scripts']);

    const relPaths = manifest.files.map((f) => f.relPath);
    expect(relPaths.some((p) => p.startsWith('skills/converted/mcp-builder/assets-src/scripts/'))).toBe(true);
    expect(relPaths.some((p) => p.startsWith('skills/converted/mcp-builder/assets-src/reference/'))).toBe(false);
  });

  it('internal-comms has a vendored examples/ dir that is never referenced by path, so it ships no assets', () => {
    const internalComms = manifest.skills.find((s) => s.name === 'internal-comms');
    expect(internalComms).toBeDefined();
    expect(internalComms?.assetDirs ?? []).toEqual([]);
  });

  it("skill-creator's all-markdown agents/ and references/ dirs still ship: they ARE referenced by path (skill-creator's own conversion documents them as intentionally-vendored subagent-spawn dependencies, not stale links) — proves the rule isn't a disguised file-extension filter", () => {
    const skillCreator = manifest.skills.find((s) => s.name === 'skill-creator');
    expect(skillCreator).toBeDefined();
    expect(skillCreator?.assetDirs?.sort()).toEqual(
      ['agents', 'assets', 'eval-viewer', 'references', 'scripts'].sort(),
    );
  });

  it('every manifest file entry exists on disk with a matching sha256 and size', async () => {
    expect(manifest.files.length).toBeGreaterThan(0);
    for (const entry of manifest.files) {
      const abs = path.join(assetsDir, ...entry.relPath.split('/'));
      const stat = await fs.stat(abs);
      expect(stat.size).toBe(entry.size);
      expect(await sha256File(abs)).toBe(entry.sha256);
    }
  });

  it('the files list matches every file actually on disk under assets/ (besides manifest.json itself)', async () => {
    const onDisk = (await listFilesRecursive(assetsDir))
      .map((abs) => path.relative(assetsDir, abs).split(path.sep).join('/'))
      .filter((rel) => rel !== 'manifest.json')
      .sort();
    const listed = manifest.files.map((f) => f.relPath).sort();
    expect(onDisk).toEqual(listed);
  });
});

describe('bundle-assets: sourceDescription / descriptionSource (packing-modes.md v2 item 2)', () => {
  it('pdf (has a vendored SKILL.md with a plain-scalar description) gets the upstream description verbatim', () => {
    const pdf = manifest.skills.find((s) => s.name === 'pdf');
    expect(pdf).toBeDefined();
    expect(pdf?.descriptionSource).toBe('upstream');
    expect(pdf?.sourceDescription).toMatch(/^Use this skill whenever the user wants to do anything with PDF files\./);
    // Verbatim means NOT markdown-stripped/summarized like `description` is.
    expect(pdf?.sourceDescription).not.toBe(pdf?.description);
  });

  it('financial-analysis (no matching vendored source — name differs from financial-analyst) falls back to the INDEX description', () => {
    const fa = manifest.skills.find((s) => s.name === 'financial-analysis');
    expect(fa).toBeDefined();
    expect(fa?.descriptionSource).toBe('index-fallback');
    expect(fa?.sourceDescription).toBe(fa?.description);
  });

  it('claude-api (vendored SKILL.md uses a YAML block-literal `|-` description) gets the full multi-line upstream text verbatim', () => {
    const claudeApi = manifest.skills.find((s) => s.name === 'claude-api');
    expect(claudeApi).toBeDefined();
    expect(claudeApi?.descriptionSource).toBe('upstream');
    expect(claudeApi?.sourceDescription).toContain('Reference for the Claude API / Anthropic SDK');
    expect(claudeApi?.sourceDescription).toContain('TRIGGER — read BEFORE opening the target file');
    expect(claudeApi?.sourceDescription?.includes('\n')).toBe(true); // block literal spans multiple lines
  });

  it('pptx (vendored SKILL.md uses a double-quoted description with escaped inner quotes) gets it unescaped verbatim', () => {
    const pptx = manifest.skills.find((s) => s.name === 'pptx');
    expect(pptx).toBeDefined();
    expect(pptx?.descriptionSource).toBe('upstream');
    expect(pptx?.sourceDescription).toContain('mentions "deck," "slides," "presentation,"'); // unescaped from \"deck,\" etc. in the source
    expect(pptx?.sourceDescription).not.toMatch(/\\"/); // no leftover escape sequences
  });

  it('every skill has a non-empty sourceDescription and a valid descriptionSource', () => {
    for (const skill of manifest.skills) {
      expect(skill.sourceDescription.length).toBeGreaterThan(0);
      expect(['upstream', 'index-fallback']).toContain(skill.descriptionSource);
    }
  });
});

describe('bundle-assets: bundleTokens accounting excludes the generated marker (packing-modes.md v2 item 6)', () => {
  it('stripGeneratedMarker removes the marker line and leaves the rest untouched', () => {
    const raw = '<!-- GENERATED by tools/hive.py compile. Do not hand-edit. -->\nreal content\nmore content\n';
    expect(stripGeneratedMarker(raw)).toBe('real content\nmore content\n');
  });

  it('stripGeneratedMarker is a no-op on content with no marker', () => {
    expect(stripGeneratedMarker('just content\n')).toBe('just content\n');
  });

  it("pdf's bundleTokens is computed on the marker-stripped BUNDLE.md content, not the raw file", async () => {
    const pdf = manifest.skills.find((s) => s.name === 'pdf');
    expect(pdf).toBeDefined();
    const bundleRaw = await fs.readFile(
      path.join(assetsDir, 'skills/converted/pdf/composable/BUNDLE.md'),
      'utf8',
    );
    expect(pdf?.bundleTokens).toBe(Math.round(stripGeneratedMarker(bundleRaw).length / 4));
    // Sanity: the naive (marker-included) count would be a different, larger number.
    expect(pdf?.bundleTokens).not.toBe(Math.round(bundleRaw.length / 4));
  });
});

describe('bundle-assets: parseSkillMdDescription (synthetic, repo-independent)', () => {
  it('parses a plain unquoted scalar', () => {
    const raw = '---\nname: foo\ndescription: A plain description.\n---\n\n# Foo\n';
    expect(parseSkillMdDescription(raw)).toBe('A plain description.');
  });

  it('parses a double-quoted scalar, unescaping \\" and \\\\', () => {
    const raw = '---\nname: foo\ndescription: "Say \\"hi\\" then use a \\\\backslash."\n---\n';
    expect(parseSkillMdDescription(raw)).toBe('Say "hi" then use a \\backslash.');
  });

  it('parses a single-quoted scalar, unescaping doubled quotes', () => {
    const raw = "---\nname: foo\ndescription: 'It''s fine.'\n---\n";
    expect(parseSkillMdDescription(raw)).toBe("It's fine.");
  });

  it('parses a `|-` block literal spanning multiple indented lines, chomping trailing blank lines', () => {
    const raw = '---\nname: foo\ndescription: |-\n  Line one.\n  Line two.\n\nlicense: MIT\n---\n';
    expect(parseSkillMdDescription(raw)).toBe('Line one.\nLine two.');
  });

  it('returns undefined when there is no frontmatter at all', () => {
    expect(parseSkillMdDescription('# Just a heading\n\nbody text\n')).toBeUndefined();
  });

  it('returns undefined when frontmatter exists but has no description key', () => {
    expect(parseSkillMdDescription('---\nname: foo\n---\n')).toBeUndefined();
  });
});

describe('bundle-assets: package.json wiring', () => {
  it('build and prepack scripts invoke bundle-assets.mjs', async () => {
    const pkgRaw = await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    expect(pkg.scripts.build).toContain('scripts/bundle-assets.mjs');
    expect(pkg.scripts.prepack).toContain('build');
  });
});

describe('bundle-assets: npm pack file list (golden)', () => {
  const distDir = path.join(packageRoot, 'dist');

  beforeAll(async () => {
    // Rebuild dist/ deterministically via the project's own tsup binary
    // (not `pnpm run build`, which would recurse through prepack/lifecycle
    // noise that pollutes `npm pack --dry-run --json`'s stdout).
    const tsupBin = path.join(packageRoot, 'node_modules', '.bin', 'tsup');
    await execFileAsync(tsupBin, [], { cwd: packageRoot });
    await bundleAssets();
  }, 60_000);

  it('shebang: dist/cli.js first line is the node shebang', async () => {
    const raw = await fs.readFile(path.join(distDir, 'cli.js'), 'utf8');
    expect(raw.split('\n')[0]).toBe('#!/usr/bin/env node');
  });

  it('matches exactly: dist/** + assets/** (per manifest) + README/package.json/LICENSE, no extras, no missing', async () => {
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      { cwd: packageRoot },
    );
    const packResult = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const packedFiles = packResult[0]?.files;
    expect(packedFiles).toBeDefined();
    const actual = new Set((packedFiles ?? []).map((f) => f.path));

    const distFiles = (await listFilesRecursive(distDir)).map(
      (abs) => `dist/${path.relative(distDir, abs).split(path.sep).join('/')}`,
    );
    const expected = new Set<string>([
      'package.json',
      'README.md',
      'LICENSE',
      'assets/manifest.json',
      ...manifest.files.map((f) => `assets/${f.relPath}`),
      ...distFiles,
    ]);

    const extras = [...actual].filter((p) => !expected.has(p));
    const missing = [...expected].filter((p) => !actual.has(p));
    expect(extras).toEqual([]);
    expect(missing).toEqual([]);
    expect(actual).toEqual(expected);
  }, 60_000);
});


describe('bundle-assets: referencesDir (synthetic, repo-independent)', () => {
  // Isolates the discriminator from real repo content. Semantics match the
  // implementation comment: word-boundary before the name, literal slash
  // after; a bare `name/` token (e.g. "read from `go/`") IS a reference.
  it('excludes a dir name only mentioned in prose without a slash', () => {
    expect(referencesDir('mentions the widgets directory in prose', 'widgets')).toBe(false);
  });

  it('includes a dir name referenced as a path token', () => {
    expect(referencesDir('Run `widgets/build.py` to regenerate.', 'widgets')).toBe(true);
  });

  it('includes a bare `name/` reference with nothing after the slash', () => {
    expect(referencesDir('read from `widgets/` at runtime', 'widgets')).toBe(true);
  });

  it('does not false-positive on hyphenated or dotted supersets (test-widgets/, foo.widgets/)', () => {
    expect(referencesDir('See the test-widgets/ directory.', 'widgets')).toBe(false);
    expect(referencesDir('See foo.widgets/ for fixtures.', 'widgets')).toBe(false);
  });
});

describe('bundle-assets: referencesDir dotted-module signal', () => {
  it('includes a dir invoked only as a Python dotted module (python -m name.tool)', () => {
    expect(referencesDir('Run `python -m widgets.aggregate` after edits.', 'widgets')).toBe(true);
  });

  it('does not match a dotted word without the -m invocation context', () => {
    expect(referencesDir('The widgets.aggregate concept is described above.', 'widgets')).toBe(false);
  });
});
