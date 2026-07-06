# hive-skills

Interactive installer for [Hive](https://github.com/sherifkozman/hive) CCS
(Compiled Composable Skills) skills across AI coding clients.

```
npx hive-skills
```

runs an interactive wizard: scan this machine for installed AI coding
clients (Claude Code, Codex, Cursor, Gemini, Windsurf, and others), pick
which clients and skills to install, review the exact writes, and confirm.

Non-interactive subcommands (all support `--json`, `--home`, `--dry-run`,
`--yes`):

- `scan` — detected clients and their existing skills/rules.
- `install` — install bundled skills into detected clients.
- `propose` — generate a conversion-proposal doc for a client's existing
  skills/rules that look like good candidates for CCS conversion.
- `doctor` — health-check installed skills and client configuration.
- `backup` / `restore` — snapshot and restore client skill state.
- `list` — the bundled skills catalog (name, category, version, minis, size).

All 13 Hive skills, the `tools/hive.py` CLI, and their licenses/provenance
are bundled into this package — installs work fully offline.

See the [Hive repository](https://github.com/sherifkozman/hive) for the CCS
specification, the skills themselves, and benchmark evidence
(`docs/BENCHMARKS.md`).

MIT licensed; see `LICENSE`. Vendored third-party skill material carries its
own license — see `THIRD_PARTY_NOTICES.md` and per-skill `PROVENANCE.md`.
