# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Hive implements the CCS (Compiled Composable Skills) v1.0 spec: a way to package an AI-agent skill as many small self-contained **minis** behind a knowledge-free **INDEX**, compiled deterministically into a **BUNDLE** and optional **presets**. It is five things: a normative spec (`docs/SPEC.md`), a stdlib-only CLI (`tools/hive.py`, Python 3.11), a library of skills (`skills/`), the benchmark evidence base (`benchmarks/` + `docs/BENCHMARKS.md`), and the npm installer package (`packages/hive-installer/`, published as `hive-skills`) that distributes the skills to AI clients.

The two halves have different toolchains. The **framework core** (spec, `tools/hive.py`, `skills/`, `benchmarks/`) has no build system or test suite — running `hive.py` against the skills tree IS its verification. The **installer package** under `packages/hive-installer/` is a conventional TypeScript/pnpm/vitest project with its own build, tests, and lint; work in that directory follows its own toolchain (below), not the framework's.

## Commands

All commands take a skill directory (or its `composable/` subdir):

```bash
python3 tools/hive.py compile skills/<category>/<name>            # regenerate BUNDLE.md + presets/*.md from mini/*.md
python3 tools/hive.py lint    skills/<category>/<name>            # structural rules from docs/SPEC.md
python3 tools/hive.py parity  skills/<category>/<name> <source>   # conversion completeness vs original source (gate: ≥85%, aim ≥95%)
python3 tools/hive.py report  skills                               # token/size/version/lint summary across all skills
python3 tools/hive.py bump    skills/<category>/<name> [major|minor|patch]   # the ONLY supported way to change composable/VERSION
```

Verifying a change to `tools/hive.py`: run `lint` and `compile` (and `parity` where applicable) against **every** skill under `skills/authored/`, `skills/converted/`, and `skills/meta/` and confirm no regression; PRs must paste that output.

### Installer package (`packages/hive-installer/`)

A pnpm workspace (Node ≥ 18, TypeScript strict, ESM). Run from that directory:

```bash
pnpm install
pnpm test          # vitest — the full suite must stay green
pnpm run typecheck # tsc --noEmit, strict
pnpm run build     # tsup → dist/ + bundles the 13 skills, tools/hive.py, and licenses into assets/
npm pack           # produce the npx-runnable tarball
node scripts/bundle-assets.mjs   # regenerate assets/ + assets/manifest.json standalone
```

The published CLI is `hive-skills` (interactive wizard on `npx hive-skills`, or subcommands `scan`/`list`/`install`/`propose`/`doctor`/`backup`/`restore`). `assets/` is generated (gitignored) — never hand-edit it; it is rebuilt from the repo's `skills/` and `tools/hive.py` at build time. The packed tarball's file list is asserted against the asset manifest by `test/pack-e2e.test.ts`, so adding files to the package requires updating the bundle script, not just `package.json`.

## Architecture

Each skill lives at `skills/<category>/<name>/composable/`:

- `INDEX.md` — knowledge-free loading menu, ~200-word budget, exactly one line per mini with an observable "load when" condition. Skill content in the INDEX is a rejected-PR offense.
- `mini/NN-*.md` — the source of truth. Each mini must be self-contained (applicable from its own text plus `00-core`). `mini/00-core.md` is the optional always-loaded foundation for cross-cutting traps. Optional frontmatter keys: `model-hint`, `effort-hint`, `requires`, `pairs-with`, `version`.
- `BUNDLE.md` and `presets/*.md` — **generated artifacts** (marked with a do-not-hand-edit comment). Edits belong in `mini/`; regenerate with `compile` after every mini change and commit the output.
- `presets.json` — optional named mini subsets (e.g. mutually exclusive Python vs Node tracks).
- `VERSION` — bare semver, mutated only via `bump`.

Categories: `authored/` (written in CCS form), `converted/` (ported from upstream skills), `meta/` (the agentic authoring entry point `ccs-skill-creator` — point an agent at its INDEX to create/convert skills), `sources/` (vendored third-party material, unmodified, with `PROVENANCE.md`; licensing tracked in `THIRD_PARTY_NOTICES.md`). Catalog with per-skill stats: `skills/README.md` (regenerate its numbers via `report`).

The runtime loading policy (spec §10) is the core idea: estimate what fraction of a skill's minis a task needs — below ~0.6 load `00-core` + selected minis; at/above load the BUNDLE or a matching preset; very broad decomposable tasks fan out parallel workers with 1–2 minis each.

## Load-bearing rules (from CONTRIBUTING.md — violations get PRs rejected outright)

- **Evidence-first**: any normative claim ("should"/"must"/"always"/"never") in `docs/SPEC.md`, `README.md`, or skill docs must either cite a benchmark cell in `docs/BENCHMARKS.md` or be explicitly labeled **convention**. Never write quality/efficiency claims as settled fact without one of the two.
- **Lossless conversion**: converting a skill is repackaging, never summarization/compression (Experiment 3 measured lossy conversion destroying the quality edge). `parity` ≥85% is a hard merge gate for `skills/converted/`.
- **Scope rule**: a skill only belongs here if it carries >~5k tokens of non-inferable, trap-dense content AND tasks vary in which subtopics they need. Smaller or uniformly-needed skills should stay a single `SKILL.md` upstream.
- Never hand-edit `BUNDLE.md`, `presets/*.md`, or `VERSION`.
- Any skill content change requires a `bump` (patch = fixes/wording, minor = new minis/coverage, major = restructuring/removals) and a `CHANGELOG.md` entry (Keep-a-Changelog format). New skills ship at `1.0.0`.
- Benchmark protocol (if adding evidence): freeze tasks before the skill exists, judge blind with committed blinding maps, count tokens as chars÷4 of files actually loaded, treat score gaps ≤3/40 as noise, commit all raw materials under `benchmarks/`, and report losses as well as wins.
- Installer safety (when editing `packages/hive-installer/`): all filesystem writes go through `src/core/fsops.ts` under a `PathGuard` allowlist — never call raw `node:fs` writes elsewhere. Mutations pre-back-up via `src/core/backup.ts` and stage atomically; pointer writes into user rules files are consent-gated. The client registry (`src/core/registry.ts`) carries per-entry `provenance` + `confidence` — new/changed client paths need a source URL or a real-machine observation, not a guess.
- Precedence on conflicts: `docs/SPEC.md` and the `docs/*.md` guides win over `CONTRIBUTING.md` and this file.
