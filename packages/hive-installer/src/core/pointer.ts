/**
 * Managed-block helpers for payload+pointer clients (spec §4/§8): a
 * pointer snippet written into a client's own rules file (GEMINI.md,
 * memories/global_rules.md, a project .cursor/rules/*.mdc file), scoped
 * between marker comments so re-install can find and replace exactly
 * this block, never anything else the user wrote in that file.
 */

export const MANAGED_BLOCK_START = '# >>> hive-skills >>>';
export const MANAGED_BLOCK_END = '# <<< hive-skills <<<';

/**
 * The full marked block (start marker, 2-4 content lines, end marker) to
 * upsert into a client's rules file. Deliberately does NOT enumerate
 * which skills are installed under `payloadDir` — that would force a
 * pointer rewrite (and a fresh confirmation prompt) every time the
 * installed skill set changes, even though the pointer's job (say where
 * the catalog lives and how to read it) never changes.
 */
export function renderPointerBlock(payloadDir: string): string {
  return [
    MANAGED_BLOCK_START,
    `Hive CCS skills are installed at: ${payloadDir}`,
    "Read a skill's composable/INDEX.md first (knowledge-free loading menu), then apply",
    'the coverage rule from its SKILL.md/SPEC excerpt (<0.6 coverage -> 00-core + selected',
    'minis; >=0.6 -> BUNDLE.md or a matching preset).',
    MANAGED_BLOCK_END,
  ].join('\n');
}

/**
 * Insert-or-replace `block` (a full marked block, see renderPointerBlock)
 * within `fileContent`, between MANAGED_BLOCK_START/END:
 *  - markers absent (including a malformed/partial pair) -> append `block`
 *    at EOF, separated from any existing content by exactly one blank
 *    line, result always ending with a single trailing newline.
 *  - markers present -> replace everything from the start marker through
 *    the end marker (inclusive) with `block`, preserving whatever came
 *    before/after.
 * Pure function; idempotent (applying it twice with the same `block`
 * yields the same result as applying it once).
 */
export function upsertManagedBlock(fileContent: string, block: string): string {
  const startIdx = fileContent.indexOf(MANAGED_BLOCK_START);
  const endIdx = fileContent.indexOf(MANAGED_BLOCK_END);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    const trimmedEnd = fileContent.replace(/\s+$/, '');
    const prefix = trimmedEnd.length > 0 ? `${trimmedEnd}\n\n` : '';
    return `${prefix}${block}\n`;
  }

  const endOfEndMarker = endIdx + MANAGED_BLOCK_END.length;
  const before = fileContent.slice(0, startIdx);
  const after = fileContent.slice(endOfEndMarker);
  const afterWithoutOneLeadingNewline = after.startsWith('\n') ? after.slice(1) : after;

  return `${before}${block}\n${afterWithoutOneLeadingNewline}`;
}

/**
 * Minimal before/after rendering for a pointer-write confirmation prompt
 * (executeInstall's ports.confirmPointerWrite). No diff library is in
 * scope (deliberately minimal deps, spec §3) — this trades a proper
 * line-level diff for a plain "here's what's there now, here's what it
 * would become" view, which is enough for a human "yes/no" confirmation.
 */
export function renderPointerDiff(existing: string | undefined, next: string, file: string): string {
  if (existing === undefined) {
    return `${file} does not exist yet. Would create it with:\n\n${next}`;
  }
  return [`${file} — managed block would change:`, '--- current ---', existing, '--- proposed ---', next].join(
    '\n',
  );
}
