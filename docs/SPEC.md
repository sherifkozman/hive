# Hive Skill Format: CCS v1.0 Specification

**Compiled Composable Skills (CCS)**: a format for packaging AI-agent domain
knowledge as authored modules plus compiled artifacts, with a runtime rule for
choosing what to load. **Hive** implements this specification; its CLI is
`tools/hive.py`.

This document is normative. The key words **MUST**, **MUST NOT**, **SHOULD**,
**SHOULD NOT**, and **MAY** are used in the RFC 2119 sense. Each rule is
followed by an **Evidence:** line citing the measured result that motivates it
(from `REPORT.md`, the round-1 experiment; and `FRAMEWORK.md`, the round-2
experiment and probes) or marked **Evidence: convention** where the rule is a
readability/consistency choice that was not independently measured.

Numbers in Evidence lines come from a study of moderate confidence: 4–5 domains,
one worker model (mid-tier), skills authored by one model family, blind
frontier-tier judging, deterministic token accounting. Single-cell score gaps of
≤3 points are within judge noise. Treat directions as solid and magnitudes as
indicative.

---

## 1. Scope and terminology

**1.1** A **skill** is a body of domain knowledge packaged for an agent to load
into context. A **mini** (mini-skill) is one focused markdown module. The
**INDEX** is a knowledge-free menu of the minis. **00-core** is a small mini the
index marks always-load. **BUNDLE.md** is the deterministic concatenation of all
minis. A **preset** is a named compiled subset of minis. The **coverage rule**
is the runtime policy for choosing among minis, preset, bundle, and fan-out.

**1.2** CCS governs the packaging of *knowledge* (markdown prose: procedures,
domain conventions, traps, heuristics). It does not govern executable assets
(scripts, templates, data files), which are out of scope for compilation and are
addressed only in §9.

---

## 2. Directory layout

**2.1** A CCS skill **MUST** live under a single directory containing a
`composable/` subtree with this shape:

```
skills/<domain>/
└── composable/
    ├── INDEX.md          # required: the menu
    ├── mini/
    │   ├── 00-core.md    # optional: always-load cross-cutting mini
    │   └── NN-*.md       # required: the authored modules (source of truth)
    ├── BUNDLE.md         # required: compiled concatenation of all minis
    └── presets/          # optional: named compiled subsets
        └── <name>.md
```

*Evidence: convention.* The layout encodes the roles the experiments validated;
the exact paths are a consistency choice.

**2.1.1** A skills root **MAY** organize skills in category subdirectories
(e.g. `skills/authored/<domain>/`, `skills/converted/<domain>/`,
`skills/meta/<domain>/`) instead of, or in addition to, a flat `skills/<domain>/`
layout. Category nesting is purely organizational: the per-skill `composable/`
contract in §2.1 is unchanged regardless of how many directories deep the skill
root sits, and tooling (`tools/hive.py report`, in particular) **MUST** discover
every `composable/` directory at any depth under a given root rather than
assuming a fixed nesting depth.

*Evidence: convention.* Categorization is a scaling accommodation for a growing
skill count, not a measured variable.

**2.2** `mini/*.md` files are the **only** source of truth. `INDEX.md`,
`BUNDLE.md`, and `presets/*.md` are derived artifacts (see §6, §7).

*Evidence: convention* (the source/artifact split is the framework's premise;
its payoff is measured in §6–§7).

**2.3** Mini files **SHOULD** be named `NN-topic.md` with a two-digit ordinal
prefix. The ordinal defines index and bundle order (§6.2, §7.2). `00-core.md`
**MUST** use ordinal `00` when present.

*Evidence: convention.*

**2.4** A skill **MUST NOT** ship a separate hand-written monolithic document as
a loadable artifact. `BUNDLE.md` replaces it.

*Evidence:* the round-2 bundle (condition D) had the best mean score and rank of
all four conditions (35.00 / rank 1.75) and beat the loose-mini condition on
every broad task 4–0; a monolith is "just an uncompiled, unstructured bundle"
(FRAMEWORK.md). In round 1 the monolithic condition had the worst mean rank of
three (2.25) and fell up to 7 points below the no-skill baseline (REPORT.md).

