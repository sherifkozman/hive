import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Thrown by PathGuard#assertWritable when a target path falls outside
 * every allowed root. This is the safety-invariant #1 enforcement point
 * (spec §9): "Writes only ever land in: client skill/payload dirs, the
 * backups dir, or an explicitly confirmed pointer file."
 *
 * `.path` and `.allowedRoots` report the *requested* (path.resolve'd, not
 * realpath-canonicalized) values, so error messages stay readable — the
 * actual containment decision is made on canonicalized paths internally.
 */
export class GuardViolation extends Error {
  readonly path: string;
  readonly allowedRoots: string[];

  constructor(targetPath: string, allowedRoots: string[]) {
    super(
      `PathGuard: "${targetPath}" is outside all allowed roots: ${allowedRoots.join(', ') || '(none)'}`,
    );
    this.name = 'GuardViolation';
    this.path = targetPath;
    this.allowedRoots = allowedRoots;
  }
}

/**
 * Resolve a path to its canonical (symlink-free) form, even when the
 * path itself (or trailing segments of it) don't exist yet: this walks
 * up to the nearest existing ancestor, realpath()s *that*, and rejoins
 * the non-existent suffix literally. This is what lets a guard root
 * that is itself a symlink (e.g. a symlinked $HOME) work correctly, and
 * what prevents a symlink placed *inside* an allowed root from resolving
 * outside it undetected.
 */
async function canonicalize(resolvedPath: string): Promise<string> {
  try {
    return await fs.realpath(resolvedPath);
  } catch {
    const parent = path.dirname(resolvedPath);
    if (parent === resolvedPath) return resolvedPath; // filesystem root; give up
    const realParent = await canonicalize(parent);
    return path.join(realParent, path.basename(resolvedPath));
  }
}

function isWithinRoot(resolvedTarget: string, resolvedRoot: string): boolean {
  if (resolvedTarget === resolvedRoot) return true;
  const withSep = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;
  return resolvedTarget.startsWith(withSep);
}

/**
 * Allowlist of writable roots. assertWritable() is the single choke
 * point every filesystem write in this package must pass through (via
 * src/core/fsops.ts) before touching disk. Both roots and targets are
 * canonicalized via realpath (nearest existing ancestor for paths that
 * don't exist yet) before comparison, so a symlink can't be used to
 * escape an allowed root, and a legitimately symlinked root (e.g. a
 * symlinked fixture $HOME) isn't falsely rejected.
 */
export class PathGuard {
  /** path.resolve'd but NOT canonicalized — kept for readable error messages. */
  private readonly rawRoots: string[];

  constructor(allowedRoots: string[]) {
    this.rawRoots = allowedRoots.map((root) => path.resolve(root));
  }

  async isAllowed(targetPath: string): Promise<boolean> {
    const resolvedTarget = path.resolve(targetPath);
    const canonTarget = await canonicalize(resolvedTarget);
    for (const root of this.rawRoots) {
      const canonRoot = await canonicalize(root);
      if (isWithinRoot(canonTarget, canonRoot)) return true;
    }
    return false;
  }

  async assertWritable(targetPath: string): Promise<void> {
    if (!(await this.isAllowed(targetPath))) {
      throw new GuardViolation(path.resolve(targetPath), [...this.rawRoots]);
    }
  }
}
