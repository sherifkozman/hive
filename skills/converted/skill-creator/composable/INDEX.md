# Skill Creator: Loading Menu

Create new skills, improve existing ones, and measure skill performance. Scripts, agents, and references remain vendored at `external/anthropic/skill-creator/`; script paths in the minis refer to that source.

Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If most of this skill is relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.

- `mini/00-core.md` - the loop, mindset, communicating with the user - **always load**
- `mini/01-creating-a-skill.md` - capture intent, interview/research, write SKILL.md - Load when creating a skill from scratch.
- `mini/02-skill-writing-guide.md` - anatomy, progressive disclosure, patterns, writing style - Load when drafting/structuring SKILL.md content.
- `mini/03-test-cases.md` - writing realistic test prompts, evals.json - Load when creating test cases.
- `mini/04-running-and-evaluating.md` - spawn runs, assertions, timing, grade, viewer, feedback - Load when running/evaluating test cases.
- `mini/05-improving-the-skill.md` - how to think about improvements, iteration loop - Load when revising based on feedback.
- `mini/06-blind-comparison.md` - rigorous A/B between two versions - Load when comparing two skill versions.
- `mini/07-description-optimization.md` - trigger eval queries, optimization loop, triggering mechanics - Load when optimizing the description.
- `mini/08-packaging.md` - package a .skill file - Load when packaging/presenting.
- `mini/09-environment-specific.md` - Claude.ai and Cowork adaptations, updating a skill - Load in Claude.ai/Cowork or when updating an existing skill.
- `mini/10-scripts-and-references.md` - vendored scripts inventory, reference-file map - Load when running scripts or locating resources.
- `mini/11-json-schemas.md` - evals/history/grading/metrics/timing/benchmark/comparison/analysis schemas - Load when writing any of these JSON files.
- `mini/12-agent-grader.md` - grader subagent instructions - Load when grading runs.
- `mini/13-agent-comparator.md` - blind comparator subagent instructions - Load when running a blind comparison.
- `mini/14-agent-analyzer.md` - post-hoc analyzer + benchmark analysis instructions - Load when analyzing comparisons or benchmarks.
