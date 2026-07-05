# Evaluations — Designing Questions (Phase 4)

Create comprehensive evaluations that test whether LLMs can effectively use your MCP server to answer realistic, complex questions using ONLY the tools provided. Running the evaluation harness is covered in `16-evaluation-running.md`.

## Purpose

The measure of quality of an MCP server is NOT how well or comprehensively the server implements tools, but how well these implementations (input/output schemas, docstrings/descriptions, functionality) enable LLMs — with no other context and access ONLY to the MCP server — to answer realistic and difficult questions.

## Overview & Requirements

Create **10 human-readable questions** requiring ONLY READ-ONLY, INDEPENDENT, NON-DESTRUCTIVE, and IDEMPOTENT operations to answer. Each question should be:
- Realistic
- Clear and concise
- Unambiguous
- Complex, requiring potentially dozens of tool calls or steps
- Answerable with a single, verifiable value that you identify in advance

The four-step creation process (referenced from the workflow): (1) **Tool Inspection** — list available tools and understand their capabilities; (2) **Content Exploration** — use READ-ONLY operations to explore available data; (3) **Question Generation** — create 10 complex, realistic questions; (4) **Answer Verification** — solve each question yourself to verify answers.

## Question Guidelines

### Core Requirements

1. **Questions MUST be independent** — each should NOT depend on the answer to any other question, and should not assume prior write operations from processing another question.
2. **Questions MUST require ONLY NON-DESTRUCTIVE AND IDEMPOTENT tool use** — should not instruct or require modifying state to arrive at the correct answer.
3. **Questions must be REALISTIC, CLEAR, CONCISE, and COMPLEX** — must require another LLM to use multiple (potentially dozens of) tools or steps to answer.

### Complexity and Depth

4. **Questions must require deep exploration** — consider multi-hop questions requiring multiple sub-questions and sequential tool calls; each step should benefit from information found in previous steps.
5. **Questions may require extensive paging** — may need paging through multiple pages of results; may require querying old data (1–2 years out-of-date) to find niche information; the questions must be DIFFICULT.
6. **Questions must require deep understanding** — rather than surface-level knowledge; may pose complex ideas as True/False questions requiring evidence; may use multiple-choice format where the LLM must search different hypotheses.
7. **Questions must not be solvable with straightforward keyword search** — do not include specific keywords from the target content; use synonyms, related concepts, or paraphrases; require multiple searches, analyzing multiple related items, extracting context, then deriving the answer.

### Tool Testing

8. **Questions should stress-test tool return values** — may elicit tools returning large JSON objects or lists that overwhelm the LLM; should require understanding multiple modalities of data (IDs and names; timestamps and datetimes — months, days, years, seconds; file IDs, names, extensions, mimetypes; URLs, GIDs, etc.); should probe the tool's ability to return all useful forms of data.
9. **Questions should MOSTLY reflect real human use cases** — the kinds of information-retrieval tasks that humans assisted by an LLM would care about.
10. **Questions may require dozens of tool calls** — this challenges LLMs with limited context and encourages MCP server tools to reduce information returned.
11. **Include ambiguous questions** — may be ambiguous OR require difficult decisions on which tools to call; force the LLM to potentially make mistakes or misinterpret; ensure that despite AMBIGUITY, there is STILL A SINGLE VERIFIABLE ANSWER.

### Stability

12. **Questions must be designed so the answer DOES NOT CHANGE** — do not ask questions that rely on dynamic "current state." For example, do not count: number of reactions to a post, number of replies to a thread, number of members in a channel.
13. **DO NOT let the MCP server RESTRICT the kinds of questions you create** — create challenging and complex questions; some may not be solvable with the available tools; questions may require specific output formats (datetime vs. epoch time, JSON vs. MARKDOWN); questions may require dozens of tool calls.

## Answer Guidelines

### Verification

1. **Answers must be VERIFIABLE via direct string comparison.** If the answer can be written in many formats, clearly specify the output format in the QUESTION (e.g., "Use YYYY/MM/DD.", "Respond True or False.", "Answer A, B, C, or D and nothing else."). Answer should be a single verifiable value such as: user ID, user name, display name, first name, last name; channel ID, channel name; message ID, string; URL, title; numerical quantity; timestamp, datetime; boolean (True/False); email address, phone number; file ID, file name, file extension; multiple choice answer. Answers must not require special formatting or complex, structured output. Answer will be verified using DIRECT STRING COMPARISON.

