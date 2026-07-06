# Building LLM-Powered Applications with Claude

This skill helps you build LLM-powered applications with Claude. Choose the right surface based on your needs, detect the project language, then read the relevant language-specific documentation.

## Before You Start

Scan the target file (or, if no target file, the prompt and project) for non-Anthropic provider markers — `import openai`, `from openai`, `langchain_openai`, `OpenAI(`, `gpt-4`, `gpt-5`, file names like `agent-openai.py` or `*-generic.py`, or any explicit instruction to keep the code provider-neutral. If you find any, stop and tell the user that this skill produces Claude/Anthropic SDK code; ask whether they want to switch the file to Claude or want a non-Claude implementation. Do not edit a non-Anthropic file with Anthropic SDK calls.

## Output Requirement

When the user asks you to add, modify, or implement a Claude feature, your code must call Claude through one of:

1. **The official Anthropic SDK** for the project's language (`anthropic`, `@anthropic-ai/sdk`, `com.anthropic.*`, etc.). This is the default whenever a supported SDK exists for the project.
2. **Raw HTTP** (`curl`, `requests`, `fetch`, `httpx`, etc.) — only when the user explicitly asks for cURL/REST/raw HTTP, the project is a shell/cURL project, or the language has no official SDK.

Never mix the two — don't reach for `requests`/`fetch` in a Python or TypeScript project just because it feels lighter. Never fall back to OpenAI-compatible shims.

**Never guess SDK usage.** Function names, class names, namespaces, method signatures, and import paths must come from explicit documentation — either this skill's language-specific minis (see the Reading Guide's per-language table) or the official SDK repositories or documentation links listed in `mini/13-live-sources.md`. If the binding you need is not explicitly documented in the skill files, WebFetch the relevant SDK repo from `mini/13-live-sources.md` before writing code. Do not infer Ruby/Java/Go/PHP/C# APIs from cURL shapes or from another language's SDK.

**If WebFetch or repository access fails** (network restricted, timeouts, clone blocked): do not keep retrying — write code from the patterns and namespace/package tables in your language's mini (see the Reading Guide's per-language table), run the compiler or interpreter on it, and iterate on the error output. For statically-typed SDKs (C#, Java, Go) a compile-fix loop against local errors reaches working code faster than blocked network research.

## Defaults

Unless the user requests otherwise:

For the Claude model version, please use Claude Opus 4.8, which you can access via the exact model string `claude-opus-4-8`. Please default to using adaptive thinking (`thinking: {type: "adaptive"}`) for anything remotely complicated. And finally, please default to streaming for any request that may involve long input, long output, or high `max_tokens` — it prevents hitting request timeouts. Use the SDK's `.get_final_message()` / `.finalMessage()` helper to get the complete response if you don't need to handle individual stream events

## ⚠️ API Drift — Your Training Prior May Be Stale

Several common Claude API shapes changed in 2025–2026. If you recall a pattern from training, verify it against this skill's language-specific minis (see the Reading Guide's per-language table) before writing — the rows below are the most frequent drift points:

| Area | Stale prior | Current API |
|---|---|---|
| Extended thinking | `thinking: {type: "enabled", budget_tokens: N}` | On Claude 4.6+ models: `thinking: {type: "adaptive"}`. `budget_tokens` is deprecated on Opus 4.6 / Sonnet 4.6 and **rejected with a 400** on Fable 5 / Sonnet 5 / Opus 4.8 / 4.7. Pre-4.6 models still use `budget_tokens`. |
| Web search / web fetch tool type | `web_search_20250305`, `web_fetch_20250910` | `web_search_20260209`, `web_fetch_20260209` (dynamic filtering) on Opus 4.8/4.7/4.6, Sonnet 5, and Sonnet 4.6. Older models keep the basic variants; on Vertex AI only basic `web_search_20250305` is available (web fetch is not on Vertex) — see the Server Tools QR below. |
| PHP parameter names | snake_case wire names as named args (`max_tokens`) | Top-level named args are camelCase (`maxTokens`). Nested array keys vary by feature (e.g. `'taskBudget'`, `'skillID'`, `'mcp_server_name'`) — copy the exact key from the documented example; do not bulk-convert. |

This skill's language-specific minis are authoritative over recalled patterns.

## Subcommands

If the User Request at the bottom of this prompt is a bare subcommand string (no prose), search every **Subcommands** table in this document — including any in sections appended below — and follow the matching Action column directly. This lets users invoke specific flows via `/claude-api <subcommand>`. If no table in the document matches, treat the request as normal prose.

