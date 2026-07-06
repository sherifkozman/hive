# Experiment 9 — CCS packaging on a community harness (BenchFlow `bench skills eval`)

**Status: single-run pilot (n=1), budget-truncated. Directional evidence only.**
Date: 2026-07-06 · Branch: feat/skillsbench-validation · Harness: benchflow 0.6.4
(installed from git; PyPI package is stale), sandbox docker, agent claude-agent-acp,
model pinned claude-sonnet-5, judge n/a (all cases exact-match).

## Question

On an external community harness (SkillsBench/BenchFlow), does Hive CCS packaging
match the upstream hand-tuned packaging of the same content? Conditions: baseline
(no skill), C1 = upstream Anthropic `pdf` skill as-is, C2 = Hive CCS conversion
exactly as `npx hive-skills` installs it (SKILL.md shim + INDEX + minis + BUNDLE).
Identical `scripts/`, identical frontmatter name/description, identical frozen
evals (sha ff15c09b…, commit 2494558; authored sources-only under a pre-registered
sampling rule; two documented amendments, one for a packaging-referential answer,
one for harness scoring mechanics).

## Results (4 cases, one rollout per cell)

Harness metric (verbatim ground-truth string in agent output files):

| case | baseline | C1 upstream | C2 Hive CCS |
|---|---|---|---|
| narrow-01 (tool categories) | 0 | 1 | 1 |
| narrow-02 (OCR functions) | 1 | 1 | 1 |
| broad-03 (pdf-lib + mediabox) | 0 | 0 | 0 |
| broad-04 (license + form keys) | 0 | 1 | **0** |
| **total** | **1/4** | **3/4** | **2/4** |

Offline deterministic component scoring (all required components present in the
agent's answer, phrasing-insensitive — pre-registered as the primary metric after
the harness's verbatim mechanics were characterized):

| case | baseline | C1 upstream | C2 Hive CCS |
|---|---|---|---|
| narrow-01 | 0 | 1 | 1 |
| narrow-02 | 1 | 1 | 1 |
| broad-03 | 1* | 0 | 0 |
| broad-04 | 0 | 1 | **1** |
| **total** | **2/4** | **3/4** | **3/4** |

\* baseline broad-03: components appeared in trajectory text near the answer; treat
with caution (component metric is more lenient than an answer-file check).

The single strict-metric discriminator (broad-04) is a phrasing artifact: C2's agent
answered `pypdfium2 (Apache/BSD); image_width and image_height` — substantively
correct, failing only the literal word "License" that C1's agent copied verbatim
from the upstream table it had read directly.

Tokens (agent-side total per condition, harness-reported):

| condition | total tokens | vs C1 | note |
|---|---|---|---|
| baseline | 723,842 | — | |
| C1 upstream | 900,922 | — | |
| C2 Hive CCS | 773,077 | **−14%** | narrow-01 cost MORE (+62%: 222k vs 137k) |

## Findings (single-run, directional)

1. **Compatibility validated end-to-end.** A CCS skill mounts and runs unmodified
   (SKILL.md shim) on a third-party community harness; the agent navigated
   INDEX → minis as designed (trajectory-verified: correct minis loaded on the
   broad case — the selection-risk failure mode did not materialize here).
2. **Quality parity with the hand-tuned original under component scoring (3/4 vs
   3/4); one-case deficit under verbatim scoring (2/4 vs 3/4)** — consistent with
   Experiment 7's conclusion (parity, not superiority, against packaging already
   tuned for progressive disclosure).
3. **Interactive-agent token economics differ from file-level accounting.** CCS
   was −14% tokens overall but +62% on a narrow case: in an ACP sandbox agent,
   INDEX→mini navigation adds turns, and each turn re-sends context — file-level
   savings (Exp 1's chars÷4 of loaded files) do not automatically transfer to
   conversation-level token flow. New, previously unmeasured effect; needs
   repeats before it is more than an observation.
4. **Harness sharp edges** (worth upstream reports, approval-gated): ground_truth
   scoring is a verbatim file scan; its `re.escape(gt)+\b` regex can never match
   ground truths ending in `)`; per-rollout `cost_usd` is unpopulated.

## Budget accounting

Measured ≈ $1.30/rollout at list pricing (≈11M raw input tokens / 28 rollouts in
diagnostics; scoring run ≈ $15.6 of a $20 cap). Descoped by budget: C3
(bundle-only), repeats (n≥2), claude-api and mcp-builder tracks — all deferred,
not abandoned. Every number above is a single-run cell; treat gaps of one case
as noise until repeated.

## Raw materials

Frozen cases + rationale: `cases/pdf/` (this dir). Run artifacts (manifests,
per-rollout result.json/reward files, trajectories, diagnostic archives incl. two
pre-scoring failed runs): session scratchpad `exp9/runs/pdf/` — summaries copied
under `runs-summary/` here; full trajectories retained locally (not committed;
multi-MB conversation logs).
