# Hive v0.2.0

The delivery release: Hive's skills now install in the shape the evidence says
performs best — per skill size and per client — and the evidence itself grew by
three experiments, including the first external validation on a community
benchmark harness.

## What is in this release

- **`hive-skills` 0.2.0 — packing modes** (`packages/hive-installer/docs/packing-modes.md`):
  `npx hive-skills` now auto-selects the delivery shape: skills up to ~25k
  compiled tokens install as a single self-contained `SKILL.md` (the compiled
  bundle inline; measured −34–38% conversation tokens at quality parity in
  Claude Code, and 4/4 vs 3/4 quality in Codex), while large skills keep the
  composable INDEX + minis tree — the only viable shape at scale, with
  measured-accurate routing. `--packing` and `--inline-threshold` override;
  receipts record every packing decision; doctor is packing-aware.
- **Asset materialization**: runtime assets referenced by skill content (e.g.
  the pdf skill's `scripts/`) now ship in the package and install beside the
  skill — reference-detected mechanically, symlink-confined for third-party
  source safety.
- **`claude-api` 1.0.1**: 47 minis carried stale cross-references from the
  upstream flat layout; all rewritten to sibling minis (parity re-verified at
  100%), shrinking the package ~844KB.
- **Three new experiments** (raw materials in `benchmarks/`): Exp 9 — quality
  parity independently confirmed on BenchFlow/SkillsBench; Exp 10 — delivery-
  shape economics across two harnesses (the basis for packing modes); Exp 11
  Phase 0 — cross-skill stacking mechanism research (client-native activation
  ranked first; dynamic-composition probe designed).
- **Docs truth pass**: README and `docs/SPEC.md` §10 updated with the
  turn-economics findings; token-savings claims stated with their measured
  conditions; `docs/BENCHMARKS.md` carries the full Exp 9/10 records,
  losses included.
- **Repository hygiene gate**: `tools/hygiene-check.sh` + CI workflow scanning
  every PR for secret-shaped values, personal identifiers, machine paths, and
  internal working files.

## Compatibility

Existing 0.1.0 installs keep working; `hive-skills doctor` advises (never
forces) when a better default shape now exists for an installed skill.
Re-running install upgrades a skill's shape in place, with the usual automatic
pre-install backup.
