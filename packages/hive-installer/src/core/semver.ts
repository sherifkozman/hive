/**
 * Minimal semver (X.Y.Z, no pre-release/build metadata — matches this
 * repo's `tools/hive.py is_semver()` convention for skill VERSION files)
 * parsing/comparison. Used by doctor.ts to validate installed skills'
 * VERSION files and to detect a stale install vs. the bundled catalog.
 */

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

export function isValidSemver(value: string): boolean {
  return SEMVER_RE.test(value.trim());
}

export function parseSemver(value: string): Semver | undefined {
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** -1 if a<b, 0 if a===b, 1 if a>b. Throws if either string isn't valid semver. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa) throw new Error(`compareSemver: "${a}" is not a valid X.Y.Z semver`);
  if (!pb) throw new Error(`compareSemver: "${b}" is not a valid X.Y.Z semver`);

  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

/** True if `installed` is an older version than `bundled`. False (never throws) if either is invalid. */
export function isOlderVersion(installed: string, bundled: string): boolean {
  if (!isValidSemver(installed) || !isValidSemver(bundled)) return false;
  return compareSemver(installed, bundled) < 0;
}
