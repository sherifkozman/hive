import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHomeContext } from '../src/core/paths.js';
import { PathGuard } from '../src/core/guard.js';
import { restore, snapshot } from '../src/core/backup.js';

/**
 * Explicit invariant check (spec §9.1 / plan-review item 6): every
 * path derived "from home" — including ~/.hive-skills/backups — must
 * flow through HomeContext, so a fixture --home redirects ALL of it.
 * If any code path fell back to the real os.homedir() or a hardcoded
 * absolute path, these assertions (which only check string containment
 * under the fixture tmp dir) would fail for that path.
 */
describe('backup home containment', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-home-containment-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('snapshot() never writes the backup dir or any payload/manifest path outside the fixture home', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(path.join(skillDir, 'nested'), { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'body');
    await writeFile(path.join(skillDir, 'nested', 'deep.md'), 'deep body');

    const result = await snapshot(ctx, 'preinstall', [skillDir]);

    expect(isUnder(result.dir, tmp)).toBe(true);
    for (const entry of result.manifest.entries) {
      expect(isUnder(entry.absPath, tmp)).toBe(true);
    }
    for (const absentPath of result.manifest.absent) {
      expect(isUnder(absentPath, tmp)).toBe(true);
    }
  });

  it('restore() never touches any path outside the fixture home', async () => {
    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'body');

    const backup = await snapshot(ctx, 'preinstall', [skillDir]);
    const plan = await restore(ctx, backup.id, { dryRun: true });

    for (const write of plan.writes) {
      expect(isUnder(write.absPath, tmp)).toBe(true);
    }
    for (const del of plan.deletes) {
      expect(isUnder(del, tmp)).toBe(true);
    }
  });

  it('the backups root itself resolves under the fixture home, not the real HIVE_SKILLS_HOME/os.homedir()', async () => {
    const ctx = resolveHomeContext({
      homeFlag: tmp,
      env: { HIVE_SKILLS_HOME: '/should-be-ignored' },
      platform: 'linux',
    });
    const result = await snapshot(ctx, 'preinstall', [path.join(tmp, 'does-not-exist')]);
    expect(result.dir.startsWith(tmp)).toBe(true);
    expect(result.dir).not.toContain('should-be-ignored');
  });

  /**
   * The isolation proof itself (spec §9 safety invariant #1, task item
   * E): a full snapshot -> mutate -> restore cycle, run for real (not a
   * dry-run) against a fixture home, guarded by a PathGuard allowlisted
   * to ONLY that fixture home. Afterward, assert the REAL os.homedir()
   * is exactly as it was before — this run must not have created (or
   * altered) a ~/.hive-skills anywhere near the actual machine running
   * the test, regardless of whether the developer's real home happens
   * to already have one from separate, real usage.
   */
  it('a full snapshot->mutate->restore cycle never creates/alters .hive-skills under the REAL os.homedir()', async () => {
    const realHiveDir = path.join(os.homedir(), '.hive-skills');
    const existedBefore = await pathExists(realHiveDir);
    const listingBefore = existedBefore ? (await readdir(realHiveDir)).sort() : null;

    const ctx = resolveHomeContext({ homeFlag: tmp, platform: 'linux' });
    const guard = new PathGuard([tmp]); // allowlist = fixture home only
    const skillDir = path.join(tmp, '.claude', 'skills', 'hive-foo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'original');

    const backup = await snapshot(ctx, 'preinstall', [skillDir], { guard });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'mutated');
    await restore(ctx, backup.id, { guard });

    const existedAfter = await pathExists(realHiveDir);
    expect(existedAfter).toBe(existedBefore);
    if (existedBefore) {
      expect((await readdir(realHiveDir)).sort()).toEqual(listingBefore);
    }

    // And, as ever, the actual writes landed only under the fixture.
    expect(await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')).toBe('original');
  });
});

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function isUnder(target: string, root: string): boolean {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  return (
    resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + path.sep)
  );
}
