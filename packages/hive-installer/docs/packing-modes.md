# Packing modes (v0.2.0 design)

Evidence base: `benchmarks/exp10-harness-econ/PRODUCT-DECISION.md` (2 skills ×
2 harnesses × n=3). Headline: the v0.1.0 install shape (thin SKILL.md shim +
composable tree, "tree mode") was never the best-measured condition — single-file
deliveries win small/mid sizes on both tested families (economics on Claude Code,
which auto-injects SKILL.md bodies; quality on Codex, which under-navigates
thin shims), while the composable tree remains the only viable shape at large
size (and its INDEX routing is measured-accurate there).

## Modes

- **`bundle-inline`** — SKILL.md = frontmatter (name + upstream-verbatim
  description) + the compiled BUNDLE.md body (generated marker stripped).
  Non-knowledge assets (scripts/ etc.) still materialized beside it; the
  composable/ tree is NOT installed.
- **`tree`** — v0.1.0 behavior (shim + composable tree). Retained for large
  skills and for reproduction/comparison studies.
- **`preset-skills`** (spec'd, unshipped — CLOSED with no driver after Exp 11)
  — would install each compiled preset as its own sibling skill (e.g.
  `hive-mcp-builder-python`, `-node`), each bundle-inline with a track-scoped
  description, plus the full-bundle fallback skill. Rationale was that Exp
  10's winning "preset-policy" needs task context the installer lacks at
  install time. Exp 11 (docs/BENCHMARKS.md) then measured native selection
  over installed shapes as sufficient and found composed/derived artifacts
  lose source-skill discoverability; no evidence currently justifies
  shipping this mode.

## Default selection rule (per skill × client)

```
bundleTokens = catalog manifest bundleTokens (chars/4 of BUNDLE.md)
mode = bundle-inline   if bundleTokens <= 25_000
       tree            otherwise
```

- 25k threshold: measured parity at 23.5k inline (mcp-builder, Claude Code
  3/4 = tree's 3/4; Codex pdf inline 4/4); clear win at ~10k (pdf: −34/−38%
  tokens at parity). Above 25k is unmeasured for inline; claude-api (195k)
  cannot inline. Threshold is a constant, overridable per install
  (`--packing <mode>` forces; `--inline-threshold <tokens>` adjusts).
- (CLOSED, no driver — Exp 11 found no packing rule needing it) Registry
  `injectsSkillBody` field: v0.2.0 behavior never branches on it; it ships
  if and when a rule actually consumes it.
- Applies to native-skills AND payload clients (the payload tree becomes a
  payload single file; pointer blocks unchanged).

## Mechanics

- `.hive-install.json` unchanged in shape; `packing` field added (additive).
  treeSha256 covers whatever shape was installed → idempotency/upgrade logic
  untouched. Upgrading a tree-mode install to inline (or back) is a normal
  upgrade (hash differs).
- Doctor: reports packing mode per installed skill; `warn` upgrade hint when an
  installed mode differs from the current default for that skill×client.
- Backup/restore: unchanged (shape-agnostic, path-based).
- Wizard + `install`: `--packing auto|tree|bundle-inline|preset-skills`
  (default `auto` = the rule above); mode shown in the plan preview.

## v2 — review reconciliation (codex gate, all issues adopted)

1. **Evidence honesty on the 10–25k band**: on Claude Code, inline at mcp size
   measured PARITY with tree (3/4 both; ~2.65M ≈ 2.67M tokens) — no advantage.
   The inline default for 10–25k rests on (i) Codex's quality-side win for
   single-file deliveries (4/4 vs 3/4, deficit reproducible 3/3) and (ii) one
   mode simplicity across clients. CONFIRMED by Experiment 11
   (docs/BENCHMARKS.md): in two-skill stacks the inline default held quality
   parity and was never beaten by ≥15% tokens under any lens by selective
   tree navigation or by a composed artifact.
2. **Description pipeline**: bundle-assets gains a `sourceDescription` manifest
   field = the UPSTREAM SKILL.md frontmatter description verbatim (fallback:
   current INDEX first-sentence, flagged in manifest). Inline SKILL.md
   generation serializes frontmatter YAML-safely (quoted/escaped) and
   HARD-FAILS if the skill has no BUNDLE.md.
3. **Mode-aware doctor + pointers**: doctor's per-skill integrity checks branch
   on the receipt's packing mode (inline installs have no composable/INDEX.md
   — check SKILL.md body presence + tree hash instead); payload pointer block
   wording becomes mode-generic ("read the skill's SKILL.md; larger skills
   carry a composable/INDEX.md menu"). Pointer wording change re-prompts via
   the existing consent gate on upgrade (expected, documented).
4. **preset-skills mode: DESCOPED from 0.2.0, then CLOSED** — the
   receipt/uninstall model for N+1 sibling skills was unsettled, and Exp 11's
   native-selection probes were to inform its design. They did: native
   selection over installed shapes measured sufficient, and derived sibling
   artifacts lose source-skill discoverability (docs/BENCHMARKS.md, Exp 11).
   No follow-up spec unless new evidence emerges.
5. **Repro receipts**: `.hive-install.json` gains `packing`, `packingForced`
   (explicit --packing vs auto), `inlineThreshold`, `catalogHash`,
   `installerVersion` (already present) — doctor's differs-from-default hint
   fires ONLY on auto installs. Benchmark reproduction pins a repo commit, not
   just "tree mode exists".
6. Threshold is computed on marker-stripped BUNDLE.md chars÷4 (same accounting
   as the catalog's bundleTokens). Codex `injectsSkillBody` stays `unknown`.

## Non-goals (0.2.0)

- No runtime/coverage-rule changes to the CCS spec itself (docs get a §10
  turn-economics note under W3, separately).
- No per-task preset selection inside the installer (that is the client's or
  Exp 11's job).
- No removal of tree mode.

## Tests

Mode-selection matrix (sizes 5k/24k/26k/195k × flags), SKILL.md generation
golden (frontmatter identical to upstream description; body = bundle minus
marker), E2E per mode from packed tarball, tree→inline upgrade path,
preset-skills opt-in (installs N+1 skills, descriptions scoped), doctor
packing report + upgrade hint.
