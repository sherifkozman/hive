# CCS Skill Creator: Core

## What CCS is

Compiled Composable Skills (CCS) packages an agent skill as small
authored markdown **minis** (one subtopic each), a knowledge-free **INDEX** that
lists them with "load when" hints, an optional always-loaded **00-core** holding
cross-cutting traps, and a tool-compiled **BUNDLE.md** (the deterministic
concatenation of every mini) plus optional named **presets/**. The minis are the
only source of truth; INDEX, BUNDLE, and presets are derived artifacts. The
payoff: a task loads only the slice it needs, quality stays at least as high as a
monolith, and every packaging choice is auditable. You build and check skills
with one stdlib CLI, `tools/hive.py` (subcommands `compile`, `lint`, `parity`,
`report`). This skill is itself authored in CCS format: the layout you are
reading is the layout you produce.

## Loading policy (how you consume any CCS skill, including this one)

Read the INDEX first. Load `00-core` if the index marks one. Estimate coverage
`k/N` = (minis relevant to the task) / (total minis). If `k/N` < ~0.6, load the
`k` relevant minis individually. If `k/N` ≥ ~0.6, load `BUNDLE.md` (or a matching
`presets/*.md`) in one read. Never both fan out to subagents and load the whole
bundle for the same task.

## The two iron rules

1. **The index is a menu, not a meal.** `INDEX.md` carries none of the
   skill's content, only mini filenames, terse descriptors, and "load when"
   conditions. Any knowledge a mini needs in order to be applied lives *in the
   mini*, never in the index.
2. **Conversion is repackaging, never summarization.** Moving a skill into CCS
   moves content between containers; it must not shrink it. Every fact,
   threshold, table, and worked example survives verbatim-equivalent in some
   mini. Runtime tokens are saved only by *selection* (load fewer minis) and
   *dedup* (preamble shared across minis factored once into `00-core`), never by
   cutting content.

## When NOT to use CCS

- **Under ~5k tokens of knowledge** → ship a single `SKILL.md`. The INDEX +
  00-core scaffolding costs more than selective loading can save.
- **Knowledge a frontier model already applies well** → write no skill at all.
  Generic guidance adds tokens and steps without adding quality; a no-skill
  baseline repeatedly tied or beat skills on tasks inside model competence.
- **Every task needs the entire skill** → it is one document; just ship the
  bundle, no selective loading to do.
