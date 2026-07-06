# mcp-builder eval case authoring — rationale

Source read (fairness-constrained, read-only): `skills/sources/anthropic/mcp-builder/SKILL.md` and every `.md` under its `reference/` subdir. Nothing under `skills/authored/`, `skills/converted/`, `skills/meta/`, `packages/`, or any `INDEX.md`/`BUNDLE.md`/`presets/`/`mini/` file was opened. No taint.

## Step 1 — Enumeration (H2/H3 only, SKILL.md then reference/*.md in alphabetical file order)

File order: `SKILL.md`, `reference/evaluation.md`, `reference/mcp_best_practices.md`, `reference/node_mcp_server.md`, `reference/python_mcp_server.md`.

Headings extracted with a fenced-code-block-aware scan (`awk` toggling on/off inside ``` fences) so no in-code `#`-comment lines were miscounted as headings. Verified by hand cross-check against direct file reads — no discrepancies.

| # | File | Line | Level | Heading |
|---|---|---|---|---|
| 1 | SKILL.md | 9 | H2 | Overview |
| 2 | SKILL.md | 17 | H2 | 🚀 High-Level Workflow |
| 3 | SKILL.md | 21 | H3 | Phase 1: Deep Research and Planning |
| 4 | SKILL.md | 78 | H3 | Phase 2: Implementation |
| 5 | SKILL.md | 127 | H3 | Phase 3: Review and Test |
| 6 | SKILL.md | 151 | H3 | Phase 4: Create Evaluations |
| 7 | SKILL.md | 198 | H2 | 📚 Documentation Library |
| 8 | SKILL.md | 202 | H3 | Core MCP Documentation (Load First) |
| 9 | SKILL.md | 211 | H3 | SDK Documentation (Load During Phase 1/2) |
| 10 | SKILL.md | 215 | H3 | Language-Specific Implementation Guides (Load During Phase 2) |
| 11 | SKILL.md | 230 | H3 | Evaluation Guide (Load During Phase 4) |
| 12 | reference/evaluation.md | 3 | H2 | Overview |
| 13 | reference/evaluation.md | 9 | H2 | Quick Reference |
| 14 | reference/evaluation.md | 11 | H3 | Evaluation Requirements |
| 15 | reference/evaluation.md | 18 | H3 | Output Format |
| 16 | reference/evaluation.md | 30 | H2 | Purpose of Evaluations |
| 17 | reference/evaluation.md | 34 | H2 | Evaluation Overview |
| 18 | reference/evaluation.md | 43 | H2 | Question Guidelines |
| 19 | reference/evaluation.md | 45 | H3 | Core Requirements |
| 20 | reference/evaluation.md | 57 | H3 | Complexity and Depth |
| 21 | reference/evaluation.md | 78 | H3 | Tool Testing |
| 22 | reference/evaluation.md | 101 | H3 | Stability |
| 23 | reference/evaluation.md | 116 | H2 | Answer Guidelines |
| 24 | reference/evaluation.md | 118 | H3 | Verification |
| 25 | reference/evaluation.md | 137 | H3 | Readability |
| 26 | reference/evaluation.md | 144 | H3 | Stability |
| 27 | reference/evaluation.md | 157 | H3 | Diversity |
| 28 | reference/evaluation.md | 174 | H2 | Evaluation Process |
| 29 | reference/evaluation.md | 176 | H3 | Step 1: Documentation Inspection |
| 30 | reference/evaluation.md | 184 | H3 | Step 2: Tool Inspection |
| 31 | reference/evaluation.md | 191 | H3 | Step 3: Developing Understanding |
| 32 | reference/evaluation.md | 200 | H3 | Step 4: Read-Only Content Inspection |
| 33 | reference/evaluation.md | 214 | H3 | Step 5: Task Generation |
| 34 | reference/evaluation.md | 220 | H2 | Output Format |
| 35 | reference/evaluation.md | 245 | H2 | Evaluation Examples |
| 36 | reference/evaluation.md | 247 | H3 | Good Questions |
| 37 | reference/evaluation.md | 312 | H3 | Poor Questions |
| 38 | reference/evaluation.md | 354 | H2 | Verification Process |
| 39 | reference/evaluation.md | 366 | H2 | Tips for Creating Quality Evaluations |
| 40 | reference/evaluation.md | 382 | H2 | Setup |
| 41 | reference/evaluation.md | 401 | H2 | Evaluation File Format |
| 42 | reference/evaluation.md | 418 | H2 | Running Evaluations |
| 43 | reference/evaluation.md | 426 | H3 | 1. Local STDIO Server |
| 44 | reference/evaluation.md | 449 | H3 | 2. Server-Sent Events (SSE) |
| 45 | reference/evaluation.md | 462 | H3 | 3. HTTP (Streamable HTTP) |
| 46 | reference/evaluation.md | 474 | H2 | Command-Line Options |
| 47 | reference/evaluation.md | 501 | H2 | Output |
| 48 | reference/evaluation.md | 519 | H3 | Save Report to File |
| 49 | reference/evaluation.md | 530 | H2 | Complete Example Workflow |
| 50 | reference/evaluation.md | 578 | H2 | Troubleshooting |
| 51 | reference/evaluation.md | 580 | H3 | Connection Errors |
| 52 | reference/evaluation.md | 587 | H3 | Low Accuracy |
| 53 | reference/evaluation.md | 596 | H3 | Timeout Issues |
| 54 | reference/mcp_best_practices.md | 3 | H2 | Quick Reference |
| 55 | reference/mcp_best_practices.md | 5 | H3 | Server Naming |
| 56 | reference/mcp_best_practices.md | 9 | H3 | Tool Naming |
| 57 | reference/mcp_best_practices.md | 14 | H3 | Response Formats |
| 58 | reference/mcp_best_practices.md | 19 | H3 | Pagination |
| 59 | reference/mcp_best_practices.md | 24 | H3 | Transport |
| 60 | reference/mcp_best_practices.md | 31 | H2 | Server Naming Conventions |
| 61 | reference/mcp_best_practices.md | 45 | H2 | Tool Naming and Design |
| 62 | reference/mcp_best_practices.md | 47 | H3 | Tool Naming |
| 63 | reference/mcp_best_practices.md | 56 | H3 | Tool Design |
| 64 | reference/mcp_best_practices.md | 65 | H2 | Response Formats |
| 65 | reference/mcp_best_practices.md | 69 | H3 | JSON Format (`response_format="json"`) |
| 66 | reference/mcp_best_practices.md | 75 | H3 | Markdown Format (`response_format="markdown"`, typically default) |
| 67 | reference/mcp_best_practices.md | 84 | H2 | Pagination |
| 68 | reference/mcp_best_practices.md | 108 | H2 | Transport Options |
| 69 | reference/mcp_best_practices.md | 110 | H3 | Streamable HTTP |
| 70 | reference/mcp_best_practices.md | 125 | H3 | stdio |
| 71 | reference/mcp_best_practices.md | 141 | H3 | Transport Selection |
| 72 | reference/mcp_best_practices.md | 152 | H2 | Security Best Practices |
| 73 | reference/mcp_best_practices.md | 154 | H3 | Authentication and Authorization |
| 74 | reference/mcp_best_practices.md | 166 | H3 | Input Validation |
| 75 | reference/mcp_best_practices.md | 174 | H3 | Error Handling |
| 76 | reference/mcp_best_practices.md | 181 | H3 | DNS Rebinding Protection |
| 77 | reference/mcp_best_practices.md | 190 | H2 | Tool Annotations |
| 78 | reference/mcp_best_practices.md | 205 | H2 | Error Handling |
| 79 | reference/mcp_best_practices.md | 231 | H2 | Testing Requirements |
| 80 | reference/mcp_best_practices.md | 243 | H2 | Documentation Requirements |
| 81 | reference/node_mcp_server.md | 3 | H2 | Overview |
| 82 | reference/node_mcp_server.md | 9 | H2 | Quick Reference |
| 83 | reference/node_mcp_server.md | 11 | H3 | Key Imports |
| 84 | reference/node_mcp_server.md | 20 | H3 | Server Initialization |
| 85 | reference/node_mcp_server.md | 28 | H3 | Tool Registration Pattern |
| 86 | reference/node_mcp_server.md | 50 | H2 | MCP TypeScript SDK |
| 87 | reference/node_mcp_server.md | 65 | H2 | Server Naming Convention |
| 88 | reference/node_mcp_server.md | 77 | H2 | Project Structure |
| 89 | reference/node_mcp_server.md | 96 | H2 | Tool Implementation |
| 90 | reference/node_mcp_server.md | 98 | H3 | Tool Naming |
| 91 | reference/node_mcp_server.md | 107 | H3 | Tool Structure |
| 92 | reference/node_mcp_server.md | 276 | H2 | Zod Schemas for Input Validation |
| 93 | reference/node_mcp_server.md | 324 | H2 | Response Format Options |
| 94 | reference/node_mcp_server.md | 354 | H2 | Pagination Implementation |
| 95 | reference/node_mcp_server.md | 382 | H2 | Character Limits and Truncation |
| 96 | reference/node_mcp_server.md | 408 | H2 | Error Handling |
| 97 | reference/node_mcp_server.md | 436 | H2 | Shared Utilities |
| 98 | reference/node_mcp_server.md | 467 | H2 | Async/Await Best Practices |
| 99 | reference/node_mcp_server.md | 485 | H2 | TypeScript Best Practices |
| 100 | reference/node_mcp_server.md | 526 | H2 | Package Configuration |
| 101 | reference/node_mcp_server.md | 528 | H3 | package.json |
| 102 | reference/node_mcp_server.md | 559 | H3 | tsconfig.json |
| 103 | reference/node_mcp_server.md | 584 | H2 | Complete Example |
| 104 | reference/node_mcp_server.md | 760 | H2 | Advanced MCP Features |
| 105 | reference/node_mcp_server.md | 762 | H3 | Resource Registration |
| 106 | reference/node_mcp_server.md | 817 | H3 | Transport Options |
| 107 | reference/node_mcp_server.md | 859 | H3 | Notification Support |
| 108 | reference/node_mcp_server.md | 879 | H2 | Code Best Practices |
| 109 | reference/node_mcp_server.md | 881 | H3 | Code Composability and Reusability |
| 110 | reference/node_mcp_server.md | 898 | H2 | Building and Running |
| 111 | reference/node_mcp_server.md | 915 | H2 | Quality Checklist |
| 112 | reference/node_mcp_server.md | 919 | H3 | Strategic Design |
| 113 | reference/node_mcp_server.md | 926 | H3 | Implementation Quality |
| 114 | reference/node_mcp_server.md | 937 | H3 | TypeScript Quality |
| 115 | reference/node_mcp_server.md | 944 | H3 | Advanced Features (where applicable) |
| 116 | reference/node_mcp_server.md | 950 | H3 | Project Configuration |
| 117 | reference/node_mcp_server.md | 957 | H3 | Code Quality |
| 118 | reference/node_mcp_server.md | 965 | H3 | Testing and Build |
| 119 | reference/python_mcp_server.md | 3 | H2 | Overview |
| 120 | reference/python_mcp_server.md | 9 | H2 | Quick Reference |
| 121 | reference/python_mcp_server.md | 11 | H3 | Key Imports |
| 122 | reference/python_mcp_server.md | 20 | H3 | Server Initialization |
| 123 | reference/python_mcp_server.md | 25 | H3 | Tool Registration Pattern |
| 124 | reference/python_mcp_server.md | 35 | H2 | MCP Python SDK and FastMCP |
| 125 | reference/python_mcp_server.md | 45 | H2 | Server Naming Convention |
| 126 | reference/python_mcp_server.md | 57 | H2 | Tool Implementation |
| 127 | reference/python_mcp_server.md | 59 | H3 | Tool Naming |
| 128 | reference/python_mcp_server.md | 68 | H3 | Tool Structure with FastMCP |
| 129 | reference/python_mcp_server.md | 121 | H2 | Pydantic v2 Key Features |
| 130 | reference/python_mcp_server.md | 150 | H2 | Response Format Options |
| 131 | reference/python_mcp_server.md | 182 | H2 | Pagination Implementation |
| 132 | reference/python_mcp_server.md | 207 | H2 | Error Handling |
| 133 | reference/python_mcp_server.md | 227 | H2 | Shared Utilities |
| 134 | reference/python_mcp_server.md | 246 | H2 | Async/Await Best Practices |
| 135 | reference/python_mcp_server.md | 264 | H2 | Type Hints |
| 136 | reference/python_mcp_server.md | 276 | H2 | Tool Docstrings |
| 137 | reference/python_mcp_server.md | 330 | H2 | Complete Example |
| 138 | reference/python_mcp_server.md | 476 | H2 | Advanced FastMCP Features |
| 139 | reference/python_mcp_server.md | 478 | H3 | Context Parameter Injection |
| 140 | reference/python_mcp_server.md | 527 | H3 | Resource Registration |
| 141 | reference/python_mcp_server.md | 554 | H3 | Structured Output Types |
| 142 | reference/python_mcp_server.md | 589 | H3 | Lifespan Management |
| 143 | reference/python_mcp_server.md | 619 | H3 | Transport Options |
| 144 | reference/python_mcp_server.md | 639 | H2 | Code Best Practices |
| 145 | reference/python_mcp_server.md | 641 | H3 | Code Composability and Reusability |
| 146 | reference/python_mcp_server.md | 658 | H3 | Python-Specific Best Practices |
| 147 | reference/python_mcp_server.md | 668 | H2 | Quality Checklist |
| 148 | reference/python_mcp_server.md | 672 | H3 | Strategic Design |
| 149 | reference/python_mcp_server.md | 679 | H3 | Implementation Quality |
| 150 | reference/python_mcp_server.md | 690 | H3 | Tool Configuration |
| 151 | reference/python_mcp_server.md | 699 | H3 | Advanced Features (where applicable) |
| 152 | reference/python_mcp_server.md | 706 | H3 | Code Quality |
| 153 | reference/python_mcp_server.md | 715 | H3 | Testing |

**N = 153** (SKILL.md: 11, evaluation.md: 42, mcp_best_practices.md: 27, node_mcp_server.md: 38, python_mcp_server.md: 35).

## Step 2 — k / offset math

```
N = 153
k = ceil(N / 6) = ceil(153 / 6) = ceil(25.5) = 26
0xdac38a (hex) = 14336906 (decimal)
14336906 mod 26 = 12   (26 × 551419 = 14336894; 14336906 − 14336894 = 12)
offset = 12 + 1 = 13
```

Sample sequence: `offset, offset+k, offset+2k, offset+3k, offset+4k, offset+5k`
= `13, 39, 65, 91, 117, 143` (all ≤ N = 153, so no modulo-N wraparound was needed).

Verified independently with a small script (`python3 -c` one-liner) — matches the by-hand computation exactly.

## Step 3 — Skip log

| Sampled index | Heading | File | Verdict |
|---|---|---|---|
| 13 | Quick Reference | reference/evaluation.md (L9) | **SKIPPED — heading-only.** Line 10 (the line between the H2 at L9 and its first child H3 at L11) is blank; the H2 introduces subsections with zero body content of its own. Advanced to index 14. |
| 14 | Evaluation Requirements | reference/evaluation.md (L11) | Accepted → **s1**. Real content: 5-bullet list of hard requirements. |
| 39 | Tips for Creating Quality Evaluations | reference/evaluation.md (L366) | Accepted → **s2**. Real content: 7-item numbered tip list. No skip needed. |
| 65 | JSON Format (`response_format="json"`) | reference/mcp_best_practices.md (L69) | Accepted → **s3**. Real content: 4-bullet description + exact literal in the heading itself. No skip needed. |
| 91 | Tool Structure | reference/node_mcp_server.md (L107) | Accepted → **s4**. Real content: intro sentence, 5-bullet requirement list, full code example. No skip needed. |
| 117 | Code Quality | reference/node_mcp_server.md (L957) | Accepted → **s5**. Real content: 6-item checklist. No skip needed. |
| 143 | Transport Options | reference/python_mcp_server.md (L619) | Accepted → **s6**. Real content: intro sentence, code example, 2-bullet selection guide. No skip needed. |

Exactly **one** skip occurred, at the very first sampled index.

## Step 4 — Per-case detail

### Case 1 — `mcp-narrow-01` (NARROW, uses s1 only)

- **Section(s) used**: s1 — "Evaluation Requirements" (H3)
- **Source file(s)**: `reference/evaluation.md`
- **Fact tested**: the guide fixes an exact count — "Create 10 human-readable questions" — as opposed to a vague/flexible target.
- **Trap rationale**: a competent agent asked to write MCP evaluations without this skill would very plausibly reason "create as many questions as needed to cover the API surface" (a defensible, common practice elsewhere) and either invent a different round number (5, 20) or refuse to commit to one at all. The skill instead pins an exact, non-negotiable count of 10, which is easy to get wrong without having read this specific line.
- **Difficulty**: medium — single fact, but genuinely counter-intuitive that the number is fixed at all rather than a rule of thumb.

### Case 2 — `mcp-narrow-02` (NARROW, uses s2 only)

- **Section(s) used**: s2 — "Tips for Creating Quality Evaluations" (H2)
- **Source file(s)**: `reference/evaluation.md`
- **Fact tested**: which named tip ("**Ensure Stability**") instructs using historical data and closed/completed concepts.
- **Trap rationale**: two compounding traps. First, an agent's intuitive best-practice instinct is that good test evaluations should reflect *current*, live data for realism — the guide's actual advice inverts that: freshness is the enemy of a stable/reproducible answer, so the tip prescribes historical/closed data specifically. Second, the same source document has *two other, separately-titled* "### Stability" H3 subsections elsewhere (under "Question Guidelines" and "Answer Guidelines," indices 22 and 26 in the enumeration) — an agent skimming for "the stability guidance" is liable to answer plain "Stability" instead of the exact bolded phrase actually used in the tips list, "Ensure Stability," causing an exact-string-match miss.
- **Difficulty**: medium-high — requires both overriding an intuitive-but-wrong assumption and reproducing the exact wording amid near-duplicate heading names in the same document.

### Case 3 — `mcp-broad-01` (BROAD, uses s3 + s4)

- **Section(s) used**: s3 — "JSON Format (`response_format="json"`)" (H3); s4 — "Tool Structure" (H3)
- **Source file(s)**: `reference/mcp_best_practices.md` (s3), `reference/node_mcp_server.md` (s4)
- **Facts tested**: (a) the exact lowercase literal `json` selects the machine-readable response format; (b) the TypeScript SDK's `registerTool` does **not** auto-extract a JSDoc comment into the tool's `description` — it must be written out explicitly.
- **Trap rationale**: two independent, compounding traps forced into one combined answer. (a) Case-sensitivity: prose elsewhere refers to the format as "JSON" (capitalized, as a proper noun/acronym), so an agent is likely to answer the literal as `JSON` rather than the actual lowercase code-level value `json`. (b) Cross-language interference: the companion Python guide (`python_mcp_server.md`, not part of this case but part of the same skill) explicitly states that in FastMCP "Tool description automatically becomes the 'description' field" from the docstring — an agent who has absorbed that Python behavior, or who simply assumes JSDoc behaves the way most doc-generators do, will wrongly answer "yes" for the TypeScript case. Only a careful, section-specific read catches that the SDKs are asymmetric here.
- **Difficulty**: high — two-part synthesis across two different files/languages, each half individually trap-prone.

### Case 4 — `mcp-broad-02` (BROAD, uses s5 + s6)

- **Section(s) used**: s5 — "Code Quality" (H3, checklist); s6 — "Transport Options" (H3)
- **Source file(s)**: `reference/node_mcp_server.md` (s5), `reference/python_mcp_server.md` (s6)
- **Facts tested**: (a) the exact constant name `CHARACTER_LIMIT` (all-caps, single underscore) that large TS tool responses must be checked against before truncation; (b) the exact string literal `streamable_http` (lowercase, underscore) that must be passed as FastMCP's `mcp.run(transport=...)` argument to select Streamable HTTP over the stdio default.
- **Trap rationale**: (a) the checklist item only *references* the constant by name ("Large responses check CHARACTER_LIMIT constant...") without redefining it inline — the exact spelling is really anchored in a different section of the same file ("Character Limits and Truncation," not itself sampled), so an agent might misremember/paraphrase it as `MAX_CHARACTERS`, `CHAR_LIMIT`, or similar plausible variants. (b) Everywhere in prose (across both the Python and Node guides, and `mcp_best_practices.md`) the transport is written as two capitalized words, "Streamable HTTP" — but the actual Python code-level argument value is the snake_case string `streamable_http`, not `streamable-http` or `StreamableHTTP`. Both halves reward an agent that has actually read the code examples rather than paraphrased the prose.
- **Difficulty**: high — two independent exact-literal traps, each drawing on a different file, with prose-vs-code-literal mismatch as the common failure mode.

## Source-file tags (requirement e)

| Case | Files |
|---|---|
| mcp-narrow-01 | reference/evaluation.md |
| mcp-narrow-02 | reference/evaluation.md |
| mcp-broad-01 | reference/mcp_best_practices.md, reference/node_mcp_server.md |
| mcp-broad-02 | reference/node_mcp_server.md, reference/python_mcp_server.md |