---

## 3. INDEX rules

**3.1** `INDEX.md` **MUST** be a knowledge-free menu: it names minis and says
when to load them, and carries no domain knowledge that a mini needs in order to
be applied.

*Evidence:* round-1 selection was expert-grade (e.g. cr-n loaded exactly
{review-method, security}; tw-n loaded exactly {changelog, breaking-changes,
style}) with a knowledge-free index; "this is plausibly why" selection accuracy
was high (REPORT.md, Recommendation 1).

**3.2** `INDEX.md` **SHOULD** be under ~200 words.

*Evidence:* the validated indexes ran ~150–200 tokens; the index is "always-paid"
overhead that "buys nothing when the answer is load-everything" (FRAMEWORK.md
§Diagnosis), so it is kept minimal. Round 1 fixed the <~200-word convention as
Recommendation 1.

**3.3** `INDEX.md` **MUST** contain exactly one line per mini. Each line
**MUST** carry (a) the mini filename, (b) a short content descriptor, and (c) a
**"load when"** hint phrased as an observable task condition.

*Evidence:* explicit "load when" hints accompanied the high-accuracy selection
in round 1 (REPORT.md, Recommendation 1); the edge probe found that with
"well-written one-line 'load when' index descriptions" a flat index was
sufficient to hit every pre-registered target mini across 5 tasks (FRAMEWORK.md
§edge probe).

**3.4** If a `00-core.md` mini exists, its index line **MUST** mark it
**always load** and the index **MUST** instruct the reader to load it before
applying the coverage rule.

*Evidence:* the one observed selection miss in 8 composable runs (da-n skipping
the data-quality mini, 12.5%) was a cross-cutting concern; marking such content
always-load "addresses [it] by construction rather than by hoping selection
improves" (FRAMEWORK.md §3; REPORT.md §3).

**3.5** `INDEX.md` **MUST NOT** be hand-desynchronized from `mini/`: every mini
file has exactly one index line and vice versa. Tooling **SHOULD** verify this.

*Evidence: convention* (a stale menu reintroduces selection/recall risk of the
kind catalogued in RESEARCH.md §4).

**3.6** `INDEX.md` **MUST** carry a standard **loading-policy header** as the
first line after the H1 title, stating the coverage rule (§10) so any agent that
reads only the index knows how to load the skill. The reference wording is:

