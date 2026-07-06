import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { CLIENT_REGISTRY, getClientById } from '../src/core/registry.js';
import { detectClients, scanSkills } from '../src/core/scanner.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-scanner-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('detectClients', () => {
  it('reports claude-code as detected when .claude exists, and codex as not detected', async () => {
    await mkdir(path.join(tmp, '.claude'), { recursive: true });
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });

    const detected = await detectClients(ctx);
    const claudeCode = detected.find((d) => d.id === 'claude-code');
    const codex = detected.find((d) => d.id === 'codex');

    expect(claudeCode?.detected).toBe(true);
    expect(claudeCode?.matchedPaths.length).toBeGreaterThan(0);
    expect(codex?.detected).toBe(false);
    expect(codex?.matchedPaths).toEqual([]);
  });

  it('returns one DetectedClient per registry entry (detection matrix, all absent)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const detected = await detectClients(ctx);
    expect(detected.length).toBe(CLIENT_REGISTRY.length);
    expect(detected.every((d) => d.detected === false)).toBe(true);
  });

  it('detects a glob-based client (vscode-copilot) via extension dir prefix match', async () => {
    await mkdir(
      path.join(tmp, '.vscode', 'extensions', 'github.copilot-1.2.3'),
      { recursive: true },
    );
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const detected = await detectClients(ctx);
    const copilot = detected.find((d) => d.id === 'vscode-copilot');
    expect(copilot?.detected).toBe(true);
  });

  it('excludes claude-desktop on a non-darwin platform even if the dir exists', async () => {
    await mkdir(path.join(tmp, 'Library', 'Application Support', 'Claude'), {
      recursive: true,
    });
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const detected = await detectClients(ctx);
    const desktop = detected.find((d) => d.id === 'claude-desktop');
    expect(desktop?.detected).toBe(false);
  });

  it('detects claude-desktop on darwin when the dir exists', async () => {
    await mkdir(path.join(tmp, 'Library', 'Application Support', 'Claude'), {
      recursive: true,
    });
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'darwin' });
    const detected = await detectClients(ctx);
    const desktop = detected.find((d) => d.id === 'claude-desktop');
    expect(desktop?.detected).toBe(true);
  });
});

