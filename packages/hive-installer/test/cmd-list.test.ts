import { describe, expect, it } from 'vitest';
import type { Catalog } from '../src/core/catalog.js';
import { formatCatalogTable, runList } from '../src/commands/list.js';

function makeCatalog(): Catalog {
  return {
    generatedAt: new Date(0).toISOString(),
    hiveCommit: 'test',
    assetsRoot: '/tmp/assets',
    files: [],
    skills: [
      {
        name: 'zeta',
        category: 'authored',
        version: '1.0.0',
        minis: 3,
        bundleTokens: 500,
        description: 'Zeta skill.',
        path: 'skills/authored/zeta',
      },
      {
        name: 'alpha',
        category: 'authored',
        version: '2.0.0',
        minis: 5,
        bundleTokens: 900,
        description: 'Alpha skill.',
        path: 'skills/authored/alpha',
      },
      {
        name: 'claude-api',
        category: 'converted',
        version: '1.2.0',
        minis: 56,
        bundleTokens: 12000,
        description: 'Claude API reference.',
        path: 'skills/converted/claude-api',
      },
    ],
  };
}

describe('runList', () => {
  it('sorts by category then name', () => {
    const rows = runList(makeCatalog());
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'zeta', 'claude-api']);
  });

  it('projects only the catalog fields list needs', () => {
    const rows = runList(makeCatalog());
    expect(rows[0]).toEqual({
      name: 'alpha',
      category: 'authored',
      version: '2.0.0',
      minis: 5,
      bundleTokens: 900,
      description: 'Alpha skill.',
    });
  });
});

describe('formatCatalogTable', () => {
  it('renders one aligned line per skill plus a count summary', () => {
    const table = formatCatalogTable(runList(makeCatalog()));
    expect(table).toContain('alpha');
    expect(table).toContain('claude-api');
    expect(table).toContain('3 skill(s) bundled.');
  });

  it('handles an empty catalog', () => {
    expect(formatCatalogTable([])).toBe('No skills bundled.');
  });
});
