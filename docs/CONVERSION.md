# Converting an Existing Skill to CCS

A guide to repackaging an *existing* skill (a monolith, a `SKILL.md` +
references tree, or a prompt library) into Compiled Composable Skills. For the
normative rules see `SPEC.md`; for authoring a new skill see `AUTHORING.md`. The
running example is the `financial-analyst` conversion, the case where the rule
below was learned the hard way.

The convert flow is:

```mermaid
flowchart LR
    I[Inventory source units] --> M[Map each unit to a mini]
    M --> F[Carry content at full fidelity]
    F --> P[Parity gate: source vs bundle]
    P --> L[Lint]
    L --> C[Compile BUNDLE + presets]
```

---

## 1. The one rule: repackaging, never summarization

**Conversion moves content between containers. It does not shrink content.**

The union of your minis (the compiled `BUNDLE.md`) must be
*content-equivalent* to the source. Every fact, threshold, table, and
worked detail in the source survives verbatim-equivalent in some mini. The only
tokens CCS saves at runtime come from:

- **selection**: a task loads only the relevant minis, not the whole source; and
- **dedup**: text shared across minis is factored once into `00-core`.

Never from cutting content.

**Why this is the whole ballgame.** When the `financial-analyst` skill was first
converted, the decomposer worked to word budgets: 250–450 words × ≤11 minis ≈
4,950 words, applied to a ~7,000-word dense reference skill. That forced ~30%
compression. Token efficiency transferred exactly as predicted (−52% on the
narrow task, −23% on the broad task), but **quality did not transfer: the
original packaging won both tasks (+4 narrow, +3 broad).** Root cause: the
judges' deciding details (deferred-revenue-adjusted coverage ratios,
balance-sheet tie-outs, dense benchmark tables) lived precisely in the ~30% that
compression removed. The deficit was compression, not the packaging pattern:
when round 1 enforced strict content parity, composable matched or beat the
monolith. The fix, adopted as a framework amendment, is that decomposition must
expand mini count and size to carry the source verbatim-equivalent (here: ~18
minis, or 450–700-word minis) and must be gated by a parity diff.

---

## 2. The parity gate

Before you ship a conversion, run a **parity diff**: compare the source against
the union of your minis (i.e. `BUNDLE.md`). Every substantive claim, number,
table, and example in the source must be present in the bundle. Resolve every
deletion: either it was genuine duplication (fine; it should now appear once in
`00-core`) or it is content loss (not fine; restore it, splitting or enlarging a
mini as needed).

Practical procedure:

1. Enumerate the source's substantive units (sections, tables, thresholds,
   worked examples).
2. Map each to the mini that now carries it (§4).
3. Diff: anything in the source not accounted for in a mini is a parity failure.
4. Fix by expanding minis (**increase mini count or size, never compress**)
   until the diff is clean.

A conversion that cannot pass parity within your intended mini count needs
*more* or *larger* minis, not tighter prose.

---

## 3. Map the source structure to CCS

| Source structure | Maps to CCS element |
|---|---|
| Monolith top matter / always-loaded preamble | `00-core` (cross-cutting only) + INDEX framing |
| Monolith section / heading | one mini (`NN-topic.md`) |
| `SKILL.md` router / purpose table | `INDEX.md` (add a "load when" hint per entry) |
| `SKILL.md` always-loaded body | split: cross-cutting → `00-core`; subtopic prose → its mini |
| `reference/<topic>.md` file | one or more minis (split if the reference is coarse) |
| Prompt-library entry / template | one mini per coherent procedure |
| Repeated preamble across references | factored once into `00-core` (dedup) |
| Scripts, fixtures, templates, data | left as-is; referenced from minis by path (§6) |
| The whole source, recompiled | `BUNDLE.md` (the parity target) |

Two structural notes:

- A coarse reference file usually becomes **several** minis. The
  `financial-analyst` source had 4 references of 728–2,503 tokens; a faithful
  conversion is ~12–18 minis. Splitting a 2,500-token reference into one mini
  reproduces the monolith's lost-in-the-middle problem inside a single file.
- The source's purpose table becomes the INDEX, but you must **add** the "load
  when" hints: the original had a purpose table but no triggers, and triggers
  are what drive expert selection.

---

## 4. Worked example: `financial-analyst`

**Source.** Two-level progressive disclosure: `SKILL.md` (~1,800 tokens, always
loaded) + 4 coarse references (728–2,503 tokens each), a purpose table but no
"load when" hints, no `00-core`, no bundle. Not a pure monolith, not composable.