> Loading policy: read this menu, then load 00-core (if present) plus the minis
> relevant to your task. If most of this skill is relevant, load BUNDLE.md
> (or a matching presets/*.md) in one read instead.

An index **MAY** precede it with a one-line skill description and **MAY** append
skill-specific routing notes (e.g. "load only one language track"), but **MUST
NOT** omit the policy or bury it below the mini list.

*Evidence: convention. Makes skills self-executing in any file-reading harness:
an agent pointed at the INDEX alone (no external instructions) recovers the
runtime loading rule of §10 from the skill itself.*

---

## 4. Mini rules

**4.1** Each mini **MUST** be self-contained: applicable from its own text plus
`00-core`, without requiring another mini to be in context.

*Evidence:* self-containment is what let the loose-mini condition work at all
and what makes selective loading safe; RESEARCH.md §4 identifies "fragmentation:
a rule split across two skills, only one loads → partial guidance" as the
composable failure mode this rule prevents.

**4.2** Each mini **MUST** cover one subtopic and stay focused. A mini that
spans two unrelated subtopics **SHOULD** be split; two minis that are never
useful apart **MAY** be merged.

*Evidence:* bounded, headed, focused sections "survive attention better than
continuous prose": composable outputs beat monolithic on broad-task quality at
near-identical token load (35.0 vs 32.5; "structure beats smoothness",
FRAMEWORK.md §Diagnosis).

**4.3** Mini size is **guidance, not a cap**. A typical mini runs ~300–700
words; longer is permitted when the subtopic demands it. Content **MUST NOT** be
summarized, truncated, or thinned to hit a size target.

*Evidence:* the financial-analyst conversion applied word budgets (250–450 words
× ≤11 minis ≈ 4,950 words) to a ~7,000-word source, forcing ~30% compression;
the compressed tail held the judges' deciding details and CCS lost both tasks
(−4 narrow, −3 broad) purely from content loss, not packaging (FRAMEWORK.md
§Case study, finding 2–3).

**4.4** Token savings **MUST** come only from *selection* (loading fewer minis)
and *dedup* (factoring shared context into `00-core`), never from content loss.

*Evidence:* same case study: savings that came from selection/dedup transferred
as predicted (−52% narrow, −23% broad) while savings taken from compression cost
3–4 quality points (FRAMEWORK.md §Case study, findings 1–3).

**4.5** A mini **MAY** carry a fenced ```section boundary``` of shared preamble,
but preamble that recurs across three or more minis **SHOULD** be factored into
`00-core` instead.

*Evidence:* the sum of all minis exceeded the monolith by 8–22% per domain from
self-containment redundancy; factoring shared context into an always-loaded
`00-core` that the compiler dedups "attacks the 8–22% redundancy directly and
can make the bundle smaller than a hand-written monolith" (FRAMEWORK.md
§Diagnosis, §1).

---

## 5. 00-core rules

**5.1** `00-core.md` **SHOULD** exist for any domain that has cross-cutting
traps: guidance relevant more often than a task-scoped reader would guess
(e.g. data quality, input validation, "prove it before claiming it").

*Evidence:* the single round-1 selection failure was a cross-cutting concern
(data quality) packaged as an optional mini and skipped (REPORT.md
Recommendation 2); da-b showed the concrete cost: the no-skill baseline told a
VP that genuine growth was a data artifact, the error the skill's cross-cutting
caution guidance prevented (REPORT.md §Orchestrator verification).

**5.2** `00-core.md` **MUST** be small: it is paid on every load of the skill.
It carries only cross-cutting essentials, not a subtopic's full treatment.

*Evidence:* core is always-paid like the index; the same always-paid-overhead
logic that bounds the index (§3.2) applies (FRAMEWORK.md §Diagnosis). Validated
cores ran ~2.6 KB (~650 tokens).

**5.3** `00-core.md` **MUST NOT** duplicate subtopic content that belongs in a
focused mini; cross-referencing the mini by name is preferred.

*Evidence: convention* (duplication inflates the always-paid core against §5.2).

---

## 6. INDEX and preset compilation (informative to §7's normative core)

*(This section is descriptive; the binding rules are in §7.)*

The INDEX may be authored by hand or generated; presets and the bundle are
always generated. All three derive from `mini/`.

---

## 7. Compiled artifacts

**7.1** `BUNDLE.md` **MUST** be the deterministic concatenation of every mini,
in index/ordinal order, produced by tooling.

*Evidence:* the compiled bundle (condition D), loaded in one read, had the best
mean score/rank of four conditions and beat loose minis on every broad task 4–0
(FRAMEWORK.md §Results).

**7.2** Bundle order **MUST** equal index order (ordinal order), with `00-core`
first when present.

*Evidence: convention* (determinism and prefix-cache stability; POSITIONING-
RESEARCH.md §2 notes a stable bundle is prefix-cache friendly).

**7.3** `BUNDLE.md` **MUST** preserve module boundaries: each mini's content is
delimited by a machine-readable marker naming its source file. The reference
tooling emits `<!-- module: NN-name.md -->` before each mini's body.

*Evidence:* the validated bundles kept "module boundaries and headers preserved"
(FRAMEWORK.md §1); the quality of the bundle condition is attributed to bounded,
headed sections surviving attention (§4.2 Evidence).

**7.4** `BUNDLE.md` and `presets/*.md` **MUST NOT** be hand-edited. Edits go to
`mini/`; artifacts are regenerated.

*Evidence: convention* (the source/artifact discipline of §2.2; hand-edits break
the parity guarantee of §8).

**7.5** Compilation **MAY** deduplicate (factoring text shared across minis
into `00-core` so each mini shrinks) provided the union of `00-core` + minis
remains content-equivalent to the pre-dedup source (parity, §8).

*Evidence:* dedup is the sanctioned lever against the 8–22% self-containment
redundancy and can make the bundle smaller than a monolith (FRAMEWORK.md
§Diagnosis, §1). It is the only compression CCS permits (§4.4).

**7.6** A **preset** **MUST** be a named compiled subset of minis for a
recurring configuration (e.g. code-review `security-audit` = 00-core + 02
security), produced by the same concatenation rules as the bundle (§7.1–§7.3).

*Evidence:* presets are the "load one file, zero selection risk" affordance the
broad path relies on; condition D (whole compiled file in one read) beat
per-mini loading on every broad task (FRAMEWORK.md §Results).

**7.7** Presets **SHOULD** be few and named for real recurring tasks. A
combinatorial family of presets **SHOULD NOT** be generated speculatively.

*Evidence:* POSITIONING-RESEARCH.md §2: llms.txt's "publish a big compiled file
nobody consumes" failure and DITA's conditional-profiling sprawl both warn
against speculative compiled variants; "the BUNDLE only pays off if the runtime
actually loads it."

---

## 8. Parity gate

**8.1** After any authoring or compilation change, the union of all minis (i.e.
`BUNDLE.md`) **MUST** be content-equivalent to the source it derives from:
verbatim for a from-scratch skill, and verbatim-equivalent to the pre-conversion
source for a converted skill (see CONVERSION.md). A **parity diff** (source vs.
union-of-minis) **SHOULD** gate the change.

*Evidence:* the financial-analyst conversion shipped without a parity gate, lost
~30% of the source to compression, and lost both eval tasks; the framework
amendment is that "a parity diff (source vs union-of-minis) should gate the
conversion" (FRAMEWORK.md §Case study, finding 3).

---

## 9. Executable and non-knowledge assets

**9.1** Scripts, templates, fixtures, and other non-markdown assets **MUST NOT**
be compiled into `BUNDLE.md`. They remain as-is in the skill directory and are
referenced from minis by path.

*Evidence: convention* (CCS scope, §1.2; POSITIONING-RESEARCH.md §3 notes
Anthropic's guidance to keep fragile operations as deterministic Level-3
scripts, not skill prose).

**9.2** Only knowledge markdown is subject to §4–§8. A script-heavy skill
converts its prose to minis and leaves its `scripts/`, `assets/`, etc. untouched.

*Evidence: convention.*

---

## 10. Runtime loading policy (the coverage rule)

**10.1** A loading agent **MUST** read `INDEX.md` first, then load `00-core` if
the index marks one, then estimate coverage `k/N` = (minis relevant to the task)
/ (total minis).

*Evidence:* the index is ~200 always-paid tokens and the entry point; core is
always-load per §5 (FRAMEWORK.md §Updated loading policy).

**10.2** If `k/N` < ~0.6, the agent **SHOULD** load the `k` selected minis
individually (narrow path).

*Evidence:* narrow-path selective loading measured 41–64% token savings (mean
~51%) at equal-or-better quality (C 34.75 vs B 33.75 narrow mean; REPORT.md §2).

**10.3** If `k/N` ≥ ~0.6, the agent **SHOULD** load `BUNDLE.md` (or the matching
preset) in a single read rather than the minis individually.

*Evidence:* the 0.6 threshold sits below the ~85% break-even (minis avg ~470
tokens, bundle ~4,200–5,100; loading ≥~85% of minis costs more than the bundle)
with margin for selection-miss risk; condition D beat loose minis on every broad
task 4–0 with one file op and zero selection risk (FRAMEWORK.md §2, §Results).

**10.4** For a very broad task that is **decomposable** along module boundaries,
an orchestrator **MAY** fan out parallel narrow subagents, each loading 1–2
minis, and synthesize their outputs.

*Evidence:* the routed fan-out (condition E) matched single-context quality
within noise (35 vs 36) while cutting max per-context load to ~2,900 tokens vs
7–9k, with every shard's mini selection expert-grade and the synthesis judged
coherent (FRAMEWORK.md §Probe: routing).

**10.5** The three branches are mutually exclusive per task; an agent **MUST
NOT** both fan out and load the whole bundle for the same work.

*Evidence: convention* (fan-out's currency is small clean per-context loads,
FRAMEWORK.md §Probe: routing, negated by also front-loading the bundle).

---

## 11. Optional per-mini frontmatter and versioning

**11.1** A mini **MAY** carry YAML frontmatter with `model-hint` and/or
`effort-hint` fields advising the orchestrator which model / reasoning effort a
shard loading this mini warrants. Values **MUST** be capability/effort **tier**
names (e.g. `fast`/`standard`/`premium`, `low`/`standard`/`high`), never
vendor-specific model IDs, so a skill stays portable across harnesses; the
orchestrator resolves a tier against whatever models its harness exposes. The
operator's manual for these keys is `docs/MODEL-ROUTING.md`.

*Evidence:* the fan-out probe ran the frontier-tier model only on the hardest
shard (DCF) and the mid-tier model elsewhere and matched single-context quality;
the amendment is "minis MAY
carry optional model-hint/effort-hint frontmatter" feeding a routed-fan-out
branch (FRAMEWORK.md §Probe: routing). Tier-not-vendor naming is *Evidence:
convention* (portability; the harness owns the tier-to-model mapping).

**11.2** `model-hint`/`effort-hint` are advisory. An orchestrator **MAY** ignore
them, and their quality benefit is **unproven**: on the tested task all
candidates hit the exact ground truth, so the premium-model shard's advantage
could not express itself (ceiling effect). A single-agent run that does not fan
out simply ignores them (graceful degradation). Routing's demonstrated value was
cost shaping (premium tokens spent only on the hard shard), clean small
per-context loads (~2,900 tokens), and wall-clock parallelism, at the cost of
~36% cumulative-token overhead from core+index duplication per shard; see
`docs/MODEL-ROUTING.md`.

*Evidence:* FRAMEWORK.md §Probe: routing. Routing matched single-context quality
within noise (35 vs 36); its demonstrated value was cost shaping and clean small
loads, not a measured quality gain.

**11.3** Cross-mini dependency edges (`requires:`, `pairs-with:`) are **NOT
RECOMMENDED** at the scale CCS targets (≤5 domains, ≤~12 minis per domain). They
**MAY** be reserved for future library-scale use (dozens+ of minis, cross-domain
dependencies, weak selectors, or index descriptions too poor to route on).

*Evidence:* the edge probe added 62 edges (17 cross-skill, 4 requires) across 5
domains / 59 minis and ran 10 paired workers (flat index vs. edge-annotated).
Result: **no measurable selection or application benefit**: every one of 5
pre-registered target minis was HIT in both conditions, and applications were
equivalent (both caught the planted duplicate quarter / 10× outlier, both fixes
lock-protected, both included SSRF protection). Edges showed a mild *precision
cost*: edge workers loaded 12–37% more files on 3 of 5 tasks (pull-in effect).
Selection was already 12/13 expert-grade with a flat index + always-core
(FRAMEWORK.md §Probe: edges).

**11.4** If edges are used, they **MUST** be authored as index hints / preset
closures only, not as a runtime graph-traversal engine.

*Evidence:* FRAMEWORK.md §Probe: routing. A graph "earns its complexity only at
library scale … and then as 2–3 optional frontmatter edge types compiled into
index hints and preset closures, never as a runtime traversal engine"; Anthropic
best practices ("one level deep") and DITA conditional-profiling sprawl warn the
same (POSITIONING-RESEARCH.md §1–§2).

### Versioning

Hive supports optional semantic versioning at two levels. Both values are bare
semver strings of the form `X.Y.Z`. Versioning is metadata for humans and future
tooling; it is not wired into loading behavior and makes no quality claim.

**11.5** A mini **MAY** carry a `version:` key in the same frontmatter block as
`model-hint`/`effort-hint`/`requires`/`pairs-with` (e.g. `version: 1.2.3`). The
key is optional: when absent it produces no output; when present it **MUST** be a
valid `X.Y.Z` semver string. Tooling **SHOULD** validate the format (`lint`
reports `PASS` for a valid value, `FAIL` for a malformed one). Nothing in the
compile output currently reads this value.

*Evidence: convention.*

**11.6** A skill **MAY** carry a single-line `composable/VERSION` file holding a
bare semver string, the skill-level counterpart to §11.5. When present, `compile`
appends `(vX.Y.Z)` to the `BUNDLE.md` and preset title lines, and `report`
surfaces it in a `version` column (showing `-` when absent). Tooling **SHOULD**
validate the format the same way as §11.5.

*Evidence: convention.*

**11.7** `hive.py bump <skill-dir> [major|minor|patch]` (default `patch`) is the
only supported mutator for `composable/VERSION`: it rewrites the file in place,
printing `old -> new`, and creates it as `0.1.0` if it does not yet exist. It
**MUST NOT** edit per-mini `version:` frontmatter. Skill-level versions **SHOULD**
be changed through `bump` rather than by hand.

*Evidence: convention.*

---

## 12. What CCS does not claim

**12.1 Skills do not beat no-skill on tasks inside model competence.** For
domains well within a frontier model's ability, generic skill content adds
little; skills earn their token cost only on trap-dense, judgment-heavy work.

*Evidence:* the no-skill baseline (mean 34.75) statistically tied composable and
beat monolithic, winning 3 of 4 broad tasks outright; skill content moved scores
decisively only on da-b, where planted data-quality/causal traps existed (36/31
vs 28; REPORT.md §"baseline is strong"). The financial narrow task scored 38/40
with zero skill tokens (FRAMEWORK.md §Case study, finding 4).

**12.2 Composability is a packaging win, not a content multiplier.** It does not
make skill knowledge more valuable than it is; it delivers equal-or-better
quality than a monolith at lower narrow-task cost and immunity to context-drag.

*Evidence:* REPORT.md verdict: "Composability is the right framework for skill
construction; it does not make skill content more valuable than it is."

**12.3 Edge metadata is unproven at CCS scale.** See §11.3. No selection or
application benefit was measured; a mild precision cost was.

*Evidence:* FRAMEWORK.md §Probe: edges (as §11.3).

**12.4 Model/effort routing quality gains are unproven.** Routing demonstrated
clean small per-context loads, cost shaping, and parallelism, not a measured
quality improvement (ceiling effect on the tested task).

*Evidence:* FRAMEWORK.md §Probe: routing (as §11.2).

**12.5 Broad-task token cost is not reduced vs a monolith.** The bundle runs
+8–22% tokens vs a hand-written monolith (the self-containment redundancy);
dedup into `00-core` narrows or closes this but is not guaranteed to beat it.

*Evidence:* condition D cost +8–22% vs monolith per domain (+9/+8/+10/+22%, mean
+12%); this is "an authoring-time problem with a known fix … not a framework
limitation" (FRAMEWORK.md §Results).

**12.6 Magnitudes carry single-run noise.** Results come from n=1 per task cell;
score gaps ≤3 are within judge noise, and independent re-judging shifted some
rankings by ±1. Directions are solid; exact scores are indicative.

*Evidence:* REPORT.md §Confidence & limitations; FRAMEWORK.md §Noise caveat:
"D's mean edge … exceeds the observed score-noise on 2 of 4 tasks; treat the
direction as solid, magnitudes as indicative."

---

## 13. Agentic authoring entry point

The `skills/meta/ccs-skill-creator` skill is the agentic adoption layer for this
spec: it is itself a conforming CCS skill (dogfooded) that packages the authoring
workflow (`AUTHORING.md`), the conversion workflow (`CONVERSION.md`), and the
maintenance workflow as loadable minis over an always-load `00-core`. An
agent (Claude Code, Codex, or any file-reading harness) pointed at
`skills/meta/ccs-skill-creator/composable/INDEX.md` and asked to create, convert, or
maintain a skill loads the relevant mini and produces a spec-conformant skill
using only those files plus `tools/hive.py`. It is the executable counterpart to
this normative document.

---

## 14. Conformance

A skill conforms to CCS v1.0 if it satisfies every **MUST** in §2–§11 and
carries no false claim prohibited by §12. A conforming skill has: a knowledge-
free INDEX under ~200 words with one "load when" line per mini (§3); focused,
self-contained, uncompressed minis (§4); a small cross-cutting `00-core` where
warranted (§5); a tooling-generated, boundary-marked, never-hand-edited
`BUNDLE.md` and any presets (§7); a passing parity diff (§8); and untouched
non-knowledge assets (§9). Consumers apply the coverage rule at load time (§10).
