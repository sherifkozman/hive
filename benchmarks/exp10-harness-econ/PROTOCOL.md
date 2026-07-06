# Experiment 10 — Protocol (frozen before any scored run)

**North star:** decide, with numbers, whether Hive's packaging/loading guidance has
room for product enhancement in real installed harnesses — not to win a benchmark.

## Pre-registered outcomes and decision rules

Exactly one of E1–E4 will be selected in PRODUCT-DECISION.md by these rules:

- **E1 — Loading-guidance change** (SKILL.md shim wording and/or SPEC §10 coverage
  threshold): triggered if C3 (bundle-only) achieves quality parity with C2
  (CCS-full) — aggregate gap ≤1 case — while using ≥20% fewer conversation tokens
  (median across repeats) on narrow cases, direction consistent in ≥2/3 repeats.
  Quantification: report the measured token delta and the turn-count delta; propose
  concrete threshold/wording change sized to the data.
- **E2 — INDEX/navigation improvement**: triggered if C2 shows ≥2 wrong-mini
  selection events (trajectory-audited: agent opens minis irrelevant to the case's
  knowledge, or misses the containing mini) across the C2 cells, OR C2 quality
  trails C1 by ≥2 cases aggregate while C3 does not.
- **E3 — Per-client install variant** (installer offers bundle-only mode):
  triggered if E1's signal holds in one harness but not the other (harness-specific
  economics).
- **E4 — No change warranted**: none of the above trigger; all deltas within bands.

Quality bands (component scoring, 4 cases): gaps of ≤1 case = noise (n is small);
≥2 cases = signal. No statistical-significance language.

## Design

- Harnesses: wave 1 = Claude Code headless (`claude -p`, subscription auth via
  env-unset ANTHROPIC_API_KEY, model pinned `claude-sonnet-5`, `--max-turns 12`,
  `--output-format json`); wave 2 = Codex CLI (`codex exec`), auth mode probed
  before any run; second model family per Exp 1–8's stated limitation.
- Conditions as isolated PROJECT fixtures (harness cwd = fixture; skills at
  `<fixture>/.claude/skills/...`):
  - C0 baseline: no skills dir
  - C1 upstream: Anthropic pdf skill verbatim
  - C2 CCS-full: installed by the ACTUAL `hive-skills` installer
    (`install --client claude-code --skill pdf --yes --home <fixture>`) — dogfood
  - C3 bundle-only: SKILL.md = frontmatter + compiled BUNDLE.md inline
    (+ identical scripts/ in C1–C3; identical name/description frontmatter)
- Cases: Exp 9 frozen pdf evals verbatim (sha ff15c09b…, commit 2494558) — no new
  authoring, full comparability. Agents write answer.txt into the fixture cwd;
  runner collects and removes it between rollouts.
- Repeats: n=3 (trim rule: n=2 if rate-limited), serial execution, condition order
  rotated per repeat by the Exp 9 permutation table.
- Metrics per rollout: (1) deterministic component scoring of answer.txt (Exp 9
  script, answer-file-first with trajectory fallback flagged); (2) tokens from
  harness JSON (input/output/cache-read/cache-write) + nominal cost field;
  (3) num_turns; (4) files-read audit from transcript for E2.
- Hygiene: fixture reset between rollouts (answer.txt and any stray writes
  removed; skills dir sha256-verified against its frozen hash before every
  rollout); one rollout at a time; raw JSON outputs archived per cell.

## v2 — review reconciliation (codex delta-review, all 9 issues adopted; frozen before any scored run)

1. **Outcome resolution is ordered; primary + secondary.** Precedence for the PRIMARY
   outcome: E2 → E1 → E3 → E4 (a navigation defect invalidates interpreting C2's
   token economics, so E2 outranks E1). Any other rule that also fires is recorded
   as a SECONDARY finding. Indeterminate zone (e.g. parity with 15–19% token delta,
   or median vs direction-consistency contradiction) → E4-with-flag, naming the
   near-miss rule and the exact numbers.
2. **E1's metric is cache-neutral tokens**: input + cache_read + cache_write +
   output, all at full weight (billable cost reported separately, never used for
   E1). Serial-run cache warming then only shifts the input/cache_read split, which
   the neutral sum absorbs. Runs keep ≥20s spacing; cold-start gaps not required.