describe('scanSkills', () => {
  it('scans skill-dirs for a native-skills client (claude-code)', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(path.join(skillDir, 'composable', 'mini'), { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'a'.repeat(40));
    await writeFile(
      path.join(skillDir, 'composable', 'mini', '00-core.md'),
      'b'.repeat(80),
    );

    const client = getClientById('claude-code')!;
    const skills = await scanSkills(ctx, client);

    expect(skills.length).toBe(1);
    expect(skills[0]?.name).toBe('hive-foo');
    expect(skills[0]?.kind).toBe('skill-dir');
    expect(skills[0]?.path).toBe(skillDir);
    expect(skills[0]?.files).toBe(2);
    expect(skills[0]?.bytes).toBe(120);
    expect(skills[0]?.tokensEst).toBe(30); // 120 chars / 4
  });

  it('returns [] when the client global location does not exist', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const client = getClientById('claude-code')!;
    expect(await scanSkills(ctx, client)).toEqual([]);
  });

  it('never lists OS junk files (.DS_Store) as skills or rules', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillsDir = path.join(tmp, '.claude', 'skills');
    await mkdir(path.join(skillsDir, 'hive-foo'), { recursive: true });
    await writeFile(path.join(skillsDir, '.DS_Store'), 'junk'.repeat(400));
    await writeFile(path.join(skillsDir, 'hive-foo', 'SKILL.md'), 'a'.repeat(40));
    await writeFile(path.join(skillsDir, 'hive-foo', '.DS_Store'), 'junk'.repeat(400));

    const skills = await scanSkills(ctx, getClientById('claude-code')!);
    expect(skills.map((s) => s.name)).toEqual(['hive-foo']);
    // the nested .DS_Store contributes neither files, bytes, nor tokens
    expect(skills[0]?.files).toBe(1);
    expect(skills[0]?.bytes).toBe(40);
    expect(skills[0]?.tokensEst).toBe(10);
  });

  it('counts binary/media files in bytes but never in the token estimate', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'media-heavy');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'a'.repeat(400));
    await writeFile(path.join(skillDir, 'demo.mp4'), Buffer.alloc(1_000_000));
    await writeFile(path.join(skillDir, 'logo.png'), Buffer.alloc(50_000));

    const skills = await scanSkills(ctx, getClientById('claude-code')!);
    const skill = skills.find((s) => s.name === 'media-heavy')!;
    expect(skill.files).toBe(3);
    expect(skill.bytes).toBe(1_050_400);
    expect(skill.tokensEst).toBe(100); // only SKILL.md's 400 chars / 4
  });

  it('scans rule-files for a rule-files client (continue) — one InstalledSkill per file', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const rulesDir = path.join(tmp, '.continue', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(path.join(rulesDir, 'style.md'), 'x'.repeat(16));
    await writeFile(path.join(rulesDir, 'testing.md'), 'y'.repeat(8));

    const client = getClientById('continue')!;
    const skills = await scanSkills(ctx, client);

    expect(skills.length).toBe(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['style.md', 'testing.md']);
    expect(skills.every((s) => s.kind === 'rules-file')).toBe(true);
    const style = skills.find((s) => s.name === 'style.md')!;
    expect(style.files).toBe(1);
    expect(style.bytes).toBe(16);
    expect(style.tokensEst).toBe(4);
  });

  it('skips node_modules and .git when computing recursive size', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-bar');
    await mkdir(path.join(skillDir, 'node_modules', 'dep'), { recursive: true });
    await mkdir(path.join(skillDir, '.git'), { recursive: true });
    await writeFile(path.join(skillDir, 'node_modules', 'dep', 'index.js'), 'z'.repeat(1000));
    await writeFile(path.join(skillDir, '.git', 'HEAD'), 'ref: refs/heads/main');
    await writeFile(path.join(skillDir, 'SKILL.md'), 'a'.repeat(40));

    const client = getClientById('claude-code')!;
    const skills = await scanSkills(ctx, client);

    expect(skills[0]?.files).toBe(1);
    expect(skills[0]?.bytes).toBe(40);
  });

  it('never follows a symlink that points outside the scanned root', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-baz');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'a'.repeat(40));

    const outsideDir = await mkdtemp(path.join(os.tmpdir(), 'hive-scanner-outside-'));
    await writeFile(path.join(outsideDir, 'secret.txt'), 's'.repeat(999));
    await symlink(outsideDir, path.join(skillDir, 'escape-link'), 'dir');

    const client = getClientById('claude-code')!;
    const skills = await scanSkills(ctx, client);

    expect(skills[0]?.files).toBe(1);
    expect(skills[0]?.bytes).toBe(40);

    await rm(outsideDir, { recursive: true, force: true });
  });

  it('treats a monolith rules file (AGENTS.md) as a single agents-md InstalledSkill', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    // Simulate a client whose "global" resolves straight to a file rather
    // than a directory by pointing scanSkills at a fabricated entry via
    // the codex pointerFile convention: write the file at the pointer
    // location and scan the client's payload dir fallback path directly.
    const agentsPath = path.join(tmp, 'AGENTS.md');
    await writeFile(agentsPath, 'm'.repeat(24));

    const client = getClientById('codex')!;
    // codex's own skillLocations.global ('.codex/skills') doesn't exist;
    // exercise the monolith-file branch directly via scanPath.
    const { scanPath } = await import('../src/core/scanner.js');
    const result = await scanPath(ctx, agentsPath, 'rule-files');
    expect(result.length).toBe(1);
    expect(result[0]?.kind).toBe('agents-md');
    expect(result[0]?.name).toBe('AGENTS.md');
    expect(result[0]?.bytes).toBe(24);
    void client;
  });
});
