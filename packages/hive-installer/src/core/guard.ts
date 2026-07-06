import path from 'node:path';

/**
 * Thrown by PathGuard#assertWritable when a target path falls outside
 * every allowed root. This is the safety-invariant #1 enforcement point
 * (spec §9): "Writes only ever land in: client skill/payload dirs, the
 * backups dir, or an explicitly confirmed pointer file."
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
 * Allowlist of writable roots. assertWritable() is the single choke
 * point every filesystem write in this package must pass through (via
 * src/core/fsops.ts) before touching disk.
 */
export class PathGuard {
  private readonly roots: string[];

  constructor(allowedRoots: string[]) {
    this.roots = allowedRoots.map((root) => path.resolve(root));
  }

  isAllowed(targetPath: string): boolean {
    const resolved = path.resolve(targetPath);
    return this.roots.some((root) => isWithinRoot(resolved, root));
  }

  assertWritable(targetPath: string): void {
    const resolved = path.resolve(targetPath);
    if (!this.isAllowed(resolved)) {
      throw new GuardViolation(resolved, [...this.roots]);
    }
  }
}

function isWithinRoot(resolvedTarget: string, resolvedRoot: string): boolean {
  if (resolvedTarget === resolvedRoot) return true;
  const withSep = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;
  return resolvedTarget.startsWith(withSep);
}
