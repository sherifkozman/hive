# Claude API: Loading Menu

Reference for the Claude API / Anthropic SDK. Detect the language first; 56 minis total. Use a preset when most of a track applies.

Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If most of this skill is relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.

## Core (load first)

- `mini/00-core.md` - routing, language detection, surface/decision tree, reading guide - **always load**
- `mini/01-model-api-quick-reference.md` - model ids/pricing, auth, thinking/effort, caching, fast mode, provider clients, server tools, all cross-language QRs - Load for model choice, params, or any quick lookup.
- `mini/02-common-pitfalls.md` - cross-cutting gotchas (thinking, prefill, refusal, tokenizer, tool JSON) - Load when writing or debugging any Claude call.

## Shared platform topics

- `mini/10-models.md` - Models API, capability lookup, older model ids - Load for "which model/context window/does X support Y".
- `mini/11-platform-availability.md` - per-feature support on Bedrock/Vertex/Foundry/AWS - Load when targeting a cloud provider.
- `mini/12-claude-platform-on-aws.md` - Claude Platform on AWS client setup - Load when using Claude on AWS.
- `mini/13-live-sources.md` - WebFetch URLs for latest SDK/API docs - Load when docs are missing or "latest" is asked.
- `mini/14-error-codes.md` - HTTP errors, per-SDK typed exception classes - Load when handling or debugging errors.
- `mini/15-prompt-caching.md` - prefix design, breakpoints, invalidator audit - Load when adding/optimizing caching.
- `mini/16-token-counting.md` - count_tokens usage - Load for "how many tokens is X".
- `mini/17-tool-use-concepts.md` - tool use, code execution, memory, structured outputs concepts - Load for any tool/agent work.
- `mini/18-agent-design.md` - tool surface, context management, caching strategy - Load when designing an agent.
- `mini/19-anthropic-cli.md` - `ant` CLI, auth profiles, scopes - Load for auth/profiles or CLI-driven setup.
- `mini/20-model-migration.md` - full migration guide (Fable 5 / Opus / Sonnet), breaking changes - Load for `migrate` or model upgrades.

## Managed Agents (shared concepts)

- `mini/30-managed-agents-overview.md` - reading guide, beta headers, pitfalls - Load first for Managed Agents.
- `mini/31-managed-agents-core.md` - agent/session lifecycle, mandatory flow - Load when building Managed Agents.
- `mini/32-managed-agents-environments.md` - environments, containers, file mounts - Load when configuring workspaces.
- `mini/33-managed-agents-tools.md` - tools, Skills, MCP on agents - Load when wiring agent tools.
- `mini/34-managed-agents-events.md` - SSE event stream reference - Load when consuming session events.
- `mini/35-managed-agents-outcomes.md` - outcomes/results handling - Load for terminal state handling.
- `mini/36-managed-agents-multiagent.md` - multi-agent orchestration - Load for multi-agent setups.
- `mini/37-managed-agents-webhooks.md` - webhooks - Load when using webhook callbacks.
- `mini/38-managed-agents-memory.md` - memory stores - Load when using agent memory.
- `mini/39-managed-agents-scheduled-deployments.md` - cron deployments - Load for scheduled/autonomous runs.
- `mini/40-managed-agents-client-patterns.md` - stream reconnect, interrupt, tool-confirmation, gotchas - Load when writing agent client code.
- `mini/41-managed-agents-onboarding.md` - interview script for setup from scratch - Load for `managed-agents-onboard` or new-agent walkthrough.
- `mini/42-managed-agents-api-reference.md` - full Managed Agents API reference - Load for endpoint/field details.
- `mini/43-managed-agents-self-hosted-sandboxes.md` - self-hosted sandboxes, monitoring/control - Load for self-hosted tool runtimes.

## Python

- `mini/50-python-readme.md` - install, client init, requests, thinking, caching - Load first for Python.
- `mini/51-python-tool-use.md` - tool runner, manual loop, code execution, structured outputs - Load for Python tools/agents.
- `mini/52-python-streaming-batches-files.md` - streaming, batches, files API - Load for Python streaming/batch/files.
- `mini/53-python-managed-agents.md` - Managed Agents code - Load for Python Managed Agents.

## TypeScript

- `mini/55-typescript-readme.md` - install, client init, requests, thinking, caching - Load first for TypeScript/JS.
- `mini/56-typescript-tool-use.md` - betaZodTool, tool runner, structured outputs - Load for TS tools/agents.
- `mini/57-typescript-streaming-batches-files.md` - streaming, batches, files API - Load for TS streaming/batch/files.
- `mini/58-typescript-managed-agents.md` - Managed Agents code - Load for TS Managed Agents.

## C#

- `mini/60-csharp-readme.md` - install, client init, requests, thinking, caching - Load first for C#.
- `mini/61-csharp-tool-use.md` - BetaToolRunner, raw JSON schema tools - Load for C# tools/agents.
- `mini/62-csharp-streaming-batches-files.md` - streaming, batches, files API - Load for C# streaming/batch/files.

## Go

- `mini/65-go-readme.md` - install, client init, requests, thinking, caching - Load first for Go.
- `mini/66-go-tool-use.md` - BetaToolRunner, code execution, structured outputs - Load for Go tools/agents.
- `mini/67-go-streaming-files.md` - streaming, files API - Load for Go streaming/files.
- `mini/68-go-managed-agents.md` - Managed Agents code - Load for Go Managed Agents.

## Java

- `mini/70-java-readme.md` - install, client init, requests, thinking, caching - Load first for Java/Kotlin/Scala.
- `mini/71-java-tool-use.md` - annotated tool classes, tool runner - Load for Java tools/agents.
- `mini/72-java-streaming-files.md` - streaming, files API - Load for Java streaming/files.
- `mini/73-java-managed-agents.md` - Managed Agents code - Load for Java Managed Agents.

## PHP

- `mini/75-php-readme.md` - install, client init, requests, thinking, caching - Load first for PHP.
- `mini/76-php-tool-use.md` - BetaRunnableTool, toolRunner - Load for PHP tools/agents.
- `mini/77-php-streaming-batches-files.md` - streaming, batches, files API - Load for PHP streaming/batch/files.
- `mini/78-php-managed-agents.md` - Managed Agents code - Load for PHP Managed Agents.

## Ruby

- `mini/80-ruby-readme.md` - install, client init, requests, thinking, caching - Load first for Ruby.
- `mini/81-ruby-tool-use-streaming.md` - BaseTool/tool_runner, streaming - Load for Ruby tools/streaming.
- `mini/82-ruby-managed-agents.md` - Managed Agents code - Load for Ruby Managed Agents.

## cURL / raw HTTP

- `mini/85-curl-examples.md` - raw HTTP request/streaming/tool-use shapes - Load for cURL/REST.
- `mini/86-curl-managed-agents.md` - Managed Agents over raw HTTP - Load for cURL Managed Agents.

## Presets

Per-track bundles (each = core + that track): `presets/shared.md`, `presets/python.md`, `presets/typescript.md`, `presets/csharp.md`, `presets/go.md`, `presets/java.md`, `presets/php.md`, `presets/ruby.md`, `presets/curl.md`. BUNDLE.md holds all minis (~192k tokens) - prefer a preset.
