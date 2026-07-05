# Scripts, reference files, and vendored resources

This skill's bundled scripts, subagent instructions, and reference docs remain **vendored** at `external/anthropic/skill-creator/`. Every script/asset/agent path mentioned anywhere in this skill (e.g. `scripts.aggregate_benchmark`, `eval-viewer/generate_review.py`, `agents/grader.md`, `assets/eval_review.html`, `references/schemas.md`) refers to that vendored source directory. Run Python module invocations (`python -m scripts.<name>`) from the vendored skill-creator directory so the `scripts` package resolves.

## Reference files

The agents/ directory contains instructions for specialized subagents. Read them when you need to spawn the relevant subagent. (Their full content is carried in the `agent-grader`, `agent-comparator`, and `agent-analyzer` minis of this skill.)

- `agents/grader.md` — How to evaluate assertions against outputs
- `agents/comparator.md` — How to do blind A/B comparison between two outputs
- `agents/analyzer.md` — How to analyze why one version beat another

The references/ directory has additional documentation:
- `references/schemas.md` — JSON structures for evals.json, grading.json, etc. (carried in the `json-schemas` mini of this skill)

## Vendored scripts inventory

The `scripts/` directory (at `external/anthropic/skill-creator/scripts/`) contains the executable tooling this workflow drives. Script paths refer to the vendored source.

- `aggregate_benchmark.py` — Aggregate individual run results into benchmark summary statistics. Reads `grading.json` files from run directories and produces a `run_summary` with mean, stddev, min, max for each metric, plus the delta between with_skill and without_skill configurations. Usage: `python aggregate_benchmark.py <benchmark_dir>` (e.g. `python aggregate_benchmark.py benchmarks/2026-01-15T10-30-00/`). Supports two directory layouts, including the workspace layout produced by skill-creator iterations (`<benchmark_dir>/eval-N/with_skill/run-1/grading.json`, etc.).
- `generate_report.py` — Generate an HTML report from `run_loop.py` output. Takes the JSON output from `run_loop.py` and generates a visual HTML report showing each description attempt with check/x for each test case, distinguishing between train and test queries.
- `improve_description.py` — Improve a skill description based on eval results. Takes eval results (from `run_eval.py`) and generates an improved description by calling `claude -p` as a subprocess (same auth pattern as `run_eval.py` — uses the session's Claude Code auth, no separate `ANTHROPIC_API_KEY` needed).
- `package_skill.py` — Skill Packager; creates a distributable `.skill` file of a skill folder. Usage: `python utils/package_skill.py <path/to/skill-folder> [output-directory]`. Excludes patterns such as `__pycache__`, `node_modules`, `*.pyc`, and `.DS_Store` when packaging. Validates the skill via `quick_validate.py` before packaging.
- `quick_validate.py` — Quick, minimal validation of a skill: checks that `SKILL.md` exists and has valid frontmatter.
- `run_eval.py` — Run trigger evaluation for a skill description. Tests whether a skill's description causes Claude to trigger (read the skill) for a set of queries, outputting results as JSON.
- `run_loop.py` — Run the eval + improve loop until all pass or max iterations reached. Combines `run_eval.py` and `improve_description.py` in a loop, tracking history and returning the best description found. Supports a train/test split to prevent overfitting.
- `utils.py` — Shared utilities for skill-creator scripts, including `parse_skill_md(skill_path)` which parses a `SKILL.md` file and returns `(name, description, full_content)`.
- `__init__.py` — Marks `scripts/` as a Python package (so `python -m scripts.<name>` and intra-package imports resolve).

## Other vendored resources

- `eval-viewer/generate_review.py` — Generates the review viewer (Outputs + Benchmark tabs) for human review of test-case results. Use this rather than writing custom HTML. Supports `--previous-workspace`, `--benchmark`, and `--static <output_path>` (for headless/Cowork environments).
- `eval-viewer/viewer.html` — The viewer HTML used by `generate_review.py`.
- `assets/eval_review.html` — Template for the description-optimization trigger-eval review UI (with `__EVAL_DATA_PLACEHOLDER__`, `__SKILL_NAME_PLACEHOLDER__`, `__SKILL_DESCRIPTION_PLACEHOLDER__` placeholders).
