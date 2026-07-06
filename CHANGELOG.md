# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) for the
spec version and the CLI, with the understanding that a v0.x release makes no
stability promises on either.

## [Unreleased]

### Added

- **`hive-skills` npm package v0.1.0** (`packages/hive-installer/`), the first
  distributable for Hive: an npx-runnable installer that detects installed AI
  coding clients (13-client registry with per-entry provenance and confidence,
  user-overridable via `--registry`), installs the bundled CCS skills into
  native skill directories or consent-gated payload+pointer locations, proposes
  conversions of a machine's existing skills against the CCS scope rule
  (thresholds per README "When to use it"; lossless-conversion recipe cites
  Experiment 3 in `docs/BENCHMARKS.md`), and ships `doctor` diagnostics plus
  sha256-manifested backup/restore with tamper-refusing deletion safety. All
  13 skills, `tools/hive.py`, and third-party license/provenance files are
  bundled into the tarball; the packed artifact is validated by an
  extracted-tarball end-to-end test. Node ≥ 18; interactive wizard via
  `npx hive-skills`, non-interactive via subcommands with `--yes`/`--dry-run`.
- **`hive-skills` v0.2.0 packing modes** (`packages/hive-installer/docs/packing-modes.md`,
  evidence base `benchmarks/exp10-harness-econ/PRODUCT-DECISION.md`): installs
  now default to `--packing auto`, which chooses per skill between
  `bundle-inline` (a single `SKILL.md` — upstream-verbatim frontmatter
  description plus the compiled `BUNDLE.md` body, marker stripped; no
  `composable/` tree) and `tree` (the v0.1.0 shim + full composable tree
  shape, retained for large skills) by a 25,000-marker-stripped-bundle-token
  threshold, overridable per install (`--packing tree|bundle-inline`,
  `--inline-threshold <n>`). Non-knowledge assets (`scripts/` etc.) still
  materialize in both modes. `.hive-install.json` gains additive
  `packing`/`packingForced`/`inlineThreshold`/`catalogHash` fields
  (pre-0.2.0 manifests, with none of these, are treated as `tree`,
  unforced); `doctor` branches its per-skill integrity checks on the
  installed mode and warns when an auto (non-forced) install's mode now
  differs from the current default. The payload-client pointer block
  wording is mode-generic ("read the skill's SKILL.md; larger skills carry
  a composable/INDEX.md menu") rather than assuming tree shape. Upgrading
  between modes (either direction) is a normal hash-diff upgrade — no new
  uninstall/reinstall step. A `preset-skills` mode (installing each compiled
  preset as its own sibling skill) is spec'd but explicitly **descoped**
  from 0.2.0 pending Exp 11's native-selection probes.
  `scripts/bundle-assets.mjs` additionally records each skill's upstream
  `sourceDescription` (verbatim from its vendored `SKILL.md` frontmatter,
  falling back to the existing INDEX-first-sentence `description` with a
  `descriptionSource` flag) for the inline `SKILL.md` generator to use.
  Evidence for the default rule: measured PARITY between inline and tree at
  mid-size on Claude Code (mcp-builder, ~23.5k tokens, 3/4 both), a
  reproducible Codex quality win for single-file delivery at small/mid size
  (4/4 vs 3/4), and −34%/−38% conversation-token deltas on engaged small-skill
  (pdf) cases — the 10–25k inline default is called out as **provisional**
  in the spec pending Experiment 11, not a settled mid-size win.

### Fixed

- **Dead non-knowledge-asset paths in installed converted skills** (found
  via Experiment 10 dogfooding). Converted skills' minis reference vendored
  non-knowledge assets by relative path per spec §9 (e.g. pdf's
  `scripts/check_fillable_fields.py`, docx/pptx's `scripts/office/*`,
  mcp-builder's `scripts/`, skill-creator's `scripts/`/`assets/`/
  `references/`/`agents/`/`eval-viewer/`), but neither the asset bundle nor
  the installer materialized those directories, so an installed skill's
  path references pointed at nothing. `scripts/bundle-assets.mjs` now
  detects each converted/authored skill's matching vendored source root and
  bundles a top-level directory there iff the skill's own compiled
  composable content (`INDEX.md`/`BUNDLE.md`/`mini/*.md`/`presets/*.md`)
  references it by relative path — reference-based, not "ship every
  directory": a source root can also hold already-converted knowledge
  material (e.g. claude-api's per-language `.md` folders, whose content is
  losslessly carried by its own minis; mcp-builder's `reference/`, never
  mentioned by path) that must NOT be duplicated into the tarball. Shipped
  dirs land under `assets/skills/<category>/<name>/assets-src/`, recorded
  on the skill's `manifest.json` entry; the installer materializes them
  into the installed skill dir's root (e.g. `<installed-skill>/scripts/`)
  alongside `composable/` and `SKILL.md`, and the tree-hash used for
  install-plan skip/upgrade decisions now accounts for them.
- **Stale cross-references in `skills/converted/claude-api` (bumped
  1.0.0 -> 1.0.1)**. The prior asset-discovery fix above still shipped
  claude-api's 9 vendored per-language directories (`csharp`, `curl`, `go`,
  `java`, `php`, `python`, `ruby`, `shared`, `typescript`) as assets, because
  every one of them was still referenced by a `<dir>/` path somewhere in the
  compiled minis — e.g. "read from `csharp/`", "see `shared/tool-use-concepts.md`",
  `{lang}/claude-api/tool-use.md` — leftovers from the pre-conversion flat
  source layout, even though that same content had already been losslessly
  carried into sibling minis (e.g. `shared/tool-use-concepts.md` ->
  `mini/17-tool-use-concepts.md`). In an installed skill those paths are
  dead: there is no `shared/`/`csharp/`/etc. directory on disk. Every stale
  reference now points at its sibling mini instead (verified by content,
  not filename guessing); `00-core.md`'s language-routing table and Reading
  Guide were rewritten to route to the `NN-<lang>-*.md` mini series rather
  than deleted, since the routing behavior itself is still needed. Parity
  vs `skills/sources/anthropic/claude-api` held at 100.4% (was 99.9%
  pre-fix) with every source heading still fuzzy-matched. Net effect:
  `scripts/bundle-assets.mjs` no longer bundles any of claude-api's 9
  vendored per-language directories as assets (`assetDirs` shrinks to
  none), since none of them are referenced by path anymore.

