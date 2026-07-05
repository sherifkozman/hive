# Prior Art: Composable Mini-Skills vs. Monolithic Skills

Research brief for the composable-skills experiment. Hypothesis under test: a small
index of selectively-loaded mini-skills (task-dependent order/config) beats a single
monolithic skill document on quality and token efficiency.

## 1. Key Findings with Sources

### Progressive disclosure is the native design of Agent Skills
Anthropic's Agent Skills format is built on exactly the mechanism our "composable"
condition tests. A skill is a directory with a `SKILL.md` plus bundled files, loaded in
three stages: (1) **Discovery** — only name + description in context at startup; (2)
**Activation** — full `SKILL.md` loaded when the task matches; (3) **Execution** —
referenced files/scripts pulled in on demand. Bundled context is "effectively unbounded"
because only the active slice occupies the window. This is the first mainstream
implementation of progressive disclosure for agent context, adopted across Codex, Gemini
CLI, Copilot, and Cursor.
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://www.newsletter.swirlai.com/p/agent-skills-progressive-disclosure
- https://dev.to/phil-whittaker/progressive-discovery-a-better-mental-model-for-agent-skills-51bd

### Long-context degradation is real and starts early ("context rot")
Chroma tested 18 frontier models (GPT-4.1, Claude 4, Gemini 2.5, Qwen3) and found *every
one* degrades as input grows — even on trivial retrieval/replication. Critically,
degradation is **not** window overflow: a 200K-token model shows significant drop by
~50K tokens. Distractors, low needle-question similarity, and haystack structure all
worsen this non-uniformly. For coding agents, accumulated noise from search/backtracking
is cited as the *primary* failure mode.
- https://research.trychroma.com/context-rot
- https://www.zenml.io/llmops-database/context-rot-evaluating-llm-performance-degradation-with-increasing-input-tokens

### Lost-in-the-middle: position matters, not just volume
Liu et al. (TACL 2024) show a U-shaped performance curve — models use info at the start
and end of context well and lose info in the middle, with >30% drops when relevant
content moves to the middle. Implication for monolithic skills: guidance buried in the
middle of a long document is measurably less likely to be applied than the same guidance
loaded alone.
- https://arxiv.org/abs/2307.03172
- https://aclanthology.org/2024.tacl-1.9/

### Just-in-time loading beats preloading — but hybrid wins
Anthropic's context-engineering guidance frames the context window as a finite "attention
budget." Their recommendation is a **hybrid**: preload a small amount of high-value
context, then retrieve the rest just-in-time (Claude Code preloads `CLAUDE.md` but uses
glob/grep to pull files on demand). Pure retrieval-per-turn can paradoxically burn context
faster and fails when the retriever returns nothing or the wrong item. JIT file reads
improved code-completion accuracy >10% over in-file baselines in one cited study.
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.tokenoptimize.dev/guides/context-engineering-reduce-token-usage

### Modular/decomposed prompting outperforms monolithic on complex tasks
Decomposed Prompting (Khot et al.) and follow-ups report consistent gains over monolithic
CoT/few-shot baselines: +4.2 to +12.9 pts on math reasoning, ~2x on JEEBench, and 7–19%
pass@1 drops when modular structure is *removed* (Modularization-is-Better, code-gen).
Gains concentrate where reasoning complexity or input size exceeds a single prompt's
capacity.
- https://arxiv.org/abs/2210.02406
- https://arxiv.org/pdf/2503.12483

### More instructions/tools in context degrade selection
Tool-selection accuracy falls 7–85% as catalogue size grows; practitioners recommend
keeping active tools well under ~20–40, exposing "the minimum set needed for the current
step." Same mechanism threatens a monolithic skill that front-loads every rule: the
attention mechanism cannot reliably focus amid the "forest of information."
- https://www.microsoft.com/en-us/research/video/tool-space-interference-an-emerging-problem-for-llm-agents/
- https://arxiv.org/pdf/2401.06201 (EASYTOOL: concise tool instruction)

