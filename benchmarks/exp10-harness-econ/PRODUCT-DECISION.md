# Experiment 10 — Product decision (wave 1: Claude Code, n=3)

**Primary outcome (per frozen precedence): E2 — with a decisive reinterpretation.**
The pre-registered E2 rule fired (4 mechanical events ≥ 2), but the corrected audit
(Amendment A5: events counted from actual Read tool calls, not transcript grep)
shows the events are NOT wrong navigation — INDEX routing was accurate wherever the
agent engaged (broad-04: exactly the 4 expected minis, 3/3 repeats; narrow-01:
exactly the expected mini). All 4 events are **skill-bypass**: the agent answered
from its own knowledge + live web without opening any mini (narrow-02 ×3, harmless
— ceiling case; broad-03 r2, harmful). Bypass equally afflicts C1/C3 (median
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
environment (constant across conditions), every cell's agent used live web tools
(12/12 per condition) — skills compete with search in production, compressing all
skill lift vs sandbox numbers. broad-03 exceeded the 12-turn budget for ALL
conditions in r3 and for C1 in 3/3 repeats (A3 failures; sensitivity: excluding
broad-03 changes no outcome selection). Wave 2 (Codex, cross-family) not run —
auth probing blocked; requires explicit approval to proceed.