| Subcommand | Action |
|---|---|
| `migrate` | Migrate existing Claude API code to a newer model. **Read `mini/20-model-migration.md` immediately** and follow it in order: Step 0 (confirm scope — ask which files/directories before any edit), Step 1 (classify each file), then the per-target breaking-changes section. Do not summarize the guide — execute it. If the user did not name a target model, ask which model to migrate to in the same turn as the scope question. |

## Language Detection

Before reading code examples, determine which language the user is working in:

1. **Look at project files** to infer the language:

   - `*.py`, `requirements.txt`, `pyproject.toml`, `setup.py`, `Pipfile` → **Python** — read from the Python minis (`mini/50-python-readme.md`–`mini/53-python-managed-agents.md`)
   - `*.ts`, `*.tsx`, `package.json`, `tsconfig.json` → **TypeScript** — read from the TypeScript minis (`mini/55-typescript-readme.md`–`mini/58-typescript-managed-agents.md`)
   - `*.js`, `*.jsx` (no `.ts` files present) → **TypeScript** — JS uses the same SDK, read from the TypeScript minis (`mini/55-typescript-readme.md`–`mini/58-typescript-managed-agents.md`)
   - `*.java`, `pom.xml`, `build.gradle` → **Java** — read from the Java minis (`mini/70-java-readme.md`–`mini/73-java-managed-agents.md`)
   - `*.kt`, `*.kts`, `build.gradle.kts` → **Java** — Kotlin uses the Java SDK, read from the Java minis (`mini/70-java-readme.md`–`mini/73-java-managed-agents.md`)
   - `*.scala`, `build.sbt` → **Java** — Scala uses the Java SDK, read from the Java minis (`mini/70-java-readme.md`–`mini/73-java-managed-agents.md`)
   - `*.go`, `go.mod` → **Go** — read from the Go minis (`mini/65-go-readme.md`–`mini/68-go-managed-agents.md`)
   - `*.rb`, `Gemfile` → **Ruby** — read from the Ruby minis (`mini/80-ruby-readme.md`–`mini/82-ruby-managed-agents.md`)
   - `*.cs`, `*.csproj` → **C#** — read from the C# minis (`mini/60-csharp-readme.md`–`mini/62-csharp-streaming-batches-files.md`; no dedicated Managed Agents mini — see the note below)
   - `*.php`, `composer.json` → **PHP** — read from the PHP minis (`mini/75-php-readme.md`–`mini/78-php-managed-agents.md`)

2. **If multiple languages detected** (e.g., both Python and TypeScript files):

   - Check which language the user's current file or question relates to
   - If still ambiguous, ask: "I detected both Python and TypeScript files. Which language are you using for the Claude API integration?"

3. **If language can't be inferred** (empty project, no source files, or unsupported language):

   - Use AskUserQuestion with options: Python, TypeScript, Java, Go, Ruby, cURL/raw HTTP, C#, PHP
   - If AskUserQuestion is unavailable, default to Python examples and note: "Showing Python examples. Let me know if you need a different language."

4. **If unsupported language detected** (Rust, Swift, C++, Elixir, etc.):

   - Suggest cURL/raw HTTP examples from `mini/85-curl-examples.md` and note that community SDKs may exist
   - Offer to show Python or TypeScript examples as reference implementations

5. **If user needs cURL/raw HTTP examples**, read `mini/85-curl-examples.md` (Managed Agents: `mini/86-curl-managed-agents.md`).

### Language-Specific Feature Support

| Language   | Tool Runner | Managed Agents | Notes                                 |
| ---------- | ----------- | -------------- | ------------------------------------- |
| Python     | Yes (beta)  | Yes (beta)     | Full support — `@beta_tool` decorator |
| TypeScript | Yes (beta)  | Yes (beta)     | Full support — `betaZodTool` + Zod    |
| Java       | Yes (beta)  | Yes (beta)     | Beta tool use with annotated classes  |
| Go         | Yes (beta)  | Yes (beta)     | `BetaToolRunner` in `toolrunner` pkg  |
| Ruby       | Yes (beta)  | Yes (beta)     | `BaseTool` + `tool_runner` in beta    |
| C#         | Yes (beta)  | Yes (beta)     | `BetaToolRunner` + raw JSON schema    |
| PHP        | Yes (beta)  | Yes (beta)     | `BetaRunnableTool` + `toolRunner()`   |
| cURL       | N/A         | Yes (beta)     | Raw HTTP, no SDK features             |

