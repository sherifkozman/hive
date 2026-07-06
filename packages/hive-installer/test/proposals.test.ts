import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import type { Catalog } from '../src/core/catalog.js';
import { INSTALL_MANIFEST_FILENAME } from '../src/core/installManifest.js';
import {
  BORDERLINE_TOKEN_THRESHOLD,
  classifyCandidate,
  renderProposalDoc,
  scanForCandidates,
  STRONG_TOKEN_THRESHOLD,
  type ProposalCandidate,
} from '../src/core/proposals.js';

let tmp: string;
let homeDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-proposals-'));
  homeDir = path.join(tmp, 'home');
  await mkdir(homeDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function ctx() {
  return resolveHomeContext({ homeFlag: homeDir, platform: 'linux' });
}

const FAKE_CATALOG: Catalog = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  hiveCommit: 'deadbeef',
  skills: [],
  files: [],
  assetsRoot: '/fake/assets',
};

describe('classifyCandidate: boundary thresholds', () => {
  it('1999 tokens -> keep-as-is (just under borderline)', () => {
    expect(classifyCandidate(1999).classification).toBe('keep-as-is');
  });

  it('2000 tokens -> borderline (exactly at the boundary)', () => {
    expect(classifyCandidate(BORDERLINE_TOKEN_THRESHOLD).classification).toBe('borderline');
    expect(classifyCandidate(2000).classification).toBe('borderline');
  });

  it('4999 tokens -> borderline (just under strong)', () => {
    expect(classifyCandidate(4999).classification).toBe('borderline');
  });

  it('5000 tokens -> strong (exactly at the boundary)', () => {
    expect(classifyCandidate(STRONG_TOKEN_THRESHOLD).classification).toBe('strong');
    expect(classifyCandidate(5000).classification).toBe('strong');
  });

  it('0 tokens -> keep-as-is', () => {
    expect(classifyCandidate(0).classification).toBe('keep-as-is');
  });
});

describe('scanForCandidates', () => {
  it('classifies an existing client skill by its token size', async () => {
    const skillDir = path.join(homeDir, '.claude', 'skills', 'my-big-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'x'.repeat(STRONG_TOKEN_THRESHOLD * 4));

    const candidates = await scanForCandidates(ctx(), ['claude-code']);
    expect(candidates.length).toBe(1);
    expect(candidates[0]?.classification).toBe('strong');
    expect(candidates[0]?.sourcePath).toBe(skillDir);
    expect(candidates[0]?.clientId).toBe('claude-code');
  });

  it('skips a skill whose name starts with hive-', async () => {
    const skillDir = path.join(homeDir, '.claude', 'skills', 'hive-code-review');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'x'.repeat(10000));

    const candidates = await scanForCandidates(ctx(), ['claude-code']);
    expect(candidates).toEqual([]);
  });

  it('skips a skill-dir that already has a .hive-install.json, even without the hive- name prefix', async () => {
    const skillDir = path.join(homeDir, '.claude', 'skills', 'renamed-but-managed');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'x'.repeat(10000));
    await writeFile(path.join(skillDir, INSTALL_MANIFEST_FILENAME), '{}');

    const candidates = await scanForCandidates(ctx(), ['claude-code']);
    expect(candidates).toEqual([]);
  });

  it('silently skips an unknown client id', async () => {
    const candidates = await scanForCandidates(ctx(), ['not-a-real-client']);
    expect(candidates).toEqual([]);
  });

  it('returns [] for a client with no existing skills', async () => {
    await mkdir(path.join(homeDir, '.claude'), { recursive: true });
    const candidates = await scanForCandidates(ctx(), ['claude-code']);
    expect(candidates).toEqual([]);
  });

  it('scans across multiple clients in one call', async () => {
    await mkdir(path.join(homeDir, '.claude', 'skills', 'a'), { recursive: true });
    await writeFile(path.join(homeDir, '.claude', 'skills', 'a', 'SKILL.md'), 'x'.repeat(10000));
    await mkdir(path.join(homeDir, '.continue', 'rules'), { recursive: true });
    await writeFile(path.join(homeDir, '.continue', 'rules', 'style.md'), 'y'.repeat(10000));

    const candidates = await scanForCandidates(ctx(), ['claude-code', 'continue']);
    expect(candidates.length).toBe(2);
    expect(candidates.map((c) => c.clientId).sort()).toEqual(['claude-code', 'continue']);
  });
});

describe('renderProposalDoc', () => {
  it('renders "No candidates found." for an empty list', () => {
    const doc = renderProposalDoc([], { generatedAt: '2026-01-01T00:00:00.000Z', catalog: FAKE_CATALOG });
    expect(doc).toContain('No candidates found.');
  });

  it('gives keep-as-is candidates no conversion recipe', () => {
    const candidate: ProposalCandidate = {
      clientId: 'claude-code',
      clientName: 'Claude Code',
      sourcePath: '/home/user/.claude/skills/small-thing',
      tokensEst: 500,
      ...classifyCandidate(500),
    };
    const doc = renderProposalDoc([candidate], { generatedAt: '2026-01-01T00:00:00.000Z', catalog: FAKE_CATALOG });
    expect(doc).toContain('No conversion recipe');
    expect(doc).not.toContain('Conversion recipe');
    expect(doc).not.toContain('parity');
  });

  it('gives strong/borderline candidates the full recipe: deps, agent prompt, gates, lossless-conversion quote', () => {
    const candidate: ProposalCandidate = {
      clientId: 'claude-code',
      clientName: 'Claude Code',
      sourcePath: '/home/user/.claude/skills/big-thing',
      tokensEst: 8000,
      ...classifyCandidate(8000),
    };
    const doc = renderProposalDoc([candidate], { generatedAt: '2026-01-01T00:00:00.000Z', catalog: FAKE_CATALOG });

    expect(doc).toContain('python3` >= 3.11');
    expect(doc).toContain(path.join(FAKE_CATALOG.assetsRoot, 'tools', 'hive.py'));
    expect(doc).toContain(
      path.join(FAKE_CATALOG.assetsRoot, 'skills', 'meta', 'ccs-skill-creator', 'composable', 'INDEX.md'),
    );
    expect(doc).toContain('parity >= 85%');
    expect(doc).toContain('lint clean');
    expect(doc).toContain('parity <converted-dir> /home/user/.claude/skills/big-thing` >= 85%');
    expect(doc).toContain('repackaging, never summarization');
    expect(doc).toContain('docs/BENCHMARKS.md` Experiment 3');
    expect(doc).toContain('Task-variance caveat');
  });

  it('golden file: 3 candidates spanning strong/borderline/keep-as-is', async () => {
    const candidates: ProposalCandidate[] = [
      {
        clientId: 'claude-code',
        clientName: 'Claude Code',
        sourcePath: '/home/user/.claude/skills/large-legacy-skill',
        tokensEst: 12000,
        ...classifyCandidate(12000),
      },
      {
        clientId: 'codex',
        clientName: 'Codex',
        sourcePath: '/home/user/.codex/skills/medium-skill',
        tokensEst: 3200,
        ...classifyCandidate(3200),
      },
      {
        clientId: 'continue',
        clientName: 'Continue',
        sourcePath: '/home/user/.continue/rules/tiny-style-note.md',
        tokensEst: 400,
        ...classifyCandidate(400),
      },
    ];

    const doc = renderProposalDoc(candidates, { generatedAt: '2026-01-01T00:00:00.000Z', catalog: FAKE_CATALOG });
    await expect(doc).toMatchFileSnapshot('./fixtures/proposals-golden.md');
  });
});
