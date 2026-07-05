# Hive v0.1.0

First public release of Hive: a framework for building composable skills for AI agents.

## What is in this release

- **CCS v1.0 specification** (`docs/SPEC.md`): skills packaged as small
  self-contained minis behind a knowledge-free index, compiled into bundles
  and presets, loaded by an explicit coverage rule. Every normative rule
  carries the measurement behind it or an explicit convention label.
- **`hive.py` CLI** (stdlib-only): `compile`, `lint`, `parity`, `report`,
  `bump`. The parity gate blocks lossy conversions; lint enforces the spec.
- **13 skills** in a categorized tree: 5 authored reference skills, 7
  lossless conversions of official Anthropic Agent Skills (including the
  full ~195k-token `claude-api` reference with 9 per-track presets), and
  the `ccs-skill-creator` meta-skill: point any file-reading agent at it to
  create, convert, or maintain skills.
- **Seven blind-judged benchmark experiments** with raw data, blinding maps,
  and judge scores in `benchmarks/` (`docs/BENCHMARKS.md` for methodology
  and results, losses included).
- **Guides**: authoring (`docs/AUTHORING.md`), lossless conversion
  (`docs/CONVERSION.md`), per-sub-skill model routing
  (`docs/MODEL-ROUTING.md`).
- **Versioning**: per-skill `VERSION` files, per-mini `version:` frontmatter,
  `hive.py bump`.

## Headline results

- Selective loading cut skill tokens 41 to 64 percent on narrow tasks at
  equal-or-better quality.
- On the largest skill (claude-api, ~195k tokens), the Hive conversion won
  the hardest benchmark cell 38 vs 34 against the original packaging at
  lower token cost, and loaded 7 of 56 minis for a narrow task.
- Skills beat the no-skill baseline by the suite's widest margins (+5 to +7
  mean points) on knowledge outside model competence.

## Honest limits

Single-run cells, one model family: directions are solid, magnitudes are
indicative. Hand-tuned progressive-disclosure skills hold quality parity
against conversion on their home turf; Hive's edge there is economics,
scale navigation, and uniform tooling. Skills under roughly 5k tokens of
content should stay single files. Full limitations in `docs/BENCHMARKS.md`.
