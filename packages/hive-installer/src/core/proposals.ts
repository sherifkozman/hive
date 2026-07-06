import path from 'node:path';
import type { HomeContext } from './paths.js';
import { CLIENT_REGISTRY, type ClientRegistryEntry } from './registry.js';
import { scanSkills } from './scanner.js';
import { readInstallManifest } from './installManifest.js';
import type { Catalog } from './catalog.js';

/**
 * Conversion-candidate classification thresholds (spec §6). Exported from
 * here — the one place — rather than duplicated at each call site
 * (scanForCandidates and any future caller, e.g. a CLI `propose --json`
 * path, should both import these instead of re-deriving the numbers).
 */
export const STRONG_TOKEN_THRESHOLD = 5000;
export const BORDERLINE_TOKEN_THRESHOLD = 2000;

export type ProposalClassification = 'strong' | 'borderline' | 'keep-as-is';

export interface ProposalCandidate {
  clientId: string;
  clientName: string;
  sourcePath: string;
  tokensEst: number;
  classification: ProposalClassification;
  rationale: string;
}

export function classifyCandidate(tokensEst: number): { classification: ProposalClassification; rationale: string } {
  if (tokensEst >= STRONG_TOKEN_THRESHOLD) {
    return {
      classification: 'strong',
      rationale: `>= ${STRONG_TOKEN_THRESHOLD} tokens: a strong candidate for CCS conversion (spec §6).`,
    };
  }
  if (tokensEst >= BORDERLINE_TOKEN_THRESHOLD) {
    return {
      classification: 'borderline',
      rationale:
        `${BORDERLINE_TOKEN_THRESHOLD}-${STRONG_TOKEN_THRESHOLD - 1} tokens: borderline. The CCS scope rule ` +
        'says small skills should stay single-file — convert only if tasks vary meaningfully in which ' +
        'subtopics they need.',
    };
  }
  return {
    classification: 'keep-as-is',
    rationale: `< ${BORDERLINE_TOKEN_THRESHOLD} tokens: below the CCS scope threshold — keep as a single file.`,
  };
}

export interface ScanForCandidatesOptions {
  registry?: readonly ClientRegistryEntry[];
}

/**
 * Scan each given client's existing skills/rules and classify them as
 * conversion candidates (spec §6). Unknown client ids are silently
 * skipped (callers are expected to pass ids from detectClients()'s
 * output, which are always valid registry ids by construction).
 */
export async function scanForCandidates(
  ctx: HomeContext,
  clientIds: string[],
  opts: ScanForCandidatesOptions = {},
): Promise<ProposalCandidate[]> {
  const registry = opts.registry ?? CLIENT_REGISTRY;
  const candidates: ProposalCandidate[] = [];

  for (const clientId of clientIds) {
    const entry = registry.find((candidate) => candidate.id === clientId);
    if (!entry) continue;

    const skills = await scanSkills(ctx, entry);
    for (const skill of skills) {
      // Already Hive-managed: skip. Name-based check covers every kind
      // (skill-dirs and rule-files alike); the manifest check only makes
      // sense for skill-dir entries (rule files have no .hive-install.json
      // concept — that file lives inside an installed skill *directory*).
      if (skill.name.startsWith('hive-')) continue;
      if (skill.kind === 'skill-dir' && (await readInstallManifest(skill.path)) !== undefined) continue;

      const { classification, rationale } = classifyCandidate(skill.tokensEst);
      candidates.push({
        clientId: entry.id,
        clientName: entry.name,
        sourcePath: skill.path,
        tokensEst: skill.tokensEst,
        classification,
        rationale,
      });
    }
  }

  return candidates;
}

export interface RenderProposalDocOptions {
  /** ISO timestamp to stamp the doc with. Required (not defaulted to Date.now()) so rendering stays pure/deterministic for golden-file testing. */
  generatedAt: string;
  /** Bundled skill catalog — resolves the real, always-valid on-disk paths to tools/hive.py and ccs-skill-creator's INDEX.md quoted in each recipe. */
  catalog: Catalog;
}

/**
 * Render the `hive-conversion-proposals.md` markdown (spec §6): one
 * section per candidate, size + classification + rationale, and (for
 * strong/borderline candidates only) a full conversion recipe — deps,
 * the exact agent prompt, and the parity/lint gates. `keep-as-is`
 * candidates are listed but get no recipe (nothing to convert).
 *
 * Recipe paths point at THIS installer run's own bundled assets
 * (`catalog.assetsRoot`), not a hypothetical per-client install of
 * ccs-skill-creator — a proposal can be generated before the user has
 * installed anything, so the bundled copy is the only path guaranteed
 * to exist.
 */
export function renderProposalDoc(candidates: ProposalCandidate[], opts: RenderProposalDocOptions): string {
  const hivePyPath = path.join(opts.catalog.assetsRoot, 'tools', 'hive.py');
  const skillCreatorIndexPath = path.join(
    opts.catalog.assetsRoot,
    'skills',
    'meta',
    'ccs-skill-creator',
    'composable',
    'INDEX.md',
  );

  const lines: string[] = ['# Hive Conversion Proposals', '', `Generated: ${opts.generatedAt}`, ''];

  if (candidates.length === 0) {
    lines.push('No candidates found.');
    return lines.join('\n') + '\n';
  }

  for (const candidate of candidates) {
    lines.push(`## ${candidate.sourcePath}`, '');
    lines.push(`- Client: ${candidate.clientName} (\`${candidate.clientId}\`)`);
    lines.push(`- Size: ~${candidate.tokensEst} tokens (chars/4 estimate)`);
    lines.push(`- Classification: **${candidate.classification}** — ${candidate.rationale}`, '');

    if (candidate.classification === 'keep-as-is') {
      lines.push('No conversion recipe — below the CCS scope threshold.', '');
      continue;
    }

    lines.push(
      'Task-variance caveat: token size alone does not confirm this is a good CCS candidate — verify that ' +
        'tasks using it actually vary in which subtopics they need (the second half of the CCS scope rule, ' +
        'which cannot be measured statically).',
      '',
      '### Conversion recipe',
      '',
      'Dependencies:',
      '- `python3` >= 3.11 (for `hive.py lint` / `parity` / `compile`)',
      `- Bundled \`tools/hive.py\`: \`${hivePyPath}\``,
      `- \`ccs-skill-creator\` meta-skill INDEX: \`${skillCreatorIndexPath}\``,
      '',
      'Agent prompt:',
      '',
      '```',
      `Point your agent at ${skillCreatorIndexPath} and ask it to convert ${candidate.sourcePath}; gates: parity >= 85%, lint clean.`,
      '```',
      '',
      'Gates (must pass before the conversion is merged/used):',
      `- \`python3 ${hivePyPath} parity <converted-dir> ${candidate.sourcePath}\` >= 85%`,
      `- \`python3 ${hivePyPath} lint <converted-dir>\` clean`,
      '',
      '> Conversion is repackaging, never summarization/compression — lossy conversion destroys the quality ' +
        'edge CCS measured (see `docs/BENCHMARKS.md` Experiment 3).',
      '',
    );
  }

  return lines.join('\n');
}
