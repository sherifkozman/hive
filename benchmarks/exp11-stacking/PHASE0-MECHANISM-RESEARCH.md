# Exp 11 Phase 0 — Cross-Skill Stacking Mechanism: Desk Research Report

**Task:** W6 (Goal 5). Read-only. Question: what mechanism should let agents
compose minis ACROSS different Hive CCS skills on the fly?

**Verified-reasoning tagging:** OBSERVED(source) / DEDUCED(basis) /
INFERRED(confidence). Nothing below is built on an ASSUMED claim without
flagging it as such.

---

## STATUS

Research complete. All five candidate mechanisms have direct evidence (either
from this repo's own benchmark history or from external sources). One
candidate — (c), compile-time cross-skill presets — has **already been tried
inside this project** (Exp 8's unshipped "kit" mechanism) and produced a
mixed, non-shippable result; that is the single most important prior-art fact
in this report and should gate how Exp 11 is scoped. One candidate — (b),
client-native multi-skill activation — turns out to already be a **shipped,
documented Claude Code feature** (explicit skill-stacking + subagent
skill-preload), not a hypothetical, which changes the framing of the whole
question from "what should we build" to "what do we need to build at all, and
where."

---

## RANKED MECHANISMS

1. **(b) Client-native multi-skill activation** — already real and free.
   Claude Code ships explicit slash-stacking (`/skillA /skillB args`, up to 6
   skills) and lets a subagent preload multiple full skill bodies via its
   `skills:` frontmatter field; Codex/OpenCode/OpenHands all support
   activating more than one skill per session through their own native tool-
   call or prompt-injection loops. Cross-skill composition is a harness
   capability Hive does not need to build — Hive's job is only to make each
   skill's `description`/INDEX good enough that the harness's own selector
   picks the right 2–3 skills, which is a direct, one-level-up extension of
   the flat-index result Exp 5/Exp 8 already proved works.

2. **(e) Orchestrator fan-out with per-skill worker contexts** — already
   real, needs only documentation, not new tooling. Claude Code's subagent
   `skills:` field injects full skill content at subagent startup; SPEC
   §10.4's routed fan-out (validated in Exp 2's condition E) already
   anticipated this shape for minis within one skill, and it generalizes
   cleanly to one skill per shard. Bounded to genuinely decomposable broad
   tasks; pays a duplicated-core-plus-index tax per shard (Exp 2: ~36%
   cumulative overhead) in exchange for parallelism and quality parity.

3. **(a) Meta-catalog skill (index-of-indexes)** — plausible future
   insurance, not justified now. `skills/README.md` plus each skill's own
   `INDEX.md`, read flat with no cross-skill graph, already hit 6/6
   right-skill and 6/6 target-mini with zero off-target loads at the current
   13-skill/165-mini catalog (Exp 8, §8c). A dedicated meta-catalog SKILL.md
   adds an always-paid extra hop with no measured selection gain at this
   scale — the same shape of finding SPEC §11.3 already recorded for
   mini-level edges, one layer up. AgentSkillOS's capability-tree work (external,
   200–200k-skill ecosystems) suggests this earns its cost only far past
   Hive's current install scale.

4. **(d) Always-on context files (CLAUDE.md/AGENTS.md) carrying a cross-skill
   catalog** — necessary infrastructure for one client class, dangerous if
   scope-creeped. For "payload-pointer" clients that have no native skill
   directory at all (Cursor, Gemini CLI, per the installer's own client
   registry), a rules-file pointer is the *only* delivery path today, and the
   installer already writes such pointers. But a rules file is paid on every
   turn of every session regardless of task relevance — worse than the INDEX
   overhead SPEC §3.2/§5.2 already bounds at ~200 words per-skill-invocation,
   because it isn't gated behind invocation at all. Use it only as a thin
   path-pointer, never as a knowledge-bearing catalog.

5. **(c) Compile-time cross-skill "stack presets"** — already tried inside
   this project and shelved. Exp 8 evaluated a cross-skill "kit" mechanism
   and got a mixed result: net-positive only when a kit's fixed composition
   happened to match the task, and it was not shipped. This is exactly the
   failure mode SPEC §7.7 already predicts for combinatorial preset families
   ("a combinatorial family of presets SHOULD NOT be generated
   speculatively") — a cross-skill kit squares that combinatorics (skills ×
   skills instead of minis-within-one-skill) without a matching quality
   payoff. Lowest priority; would need a much narrower trigger (a genuinely
   recurring, named cross-skill task shape) before it's worth reopening.

---

## TOP-2 DETAILED

### Probe 1 — validate (b): does good cross-skill description text let the
harness's native selector pick the right skill set, at zero new tooling?

