# Evaluation Protocol

## Worker runs (Sonnet)
24 runs = 4 domains x 2 tasks (narrow/broad) x 3 conditions. Identical task
prompt; only the skill-loading preamble differs. Workers run with the repo
checked out and may use Bash/Read to run code (needed for data-analysis and to
self-verify coding tasks). Workers must put the complete deliverable in their
final message.

### Condition A — baseline
> You are completing a task. Do not read anything under /home/user/hive/skills/.
> TASK: <task text>

### Condition B — monolithic skill
> You are completing a task. First read the skill file
> /home/user/hive/skills/<domain>/monolithic/SKILL.md in full and apply it.
> Do not read anything else under /home/user/hive/skills/.
> TASK: <task text>
> At the very end of your reply, append a line: `LOADED: monolithic/SKILL.md`.

### Condition C — composable skill
> You are completing a task. A composable skill is available: read
> /home/user/hive/skills/<domain>/composable/INDEX.md first, then load ONLY the
> mini-skills from /home/user/hive/skills/<domain>/composable/mini/ that you
> judge relevant to this task, in whatever order/configuration you find useful.
> Do not read the monolithic variant. TASK: <task text>
> At the very end of your reply, append a line: `LOADED: <comma-separated
> filenames you actually read, including INDEX.md>`.

## Token accounting
skill_tokens(run) = sum over loaded files of ceil(chars/4).
- A: 0. B: full SKILL.md. C: INDEX.md + reported mini-skills (cross-checked
  for plausibility; a worker claiming files that don't exist voids the run).

## Blind judging (Opus, one judge per task = 8 judges)
Judge receives: the task text, the fixture (if any), and the three outputs
labeled Output-1/2/3 in randomized order with LOADED lines stripped. Rubric,
1-10 each:
- Correctness (facts/code/arithmetic right; for code: would it run & meet spec)
- Completeness (all requirements covered; nothing required missing)
- Expertise (best practices, depth, judgment a senior practitioner would show)
- Communication (clarity, structure, fitness for stated audience)
Judge must justify each score in <=2 sentences and declare a per-task ranking.

## Orchestrator final judgment
- Verifies coding outputs by running them where feasible.
- Verifies data-analysis arithmetic against the fixture with independent code.
- Scores condition-C selection accuracy (right mini-skills loaded?) per run:
  precision/recall vs orchestrator's expert selection, recorded in scores.
- May override judge scores with written justification in REPORT.md.

## Randomization
Label assignment per task uses a fixed seed recorded in eval/scores/blinding.json
(committed before judging).