> **Managed Agents code examples**: dedicated language-specific minis are provided for Python, TypeScript, Go, Ruby, PHP, Java, and cURL (`mini/53-python-managed-agents.md`, `mini/58-typescript-managed-agents.md`, `mini/68-go-managed-agents.md`, `mini/73-java-managed-agents.md`, `mini/78-php-managed-agents.md`, `mini/82-ruby-managed-agents.md`, `mini/86-curl-managed-agents.md`; C# has no dedicated mini — use the cURL one as the wire-level reference alongside `mini/60-csharp-readme.md`). Read your language's mini plus the language-agnostic `mini/30-managed-agents-overview.md` through `mini/43-managed-agents-self-hosted-sandboxes.md` concept files. **Agents are persistent — create once, reference by ID.** Store the agent ID returned by `agents.create` and pass it to every subsequent `sessions.create`; do not call `agents.create` in the request path. The Anthropic CLI (`ant`) is one convenient way to create agents and environments from version-controlled YAML — see `mini/19-anthropic-cli.md`. If a binding you need isn't shown in the README, WebFetch the relevant entry from `mini/13-live-sources.md` rather than guess. C# has beta Managed Agents support via `client.Beta.Agents` and related namespaces.

## Which Surface Should I Use?

> **Start simple.** Default to the simplest tier that meets your needs. Single API calls and workflows handle most use cases — only reach for agents when the task genuinely requires open-ended, model-driven exploration.

| Use Case                                        | Tier            | Recommended Surface       | Why                                                          |
| ----------------------------------------------- | --------------- | ------------------------- | ------------------------------------------------------------ |
| Classification, summarization, extraction, Q&A  | Single LLM call | **Claude API**            | One request, one response                                    |
| Batch processing or embeddings                  | Single LLM call | **Claude API**            | Specialized endpoints                                        |
| Multi-step pipelines with code-controlled logic | Workflow        | **Claude API + tool use** | You orchestrate the loop                                     |
| Custom agent with your own tools                | Agent           | **Claude API + tool use** | Maximum flexibility                                          |
| Server-managed stateful agent with workspace    | Agent           | **Managed Agents**        | Anthropic runs the loop and hosts the tool-execution sandbox |
| Persisted, versioned agent configs              | Agent           | **Managed Agents**        | Agents are stored objects; sessions pin to a version         |
| Long-running multi-turn agent with file mounts  | Agent           | **Managed Agents**        | Per-session containers, SSE event stream, Skills + MCP       |

> **Note:** Managed Agents is the right choice when you want Anthropic to run the agent loop *and* host the container where tools execute — file ops, bash, code execution all run in the per-session workspace. If you want to host the compute yourself or run your own custom tool runtime, Claude API + tool use is the right choice — use the tool runner for automatic loop handling, or the manual loop for fine-grained control (approval gates, custom logging, conditional execution).

> **Cloud-provider access.** **Claude Platform on AWS** is Anthropic-operated with same-day API parity — see `mini/12-claude-platform-on-aws.md` for client setup. For per-feature availability on **Claude Platform on AWS**, **Amazon Bedrock**, **Google Vertex AI**, and **Microsoft Foundry**, see `mini/11-platform-availability.md` — that table is the single source of truth in this skill; do not infer availability from anywhere else.

### Decision Tree

```
What does your application need?

0. Which provider?
   ├── First-party API or Claude Platform on AWS → continue (full surface available; per-feature exceptions in mini/11-platform-availability.md).
   └── Amazon Bedrock, Google Vertex AI, or Microsoft Foundry → Claude API (+ tool use for agents); see mini/11-platform-availability.md for per-feature support.

1. Single LLM call (classification, summarization, extraction, Q&A)
   └── Claude API — one request, one response

2. Do you want Anthropic to run the agent loop and host a per-session
   container where Claude executes tools (bash, file ops, code)?
   └── Yes → Managed Agents — server-managed sessions, persisted agent configs,
       SSE event stream, Skills + MCP, file mounts.
       Examples: "stateful coding agent with a workspace per task",
                 "long-running research agent that streams events to a UI",
                 "agent with persisted, versioned config used across many sessions"

3. Workflow (multi-step, code-orchestrated, with your own tools)
   └── Claude API with tool use — you control the loop

4. Open-ended agent (model decides its own trajectory, your own tools, you host the compute)
   └── Claude API agentic loop (maximum flexibility)
```

### Should I Build an Agent?

Before choosing the agent tier, check all four criteria:

- **Complexity** — Is the task multi-step and hard to fully specify in advance? (e.g., "turn this design doc into a PR" vs. "extract the title from this PDF")
- **Value** — Does the outcome justify higher cost and latency?
- **Viability** — Is Claude capable at this task type?
- **Cost of error** — Can errors be caught and recovered from? (tests, review, rollback)

If the answer is "no" to any of these, stay at a simpler tier (single call or workflow).

## Architecture

Everything goes through `POST /v1/messages`. Tools and output constraints are features of this single endpoint — not separate APIs.

**User-defined tools** — You define tools (via decorators, Zod schemas, or raw JSON), and the SDK's tool runner handles calling the API, executing your functions, and looping until Claude is done. For full control, you can write the loop manually.

**Server-side tools** — Anthropic-hosted tools that run on Anthropic's infrastructure. Code execution is fully server-side (declare it in `tools`, Claude runs code automatically). Computer use can be server-hosted or self-hosted.

**Structured outputs** — Constrains the Messages API response format (`output_config.format`) and/or tool parameter validation (`strict: true`). The recommended approach is `client.messages.parse()` which validates responses against your schema automatically. Note: the old `output_format` parameter is deprecated; use `output_config: {format: {...}}` on `messages.create()`.

**Supporting endpoints** — Batches (`POST /v1/messages/batches`), Files (`POST /v1/files`), Token Counting (`POST /v1/messages/count_tokens` — see `mini/16-token-counting.md`), and Models (`GET /v1/models`, `GET /v1/models/{id}` — live capability/context-window discovery) feed into or support Messages API requests.

## Reading Guide

After detecting the language, read the relevant files based on what the user needs.

**All SDK languages are split across the same set of per-language minis** — a readme mini (install, client init, basic request, thinking, caching, stop details, misc), a tool-use mini (tool definitions, agentic loop, Anthropic-defined tools, structured outputs), and a streaming/batches/files mini. Not every language mini covers every topic (e.g., Ruby folds tool use + streaming into one mini with no separate batches/files-api content; Go and Java have no batches content); if a topic is absent for a language, that feature's example is not yet documented for it — fall back to the cURL shape or WebFetch the SDK repo from `mini/13-live-sources.md`. **cURL** → `mini/85-curl-examples.md` (Managed Agents: `mini/86-curl-managed-agents.md`).

| Language   | Readme mini                        | Tool-use mini                              | Streaming/batches/files mini                  | Managed Agents mini                  |
| ---------- | ----------------------------------- | ------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| Python     | `mini/50-python-readme.md`         | `mini/51-python-tool-use.md`               | `mini/52-python-streaming-batches-files.md`    | `mini/53-python-managed-agents.md`    |
| TypeScript | `mini/55-typescript-readme.md`     | `mini/56-typescript-tool-use.md`           | `mini/57-typescript-streaming-batches-files.md`| `mini/58-typescript-managed-agents.md`|
| C#         | `mini/60-csharp-readme.md`         | `mini/61-csharp-tool-use.md`               | `mini/62-csharp-streaming-batches-files.md`    | none — see the Managed Agents note above |
| Go         | `mini/65-go-readme.md`             | `mini/66-go-tool-use.md`                   | `mini/67-go-streaming-files.md` (no batches)   | `mini/68-go-managed-agents.md`        |
| Java       | `mini/70-java-readme.md`           | `mini/71-java-tool-use.md`                 | `mini/72-java-streaming-files.md` (no batches) | `mini/73-java-managed-agents.md`      |
| PHP        | `mini/75-php-readme.md`            | `mini/76-php-tool-use.md`                  | `mini/77-php-streaming-batches-files.md`       | `mini/78-php-managed-agents.md`       |
| Ruby       | `mini/80-ruby-readme.md`           | `mini/81-ruby-tool-use-streaming.md` (tool use + streaming; no batches/files-api) | (same as tool-use mini) | `mini/82-ruby-managed-agents.md`      |
| cURL       | `mini/85-curl-examples.md`         | (same)                                      | (same)                                          | `mini/86-curl-managed-agents.md`      |

The Quick Task Reference below refers to "your language's readme/tool-use/streaming mini" using this table.

### Quick Task Reference

**Single text classification/summarization/extraction/Q&A:**
→ Read only your language's readme mini

**Chat UI or real-time response display:**
→ Read your language's readme mini + streaming/batches/files mini

**Long-running conversations (may exceed context window):**
→ Read your language's readme mini — see Compaction section
**Migrating to a newer model (Fable 5 / Opus 4.8 / Opus 4.7 / Opus 4.6 / Sonnet 5 / Sonnet 4.6) or replacing a retired model:**
→ Read `mini/20-model-migration.md`
**Prompting or tuning Fable 5 (long turns, effort, verbosity, autonomous runs, sub-agents):**
→ Read `mini/20-model-migration.md` → Migrating to Fable 5 → Behavioral shifts (prompt-tunable) + Long-running agent recommendations
**Prompt caching / optimize caching / "why is my cache hit rate low":**
→ Read `mini/15-prompt-caching.md` + your language's readme mini (Prompt Caching section)
**Count tokens in a file / prompt / diff ("how many tokens is X"):**
→ Read `mini/16-token-counting.md` — use `messages.count_tokens`, never `tiktoken`

**Function calling / tool use / agents:**
→ Read your language's readme mini + `mini/17-tool-use-concepts.md` + your language's tool-use mini

**Agent design (tool surface, context management, caching strategy):**
→ Read `mini/18-agent-design.md`

**Batch processing (non-latency-sensitive):**
→ Read your language's readme mini + streaming/batches/files mini

**File uploads across multiple requests:**
→ Read your language's readme mini + streaming/batches/files mini

**Managed Agents (server-managed stateful agents with workspace):**
→ Read `mini/30-managed-agents-overview.md` + the rest of the `mini/3x-managed-agents-*.md` series (`mini/31`–`mini/43`). For Python, TypeScript, Go, Ruby, PHP, and Java, read your language's Managed Agents mini (table above) for code examples. For cURL, read `mini/86-curl-managed-agents.md`. **Agents are persistent — create once, reference by ID.** Store the agent ID returned by `agents.create` and pass it to every subsequent `sessions.create`; do not call `agents.create` in the request path. The Anthropic CLI (`ant`) is one convenient way to create agents and environments from version-controlled YAML — see `mini/19-anthropic-cli.md`. If a binding you need isn't shown in the language mini, WebFetch the relevant entry from `mini/13-live-sources.md` rather than guess. C# has beta Managed Agents support — see `mini/60-csharp-readme.md` for details, or `mini/86-curl-managed-agents.md` for raw HTTP reference.

### Claude API (Full File Reference)

Read the **language-specific Claude API minis** — the readme/tool-use/streaming minis for every SDK language (table above), `mini/85-curl-examples.md` for cURL:

1. **Your language's readme mini** — **Read this first.** Installation, quick start, common patterns, error handling.
2. **`mini/17-tool-use-concepts.md`** — Read when the user needs function calling, code execution, memory, or structured outputs. Covers conceptual foundations.
3. **`mini/18-agent-design.md`** — Read when designing an agent: bash vs. dedicated tools, programmatic tool calling, tool search/skills, context editing vs. compaction vs. memory, caching principles.
4. **Your language's tool-use mini** — Read for language-specific tool use code examples (tool runner, manual loop, code execution, memory, structured outputs).
5. **Your language's streaming/batches/files mini** — Read when building chat UIs or interfaces that display responses incrementally.
6. **Your language's streaming/batches/files mini** — Read when processing many requests offline (not latency-sensitive). Runs asynchronously at 50% cost.
7. **Your language's streaming/batches/files mini** — Read when sending the same file across multiple requests without re-uploading.
8. **`mini/15-prompt-caching.md`** — Read when adding or optimizing prompt caching. Covers prefix-stability design, breakpoint placement, and anti-patterns that silently invalidate cache.
9. **`mini/14-error-codes.md`** — Read when debugging HTTP errors or implementing error handling. Includes the per-SDK typed exception class table and the Go `errors.As` pattern.
10. **`mini/20-model-migration.md`** — Read when upgrading to newer models, replacing retired models, or translating `budget_tokens` / prefill patterns to the current API.
11. **`mini/13-live-sources.md`** — WebFetch URLs for fetching the latest official documentation.

Not every language mini covers every topic (e.g., Ruby's streaming/batches/files content lives in its tool-use mini and has no batches/files-api section; Go and Java have no batches section); if a topic is absent, that feature's example is not yet documented for that language.

> **Note:** For the Managed Agents file reference, see the `## Managed Agents (Beta)` section above — it lists every `mini/3x-managed-agents-*.md` file and the language-specific Managed Agents minis.

## When to Use WebFetch

Use WebFetch to get the latest documentation when:

- User asks for "latest" or "current" information
- Cached data seems incorrect
- User asks about features not covered here

Live documentation URLs are in `mini/13-live-sources.md`.