**Design.** Freeze 4–6 tasks that each genuinely need minis from **two**
already-installed Hive skills (candidates: financial-analysis + code-review;
pdf + mcp-builder; internal-comms + financial-analysis). Run under stock
Claude Code, both skills installed as-is, no new Hive artifact. Count from
the trajectory using the exact method `skill-invocation-surfaces.md` already
validates for SkillsBench: grep `Skill(name=…)` tool-call events (or, for the
auto-injected case, confirm via `/context`/`doctor` that both bodies entered
context). Then run a second wave with only the `description`/INDEX
loading-policy line reworded to name likely companion skills (e.g. "often
paired with `pdf` for report-formatted output") and compare hit rate.

**Metric.** Binary per task: both target skills invoked (HIT) vs one/neither
(MISS) — the same objective scoring already used in Exp 5's `LOADED`-line
method and Exp 8's 8c stack-scale test, extended from mini-selection to
skill-selection.

**Cost.** Near-zero. No new code, no compiler changes. 4–6 frozen tasks × 2
waves × n=3 repeats (Exp 10's confirmation-wave size) ≈ 24–36 runs, all on
existing installed skills. This is the cheapest possible Phase-1 probe and
should run first — it either confirms "no new mechanism needed" (matching the
candidate's rationale) or surfaces a genuine harness-level gap that would
justify (a)/(d)/(e) investment.

**Failure modes to watch:** (i) bypass — the model answers from its own
knowledge without invoking either skill (Exp 10 saw this in 4/12 C2 cells);
(ii) single-skill capture — the model picks one skill and never widens to the
second even when relevant; (iii) Codex-specific undercount — its skills are
prompt injections with no trajectory tool-call event, so this harness needs
the `<skill>`-marker grep method the invocation-surfaces doc specifies, or it
will look like under-invocation when it isn't.

### Probe 2 — validate (e): does subagent-per-skill fan-out beat single-context
loading on genuinely cross-skill broad tasks, and at what token cost?

**Design.** Freeze 2–3 broad tasks that decompose cleanly along skill
boundaries (e.g. "build an MCP server, then produce a PDF report of its API
surface" → mcp-builder + pdf). Three conditions, reusing the Exp 1/2/6/7/8
frozen-task/blind-judge protocol: (i) single main-loop context loads both
skills' relevant minis directly (today's default); (ii) orchestrator spawns
one subagent per skill via the native `skills:` frontmatter preload field,
synthesizes; (iii) no-skill baseline. Score blind against the existing fixed
rubric; an independent frontier-tier judge scores quality, and token
accounting is deterministic (chars/4 of files actually loaded plus
conversation overhead, per the BENCHMARKS.md protocol).

**Metric.** Quality score/40 per condition (parity claim to test: does (ii)
match (i) within the ±3-point noise band, as Exp 2's routed fan-out did — 35
vs 36 single-context); total tokens per condition (expect (ii) to show the
~30–40% duplicated-core-and-index overhead pattern Exp 2 measured, now
duplicated per *skill* rather than per mini-shard); wall-clock/turns as a
secondary signal for the parallelism claim.

**Cost.** Moderate — authoring 2–3 new cross-skill broad tasks plus a fixed
rubric (following Exp 6/7/8's task-freezing discipline) and running n=3 per
condition (Exp 10-style). More expensive than Probe 1 because it needs new
frozen tasks and blind judging, but still small relative to a full experiment
(no new compiler code, no new skill artifacts — the mechanism is a subagent
definition, which already exists as a Claude Code primitive).

**Failure modes to watch:** synthesis-coherence risk (Exp 2's judge had to
explicitly check cross-section consistency for condition E); the mutual-
exclusivity trap of SPEC §10.5 — an orchestrator must not fan out AND load
the full bundle of either skill for the same work; and per-client variance,
since the `skills:` subagent-preload field is a Claude-Code-specific
primitive — Codex/OpenCode/OpenHands would need their own equivalent (a
first-class subagent-with-preloaded-context concept) checked before claiming
portability.

---

## KEY FACTS (tagged)

- OBSERVED (SPEC.md §10.4, §11.3, §11.4): Hive's own spec already anticipates
  a fan-out branch ("an orchestrator MAY fan out parallel narrow subagents,
  each loading 1–2 minis") and explicitly discourages cross-mini dependency
  graphs below library scale ("NOT RECOMMENDED... MAY be reserved for future
  library-scale use — dozens+ of minis, cross-domain dependencies").
- OBSERVED (BENCHMARKS.md §9, Exp 8 "Honesty note"): "a cross-skill 'kit'
  mechanism... produced a mixed result (net-positive only when a kit's fixed
  composition matched the task) and is not shipped in this release. Full
  analysis of those two is retained in internal experiments." The raw data
  for this sub-experiment is **not present in the repo** — only this summary
  sentence survives; flagged under NOT CHECKED below.
- OBSERVED (BENCHMARKS.md §6, Exp 5 edge probe): 10/10 selection hits across
  flat vs edge-annotated indexes at 5-domain/59-mini scale; edges showed a
  mild precision cost (pull-in effect, +11–38% more files loaded on 3/5
  tasks) and no selection or application benefit.
- OBSERVED (BENCHMARKS.md §9, Exp 8 §8c): flat-index routing at full
  13-skill/165-mini catalog scale — 6/6 right-skill, 6/6 target-mini, 0
  off-target loads, extending the Exp 5 result from domain scale to a full
  shipped catalog.
- OBSERVED (Exp10 PRODUCT-DECISION.md): "Claude Code injects the activated
  skill's SKILL.md body into context without tool calls" — the structural
  finding driving all downstream cost comparisons. C3 (bundle inlined)
  measured median 0 file-reads; C2 (CCS INDEX→minis shim) measured median 2.5
  reads, "each turn re-sending conversation context." Engaged-case deltas:
  C3 vs C2 −34% and −38% tokens on two of four cases at quality parity (3/4
  = 3/4). Confirmation waves (2 skills × 2 harnesses × n=3): "E3 fires —
  PRIMARY OUTCOME: per-client, per-size packing," and per-client/per-size
  table recommends BUNDLE-inline for small skills, preset-else-bundle for
  mid, composable tree only for large (50k+, where it's the only option and
  routing is accurate).
- OBSERVED (code.claude.com/docs/en/skills, fetched 2026-07-06): explicit
  skill-stacking is a shipped Claude Code feature as of v2.1.199 — "You can
  also stack several skills at the start of one message... typing
  `/code-review /fix-issue 123` loads both skills and passes the trailing
  text `123` as `$ARGUMENTS` to each... Claude Code expands the first skill
  plus up to five more stacked after it." Skill-content lifecycle: a loaded
  skill body "enters the conversation as a single message and stays there for
  the rest of the session"; auto-compaction re-attaches the most recent
  invocation of each skill, keeping the first 5,000 tokens each, with a
  shared 25,000-token budget across re-attached skills (oldest dropped
  first). Skill-description budget scales at ~1% of the model's context
  window (`skillListingBudgetFraction`), each description+when_to_use capped
  at 1,536 characters.
- OBSERVED (code.claude.com/docs/en/sub-agents, fetched 2026-07-06): a
  subagent's `skills:` frontmatter field "preload[s] Skills into the
  subagent's context at startup. The full skill content is injected, not
  only the description." This is a native, already-shipped mechanism for
  exactly the "orchestrator fan-out with per-skill worker contexts" pattern —
  an orchestrator can spawn N subagents, each with a different
  single-skill (or small-set) `skills:` list, without any new Hive tooling.
- OBSERVED (agentskills.io/specification, fetched 2026-07-06): the spec is
  **silent** on cross-skill composition — no dependency/`requires:`
  frontmatter, no catalog/index-of-indexes concept, no multi-skill semantics
  of any kind. Only `name`, `description`, `license`, `compatibility`,
  `metadata`, `allowed-tools` are defined fields. Cross-skill stacking is
  therefore entirely a harness-layer emergent property today, not a
  spec-level primitive.
- OBSERVED (skill-invocation-surfaces.md, this repo's scratchpad): activation
  and invocation surfaces differ sharply per harness — claude-code/opencode/
  openhands treat a skill as a first-class tool call (auditable trajectory
  event); codex treats skill bodies as `<skill>`-marked user-role prompt
  injections with **no** trajectory tool-call event (only an out-of-band
  OTel counter `codex.skill.injected`). Any cross-skill mechanism whose
  measurement relies on grepping tool calls will systematically undercount
  Codex.
- OBSERVED (packages/hive-installer/src/core/registry.ts): the installer
  already classifies clients into `native-skills` (has a real skills
  directory: Claude Code, Codex, OpenCode, etc.) vs `payload-pointer`/
  `payload-project-pointer` (rules-file-only clients: Cursor, Gemini CLI,
  etc., with no skills concept at all) — mechanism (d)'s rules-file pointer
  is not a hypothetical add-on for that second client class, it is the
  existing, only delivery mechanism the installer already implements there.
- OBSERVED (external, arxiv 2603.02176 "Organizing, Orchestrating, and
  Benchmarking Agent Skills at Ecosystem Scale," fetched 2026-07-06,
  AgentSkillOS): at 200/1,000/200,000-skill ecosystem scale, "DAG
  orchestration substantially outperforms native flat skill invocation even
  when given the oracle skill set" (identical skill selection, flat
  invocation still loses). Supporting structure is a hierarchical
  "capability tree" (active top-K index + dormant semantic-suggestion
  index) — functionally an index-of-indexes, i.e. mechanism (a) at a much
  larger scale than Hive's current catalog. Paper does not discuss token/
  context economics and assumes skills are pre-collected (no discovery
  pipeline).
- DEDUCED (from Exp 2 §5 fan-out probe + Exp10 injection finding, combined):
  a cross-skill fan-out (mechanism e) would pay the same ~30–40% duplicated
  core+index tax Exp 2 measured for within-skill mini fan-out (9,770 total
  vs 7–9k single-context), now duplicated per *skill* rather than per
  mini-shard, since each subagent's `skills:` preload re-injects that
  skill's full 00-core + relevant minis independent of what a sibling shard
  already loaded. Confidence: high — same mechanism (parallel contexts don't
  share prefix cache across subagents), just at one coarser granularity.
- INFERRED (moderate confidence): mechanism (a)'s meta-catalog skill would
  only pay for itself past the point where a flat `skills/README.md` +
  native description-listing stops being sufficient — i.e., well beyond the
  13-skill scale Exp 8 already validated as sufficient, plausibly in the
  hundreds-of-skills range AgentSkillOS studies, not at Hive's near-term
  install scale (single digits to low tens of skills per user).

---

## NOT CHECKED

- The Exp 8 "kit" mechanism's raw design, task set, and score data are not
  in this repo (BENCHMARKS.md states they are "retained in internal
  experiments"); I could not read what compositional shape the kit actually
  took (fixed N-skill bundle? preset drawing named minis from named skills?)
  or what the exact score gap was on the mismatched-task failure cases. This
  is the single most load-bearing prior-art fact for ranking (c) and should
  be tracked down (ask whoever ran Exp 8, or search further back in git
  history / other scratchpad session directories) before Exp 11 commits to
  deprioritizing (c).
- Did not verify Codex's, OpenCode's, or OpenHands' equivalent of Claude
  Code's subagent `skills:` preload field (mechanism e's portability). The
  skill-invocation-surfaces audit documents each harness's *single-skill*
  invocation surface in depth but does not describe a subagent/sub-session
  preload primitive per harness — this needs a targeted follow-up read of
  each harness's subagent/sub-task documentation (openhands `install_skill`
  lifecycle looked closest but wasn't checked for a preload-into-subtask
  concept).
- Did not verify pi's current skill-invocation model at all — the source
  audit itself flags `inception-ai/pi-mono` as no longer publicly
  accessible as of 2026-04-30 and marks its `allowed-tools` enforcement claim
  unverifiable.
- Did not fetch the SkillFlow paper or the other arxiv hits from the
  "composition/stacking" search beyond AgentSkillOS (e.g. 2606.20631
  "Harnessing Agent Skills: Architectural Patterns," 2603.25723 "Natural-
  Language Agent Harnesses") — time-boxed the web sweep to the two
  highest-signal hits (official Claude Code docs, AgentSkillOS) rather than
  exhaustively surveying the 2026 literature.
- Did not read `docs/MODEL-ROUTING.md` (referenced by SPEC §11.1 for
  model-hint/effort-hint semantics) — only tangential to this question, but
  relevant if mechanism (e)'s cross-skill fan-out later wants per-shard
  model routing.
- Did not independently confirm the exact wording/behavior differences
  between Claude Platform API subagents (`skills:` field) vs Claude Code
  CLI subagents beyond what the single docs page states — took the fetched
  docs at face value (single source, not cross-checked against a second
  independent doc or changelog entry).

---

## LEARNINGS (mandatory)

- The most consequential finding of this research task is negative-shaped:
  before designing a *new* Hive mechanism for cross-skill stacking, check
  whether the harness already does it. Mechanism (b) turned out to be a
  shipped feature (explicit skill-stacking since Claude Code v2.1.199, plus
  subagent skill-preload), which reframes Exp 11 from "invent a stacking
  mechanism" to "measure whether Hive's existing INDEX/description
  discipline transfers one level up to skill-selection, and document the
  native fan-out primitive Hive can already piggyback on." A `CLAUDE.md`-
  style rule worth capturing project-side: **when a question asks "what
  mechanism should let agents do X," first check whether the target harness
  already ships X as a primitive** — this alone would have saved a design
  cycle if skipped.
- Second-most consequential: this project already ran the exact experiment
  mechanism (c) proposes (Exp 8's "kit" mechanism), got a mixed result, and
  shelved it — but that fact is only preserved as one summary sentence in
  BENCHMARKS.md, with the raw data explicitly parked in "internal
  experiments" outside this repo. That is a knowledge-preservation gap: a
  negative/mixed result this specific (and this directly relevant to a
  now-active follow-up experiment, Exp 11) should have left a recoverable
  artifact, not just a footnote. Recommend: before Exp 11 Phase 1 commits
  resources to re-deriving what Exp 8 already learned about cross-skill
  kits, locate and re-read that internal record.