## 2. Arguments AGAINST Composability

RAG/selection literature supplies the counter-case, and it maps directly onto our
composable condition (the index-selection step is a retrieval step):

- **Selection error.** When retrieval picks the wrong chunk, "generation becomes
  guesswork." A composable system that mis-selects or fails to load a needed mini-skill
  underperforms a monolith that always had the rule present.
  https://snorkel.ai/blog/retrieval-augmented-generation-rag-failure-modes-and-how-to-fix-them/
- **Fragmentation / lost cross-references.** Splitting guidance loses surrounding
  context ("It increased by 40%" is useless without the antecedent). Cross-cutting
  guidance that spans two mini-skills may never co-occur in context.
- **Missing-context / low recall.** High precision with low recall = selective but misses
  relevant material; a narrow index can silently omit a needed skill.
- **Overhead.** The index itself and per-step retrieval consume tokens and can be slower;
  pure JIT "can consume context faster than standard methods."
  https://www.tokenoptimize.dev/guides/context-engineering-reduce-token-usage
- **Taxonomy of RAG errors** (retrieval miss, wrong chunk, distractor) applies wholesale.
  https://arxiv.org/html/2510.13975v1

## 3. What Prior Art Predicts for Our Experiment

The literature strongly favors composability on **token efficiency** (progressive
disclosure loads a fraction of the corpus) and on **narrow/deep tasks** (less middle-of-
context dilution, no tool/instruction overload). The risk is concentrated in the
**selection step** and in **broad/cross-cutting tasks** where a monolith's always-present
guidance is an advantage and no single mini-skill covers the whole job. Net expectation:
composable wins clearly when (a) the corpus is large relative to any one task's needs and
(b) selection is reliable; monolith closes the gap or wins when tasks need many skills at
once or selection is noisy.

## 4. Failure Modes to Watch, Per Condition

**Composable condition**
- *Selection miss*: index description too terse → needed mini-skill never activates
  (recall failure). Instrument: log which skills loaded vs. gold set.
- *Wrong-order/config*: task-dependent ordering picks a suboptimal sequence.
- *Fragmentation*: a rule split across two skills, only one loads → partial guidance.
- *Index bloat*: too many entries reintroduces the tool-overload degradation curve.
- *Retrieval overhead*: cumulative loads erase the token savings on multi-skill tasks.

**Monolithic condition**
- *Context rot*: total length pushes the model past the ~early-degradation threshold even
  under the nominal window.
- *Lost-in-the-middle*: mid-document rules under-applied vs. head/tail rules.
- *Distraction*: irrelevant sections act as distractors lowering precision on the active
  subtask.
- *Uniform cost*: pays full token price on every task, including trivial ones — the
  efficiency loss is guaranteed, not probabilistic.

## 5. Concrete Predictions

1. **Narrow/single-skill tasks — composable wins on quality by a modest margin
   (~5–15 pts on a task-quality rubric)** and wins decisively on tokens (loads roughly
   1/N of the corpus), because it avoids lost-in-the-middle and distractor dilution.
2. **Token efficiency — composable uses materially fewer input tokens on average
   (order of 40–80% reduction on narrow tasks)**, with the gap shrinking as the number of
   skills a task needs rises.
3. **Broad / multi-skill / cross-cutting tasks — roughly a tie on quality**; monolith may
   edge ahead when >~3–4 skills must co-occur, since composable pays retrieval overhead
   and risks fragmentation, eroding its token edge.
4. **Selection reliability is the swing variable — composable's quality advantage
   collapses (and can go negative) once selection miss-rate exceeds ~15–20%.** This is the
   single most important thing to measure; quality tracks recall of the correct skill set.
5. **Scaling — composable's relative advantage grows with corpus size.** At small corpora
   the monolith fits comfortably and ties; as the corpus crosses the early context-rot
   band (tens of K tokens), the monolith degrades and composable's lead widens.
