# Contributing to Hive

Hive (the CCS, Compiled Composable Skills, framework) is small on purpose:
one spec, one stdlib CLI (`tools/hive.py`), a set of reference skills, and an
evidence base that every claim traces back to. Contributions should keep that
shape. This document is the complete set of rules for contributing: ground
rules, adding or converting a skill, changing the spec or tooling, versioning,
the PR process, reporting problems, and the code of conduct. If you only read
one section, read the ground rules below: they govern everything else.

The skills tree has three top-level categories:

```
skills/
├── authored/    # skills written from scratch for this project
├── converted/   # skills converted from an existing SKILL.md, AGENTS.md, or vendor docs
└── meta/        # the agentic authoring/conversion entry point (ccs-skill-creator)
```

Each skill directory (`skills/<category>/<name>/`) contains a `composable/`
subtree per `docs/SPEC.md` §2. All CLI commands take a skill directory or its
`composable/` subdirectory, e.g. `python3 tools/hive.py lint skills/authored/code-review`.

## 1. Ground rules

These three rules are load-bearing. Every other section in this document is a
consequence of one of them.

### Evidence-first culture

No normative claim ships without a benchmark it traces to, or an explicit
**convention** label. Concretely:

- If you propose a new rule ("always do X", "never do Y") in `docs/SPEC.md`,
  `README.md`, or skill documentation, you must either (a) point to a
  benchmark cell in `docs/BENCHMARKS.md` that shows X beats not-X, or (b) mark
  the rule explicitly as **convention** (a readability/consistency choice, not
  a measured result). Unlabeled prose that reads as a quality or efficiency
  claim without a citation is not acceptable, no matter how confident it
  sounds.
- If you extend a skill or the spec believing it improves quality or token
  cost, the strong version of the contribution includes a benchmark cell, not
  just an argument. See §7, "Running the benchmark protocol," for how to
  produce one.
- A PR that adds a "should" or "must" rule with neither a benchmark citation
  nor a convention label attached will be rejected outright (see §6).

### Lossless-conversion rule

Converting existing material into a Hive skill (`skills/converted/`) is
repackaging, never summarization. A conversion regroups and deduplicates
content into minis; it does not compress, trim, or paraphrase to hit a size or
mini-count target. This is not a style preference: Experiment 3 in
`docs/BENCHMARKS.md` measured a ~30%-compression conversion losing its quality
edge against the original source, which is why the parity gate (§3) exists and
is non-negotiable for conversions.

### Scope rule