## [0.1.0] (2026-07-05)

Initial public release of Hive: the CCS (Compiled Composable Skills) framework
for packaging an agent skill as small authored modules plus
deterministic compiled artifacts, with an explicit runtime rule for what to
load.

### Added

- **CCS specification v1.0** (`docs/SPEC.md`), the normative directory
  layout (INDEX / minis / optional `00-core` / compiled BUNDLE and presets),
  INDEX and mini authoring rules, the parity gate for conversions, the runtime
  coverage-rule loading policy, and an explicit "what CCS does not claim"
  section separating measured claims from labeled convention.
- **`tools/hive.py`**, a single, zero-dependency, stdlib-only Python CLI with
  four subcommands: `compile` (regenerate `BUNDLE.md` and named presets from
  `mini/*.md`), `lint` (structural conformance checks against the spec),
  `parity` (diff a conversion's minis against its source material to catch
  lossy compression), and `report` (token/size summary across all skills in a
  skills root).
- **13 reference skills** under `skills/`, organized into three categories per
  `docs/SPEC.md`:
  - `skills/authored/` (5): `code-review`, `data-analysis`,
    `financial-analysis`, `python-api`, `tech-writing`.
  - `skills/converted/` (7): `claude-api`, `docx`, `internal-comms`,
    `mcp-builder`, `pdf`, `pptx`, `skill-creator`. All seven are lossless CCS
    conversions of official Anthropic Agent Skills (source vendored unmodified
    under `skills/sources/anthropic/`, see `THIRD_PARTY_NOTICES.md`).
  - `skills/meta/` (1): `ccs-skill-creator`.

  `financial-analysis` was authored with a third-party market skill as a
  benchmarking reference (source vendored under `skills/sources/financial-analyst/`,
  see `THIRD_PARTY_NOTICES.md` for that provenance).