### Readability

2. **Answers should generally prefer HUMAN-READABLE formats** — names, first name, last name, datetime, file name, message string, URL, yes/no, true/false, a/b/c/d — rather than opaque IDs (though IDs are acceptable). The VAST MAJORITY of answers should be human-readable.

### Stability

3. **Answers must be STABLE/STATIONARY** — look at old content (conversations that have ended, projects that have launched, questions answered); create questions based on "closed" concepts that will always return the same answer; questions may ask to consider a fixed time window to insulate from non-stationary answers; rely on context UNLIKELY to change. Example: if finding a paper name, be SPECIFIC enough so the answer is not confused with papers published later.
4. **Answers must be CLEAR and UNAMBIGUOUS** — designed so there is a single, clear answer derivable from the MCP server tools.

### Diversity

5. **Answers must be DIVERSE** — a single verifiable value in diverse modalities and formats. User concept: user ID, user name, display name, first name, last name, email address, phone number. Channel concept: channel ID, channel name, channel topic. Message concept: message ID, message string, timestamp, month, day, year.
6. **Answers must NOT be complex structures** — not a list of values, not a complex object, not a list of IDs or strings, not natural language text — UNLESS the answer can be straightforwardly verified using DIRECT STRING COMPARISON and can be realistically reproduced (unlikely that an LLM would return the same list in any other order or format).

## Evaluation Process

1. **Documentation Inspection** — read the target API docs to understand available endpoints and functionality; if ambiguity exists, fetch additional info from the web; parallelize as much as possible; ensure each subagent is ONLY examining documentation from the file system or web.
2. **Tool Inspection** — list the tools available in the MCP server; inspect input/output schemas, docstrings, and descriptions WITHOUT calling the tools at this stage.
3. **Developing Understanding** — repeat steps 1 & 2, iterating multiple times; think about the tasks you want to create and refine understanding; at NO stage READ the code of the MCP server implementation itself; use intuition to create reasonable, realistic, but VERY challenging tasks.
4. **Read-Only Content Inspection** — USE the MCP server tools with READ-ONLY, NON-DESTRUCTIVE operations ONLY to identify specific content (users, channels, messages, projects, tasks) for realistic questions. Do NOT call tools that modify state. Do NOT read the server's code. Parallelize with individual sub-agents pursuing independent explorations (each performing only read-only, non-destructive, idempotent operations). BE CAREFUL: some tools may return LOTS OF DATA and exhaust context — make INCREMENTAL, SMALL, TARGETED calls; in all tool call requests use the `limit` parameter (<10); use pagination.
5. **Task Generation** — create 10 human-readable questions an LLM can answer with the MCP server, following all question and answer guidelines above.

## Output Format

Each QA pair consists of a question and an answer, in an XML file:

```xml
<evaluation>
   <qa_pair>
      <question>Find the project created in Q2 2024 with the highest number of completed tasks. What is the project name?</question>
      <answer>Website Redesign</answer>
   </qa_pair>
   <qa_pair>
      <question>Search for issues labeled as "bug" that were closed in March 2024. Which user closed the most issues? Provide their username.</question>
      <answer>sarah_dev</answer>
   </qa_pair>
   <qa_pair>
      <question>Look for pull requests that modified files in the /api directory and were merged between January 1 and January 31, 2024. How many different contributors worked on these PRs?</question>
      <answer>7</answer>
   </qa_pair>
   <qa_pair>
      <question>Find the repository with the most stars that was created before 2023. What is the repository name?</question>
      <answer>data-pipeline</answer>
   </qa_pair>
</evaluation>
```

A single-pair illustration of the same structure:

```xml
<evaluation>
  <qa_pair>
    <question>Find discussions about AI model launches with animal codenames. One model needed a specific safety designation that uses the format ASL-X. What number X was being determined for the model named after a spotted wild cat?</question>
    <answer>3</answer>
  </qa_pair>
<!-- More qa_pairs... -->
</evaluation>
```

## Examples

### Good Questions