Hive is not the right packaging for every domain. Use it only when both hold:
the domain carries more than roughly 5k tokens of non-inferable, trap-dense
knowledge, and tasks vary in which subtopics they need (so selective loading
has something to select). If a domain's knowledge fits comfortably under ~5k
tokens, or every task needs all of it, it belongs upstream as a single
`SKILL.md` or `AGENTS.md` file, not as a Hive skill. Bringing a small,
non-trap-dense domain into `skills/` anyway adds INDEX + `00-core` scaffolding
that costs more than selective loading saves (see README, "When to use it,
and when not," and `docs/SPEC.md` §12.1). A PR proposing a new skill must
justify, in the PR description, why the domain clears this bar (see §2 and
§6).

## 2. Contributing a new skill (`skills/authored/`)

A new skill lives at `skills/authored/<name>/composable/`. Follow
`docs/AUTHORING.md` for the full authoring walkthrough (deciding whether a
skill is warranted, scoping the domain, slicing minis, writing `00-core` and
`INDEX.md`, compiling).

Before opening a PR, the skill must satisfy every item below. This is a
checklist, not guidance: a PR missing any unchecked item without an
explanation is not ready for review.

- [ ] `python3 tools/hive.py lint skills/authored/<name>` passes clean (or
      every warning is explained inline in the PR description).
- [ ] `composable/VERSION` exists and starts at `1.0.0` for a new skill (set
      it by hand on creation, or run `python3 tools/hive.py bump
      skills/authored/<name>` against a fresh skill, which initializes to
      `0.1.0`, then bump it to `1.0.0` once the skill is PR-ready).
- [ ] `INDEX.md` is under the ~200-word budget (`docs/SPEC.md` §3.2), carries
      exactly one line per mini, and each line has a "load when" hint phrased
      as an observable task condition (§3.3), not a vague topic label.
- [ ] `INDEX.md` contains no domain knowledge: it is a knowledge-free menu.
      If applying a mini requires reading something the index says instead of
      the mini, that content is in the wrong place (§3.1). This is checked in
      review by hand; `lint` does not fully automate it.
- [ ] A `mini/00-core.md` exists if the domain has cross-cutting traps:
      guidance relevant more often than a task-scoped reader would guess
      (input validation, "prove it before claiming it," data-quality caveats,
      and similar). If the domain has no such cross-cutting concern, omitting
      `00-core` is fine and should be noted as a deliberate choice in the PR.
- [ ] `BUNDLE.md` (and any `presets/*.md`) were produced by `python3
      tools/hive.py compile skills/authored/<name>` and never hand-edited.
      Regenerate after every mini change and commit the regenerated output.
- [ ] Every mini is self-contained: applicable from its own text plus
      `00-core`, without requiring another mini to be in context (`docs/SPEC.md`
      §4.1).
- [ ] Non-knowledge assets (scripts, templates, fixtures) are left as-is and
      referenced from minis by path, never compiled into prose (`docs/SPEC.md`
      §9).
- [ ] The domain justifies CCS packaging per the scope rule in §1: more than
      roughly 5k tokens of trap-dense knowledge, and tasks that vary in
      coverage. A skill that doesn't clear this bar should be a single
      upstream file, not a Hive skill.

**The PR must include, in the description, not just in code:**

1. **Rationale**: why this domain needs a skill at all, what traps or
   procedures does a frontier model miss without it, and why is the domain
   too large or too trap-dense for the model's default behavior to cover.
2. **A self-assessment against the scope rule**: your own accounting of
   the domain's token size (rough word/token count of the knowledge) and
   whether tasks in this domain vary in what they need. If you can't clear
   the ~5k-token bar or tasks don't vary, say so and explain why a Hive skill
   is still the right call (or, better, reconsider and ship a single file
   upstream instead).

## 3. Converting an existing skill (`skills/converted/`)

A conversion lives at `skills/converted/<name>/composable/`. Follow
`docs/CONVERSION.md` for the walkthrough. Everything in §2 applies, plus the
following, which are additional gates specific to conversions:

- [ ] **Parity gate.** `python3 tools/hive.py parity skills/converted/<name>
      <path-to-original-source>` must score **at least 85%**, and you should
      aim for **95% or higher**. Paste the `parity` output in the PR
      description. `parity` diffs the union of your minis against the source
      and flags content that is genuinely missing, as opposed to content
      that was deduplicated into `00-core`, which is expected and does not
      count against the score. A conversion below 85% is a lossy conversion
      and will not be merged regardless of how good the resulting packaging
      looks (see the lossless-conversion rule in §1 and Experiment 3 in
      `docs/BENCHMARKS.md`).
- [ ] **Vendored source.** The original, unmodified source material is
      checked in under `external/<origin>/` (e.g. `external/anthropic/`,
      `external/financial-analyst/`), byte-for-byte, alongside a
      `PROVENANCE.md` recording where it came from and what it was used for.
- [ ] **License notice.** `THIRD_PARTY_NOTICES.md` has an entry for the new
      `external/<origin>/` directory naming the upstream source, the license
      it carries, and a note that the license (not this project's MIT
      license) governs the vendored files. If the upstream directory carries
      its own `LICENSE.txt`, that file is vendored too.
- [ ] **License permits redistribution.** Before vendoring anything, confirm
      the upstream license actually allows you to redistribute the source in
      this repository. If the upstream material has no license, or a license
      that prohibits redistribution or derivative works, it cannot be
      converted here: do not vendor it and do not open the PR.

## 4. Changing the spec or tooling

`docs/SPEC.md` is the normative document; every rule in it is annotated with
either the measurement that motivates it or an explicit "convention" marker
(see `docs/SPEC.md` §12, "What CCS does not claim," for the boundary between
the two).

1. **Open an issue first**, describing the problem and, if applicable, which
   existing rule or gap in `docs/SPEC.md` it touches.
2. **If the change affects loading behavior, packaging, or a claimed
   quality/token effect**, you must run the benchmark protocol (§7) on at
   least one representative domain before proposing the rule as normative.
   Report where the change lost, not only where it won.
3. **If the change is purely structural or convention** (a naming rule, a
   frontmatter key, a directory shape) and makes no quality or efficiency
   claim, it can be proposed without a new benchmark, but the spec text must
   label it convention, not phrase it as evidence-backed.
4. Update `docs/SPEC.md`'s conformance section (§14) and any affected guide
   (`docs/AUTHORING.md`, `docs/CONVERSION.md`) in the same PR, so the spec and
   the guides never drift apart.
5. **Tooling changes** (anything touching `tools/hive.py`) must include, in
   the PR description, the exact verification commands you ran and their
   pasted output, at minimum `lint`, `compile`, and `parity` (where
   applicable) run against every existing skill under `skills/authored/`,
   `skills/converted/`, and `skills/meta/`, showing no regression. A tooling
   PR without pasted verification output will not be merged.

## 5. Versioning and changelog rules

- Any content change to a skill (a mini edited, added, or removed; `INDEX.md`
  changed; `00-core` changed) requires bumping `composable/VERSION` via
  `python3 tools/hive.py bump skills/<category>/<name> [major|minor|patch]`.
  Never hand-edit `VERSION`.
  - **patch**: fixes, clarifications, wording corrections, no change in
    what the skill covers.
  - **minor**: new minis added, coverage expanded, non-breaking additions.
  - **major**: restructuring (renumbering or regrouping minis, splitting or
    merging the domain) or removals (a mini or a covered subtopic dropped).
- `bump` defaults to `patch` and creates `VERSION` as `0.1.0` if it does not
  exist yet, so a brand-new skill's first release should be bumped by hand or
  by repeated `bump` calls to `1.0.0` (per §2) before merge, not left at
  `0.1.0`.
- Every release (spec version, CLI version, or a batch of skill changes
  meant to ship together) gets a `CHANGELOG.md` entry under a new version
  heading, following the existing Keep-a-Changelog format already in the
  file. Entries describe what changed and why, in the same plain tone as the
  rest of this document.

## 6. PR process

**What reviewers check**, roughly in order:

1. Does the PR touch only what it claims to touch (a skill's own directory,
   or the specific spec/doc/tooling files named in the PR)?
2. For a new or changed skill: does `lint` pass, does the checklist in §2 (and
   §3, for conversions) appear filled out in the PR description, and is the
   rationale/self-assessment actually specific to this domain (not
   boilerplate)?
3. For a conversion: does `parity` meet the 85% floor, is the vendored source
   present with provenance and license notice, and does the upstream license
   actually permit redistribution?
4. For a spec or tooling change: is every new rule either benchmark-cited or
   convention-labeled, and are verification commands pasted for tooling
   changes?
5. Is the version bumped and is there a changelog entry?

**What gets a PR rejected outright** (not "requested changes," rejected):

- `lint` failures that aren't explained, or `lint` was never run.
- `parity` below 85% on a conversion, or `parity` never run on a conversion.
- Knowledge leaking into `INDEX.md` (index lines that carry domain content
  instead of a load-when hint).
- A conversion that summarizes, trims, or paraphrases source content instead
  of repackaging it losslessly.
- A normative claim ("should," "must," "always," "never") with no benchmark
  citation and no convention label: an unverifiable claim presented as
  settled fact.
- Hand-edited `BUNDLE.md` or `presets/*.md` (these are generated artifacts;
  edits belong in `mini/`).
- Vendored third-party content with no provenance note, no license notice in
  `THIRD_PARTY_NOTICES.md`, or a license that does not permit redistribution.

## 7. Running the benchmark protocol on your own skills

Full methodology: `docs/BENCHMARKS.md` §1. Short version, if you want to
validate a skill or a packaging change yourself:

1. **Freeze your tasks before the skill (or skill change) exists**, or before
   you've looked closely at it. Tasks written after you know the skill's
   contents get written to its strengths. This is the single most important
   control in the protocol.
2. **Run each condition blind.** Strip condition labels from worker outputs,
   randomize presentation order, and commit the label-to-output mapping (a
   "blinding map," see `benchmarks/exp1-2/scores/blinding*.json` for the
   format) before judging, not after. Score with a fixed rubric applied
   identically across conditions (this project used four 1-10 dimensions
   (correctness, completeness, expertise/best-practice, communication) summed
   to a 40-point scale.
3. **Account tokens deterministically.** Use chars÷4 of every file a worker
   actually loaded, cross-checked against the worker's self-reported "loaded"
   list and against file sizes, not a model's own token-count claim. Apply
   the same accounting method to every condition so ratios are comparable
   even if absolute counts are approximate.
4. **Report the noise band and the losses.** Single-run cells carry real
   judge noise: treat score gaps of 3 points or fewer (out of 40) as ties,
   and report ±1 rank as the expected noise band from an independent
   re-judge. Report where your proposed change lost, not just where it won.
5. **Commit the raw materials**: tasks, worker outputs, blinding maps, judge
   scores, and token accounting, the way `benchmarks/exp1-2/`, `exp3-4/`,
   `exp5/`, and `exp6/` do for the existing experiments, so your result can be
   checked or overturned by someone else. A benchmark claim without its raw
   data attached isn't load-bearing here.

## 8. Reporting problems

- **Benchmark-replication reports are especially welcome.** If you re-ran any
  experiment in `docs/BENCHMARKS.md` on a different model family, a larger
  domain set, or with repeated sampling, and got a different result (or
  confirmed the existing one), open an issue with your raw materials attached
  and point to the methodology in `docs/BENCHMARKS.md` §1 so reviewers can
  check your protocol matched. This is the single most valuable kind of
  contribution the project can receive, since every result here is currently
  single-run.
- **Security or content issues** (a skill recommending something unsafe, a
  vendored file that shouldn't be redistributable, a factual error presented
  as benchmark-backed when it isn't): open an issue describing the problem
  plainly. If the issue involves a credential, private data, or something
  that shouldn't be posted publicly, say so in the issue and a maintainer
  will follow up privately for details.
- For anything else (typos, broken links, unclear docs), a normal issue or PR
  is fine.

## 9. Code of conduct

Be respectful, be honest about uncertainty, and back claims with something
checkable. That's the whole policy; see `docs/BENCHMARKS.md` for what
"backed" means in practice here.

## Questions

If something in this document conflicts with `docs/SPEC.md`,
`docs/AUTHORING.md`, or `docs/CONVERSION.md`, those documents win: open an
issue and we'll fix the drift here.
