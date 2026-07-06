# Skills catalog

This is the index of every CCS (Compiled Composable Skill) that ships in this
repository, organized by category:

- **`authored/`**: skills written directly in CCS form (not derived from an
  existing single-file skill).
- **`converted/`**: skills ported from an existing upstream skill (an
  Anthropic Agent Skill, a third-party market skill, etc.), repackaged
  losslessly per `docs/CONVERSION.md`'s repackaging-not-summarization rule.
- **`meta/`**: skills about the CCS framework itself (currently just the
  agentic authoring/conversion entry point).

Every skill here follows the layout in `docs/SPEC.md` §2: an `INDEX.md`
loading menu, authored `mini/*.md` modules (the source of truth), a generated
`BUNDLE.md`, and optional `presets/*.md`. Regenerate/verify any skill with
`tools/hive.py compile|lint|parity|bump skills/<category>/<name>`; regenerate
this catalog's numbers with `python3 tools/hive.py report skills`.

The table below is generated from that `report` output. Re-run it for the
current state if you have edited any skill.

## Catalog

| Skill | Category | Version | Minis | Bundle tokens | Lint (P/W/F) | What it's for |
|---|---|---|---|---|---|---|
| [`code-review`](authored/code-review/composable/INDEX.md) | authored | 1.0.0 | 9 | 4,524 | 49P/0W/0F | Code review & refactoring method, security, performance, language-specific traps |
| [`data-analysis`](authored/data-analysis/composable/INDEX.md) | authored | 1.0.0 | 9 | 5,075 | 52P/0W/0F | Tabular data analysis, validation, stats, and reporting |
| [`financial-analysis`](authored/financial-analysis/composable/INDEX.md) | authored | 1.0.0 | 13 | 10,876 | 72P/0W/0F | Ratio analysis, DCF, comps, budget variance, forecasting (converted from the `financial-analyst` market skill, kept under `authored/` per its original categorization) |
| [`python-api`](authored/python-api/composable/INDEX.md) | authored | 1.0.0 | 9 | 5,136 | 51P/0W/0F | FastAPI REST API design, auth, validation, testing |
| [`tech-writing`](authored/tech-writing/composable/INDEX.md) | authored | 1.0.0 | 8 | 4,736 | 45P/0W/0F | Technical & product writing: changelogs, breaking changes, style |
| [`claude-api`](converted/claude-api/composable/INDEX.md) | converted | 1.0.1 | 56 | 195,982 | 229P/1W/0F | Claude API / Anthropic SDK reference, with language-track presets (see note below) |
| [`docx`](converted/docx/composable/INDEX.md) | converted | 1.0.0 | 6 | 5,304 | 30P/0W/0F | Word document (.docx) creation, reading, editing, and XML manipulation (from `anthropics/skills`) |
| [`internal-comms`](converted/internal-comms/composable/INDEX.md) | converted | 1.0.0 | 5 | 2,876 | 26P/0W/0F | Internal comms writing (from `anthropics/skills`) |
| [`mcp-builder`](converted/mcp-builder/composable/INDEX.md) | converted | 1.0.0 | 17 | 23,441 | 74P/0W/0F | Building MCP servers (from `anthropics/skills`); ships `presets/{python-server,node-server}.md` |
| [`pdf`](converted/pdf/composable/INDEX.md) | converted | 1.0.0 | 8 | 9,792 | 38P/0W/0F | PDF processing: read, extract, create, merge, split, OCR, encrypt, fill forms (from `anthropics/skills`) |
| [`pptx`](converted/pptx/composable/INDEX.md) | converted | 1.0.0 | 6 | 8,114 | 30P/0W/0F | PowerPoint generation/editing (from `anthropics/skills`) |
| [`skill-creator`](converted/skill-creator/composable/INDEX.md) | converted | 1.0.0 | 15 | 19,913 | 66P/0W/0F | Skill authoring, improvement, and evaluation helper (from `anthropics/skills`) |
| [`ccs-skill-creator`](meta/ccs-skill-creator/composable/INDEX.md) | meta | 1.0.0 | 4 | 5,566 | 22P/0W/0F | Agentic entry point: walks an agent through authoring/converting/maintaining a CCS skill |

*Token counts are `chars/4` estimates (bundle = concatenation of all minis for
that skill, frontmatter stripped), consistent with the accounting used
throughout `docs/BENCHMARKS.md`.*

*The `claude-api` skill carries one non-blocking lint warning: its `INDEX.md`
runs longer than the `< ~200`-word convention (`docs/SPEC.md` §3.2) because it
menus 56 minis across several language tracks. It compiles and passes every
structural check; the warning flags the index length, not a defect.*

## Upstream skills below the CCS break-even

Per `README.md`'s "When to use it, and when not" (and Experiment 6 in
`docs/BENCHMARKS.md`, which found the ~2.8k-token official `internal-comms`
skill got no benefit from CCS packaging), a skill under roughly 5k tokens of
content doesn't clear CCS's break-even point: the `INDEX.md` +
`00-core` scaffolding costs more than selective loading saves. The following
official Anthropic Agent Skills were evaluated and left **unconverted** for
that reason. Use them upstream, as a single `SKILL.md` file, as-is:

| Skill | Rationale |
|---|---|
| `algorithmic-art` | Below break-even per benchmarks; use upstream single-file skill as-is |
| `doc-coauthoring` | Below break-even per benchmarks; use upstream single-file skill as-is |
| `canvas-design` | Below break-even per benchmarks; use upstream single-file skill as-is |
| `xlsx` | Below break-even per benchmarks; use upstream single-file skill as-is |
| `theme-factory` | Below break-even per benchmarks; use upstream single-file skill as-is |
| `frontend-design` | Below break-even per benchmarks; use upstream single-file skill as-is |
| `slack-gif-creator` | Below break-even per benchmarks; use upstream single-file skill as-is |
| `webapp-testing` | Below break-even per benchmarks; use upstream single-file skill as-is |
| `brand-guidelines` | Below break-even per benchmarks; use upstream single-file skill as-is |

Upstream source for all of these: [`github.com/anthropics/skills`](https://github.com/anthropics/skills).
