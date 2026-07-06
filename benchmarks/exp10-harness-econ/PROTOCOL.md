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

## What this is not

Single-skill (pdf), small-n, two harnesses, one machine. It selects among E1–E4
for a PROPOSAL; any spec/product change still requires its own review gate per
CONTRIBUTING (a "should" needs the benchmark citation this experiment provides,
or it doesn't ship).
