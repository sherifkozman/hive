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
- **`preset-skills`** (experimental, opt-in) — installs each compiled preset as
  its own sibling skill (e.g. `hive-mcp-builder-python`, `-node`), each
  bundle-inline with a track-scoped description, plus the full-bundle fallback
  skill. Rationale: Exp 10's winning "preset-policy" needs task context the
  installer lacks at install time; delivering presets as separate skills lets
  the CLIENT's native skill selection make that per-task choice. Flagged
  experimental pending Exp 11 (this is mechanism-adjacent to cross-skill
  stacking). Not the default anywhere in 0.2.0.

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
- Registry gains `injectsSkillBody: 'observed' | 'assumed' | 'no' | 'unknown'`
  per client (Claude Code: observed; Codex: unknown-but-single-file-favored,
  evidence quality-side). v0.2.0 behavior does NOT branch on it (both observed
  clients favor single-file ≤25k); recorded for transparency + future rules.
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
