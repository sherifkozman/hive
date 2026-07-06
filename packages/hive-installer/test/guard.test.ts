import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { GuardViolation, PathGuard } from '../src/core/guard.js';

describe('PathGuard', () => {
  it('allows a path exactly equal to an allowed root', () => {
    const guard = new PathGuard(['/fixture/home']);
    expect(() => guard.assertWritable('/fixture/home')).not.toThrow();
  });

  it('allows a path nested under an allowed root', () => {
    const guard = new PathGuard(['/fixture/home']);
    expect(() =>
      guard.assertWritable('/fixture/home/.claude/skills/foo/SKILL.md'),
    ).not.toThrow();
  });

  it('throws GuardViolation for a path outside every allowed root', () => {
    const guard = new PathGuard(['/fixture/home']);
    expect(() => guard.assertWritable('/etc/passwd')).toThrow(GuardViolation);
  });

  it('rejects a sibling directory that merely shares a prefix (no separator boundary)', () => {
    const guard = new PathGuard(['/fixture/home']);
    // '/fixture/home-evil' starts with the string '/fixture/home' but is
    // NOT inside it — must not be treated as allowed.
    expect(() => guard.assertWritable('/fixture/home-evil/file')).toThrow(
      GuardViolation,
    );
  });

  it('normalizes ../ traversal before checking containment', () => {
    const guard = new PathGuard(['/fixture/home/.claude']);
    expect(() =>
      guard.assertWritable('/fixture/home/.claude/../../../etc/passwd'),
    ).toThrow(GuardViolation);
  });

  it('resolves relative allowed roots and target paths against cwd', () => {
    const guard = new PathGuard(['relative-root']);
    expect(() =>
      guard.assertWritable(path.join('relative-root', 'file.txt')),
    ).not.toThrow();
    expect(() => guard.assertWritable('other-root/file.txt')).toThrow(
      GuardViolation,
    );
  });

  it('isAllowed returns a boolean without throwing', () => {
    const guard = new PathGuard(['/fixture/home']);
    expect(guard.isAllowed('/fixture/home/x')).toBe(true);
    expect(guard.isAllowed('/etc/passwd')).toBe(false);
  });

  it('supports multiple allowed roots', () => {
    const guard = new PathGuard(['/fixture/home', '/fixture/backups']);
    expect(guard.isAllowed('/fixture/backups/2026-01-01/manifest.json')).toBe(
      true,
    );
    expect(guard.isAllowed('/fixture/other')).toBe(false);
  });

  it('GuardViolation carries the offending path and allowed roots', () => {
    const guard = new PathGuard(['/fixture/home']);
    try {
      guard.assertWritable('/etc/passwd');
      throw new Error('expected assertWritable to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GuardViolation);
      const violation = err as GuardViolation;
      expect(violation.path).toBe(path.resolve('/etc/passwd'));
      expect(violation.allowedRoots).toEqual([path.resolve('/fixture/home')]);
    }
  });
});
