# hive-skills

`hive-skills` is an interactive, offline installer for [Hive](https://github.com/sherifkozman/hive)
CCS (Compiled Composable Skills) skills across AI coding clients (Claude Code,
Codex, Cursor, Gemini CLI, Windsurf, and others). It scans your machine for
installed clients, installs bundled skills into them, proposes CCS conversions
of your existing client skills/rules, and can back up and restore client skill
state.

All 13 bundled Hive skills, the `tools/hive.py` CLI, and their
licenses/provenance ship inside this package — installs work fully offline, no
network calls at runtime.

## Quickstart

```
npx hive-skills
```

runs with no arguments an interactive wizard: scan this machine for installed
AI coding clients, pick which clients and skills to install, review the exact
files that will be written, and confirm. Every mutating step is preceded by an
automatic backup (see [Safety model](#safety-model)).

Every subcommand also runs non-interactively, for scripting/CI:

```
npx hive-skills install --client claude-code --all --yes
```

## Command reference

Global options (accepted by every subcommand):

| Flag | Meaning |
|---|---|
| `--home <dir>` | Override the resolved home directory (testing/CI seam; also settable via `HIVE_SKILLS_HOME`). |
| `--registry <jsonfile>` | A partial registry document, deep-merged over the built-in client registry (also settable via `HIVE_SKILLS_REGISTRY`). Lets you patch a client's detected paths/strategy without waiting for a release. |
| `--json` | Machine-readable JSON output, where the command produces data. |
| `--dry-run` | Preview writes without performing them (zero filesystem writes). |
| `--yes` | Required to perform any write in a non-interactive shell. |
| `--no-backup` | Skip the automatic pre-mutation backup (not recommended). |
| `--force` | Override a safety refusal (foreign directory, hash mismatch, or an `absent`-entry deletion) — only after you've confirmed it's safe. |
| `--project <dir>` | Project directory, for project-scoped clients (currently: Cursor's project rule file). |

Subcommands:

- **`scan`** — detect installed clients and scan their existing skills/rules,
  with a chars÷4 token estimate per item found. `--json` emits
  `{ clients: [{ id, name, detected, strategy, confidence, skills: [...] }] }`.
- **`list`** — the bundled skill catalog: name, category, version, mini count,
  bundle token count, description.
- **`install [--client <id>...] [--skill <name>...] [--all] [--project <dir>] [--write-pointers]`**
  — install bundled skills into clients. `--client`/`--skill` are repeatable;
  `--all` fills in whichever of the two you didn't pass explicitly (e.g.
  `install --client claude-code --all --yes` installs every bundled skill into
  just `claude-code`). Requires `--yes` to actually write; without it, use
  `--dry-run` to preview the plan. For a payload+pointer client (see below),
  the pointer-file snippet is only written when both `--write-pointers` and
  `--yes` are given — otherwise the write is skipped and the snippet is
  printed for you to add by hand.
- **`propose [--client <id>...] [--out <file>]`** — scan a client's existing
  skills/rules and write a conversion-candidate doc (default
  `./hive-conversion-proposals.md`). Never executes a conversion itself — see
  [Conversion workflow](#conversion-workflow).
- **`doctor`** — health-check: Node/Python versions, per-client readability
  and writability, installed-skill integrity (tree hash, `VERSION`,
  `BUNDLE.md`'s generated marker, staleness vs. the bundled catalog), dangling
  pointer-file managed blocks, and the backups directory. Exits `1` only on a
  `fail` finding; `warn` findings exit `0`.
- **`backup [--client <id>...]`** — snapshot a client's current skill/payload/
  pointer state now, independent of installing anything.
- **`restore [--list | --backup <id>] [--force] [--dry-run]`** — `--list`
  shows every backup (id, created-at, label, entry count); `--backup <id>`
  verifies and applies one. Refuses on a payload hash mismatch or an
  unsafe deletion without `--force` (see below).

With no subcommand: the interactive wizard on a TTY, or help text (exit `0`)
otherwise.

## Safety model

- **Backups always.** Every mutating command snapshots exactly the paths it's
  about to touch before touching them, into
  `~/.hive-skills/backups/<timestamp>-<label>-<suffix>/`. Opt out only with
  the explicit `--no-backup`. Backups are never pruned automatically —
  `doctor` reports total count/size with a prune hint.
- **Consent-gated pointer writes.** For a `payload+pointer` client (rules-based,
  no first-class skills directory — currently Gemini CLI and Windsurf) or
  `payload+project-pointer` client (Cursor), the CCS skill tree is installed
  to a payload directory this installer owns, but the short pointer snippet
  into the client's own rules file (`GEMINI.md`, `global_rules.md`, a project
  `.cursor/rules/*.mdc`) is never written without explicit consent: an
  interactive per-file confirmation showing the diff, or `--write-pointers`
  together with `--yes` non-interactively. The snippet lives inside marked
  `# >>> hive-skills >>>` / `# <<< hive-skills <<<` comments, so re-installing
  updates it in place and uninstalling removes exactly that block.
- **Path guard.** Every filesystem write passes through an allowlist check
  (client skill/payload directories, the backups directory, or an explicitly
  confirmed pointer file, or an explicitly-passed `propose --out` path) —
  both the allowed roots and the write target are resolved through the real
  filesystem path (symlinks included) before the check, so neither a
  symlinked home directory nor a symlink placed inside an allowed root can
  bypass it.
- **Dry-run means zero writes.** `--dry-run` performs no filesystem mutation
  at all — verified directly (fixture-tree hash comparison before/after) in
  this package's test suite.
- **Atomic, single-writer.** Each skill tree is staged into a temporary
  sibling directory and atomically renamed into place; a single lockfile
  under `~/.hive-skills/.lock` (stale-detected by pid + age) prevents two
  concurrent runs from interleaving writes.
- **No git, no network.** The installer never touches the Hive repository
  itself and never runs `git` or makes a network call at runtime.

## Client support table

Generated from the installer's built-in client registry (kept in sync by a
test that asserts every registry id appears here). `strategy` is one of:
`native-skills` (a first-class skills directory — the full CCS tree plus a
`SKILL.md` shim is installed there directly), `payload-pointer` /
`payload-project-pointer` (rules-based client — the CCS tree goes to a payload
directory this installer owns; a pointer snippet into the client's rules file
is offered, never silently written), or `scan-only` (detected and scanned,
but not installed to, in this version). `confidence` is `verified` (observed
on a real machine this session and/or corroborated by fetched vendor docs),
`docs` (from vendor documentation, not independently observed this session),
or `assumed` (best-effort guess from naming conventions, not verified) — see
`doctor`'s per-client output for what it actually finds on your machine,
regardless of this table.

| id | name | strategy | provenance | confidence |
|---|---|---|---|---|
| `claude-code` | Claude Code | native-skills | observed-local | verified |
| `codex` | Codex | native-skills (payload-pointer fallback if `~/.codex/skills` can't be created) | observed-local | verified |
| `opencode` | OpenCode | native-skills | opencode.ai/docs/skills | docs |
| `vscode-copilot` | VS Code (GitHub Copilot) | native-skills | observed-local; code.visualstudio.com/docs/agent-customization/agent-skills | verified |
| `cline` | Cline | native-skills | docs.cline.bot/customization/skills | docs |
| `agents-dir` | Shared agents dir (~/.agents) | native-skills | observed-local | verified |
| `gemini` | Gemini CLI | payload-pointer | observed-local | verified |
| `windsurf` | Windsurf | payload-pointer | observed-local (payload dir); pointer-file path unverified | assumed |
| `cursor` | Cursor | payload-project-pointer (no home-relative pointer — Cursor's global rules live in app settings) | observed-local (payload dir); reported (Cursor global rules location) | docs |
| `roo` | Roo Code | scan-only | assumed from naming conventions | assumed |
| `zed` | Zed | scan-only (deferred pending further validation, even though zed.dev/docs/ai/skills now documents real skill support) | docs-tier | docs |
| `continue` | Continue | scan-only | assumed from naming conventions | assumed |
| `claude-desktop` | Claude Desktop | scan-only (skills managed in-app) | observed-local | verified |

`--registry <jsonfile>` (or `HIVE_SKILLS_REGISTRY`) lets you patch any of the
above — or add an entirely new client — without waiting for a release: pass a
JSON object keyed by client id, deep-merged onto the built-ins (or, for an
unrecognized id, a full new entry with at least `name`/`detect`/
`skillLocations`/`strategy`).

## Conversion workflow

`propose` scans a client's existing skills/rules and classifies each as a CCS
conversion candidate by size (chars÷4 token estimate): **strong** (≥5,000
tokens), **borderline** (2,000–4,999 tokens — the CCS scope rule says small
skills should stay single-file; convert only if tasks genuinely vary in which
subtopics they need), or **keep-as-is** (<2,000 tokens). Every candidate
carries a caveat that token size alone doesn't confirm task-variance, which
can't be measured statically.

For each strong/borderline candidate, the generated doc lists a ready-to-run
conversion recipe and its dependencies:

- `python3` ≥ 3.11 (for `tools/hive.py`'s `lint`/`parity`/`compile`).
- The bundled `tools/hive.py` and the bundled `ccs-skill-creator` meta-skill
  (both shipped inside this package's `assets/`, at the paths the generated
  doc quotes).
- The exact agent prompt to run the conversion: point an agent at
  `ccs-skill-creator`'s `composable/INDEX.md` and ask it to convert the
  candidate source.

**`propose` never executes a conversion itself** — conversion is agentic work,
gated on:

- **Parity ≥ 85%** (`tools/hive.py parity <converted-dir> <source>`) — the
  conversion must be repackaging, never summarization. This isn't a style
  preference: converting a real third-party skill and letting the decomposer
  compress content lost the quality edge entirely — the lossy conversion
  scored worse than the original packaging on both tasks tested, while
  content-parity conversions elsewhere matched or beat the monolith (Hive
  `docs/BENCHMARKS.md`, Experiment 3).
- **Lint clean** (`tools/hive.py lint <converted-dir>`).

## Backup, restore, and uninstall

- `hive-skills backup [--client <id>...]` snapshots a client's current state
  on demand; every mutating command (`install`, a pointer write, `restore`
  itself) also snapshots automatically first, unless `--no-backup`.
- `hive-skills restore --list` shows every backup (id, created-at, label,
  entry count, newest first). `hive-skills restore --backup <id>` verifies
  every backed-up file's hash before writing anything (fails fast rather than
  applying a corrupt backup partway), then restores byte-identical content —
  file contents, permission bits, and symlinks alike. `--dry-run` prints the
  write/delete plan with zero writes; `--force` is required to restore over a
  hash mismatch, or to delete a path that changed since it was installed
  (restore refuses by default rather than silently discarding unrecognized
  changes).
- **Uninstall** a skill by restoring the backup taken right before it was
  installed (`hive-skills backup`'s automatic pre-install snapshot, or
  `restore --list` to find it) — the skill tree is recorded as an `absent`
  entry in that backup's manifest, so restoring it removes the tree. A
  payload+pointer client's rules-file pointer snippet is a documented
  exception: if the pointer file didn't already exist before that install, it
  isn't captured by the pre-install backup (restoring it would otherwise
  delete the *entire* file, destroying anything else in it), so restore
  leaves the block behind — `doctor`'s dangling-pointer-block check flags
  this so you know to remove it by hand or re-run install.

## Limitations (v0.1)

- **Darwin-validated only.** Every command in this README has been exercised
  on macOS. Paths are written platform-aware (`path` + resolved home
  directory, and the registry has `win32` entries where a client's Windows
  convention is documented), but Windows itself is not yet validated.
- **Several registry entries are `scan-only` in this version**: `roo`, `zed`,
  `continue`, and `claude-desktop` are detected and scanned, but this
  installer does not write to them yet (see the [client support
  table](#client-support-table) above for why, per entry).
- **No npm publish, no auto-update, no telemetry** — this package installs
  what's bundled in the tarball you have; nothing is fetched at runtime.
- **Single-run evidence.** The conversion-quality findings cited above
  (Experiment 3) are a single-run case study, not a repeated-sampling study;
  see Hive's `docs/BENCHMARKS.md` §12 for the full limitations of the
  underlying benchmark suite this installer's evidence-cited claims draw on.

## License

MIT — see `LICENSE`. Vendored third-party skill material carries its own
license: see `THIRD_PARTY_NOTICES.md` and each source's `PROVENANCE.md`.

See the [Hive repository](https://github.com/sherifkozman/hive) for the CCS
specification, the skills themselves in editable form, and the full benchmark
evidence base.
