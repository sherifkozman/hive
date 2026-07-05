# Review and Maintain a CCS Skill

Use this when changing a skill that already exists in CCS format: editing its
knowledge, adding a preset, or checking it still conforms. The governing
discipline is the source/artifact split: `mini/*.md` is the only source of
truth; `INDEX.md`, `BUNDLE.md`, and `presets/*.md` are derived.

## The maintenance loop (edit minis, recompile, relint)

To change any knowledge:

1. **Edit the mini**, never `BUNDLE.md` or `presets/*.md`. Those are generated;
   hand-edits are overwritten on the next compile and break the parity guarantee.
2. **Recompile** so the bundle (and presets) match the minis again:

   ```bash
   python3 tools/hive.py compile skills/<category>/<domain>
   ```

3. **Relint** and fix every FAIL:

   ```bash
   python3 tools/hive.py lint skills/<category>/<domain>
   ```

   `lint` flags a **stale BUNDLE.md** (`does not match mini/*.md — re-run
   compile`) whenever a mini changed but the bundle was not regenerated. Note the
   asymmetry: editing only `INDEX.md` does *not* stale the bundle (the bundle is
   built from minis, not the index), but it can still break other lint rules
   (drift, word budget, always-load marking), so relint after any edit.

**Acceptance:** `lint` exits 0 after every change.

## Keep the INDEX in sync

Every mini file MUST have exactly one index line, and every index line exactly
one mini file: `lint` fails on drift. So:

- **Add a mini** → add its one knowledge-free index line (descriptor + "load
  when" hint), keep it under the word budget, then recompile.
- **Remove a mini** → delete its file *and* its index line, then recompile.
- **Rename a mini** → rename the file and update the index line's filename, then
  recompile (the bundle's `<!-- module: … -->` marker tracks the new name).

Keep edits within the "index is a menu, not a meal" rule: never migrate
knowledge into the index to "clarify" it. If a mini's trigger is unclear, sharpen
the "load when" condition, not by adding skill content.

**Acceptance:** one index line per mini and one mini per index line; index still
under ~200 words (~300 for >12 minis); no line reads like knowledge.

## Editing content without regressing fidelity

When the skill was produced by *conversion*, re-run the parity gate after
substantive edits so you don't silently drop content:

```bash
python3 tools/hive.py parity skills/<category>/<domain> <source-dir>
```

Keep the ratio ≥ 85% (aim 95%+) with no unexplained dropped heading. When adding
new original knowledge (no external source), there is nothing to parity against:
just ensure the new mini is self-contained and the bundle recompiles clean.

## Adding presets, especially for variant-split skills

A **preset** is a named compiled subset of minis for a recurring configuration,
built by the same concatenation rules as the bundle. Generate presets with the
`--presets NAME=IDS` flag on `compile` (ids may be ordinals like `01`, stems, or
filenames; comma-separated; order preserved):

```bash
python3 tools/hive.py compile skills/<category>/<domain> \
  --presets security-audit=00-core,02 python-server=00-core,01,02,11,12
```

This writes `presets/security-audit.md` and `presets/python-server.md`. Presets
SHOULD be few and named for real recurring tasks. Do not generate a
combinatorial family speculatively.

**The variant-split case is where presets earn their keep.** When a skill
contains mutually-exclusive tracks, such as language variants (Python *vs* Node)
or platform variants (iOS *vs* Android), a broad task should never load the whole
bundle, because half of it is irrelevant to the chosen variant. Ship one preset
per variant: each is `00-core` + the shared minis + only that variant's minis, so
a "build the whole Python server" task loads `presets/python-server.md` in one
read with zero cross-variant waste. Reference these presets in the INDEX's
loading header or a note so the loader knows to prefer them for broad
variant-specific work.

**Acceptance:** each preset covers exactly one real recurring configuration;
`presets/*.md` are tool-generated (never hand-edited); `lint` exits 0.

## Conformance re-check

Before considering maintenance done, confirm the skill still satisfies the spec:
knowledge-free INDEX under budget with one "load when" line per mini; focused,
self-contained, uncompressed minis each with an H1; a small `00-core` where
warranted, marked always-load; a tool-generated, boundary-marked, never-
hand-edited `BUNDLE.md` and any presets; passing parity (for converted skills);
untouched non-knowledge assets. A single command reports lint status across every
skill in the repo:

```bash
python3 tools/hive.py report skills
```

`report` prints a per-skill token/size table with a `lint (P/W/F)` column and
exits nonzero if any skill has a lint FAIL. Use it as the final green light.

**Acceptance:** `report skills` shows the maintained skill with `0F` (zero
fails).
