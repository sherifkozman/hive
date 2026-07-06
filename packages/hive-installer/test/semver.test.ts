import { describe, expect, it } from 'vitest';
import { compareSemver, isOlderVersion, isValidSemver, parseSemver } from '../src/core/semver.js';

describe('isValidSemver', () => {
  it.each(['1.0.0', '0.1.0', '10.20.30', '1.0.0'.trim()])('accepts %s', (v) => {
    expect(isValidSemver(v)).toBe(true);
  });

  it.each(['1.0', '1', 'v1.0.0', '1.0.0-beta', '1.0.0+build', 'x.y.z', '', '1.0.0 '.repeat(2)])(
    'rejects %s',
    (v) => {
      expect(isValidSemver(v)).toBe(false);
    },
  );

  it('tolerates surrounding whitespace (e.g. a VERSION file with a trailing newline)', () => {
    expect(isValidSemver('1.2.3\n')).toBe(true);
  });
});

describe('parseSemver', () => {
  it('parses major/minor/patch', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('returns undefined for invalid input', () => {
    expect(parseSemver('nope')).toBeUndefined();
  });
});

describe('compareSemver', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
    expect(compareSemver('1.2.1', '1.2.0')).toBe(1);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('throws for invalid input on either side', () => {
    expect(() => compareSemver('nope', '1.0.0')).toThrow();
    expect(() => compareSemver('1.0.0', 'nope')).toThrow();
  });
});

describe('isOlderVersion', () => {
  it('true when installed < bundled', () => {
    expect(isOlderVersion('1.0.0', '1.1.0')).toBe(true);
  });

  it('false when installed >= bundled', () => {
    expect(isOlderVersion('1.1.0', '1.1.0')).toBe(false);
    expect(isOlderVersion('1.2.0', '1.1.0')).toBe(false);
  });

  it('false (never throws) for invalid input', () => {
    expect(isOlderVersion('nope', '1.0.0')).toBe(false);
    expect(isOlderVersion('1.0.0', 'nope')).toBe(false);
  });
});
