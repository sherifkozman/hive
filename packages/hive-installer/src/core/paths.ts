import os from 'node:os';
import path from 'node:path';

/**
 * Resolved home directory + platform for a single installer run. Every
 * other module in this package takes a HomeContext instead of calling
 * os.homedir()/process.platform directly — this is the sole seam that
 * makes fixture-home testing (never the real home) possible, and it is
 * enforced by test/no-homedir-leak.test.ts.
 */
export interface HomeContext {
  /** Absolute path to the resolved "home" directory. */
  home: string;
  /** Platform to use for platform-specific registry/path logic. */
  platform: NodeJS.Platform;
}

export interface ResolveHomeContextOptions {
  /** Value of a `--home <dir>` CLI flag, if the user passed one. */
  homeFlag?: string | undefined;
  /** Environment to read HIVE_SKILLS_HOME from. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Platform override, for tests. Defaults to process.platform. */
  platform?: NodeJS.Platform;
}

/**
 * Resolution order: --home flag > HIVE_SKILLS_HOME env var > os.homedir().
 * The result is always an absolute path (relative inputs are resolved
 * against process.cwd()).
 */
export function resolveHomeContext(
  options: ResolveHomeContextOptions = {},
): HomeContext {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  const fromFlag = options.homeFlag?.trim();
  const fromEnv = env.HIVE_SKILLS_HOME?.trim();

  const raw = fromFlag || fromEnv || os.homedir();

  return {
    home: path.resolve(raw),
    platform,
  };
}

/** Join path segments onto ctx.home. */
export function joinHome(ctx: HomeContext, ...segments: string[]): string {
  return path.join(ctx.home, ...segments);
}

/**
 * Expand a path that may start with `~` (or `~/...`) to ctx.home; any
 * other path (absolute or relative) is resolved as-is (relative paths
 * resolve against process.cwd(), matching normal shell/CLI semantics —
 * they are NOT implicitly home-relative).
 */
export function expandPath(ctx: HomeContext, input: string): string {
  if (input === '~') {
    return ctx.home;
  }
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(ctx.home, input.slice(2));
  }
  return path.resolve(input);
}
