import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { expandPath, joinHome, resolveHomeContext } from '../src/core/paths.js';

describe('resolveHomeContext', () => {
  it('prefers the --home flag over env and os.homedir()', () => {
    const ctx = resolveHomeContext({
      homeFlag: '/fixture/flag-home',
      env: { HIVE_SKILLS_HOME: '/fixture/env-home' },
      platform: 'darwin',
    });
    expect(ctx.home).toBe(path.resolve('/fixture/flag-home'));
    expect(ctx.platform).toBe('darwin');
  });

  it('falls back to HIVE_SKILLS_HOME env var when no flag is given', () => {
    const ctx = resolveHomeContext({
      env: { HIVE_SKILLS_HOME: '/fixture/env-home' },
      platform: 'linux',
    });
    expect(ctx.home).toBe(path.resolve('/fixture/env-home'));
  });

  it('falls back to os.homedir() when neither flag nor env are set', () => {
    const ctx = resolveHomeContext({ env: {}, platform: 'linux' });
    expect(ctx.home.length).toBeGreaterThan(0);
    expect(path.isAbsolute(ctx.home)).toBe(true);
  });

  it('defaults platform to process.platform when not given', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/flag-home' });
    expect(ctx.platform).toBe(process.platform);
  });

  it('ignores an empty-string HIVE_SKILLS_HOME env value', () => {
    const ctx = resolveHomeContext({ env: { HIVE_SKILLS_HOME: '' }, platform: 'linux' });
    // Falls through to os.homedir(), not an empty/relative path.
    expect(ctx.home.length).toBeGreaterThan(0);
    expect(path.isAbsolute(ctx.home)).toBe(true);
  });

  it('resolves a relative --home flag to an absolute path', () => {
    const ctx = resolveHomeContext({ homeFlag: 'relative/dir', platform: 'linux' });
    expect(path.isAbsolute(ctx.home)).toBe(true);
  });
});

describe('joinHome', () => {
  it('joins segments onto ctx.home', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    expect(joinHome(ctx, '.claude', 'skills')).toBe(
      path.join('/fixture/home', '.claude', 'skills'),
    );
  });
});

describe('expandPath', () => {
  it('expands a leading ~ to ctx.home', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    expect(expandPath(ctx, '~/.claude/skills')).toBe(
      path.join('/fixture/home', '.claude/skills'),
    );
  });

  it('leaves an already-absolute path untouched (resolved)', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    expect(expandPath(ctx, '/already/absolute')).toBe(path.resolve('/already/absolute'));
  });

  it('resolves a bare relative path against cwd, not home', () => {
    const ctx = resolveHomeContext({ homeFlag: '/fixture/home', platform: 'linux' });
    expect(expandPath(ctx, 'relative/path')).toBe(path.resolve('relative/path'));
  });
});