3. **Aggregation defined**: per case, take the MEDIAN score across repeats; count
   case wins/losses over the 4 cases. "Gap ≤1 case" always refers to this
   median-per-case count. Same definition in E1/E2/E3. Narrow cases are, by frozen
   ID: pdf-narrow-01, pdf-narrow-02.
4. **Degraded cells**: if any rollout in a repeat block is rate-limited/errored,
   discard that ENTIRE repeat block for that harness and retry once after cooldown;
   never keep partial-by-condition data.
5. **Wrong-mini events are mechanical**: a frozen case→expected-mini map (generated
   by deterministic grep of each case's scoring components across mini files,
   committed alongside this protocol) defines the allowlist; an event = C2 opening
   zero expected minis or >2 non-expected minis for a case; max one event counted
   per case×repeat; transcript evidence archived.
6. **Per-rollout isolation**: each rollout runs in a FRESH COPY of its condition
   fixture (no resume, no prior transcripts/state); the copy is archived with the
   outputs. HOME limitation, documented: full HOME isolation breaks subscription
   auth (verified: "Not logged in" under fresh HOME), and credential relocation is
   deliberately out of bounds. Runs therefore inherit the real user HOME: user-level
   CLAUDE.md/skills are a CONSTANT context across all conditions (verified: no
   pdf-relevant user skills). Differential comparisons remain valid; the constant
   preamble inflates token denominators, making the ≥20% E1 threshold conservative.
7. **Model pin asserted per rollout** from output JSON (modelUsage keys must be
   exactly the pinned model); mismatch invalidates the rollout (rule 4 applies).
8. **Discovery canary** (unscored), once per condition×repeat: "list the skill
   files available to you and quote the first heading of each" — verifies the
   harness actually discovered the expected frozen SKILL.md (hash-matched fixture).
9. **E3 meaning**: E1_signal is computed per harness on that harness's OWN paired
   metrics (never pooling token counts across families); held constant across
   waves: cases, prompts, scoring, skill-tree hashes, repeat structure,
   invalid-run rules, turn-cap semantics; allowed to differ: discovery mechanism,
   tokenizer/accounting, model. Output tokens are part of the E1 neutral sum;
   output-only comparisons are secondary.

## Amendments during execution (documented, condition-neutral)

- **A1 (r1, pre-scoring):** the model-pin assertion (v2.7) initially required every
  model in `modelUsage` to match the pin; Claude Code legitimately uses auxiliary
  helper models (observed: a Haiku call for websearch summarization) alongside the
  pinned dominant model. Corrected definition: the DOMINANT model (max output
  tokens) must match the pin; auxiliary models are recorded in the manifest.
  Rollouts flagged under the old rule are revalidated post-hoc under this
  definition; token accounting sums across ALL models in `modelUsage`.
- **A2 (observation):** real-harness agents have live web tools; baseline (and any)
  conditions may search the web instead of/alongside reading skills. Retained
  deliberately — production-realistic behavior is the object of study — and
  reported (tool usage audited per rollout from transcripts).

- **A3 (r1, before any scoring):** `error_max_turns` on a SCORED cell is a
  legitimate task failure (reward 0), consistent with Exp 9's timeout-as-failure
  precedent — not a block-invalidating infra error (v2.4 stays reserved for rate
  limits / auth / harness crashes). Because this ruling was made after observing
  which condition it affected (C1-upstream/pdf-broad-03), results additionally
  report a sensitivity row excluding that cell. Turn cap stays 12 for all repeats.
- **A4 (r1):** canary prompt scoped to the project's own `.claude/skills` (the
  original wording made agents enumerate the constant user-level skills and blow
  the turn cap; canaries are unscored diagnostics). r1 canary verification is done
  from transcripts instead.

## What this is not

Single-skill (pdf), small-n, two harnesses, one machine. It selects among E1–E4
for a PROPOSAL; any spec/product change still requires its own review gate per
CONTRIBUTING (a "should" needs the benchmark citation this experiment provides,
or it doesn't ship).
