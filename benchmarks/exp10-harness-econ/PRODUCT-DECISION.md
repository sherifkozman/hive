# Experiment 10 — Product decision (wave 1: Claude Code, n=3)

**Primary outcome (per frozen precedence): E2 — with a decisive reinterpretation.**
The pre-registered E2 rule fired (4 mechanical events ≥ 2), but the corrected audit
(Amendment A5: events counted from actual Read tool calls, not transcript grep)
shows the events are NOT wrong navigation — INDEX routing was accurate wherever the
agent engaged (broad-04: exactly the 4 expected minis, 3/3 repeats; narrow-01:
exactly the expected mini). All 4 events are **skill-bypass**: the agent answered
from its own knowledge without opening any mini (narrow-02 ×3, harmless
— ceiling case; broad-03 r2, harmful; corrected web audit, Exp 11 A3a:
none of these cells made an actual web call). Bypass equally afflicts C1/C3 (median
file-reads per rollout: C1 0.5, C3 0.0).

**The structural finding that matters for the product:** Claude Code injects the
activated skill's SKILL.md body into context without tool calls. Hence:

- C3 (bundle inlined in SKILL.md): whole knowledge, ONE free injection, zero
  navigation turns — median 0 reads.
- C1 (upstream): 8k body free, occasional extra reads — median 0.5.
- C2 (CCS shim → INDEX → minis): tiny shim free, then PAID tool turns for every
  file — median 2.5 reads, each turn re-sending conversation context.

## Quantified deltas (median neutral tokens, quality at parity 3/4 = 3/4 = 3/4)

| case | C2 CCS-full | C3 bundle-inline | C3 vs C2 |
|---|---|---|---|
| narrow-01 | 321,570 | 211,025 | **−34%** |
| narrow-02 | 177,473 | 210,591 | +19% (bypass case — no skill read either way) |
| broad-03 | 554,651 | 923,852 | +67% (all-conditions-fail case at median) |
| broad-04 | 340,941 | 211,542 | **−38%** |

E1's strict trigger (≥20% aggregate narrow) landed at −15.5% = the pre-registered
indeterminate band → E1 not claimed; the per-case engaged deltas (−34%, −38%) are
reported as the secondary signal.

## Recommended product enhancement (proposal — NOT applied; needs its own gate)

**Per-client packing mode in the installer (`hive-skills`):** for clients observed
to auto-inject SKILL.md bodies (Claude Code), install compiled-BUNDLE-inline
(today's C3 shape) as the default when the bundle fits comfortably in an injection
(pdf: 39KB ≈ 10k tokens — fine); keep the composable INDEX+minis tree for
scale skills where inlining is impossible (claude-api, 195k tokens — and there the
corrected audit shows INDEX routing is ACCURATE, so the mechanism is sound at the
scale it exists for). Measured value: −34% to −38% conversation tokens at equal
quality on engaged cases, zero selection risk, no extra turns.

Secondary enhancement candidates, evidence-backed:
1. **Engagement, not selection, is the weak link**: strengthen shim/skill
   `description` trigger wording (bypass = 4/12 C2 cells; cost one real failure).
   Any wording change must A/B under this same protocol before shipping.
2. **Installer gap (pre-run finding):** referenced `scripts/` assets are not
   materialized by install — mini/06 points at paths that don't exist in an
   installed tree. Fix in `bundle-assets`/installer regardless of packing mode.
3. **SPEC §10 note (needs the citation this experiment provides):** the coverage
   rule's economics differ in turn-based harnesses; loading via fewer injections
   dominates loading fewer bytes when per-turn context re-send applies.

## Context that bounds the claims

Single skill (pdf), 4 cases, n=3, one harness (Claude Code + sonnet-5), real-HOME
environment (constant across conditions), live web tools available in every cell
— corrected audit (Exp 11 Amendment A3a: actual WebSearch/WebFetch tool_use
counted, replacing a transcript string-search that matched the harness's tool
listing): actual web calls occurred in 11/108 cells across both waves,
concentrated in the no-skill baseline — skills compete with search and the
model's own knowledge in production, compressing all skill lift vs sandbox
numbers. broad-03 exceeded the 12-turn budget for ALL
conditions in r3 and for C1 in 3/3 repeats (A3 failures; sensitivity: excluding
broad-03 changes no outcome selection). Wave 2 (Codex, cross-family) not run —
auth probing blocked; requires explicit approval to proceed.

---

# Confirmation waves (final, 2 skills × 2 harnesses × n=3)

## Median-per-case totals

| wave | C0 | C1 upstream | C2 CCS-shim | C3 bundle-inline | C4 preset-policy |
|---|---|---|---|---|---|
| pdf / Claude Code | 1/4 | 3/4 | 3/4 | 3/4 | — |
| pdf / Codex | 2/4 | 4/4 | 3/4 | **4/4** | — |
| mcp / Claude Code | 2/4 | **4/4** | 3/4 | 3/4 | **4/4** |

Median neutral tokens (mcp wave): C1 2.05M ≈ C4 2.11M < C3 2.65M ≈ C2 2.67M < C0 3.76M.
pdf/Claude Code engaged-case deltas: C3 −34%/−38% vs C2. pdf/Codex: C2 failed
narrow-01 in 3/3 repeats (consistent shim under-navigation on Codex).

## Frozen-rule outcome (v2.1 precedence)

- E2: does NOT fire (no wave has C2 trailing C1 by ≥2 median cases; corrected audit
  shows accurate mini selection when engaged).
- E1: fires in the pdf/Claude-Code band only (indeterminate 15.5% aggregate, −34/−38%
  per engaged case); NOT at mcp size (C3 ≈ C2 tokens, no advantage).
- **E3 fires — PRIMARY OUTCOME: per-client, per-size packing.** E1_signal holds in
  exactly one harness (and only at small skill size), and Codex adds an independent
  QUALITY dimension (single-file deliveries 4/4 vs shim 3/4, deficit reproducible
  3/3 on the same case).

## The single most important product fact

**C2 — the shape `npx hive-skills` installs today — was never the best condition in
any of the twelve measured wave×condition cells**: quality 3/4 everywhere, and
always the (co-)most-expensive skill condition. Every measured client×size band has
a better delivery shape available from artifacts Hive ALREADY compiles:

| skill size | Claude Code | Codex |
|---|---|---|
| small (≲10k tok) | BUNDLE inline in SKILL.md (parity, −34/−38% tokens) | BUNDLE inline (4/4 vs 3/4) |
| mid (~10–50k) | preset-policy: preset if covered, else bundle (4/4 at C1-level cost) | single-file (upstream-style or bundle) |
| large (50k+) | composable tree (only option; routing accurate) | composable tree + engagement wording TBD |

Secondary finding: the C4 preset POLICY (mechanical preset-else-bundle fallback)
matched the best condition (4/4) at near-best cost on its first outing, including
surviving a natural cross-track preset-gap case via fallback.

Baseline was worst in every wave — the cases discriminate; skills carry real lift
on both model families.
