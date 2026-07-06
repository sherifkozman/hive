import type { HomeContext } from '../core/paths.js';
import type { ClientRegistryEntry } from '../core/registry.js';
import type { Catalog } from '../core/catalog.js';
import { doctor, formatDoctorReport, type DoctorResult } from '../core/doctor.js';

export interface DoctorCommandOptions {
  project?: string;
}

/** Thin adapter over core doctor() (spec §5/§7 `doctor`) — wires the resolved registry/catalog/projectDir through. */
export async function runDoctor(
  ctx: HomeContext,
  registry: readonly ClientRegistryEntry[],
  catalog: Catalog,
  opts: DoctorCommandOptions = {},
): Promise<DoctorResult> {
  return doctor(ctx, { registry, catalog, projectDir: opts.project });
}

export { formatDoctorReport };
