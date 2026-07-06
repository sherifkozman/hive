import pc from 'picocolors';
import type { Catalog, CatalogSkill } from '../core/catalog.js';

export type ListSkillRow = Pick<
  CatalogSkill,
  'name' | 'category' | 'version' | 'minis' | 'bundleTokens' | 'description'
>;

/** Adapter over the bundled catalog (spec §5 `list`): name/category/version/minis/bundle-token-count/description, sorted category then name. */
export function runList(catalog: Catalog): ListSkillRow[] {
  return [...catalog.skills]
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)))
    .map(({ name, category, version, minis, bundleTokens, description }) => ({
      name,
      category,
      version,
      minis,
      bundleTokens,
      description,
    }));
}

/** Pretty table (no table lib) — one aligned line per skill. */
export function formatCatalogTable(rows: ListSkillRow[]): string {
  if (rows.length === 0) return 'No skills bundled.';

  const nameWidth = Math.max(...rows.map((r) => r.name.length), 'name'.length);
  const categoryWidth = Math.max(...rows.map((r) => r.category.length), 'category'.length);
  const versionWidth = Math.max(...rows.map((r) => r.version.length), 'version'.length);

  const lines = rows.map((r) => {
    const stats = pc.dim(`${String(r.minis).padStart(2)} minis, ~${r.bundleTokens} tokens`);
    return `${r.name.padEnd(nameWidth)}  ${r.category.padEnd(categoryWidth)}  ${r.version.padEnd(
      versionWidth,
    )}  ${stats}  ${r.description}`;
  });

  return [...lines, '', `${rows.length} skill(s) bundled.`].join('\n');
}
