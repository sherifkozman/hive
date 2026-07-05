# Convert an Existing Skill to CCS

Use this to repackage an existing skill (a monolithic `SKILL.md`, a `SKILL.md`
plus a `reference/` tree, or a prompt library) into CCS. For a brand-new skill
with no source, see `01-create-new-skill.md`. The governing rule is iron rule 2:
**conversion is repackaging, never summarization** (see `00-core`).

## The failure you are avoiding

The `financial-analyst` conversion once decomposed a ~7,000-word source against
word budgets (250–450 words × ≤11 minis), forcing ~30% compression; token savings
transferred as predicted but the compressed tail held the judges' deciding
details and the converted skill *measurably lost quality on both eval tasks*: a
content loss, not a packaging flaw. That is why the parity gate below is
mandatory, and why you carry content at **full fidelity with no size caps**.

## Step 1: Inventory the source

Enumerate the source's substantive units: every section/heading, table,
threshold, worked example, and always-loaded preamble. This list is your parity
checklist: nothing on it may vanish. Note where the source keeps its knowledge
(monolith body, reference files, prompt entries) and any always-loaded preamble
that repeats across files (that repetition is your one legitimate dedup target).

**Acceptance:** a written list of every substantive unit in the source.

## Step 2: Map source structure to CCS elements

| Source structure | Maps to |
|---|---|
| Monolith top matter / always-loaded preamble | `00-core` (cross-cutting only) + INDEX framing |
| Monolith section / heading | one mini (`NN-topic.md`) |
| `SKILL.md` router / purpose table | `INDEX.md` (add a "load when" hint per entry) |
| `SKILL.md` always-loaded body | split: cross-cutting → `00-core`; subtopic prose → its mini |
| `reference/<topic>.md` file | one or more minis (split if coarse) |
| Prompt-library entry / template | one mini per coherent procedure |
| Repeated preamble across references | factored once into `00-core` (dedup) |
| Scripts, fixtures, templates, data | left as-is; referenced from a mini by path |
| The whole source, recompiled | `BUNDLE.md` (the parity target) |

Two rules of thumb: a coarse reference file (say 2,500 tokens) usually becomes
**several** minis: one mini reproduces the lost-in-the-middle problem inside a
single file. And the source's purpose table becomes the INDEX, but you must
**add** the "load when" hints if the source lacked them; triggers drive expert
selection.

**Acceptance:** every inventory unit from Step 1 is assigned to a specific mini.

## Step 3: Create the layout and carry content at full fidelity

Create `skills/<category>/<domain>/composable/mini/` (layout identical to a from-scratch
skill: `INDEX.md`, `mini/00-core.md` + `mini/NN-topic.md`, generated `BUNDLE.md`,
optional `presets/`). Copy each source unit into its assigned mini **verbatim or
verbatim-equivalent**. Split coarse references into focused minis (e.g. a DCF
reference → `04-dcf-projection.md` + `05-terminal-value-sensitivity.md`). Factor
preamble repeated across three or more source files once into `00-core`. Make
each mini self-contained (applicable from its own text + `00-core`) and give it
an H1.

**There are no size caps.** If faithful fidelity needs more room, add minis or
enlarge them: the fix for "too much content" is *more or larger minis*, never
tighter prose. Do not compress "to tidy up." Leave scripts/assets untouched and
reference them from a mini by path.

**Acceptance:** every mini has an H1; every inventory unit is present at full
fidelity in some mini; only genuine cross-file duplication was removed (and now
lives once in `00-core`).

## Step 4: Write the INDEX

Turn the source's purpose table into `INDEX.md`: an H1, the standard
loading-policy header verbatim after it, then one knowledge-free line per mini
with a filename, terse descriptor, and a **"load when"** observable-condition
hint. Mark `00-core` **always load** if present. Keep under ~200 words (~300 if
more than 12 minis). Standard header, pasted verbatim after the H1:

```
Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If you judge most of this skill relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.
```

## Step 5: Compile, then run the parity gate and lint

Run from the repo root:

```bash
python3 tools/hive.py compile skills/<category>/<domain>
python3 tools/hive.py parity  skills/<category>/<domain> <source-dir>
python3 tools/hive.py lint    skills/<category>/<domain>
```

`parity` compares the union of your minis against the original source. It reports
a **token ratio** (mini tokens ÷ source tokens) and lists any source `##`/`###`
heading with no fuzzy match in the minis (possibly dropped). Acceptance bar:

- Ratio **≥ 85%** is the hard floor (below it, `parity` FAILs and summarization
  is suspected). **Aim for 95%+**: a faithful conversion loses tokens only to
  genuine dedup, so the union of minis should be nearly the whole source.
- The dropped-heading list must be **empty**, or every entry on it explained as
  genuine duplication now living once in `00-core`. Treat each listed heading as
  a real gap: open the source section, find where it should live, and restore it
  into the right mini. Re-run `compile` then `parity` until clean.

`lint` must exit 0 (INDEX/mini/core structural rules, `00-core` marked
always-load, `BUNDLE.md` not stale). A conversion that cannot pass parity within
your current mini count needs **more or larger minis, not tighter prose**.

**Acceptance:** `parity` ratio ≥ 85% (target 95%+) with no unexplained dropped
heading, **and** `lint` exits 0. Only then is the conversion done.

## Edge cases

- **No cross-cutting content in the source** → omit `00-core`; mark the "start
  here" mini always-load instead. Don't invent core material.
- **Script-heavy skill** → convert only the knowledge markdown; leave
  `scripts/`, `assets/`, fixtures exactly as they are and reference them by path.
- **Source already close to CCS** (fine-grained references with triggers) →
  conversion is mostly mechanical: rename to `NN-topic.md`, write the INDEX with
  "load when" hints, compile, parity-check. Still do not compress.
- **Very large source** that overflows your intended mini count at full
  fidelity → raise the mini count. Parity outranks any target mini count.
