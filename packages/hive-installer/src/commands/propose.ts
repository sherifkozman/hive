import path from 'node:path';
import type { HomeContext } from '../core/paths.js';
import type { ClientRegistryEntry } from '../core/registry.js';
import type { Catalog } from '../core/catalog.js';
import { detectClients } from '../core/scanner.js';
import { renderProposalDoc, scanForCandidates, type ProposalCandidate } from '../core/proposals.js';
import { PathGuard } from '../core/guard.js';
import { writeFile } from '../core/fsops.js';

export const DEFAULT_PROPOSE_OUT = 'hive-conversion-proposals.md';

export interface ProposeCommandOptions {
  clients?: string[];
  out?: string;
  /** Test seam: defaults to `() => new Date().toISOString()`. */
  now?: () => string;
}

export interface ProposeCommandResult {
  candidates: ProposalCandidate[];
  outPath: string;
  doc: string;
}

/**
 * Adapter over scanForCandidates/renderProposalDoc (spec §5/§6
 * `propose`): defaults to every detected client when --client is
 * omitted, writes the rendered doc to --out (default
 * `./hive-conversion-proposals.md`), guarded to ONLY that file's parent
 * directory — propose is the one write path that can land outside every
 * client/backups root the rest of the installer is confined to (spec §9
 * invariant 1 names "client skill/payload dirs, the backups dir, or an
 * explicitly confirmed pointer file"; an explicit --out is the
 * user-directed exception, scoped as narrowly as a single directory).
 */
export async function runPropose(
  ctx: HomeContext,
  registry: readonly ClientRegistryEntry[],
  catalog: Catalog,
  opts: ProposeCommandOptions = {},
): Promise<ProposeCommandResult> {
  const clientIds =
    opts.clients && opts.clients.length > 0
      ? opts.clients
      : (await detectClients(ctx)).filter((d) => d.detected).map((d) => d.id);

  const candidates = await scanForCandidates(ctx, clientIds, { registry });

  const outPath = path.resolve(opts.out ?? DEFAULT_PROPOSE_OUT);
  const generatedAt = (opts.now ?? (() => new Date().toISOString()))();
  const doc = renderProposalDoc(candidates, { generatedAt, catalog });

  const guard = new PathGuard([path.dirname(outPath)]);
  await writeFile(guard, outPath, doc);

  return { candidates, outPath, doc };
}

/** Pretty candidate summary (the doc itself is written to disk; this is the on-screen echo). */
export function formatProposeSummary(result: ProposeCommandResult): string {
  const counts = { strong: 0, borderline: 0, 'keep-as-is': 0 };
  for (const c of result.candidates) counts[c.classification]++;

  const lines = [
    `${result.candidates.length} candidate(s) scanned: ${counts.strong} strong, ${counts.borderline} borderline, ${counts['keep-as-is']} keep-as-is.`,
    `Proposal doc written to: ${result.outPath}`,
  ];
  return lines.join('\n');
}
