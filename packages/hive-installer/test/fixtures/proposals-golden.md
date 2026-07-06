# Hive Conversion Proposals

Generated: 2026-01-01T00:00:00.000Z

## /home/user/.claude/skills/large-legacy-skill

- Client: Claude Code (`claude-code`)
- Size: ~12000 tokens (chars/4 estimate)
- Classification: **strong** — >= 5000 tokens: a strong candidate for CCS conversion (spec §6).

Task-variance caveat: token size alone does not confirm this is a good CCS candidate — verify that tasks using it actually vary in which subtopics they need (the second half of the CCS scope rule, which cannot be measured statically).

### Conversion recipe

Dependencies:
- `python3` >= 3.11 (for `hive.py lint` / `parity` / `compile`)
- Bundled `tools/hive.py`: `/fake/assets/tools/hive.py`
- `ccs-skill-creator` meta-skill INDEX: `/fake/assets/skills/meta/ccs-skill-creator/composable/INDEX.md`

Agent prompt:

```
Point your agent at /fake/assets/skills/meta/ccs-skill-creator/composable/INDEX.md and ask it to convert /home/user/.claude/skills/large-legacy-skill; gates: parity >= 85%, lint clean.
```

Gates (must pass before the conversion is merged/used):
- `python3 /fake/assets/tools/hive.py parity <converted-dir> /home/user/.claude/skills/large-legacy-skill` >= 85%
- `python3 /fake/assets/tools/hive.py lint <converted-dir>` clean

> Conversion is repackaging, never summarization/compression — lossy conversion destroys the quality edge CCS measured (see `docs/BENCHMARKS.md` Experiment 3).

## /home/user/.codex/skills/medium-skill

- Client: Codex (`codex`)
- Size: ~3200 tokens (chars/4 estimate)
- Classification: **borderline** — 2000-4999 tokens: borderline. The CCS scope rule says small skills should stay single-file — convert only if tasks vary meaningfully in which subtopics they need.

Task-variance caveat: token size alone does not confirm this is a good CCS candidate — verify that tasks using it actually vary in which subtopics they need (the second half of the CCS scope rule, which cannot be measured statically).

### Conversion recipe

Dependencies:
- `python3` >= 3.11 (for `hive.py lint` / `parity` / `compile`)
- Bundled `tools/hive.py`: `/fake/assets/tools/hive.py`
- `ccs-skill-creator` meta-skill INDEX: `/fake/assets/skills/meta/ccs-skill-creator/composable/INDEX.md`

Agent prompt:

```
Point your agent at /fake/assets/skills/meta/ccs-skill-creator/composable/INDEX.md and ask it to convert /home/user/.codex/skills/medium-skill; gates: parity >= 85%, lint clean.
```

Gates (must pass before the conversion is merged/used):
- `python3 /fake/assets/tools/hive.py parity <converted-dir> /home/user/.codex/skills/medium-skill` >= 85%
- `python3 /fake/assets/tools/hive.py lint <converted-dir>` clean

> Conversion is repackaging, never summarization/compression — lossy conversion destroys the quality edge CCS measured (see `docs/BENCHMARKS.md` Experiment 3).

## /home/user/.continue/rules/tiny-style-note.md

- Client: Continue (`continue`)
- Size: ~400 tokens (chars/4 estimate)
- Classification: **keep-as-is** — < 2000 tokens: below the CCS scope threshold — keep as a single file.

No conversion recipe — below the CCS scope threshold.
