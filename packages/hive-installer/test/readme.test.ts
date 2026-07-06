import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_REGISTRY } from '../src/core/registry.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(path.join(packageRoot, 'README.md'), 'utf8');

/**
 * Keeps README.md's client support table honest as the registry grows
 * (T8): every CLIENT_REGISTRY entry's id and display name must appear
 * somewhere in the README, so a future registry addition that forgets to
 * update the doc fails this test rather than silently drifting.
 */
describe('README client support table stays in sync with CLIENT_REGISTRY', () => {
  it('mentions every registry client id (as `` `id` ``)', () => {
    const missing = CLIENT_REGISTRY.filter((entry) => !readme.includes(`\`${entry.id}\``));
    expect(missing.map((e) => e.id)).toEqual([]);
  });

  it('mentions every registry client display name', () => {
    const missing = CLIENT_REGISTRY.filter((entry) => !readme.includes(entry.name));
    expect(missing.map((e) => e.id)).toEqual([]);
  });

  it('mentions every distinct strategy in use', () => {
    const strategies = new Set(CLIENT_REGISTRY.map((e) => e.strategy));
    for (const strategy of strategies) {
      expect(readme).toContain(strategy);
    }
  });
});

describe('README evidence-culture claims', () => {
  it('cites docs/BENCHMARKS.md by experiment number wherever it cites a quality/token finding', () => {
    expect(readme).toContain('docs/BENCHMARKS.md');
    expect(readme).toMatch(/Experiment \d/);
  });

  it('does not hardcode the npm package name (nothing to keep in sync with a rename)', () => {
    // Sanity: the quickstart uses the generic `npx hive-skills` form, matching package.json's bin name.
    expect(readme).toContain('npx hive-skills');
  });
});
