import { describe, expect, it } from 'vitest';
import { DEFAULT_INLINE_THRESHOLD, selectPackingMode } from '../src/core/packing.js';
import type { CatalogSkill } from '../src/core/catalog.js';

/**
 * selectPackingMode is the pure decision function behind
 * docs/packing-modes.md's default selection rule: bundle-inline when a
 * skill's (marker-stripped) bundleTokens fits the threshold, tree
 * otherwise — overridable per-install via an explicit `packing` mode or a
 * custom `inlineThreshold`. No filesystem access; every case here is
 * synthesized bundleTokens values at the boundaries the spec calls out
 * (5k/24k/26k/195k) plus the override paths.
 */

function skill(bundleTokens: number): CatalogSkill {
  return {
    name: 'fixture',
    category: 'authored',
    version: '1.0.0',
    minis: 1,
    bundleTokens,
    description: 'A fixture skill.',
    path: 'skills/authored/fixture',
  };
}

describe('selectPackingMode: default (auto) rule', () => {
  it('DEFAULT_INLINE_THRESHOLD is 25_000', () => {
    expect(DEFAULT_INLINE_THRESHOLD).toBe(25_000);
  });

  it('5k tokens (pdf-scale) -> bundle-inline', () => {
    const result = selectPackingMode(skill(5_000));
    expect(result.mode).toBe('bundle-inline');
    expect(result.forced).toBe(false);
    expect(result.inlineThreshold).toBe(25_000);
  });

  it('24k tokens (just under threshold) -> bundle-inline', () => {
    expect(selectPackingMode(skill(24_000)).mode).toBe('bundle-inline');
  });

  it('exactly the threshold (25_000) -> bundle-inline (inclusive boundary)', () => {
    expect(selectPackingMode(skill(25_000)).mode).toBe('bundle-inline');
  });

  it('26k tokens (just over threshold) -> tree', () => {
    const result = selectPackingMode(skill(26_000));
    expect(result.mode).toBe('tree');
    expect(result.forced).toBe(false);
  });

  it('195k tokens (claude-api-scale) -> tree', () => {
    expect(selectPackingMode(skill(195_000)).mode).toBe('tree');
  });

  it('opts.packing omitted entirely behaves like "auto"', () => {
    expect(selectPackingMode(skill(5_000), {}).mode).toBe('bundle-inline');
    expect(selectPackingMode(skill(195_000), {}).mode).toBe('tree');
  });

  it('explicit packing: "auto" is equivalent to omitting the option', () => {
    expect(selectPackingMode(skill(5_000), { packing: 'auto' }).mode).toBe('bundle-inline');
    expect(selectPackingMode(skill(195_000), { packing: 'auto' }).mode).toBe('tree');
  });
});

describe('selectPackingMode: --packing force', () => {
  it('forces tree even for a small skill', () => {
    const result = selectPackingMode(skill(5_000), { packing: 'tree' });
    expect(result.mode).toBe('tree');
    expect(result.forced).toBe(true);
  });

  it('forces bundle-inline even for a huge skill', () => {
    const result = selectPackingMode(skill(195_000), { packing: 'bundle-inline' });
    expect(result.mode).toBe('bundle-inline');
    expect(result.forced).toBe(true);
  });

  it('forced results still echo the threshold that would have applied under auto', () => {
    const result = selectPackingMode(skill(195_000), { packing: 'bundle-inline', inlineThreshold: 30_000 });
    expect(result.inlineThreshold).toBe(30_000);
  });
});

describe('selectPackingMode: --inline-threshold override', () => {
  it('a raised threshold pulls a 26k skill into bundle-inline', () => {
    const result = selectPackingMode(skill(26_000), { inlineThreshold: 30_000 });
    expect(result.mode).toBe('bundle-inline');
    expect(result.forced).toBe(false);
    expect(result.inlineThreshold).toBe(30_000);
  });

  it('a lowered threshold pushes a 5k skill into tree', () => {
    const result = selectPackingMode(skill(5_000), { inlineThreshold: 1_000 });
    expect(result.mode).toBe('tree');
  });

  it('an invalid (NaN/non-finite) threshold falls back to the default', () => {
    const result = selectPackingMode(skill(5_000), { inlineThreshold: Number.NaN });
    expect(result.inlineThreshold).toBe(DEFAULT_INLINE_THRESHOLD);
    expect(result.mode).toBe('bundle-inline');
  });
});