**Example 1 — Multi-hop question requiring deep exploration (GitHub MCP):**
```xml
<qa_pair>
   <question>Find the repository that was archived in Q3 2023 and had previously been the most forked project in the organization. What was the primary programming language used in that repository?</question>
   <answer>Python</answer>
</qa_pair>
```
Good because: requires multiple searches to find archived repositories; needs to identify which had the most forks before archival; requires examining repository details for the language; answer is a simple verifiable value; based on historical (closed) data that won't change.

**Example 2 — Requires understanding context without keyword matching (Project Management MCP):**
```xml
<qa_pair>
   <question>Locate the initiative focused on improving customer onboarding that was completed in late 2023. The project lead created a retrospective document after completion. What was the lead's role title at that time?</question>
   <answer>Product Manager</answer>
</qa_pair>
```
Good because: doesn't use the specific project name; requires finding completed projects from a specific timeframe; needs to identify the project lead and their role; requires understanding context from retrospective documents; answer is human-readable and stable; based on completed work.

**Example 3 — Complex aggregation requiring multiple steps (Issue Tracker MCP):**
```xml
<qa_pair>
   <question>Among all bugs reported in January 2024 that were marked as critical priority, which assignee resolved the highest percentage of their assigned bugs within 48 hours? Provide the assignee's username.</question>
   <answer>alex_eng</answer>
</qa_pair>
```
Good because: requires filtering bugs by date, priority, and status; needs to group by assignee and calculate resolution rates; requires understanding timestamps to determine 48-hour windows; tests pagination; answer is a single username; based on historical data.

**Example 4 — Requires synthesis across multiple data types (CRM MCP):**
```xml
<qa_pair>
   <question>Find the account that upgraded from the Starter to Enterprise plan in Q4 2023 and had the highest annual contract value. What industry does this account operate in?</question>
   <answer>Healthcare</answer>
</qa_pair>
```
Good because: requires understanding subscription tier changes; needs to identify upgrade events in a specific timeframe; requires comparing contract values; must access account industry information; answer is simple and verifiable; based on completed historical transactions.

### Poor Questions

**Example 1 — Answer changes over time:**
```xml
<qa_pair>
   <question>How many open issues are currently assigned to the engineering team?</question>
   <answer>47</answer>
</qa_pair>
```
Poor because: the answer changes as issues are created, closed, or reassigned; not based on stable data; relies on dynamic "current state."

**Example 2 — Too easy with keyword search:**
```xml
<qa_pair>
   <question>Find the pull request with title "Add authentication feature" and tell me who created it.</question>
   <answer>developer123</answer>
</qa_pair>
```
Poor because: solvable with a straightforward keyword search for the exact title; doesn't require deep exploration or understanding; no synthesis or analysis needed.

**Example 3 — Ambiguous answer format:**
```xml
<qa_pair>
   <question>List all the repositories that have Python as their primary language.</question>
   <answer>repo1, repo2, repo3, data-pipeline, ml-tools</answer>
</qa_pair>
```
Poor because: the answer is a list that could be returned in any order; difficult to verify with direct string comparison; an LLM might format differently (JSON array, comma-separated, newline-separated); better to ask for a specific aggregate (count) or superlative (most stars).

## Verification Process

After creating evaluations:
1. **Examine the XML file** to understand the schema.
2. **Load each task instruction** and, in parallel using the MCP server and tools, identify the correct answer by attempting to solve the task YOURSELF.
3. **Flag any operations** that require WRITE or DESTRUCTIVE operations.
4. **Accumulate all CORRECT answers** and replace any incorrect answers in the document.
5. **Remove any `<qa_pair>`** that requires WRITE or DESTRUCTIVE operations.

Parallelize solving tasks to avoid running out of context, then accumulate all answers and make changes to the file at the end.

## Tips for Quality Evaluations

1. **Think Hard and Plan Ahead** before generating tasks.
2. **Parallelize Where Opportunity Arises** to speed up the process and manage context.
3. **Focus on Realistic Use Cases** that humans would actually want to accomplish.
4. **Create Challenging Questions** that test the limits of the MCP server's capabilities.
5. **Ensure Stability** by using historical data and closed concepts.
6. **Verify Answers** by solving the questions yourself using the MCP server tools.
7. **Iterate and Refine** based on what you learn during the process.
