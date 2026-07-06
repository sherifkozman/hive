import pc from 'picocolors';
import type { HomeContext } from '../core/paths.js';
import type { ClientRegistryEntry } from '../core/registry.js';
import { detectClients, scanSkills, type InstalledSkillKind } from '../core/scanner.js';

export interface ScanSkillRow {
  name: string;
  path: string;
  kind: InstalledSkillKind;
  tokensEst: number;
}

export interface ScanClientRow {
  id: string;
  name: string;
  detected: boolean;
  strategy: string;
  confidence?: string;
  skills: ScanSkillRow[];
}

/** Stable `--json` shape (T7): `{ clients: [{ id, name, detected, strategy, confidence, skills: [...] }] }`. */
export interface ScanResult {
  clients: ScanClientRow[];
}

/**
 * Adapter over detectClients()/scanSkills() (spec §5 `scan`): every
 * registry entry is reported (detected: false for the rest), and
 * existing skills/rules are only scanned for detected clients that
 * resolve to a global skill location.
 */
export async function runScan(ctx: HomeContext, registry: readonly ClientRegistryEntry[]): Promise<ScanResult> {
  const detected = await detectClients(ctx);
  const clients: ScanClientRow[] = [];

  for (const d of detected) {
    const entry = registry.find((candidate) => candidate.id === d.id);
    const skills = d.detected && entry ? await scanSkills(ctx, entry) : [];
    clients.push({
      id: d.id,
      name: d.name,
      detected: d.detected,
      strategy: d.strategy,
      confidence: d.confidence,
      skills: skills.map((s) => ({ name: s.name, path: s.path, kind: s.kind, tokensEst: s.tokensEst })),
    });
  }

  return { clients };
}

/** Pretty table (no table lib, per spec §3's minimal-deps constraint) — one line per client, indented lines per existing skill/rule. */
export function formatScanTable(result: ScanResult): string {
  const lines: string[] = [];

  for (const client of result.clients) {
    const marker = client.detected ? pc.green('✔') : pc.dim('·');
    const strategyLabel = pc.dim(`[${client.strategy}]`);
    const confidenceLabel = client.confidence && client.confidence !== 'verified' ? pc.dim(` (${client.confidence})`) : '';
    lines.push(`${marker} ${client.name.padEnd(28)} ${strategyLabel}${confidenceLabel}`);

    for (const skill of client.skills) {
      lines.push(`    - ${skill.name} ${pc.dim(`(${skill.kind}, ~${skill.tokensEst} tokens)`)}`);
    }
  }

  const detectedCount = result.clients.filter((c) => c.detected).length;
  lines.push('', `${detectedCount} of ${result.clients.length} known client(s) detected.`);
  return lines.join('\n');
}
