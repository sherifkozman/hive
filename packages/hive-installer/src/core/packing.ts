import type { CatalogSkill } from './catalog.js';

/**
 * Install packing shape (docs/packing-modes.md): `bundle-inline` ships a
 * single SKILL.md (frontmatter + the compiled BUNDLE.md body, no
 * composable/ tree); `tree` is the v0.1.0 shape (a thin SKILL.md shim
 * plus the full composable/ tree). `preset-skills` is spec'd but
 * explicitly DESCOPED for 0.2.0 (packing-modes.md v2 item 4) — not a
 * member of this union.
 */
export type PackingMode = 'bundle-inline' | 'tree';

/** bundleTokens <= this -> bundle-inline by default (packing-modes.md "Default selection rule"). */
export const DEFAULT_INLINE_THRESHOLD = 25_000;

export interface SelectPackingModeOptions {
  /**
   * 'auto' (default, same as omitting this field) applies the size rule
   * below. Any concrete PackingMode forces that mode regardless of size —
   * this is what a user's `--packing tree`/`--packing bundle-inline`
   * ultimately becomes.
   */
  packing?: 'auto' | PackingMode;
  /** Overrides DEFAULT_INLINE_THRESHOLD for the size rule (a user's `--inline-threshold`). Non-finite values (including NaN) fall back to the default. */
  inlineThreshold?: number;
}

export interface PackingModeResult {
  mode: PackingMode;
  /** True iff `opts.packing` named a concrete mode (not 'auto'/omitted) — i.e. the caller forced it rather than the size rule choosing it. */
  forced: boolean;
  /** The threshold actually in effect (echoed even when forced, so callers — e.g. installer.ts's receipt — can record it regardless of how the mode was decided). */
  inlineThreshold: number;
}

/**
 * The packing-modes.md "Default selection rule", as a pure function of a
 * catalog skill's already-marker-stripped `bundleTokens` (bundle-assets.mjs
 * computes it that way — see packing-modes.md v2 item 6, "same accounting
 * as the catalog's bundleTokens") and the caller's override options. No
 * filesystem access, so every case (including the v2-cited 5k/24k/26k/195k
 * boundaries) is directly unit-testable.
 */
export function selectPackingMode(
  catalogSkill: CatalogSkill,
  opts: SelectPackingModeOptions = {},
): PackingModeResult {
  const inlineThreshold =
    opts.inlineThreshold !== undefined && Number.isFinite(opts.inlineThreshold)
      ? opts.inlineThreshold
      : DEFAULT_INLINE_THRESHOLD;

  if (opts.packing !== undefined && opts.packing !== 'auto') {
    return { mode: opts.packing, forced: true, inlineThreshold };
  }

  const mode: PackingMode = catalogSkill.bundleTokens <= inlineThreshold ? 'bundle-inline' : 'tree';
  return { mode, forced: false, inlineThreshold };
}