- **`ccs-skill-creator`**, an agentic meta-skill and the recommended entry
  point for most adopters: a CCS-conformant skill (dogfooded against its own
  spec) that packages the authoring workflow (`docs/AUTHORING.md`), the
  conversion workflow (`docs/CONVERSION.md`), and skill maintenance as
  loadable minis, so an AI coding agent pointed at
  `skills/meta/ccs-skill-creator/composable/INDEX.md` can create, convert, or
  maintain a skill, including running `lint`/`parity` on its own output,
  without a human first reading the spec end to end. Its viability as the
  primary onboarding path was adoption-tested against this repository, and
  the loading path and lint rules were adjusted based on what that testing
  surfaced (see `README.md`'s "quick start" and `docs/SPEC.md` §13).
- **Six blind-judged benchmark experiments** (`docs/BENCHMARKS.md`), all under
  one shared protocol: tasks frozen by commit before the skills existed,
  blind judging by independent frontier-tier LLM judges against a fixed rubric,
  deterministic chars÷4 token accounting, orchestrator verification of code
  outputs:
  1. Monolithic vs. composable vs. no-skill baseline across 4 domains × 2 task
     types: composable met-or-beat monolithic quality with 41-64% token
     savings on narrow tasks, but the token advantage inverted on broad tasks.
  2. Compiled-bundle loading (condition D): beat loose-mini loading 4-0 on
     broad tasks, at a token premium over a hand-written monolith.
  3. Third-party market-skill conversion case study (`financial-analyst`):
     token savings transferred, but a lossy ~30%-compression conversion lost
     the quality edge, motivating the parity gate.
  4. Per-mini model-routing / fan-out probe: matched single-context quality
     within noise at much lower peak per-context load; the quality upside
     remains unproven due to a ceiling effect.
  5. Skill-graph edge (`requires:` / `pairs-with:`) probe: no measured
     selection or application benefit at domain scale.
  6. Supplemental validation on two official Anthropic Agent Skills,
     losslessly converted: CCS won on quality and tokens for a large skill on
     a narrow task, but lost on a broad task against pruned manual disclosure,
     and showed no benefit at all on a small (~2.8k-token) skill.
- **Provenance and licensing scaffolding**: `skills/sources/` vendors third-party
  source material unmodified for benchmarking (see each directory's
  `PROVENANCE.md`); `LICENSE` (MIT) and `THIRD_PARTY_NOTICES.md` clarify what
  this project's license covers versus the vendored, separately-licensed
  material under `skills/sources/`.
- **Research notes** (`research/`): a positioning scan against prior art
  (Anthropic Agent Skills, Cursor rules, GitHub Copilot instructions,
  `llms.txt`, DSPy, DITA) and a failure-mode survey informing the spec's
  design choices.

### Known limitations at this release

- All benchmark cells are single-run (n=1 per task/condition) from one model
  family; score gaps ≤ 3 points (of 40) are treated as noise, and independent
  re-judging shifted some rankings within that band. See
  `docs/BENCHMARKS.md` §10 for the full limitations list.
- Skill-graph edge metadata and per-mini model routing are implemented but
  their quality benefit is explicitly not proven: see the framework's
  "what CCS does not claim" section (`docs/SPEC.md` §12).
- The Experiment 6 preset remedy for the broad-task "preset gap" is a token
  projection, not a re-benchmarked result.

[0.1.0]: https://github.com/sherifkozman/hive/releases/tag/v0.1.0
