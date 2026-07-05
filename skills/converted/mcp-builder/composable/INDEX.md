# MCP Builder: Loading Menu

Building high-quality MCP servers. Implementation tasks: load only the chosen language's minis (Python OR Node), never both.

Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If most of this skill is relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.

- `mini/00-core.md` - quality mindset, agent-first design, token-consciousness, error discipline, composability - **always load**
- `mini/01-workflow-research-planning.md` - 4-phase workflow, Phase 1 research/planning, stack, doc navigation - Load when starting or planning a server.
- `mini/02-implementation-process.md` - Phase 2 build + Phase 3 review/test (language-agnostic) - Load when implementing or reviewing.
- `mini/03-naming-conventions.md` - server + tool naming rules (both languages) - Load when naming a server or tools.
- `mini/04-response-formats.md` - JSON vs Markdown output rules - Load when designing tool outputs.
- `mini/05-pagination.md` - limit/offset, metadata, defaults - Load when a tool lists resources.
- `mini/06-transport.md` - streamable HTTP vs stdio selection - Load when choosing/wiring transport.
- `mini/07-annotations.md` - readOnly/destructive/idempotent/openWorld hints - Load when setting tool annotations.
- `mini/08-security.md` - auth, input validation, DNS rebinding - Load when handling auth, input, or local HTTP.
- `mini/09-error-handling.md` - actionable error standards - Load when designing error paths.
- `mini/10-testing-and-documentation.md` - testing + doc requirements - Load when testing or documenting.
- `mini/11-python-implementation.md` - Python/FastMCP code patterns + full example - Load for Python tasks.
- `mini/12-python-advanced-and-checklist.md` - Python advanced features + quality checklist - Load for Python tasks.
- `mini/13-node-implementation.md` - Node/TypeScript code patterns + full example - Load for Node tasks.
- `mini/14-node-advanced-and-checklist.md` - Node advanced features, build + checklist - Load for Node tasks.
- `mini/15-evaluation-design.md` - designing 10 eval questions/answers - Load when creating evaluations.
- `mini/16-evaluation-running.md` - running the evaluation harness - Load when running evaluations.