**What the first conversion did, and what went wrong.** A frontier-tier LLM
decomposed it into 12 minis + index + bundle, blind to the eval tasks. Because it decomposed against
word budgets, it compressed the ~7,000-word source by ~30%. Outcome: tokens
−52% / −23% (as predicted) but quality −4 / −3 (both tasks lost). The dense tail
(deferred-revenue-adjusted coverage, balance-sheet tie-outs, benchmark tables)
was exactly what the judges rewarded and exactly what compression removed.

**The correct conversion.**

1. **Inventory** the source's substantive units: ratio families, DCF projection
   + WACC, terminal value + sensitivity, comps/precedents, budget variance,
   driver-based forecasting, rolling forecasts, reporting, industry adaptations,
   plus the cross-cutting analyst method and data-validation discipline.
2. **Core.** The cross-cutting parts of the always-loaded `SKILL.md`, namely the
   5-phase analyst method, the data-validation discipline, and the cross-cutting
   traps (compare within industry, trends over snapshots, present ranges not
   points), become `00-core.md`, marked always-load. This is also where dedup
   lands: preamble the references each restated is now stated once.
3. **Minis.** Each ratio family, each DCF stage, comps, variance, forecasting,
   reporting, and industry adaptations become their own minis (the shipped skill
   has `01`–`11`). Where a single reference held two separable subtopics (DCF
   projection vs. terminal value/sensitivity), it splits into two minis
   (`04`, `05`) so a task doing only projection needn't load terminal-value
   material.
4. **Index.** The purpose table becomes `INDEX.md`, and every line gains a "load
   when" hint ("Load when building a DCF or estimating discount rate", "Load when
   the target is in a specific sector").
5. **Compile & parity-gate.** Generate `BUNDLE.md` and diff it against the
   ~7,000-word source:

   ```bash
   python3 tools/hive.py compile skills/<category>/<domain>
   python3 tools/hive.py parity  skills/<category>/<domain> <source-dir>
   python3 tools/hive.py lint    skills/<category>/<domain>
   ```

   Any deciding detail that compression would have dropped must still be present
   in a mini. If the mini count can't hold it, add minis or enlarge them: the
   fix is expansion, never tighter prose.

**Result to aim for.** Same measured token savings from selection and dedup
(−52% narrow, −23% broad), but quality parity because no content was lost,
recovering the 3–4 points the lossy conversion gave away.

**Versioning your conversion (optional).** You may record a starting version for
the converted skill in a `composable/VERSION` file (bare semver `X.Y.Z`) and bump
it as you revise, with `python3 tools/hive.py bump skills/<category>/<domain>
[major|minor|patch]`, the only supported mutator. It is convention only and does
not affect loading; see `SPEC.md` §11 (Versioning).

---

## 5. Edge cases

- **Script-heavy skills.** Scripts, templates, fixtures, and data files are out
  of scope for compilation. Leave `scripts/`, `assets/`, etc. exactly as they
  are; convert only the knowledge markdown into minis, and reference the scripts
  from the relevant mini by path. Deterministic operations belong in executable
  assets, not in prose minis.
- **Source with no cross-cutting content.** Omit `00-core`; make the "start
  here" mini always-load instead (as `code-review` does with its method mini).
  Don't invent cross-cutting material to fill a core.
- **Source already close to CCS** (e.g. `SKILL.md` + fine-grained references
  with triggers). Conversion is mostly mechanical: rename references to
  `NN-topic.md`, write the INDEX with "load when" hints, compile the bundle, and
  parity-check. Do not compress to "tidy up."
- **Prompt libraries.** Each coherent procedure becomes a mini; shared setup
  becomes `00-core`. Watch for hidden duplication across entries: that is
  legitimate dedup, and the only content that should disappear.
- **Very large sources** that exceed your intended mini count at faithful
  fidelity. This is a signal to raise the mini count, not to compress. Parity
  outranks any target mini count.

---

## 6. Conversion checklist

- [ ] Every substantive unit of the source is mapped to a mini (§3 table).
- [ ] Parity diff passes: `BUNDLE.md` is content-equivalent to the source;
      every deleted line is genuine duplication now living once in `00-core`.
- [ ] No content was compressed, truncated, or summarized to hit a size or mini
      count; where fidelity needed more room, mini count/size grew.
- [ ] Cross-cutting preamble is factored once into `00-core` (dedup), not
      restated per mini.
- [ ] Coarse references were split into focused minis, not carried as
      monolith-in-a-file.
- [ ] INDEX has a "load when" hint per mini (added if the source lacked them).
- [ ] Scripts/assets left as-is and referenced by path; only knowledge markdown
      converted.
- [ ] Token savings come only from selection + dedup, verified against the
      source token count.
