# Core: MCP Server Quality Mindset

Always-loaded foundation for building high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Load the focused minis (see INDEX) for the workflow, per-standard rules, language-specific code, and evaluations.

## What "quality" means here

Create MCP servers that enable LLMs to interact with external services through well-designed tools. **The quality of an MCP server is measured by how well it enables LLMs to accomplish real-world tasks** — NOT by how well or comprehensively the server implements tools. Quality is about how the implementations (input/output schemas, docstrings/descriptions, functionality) enable an LLM, with no other context and access ONLY to the MCP server, to answer realistic and difficult questions and complete real tasks.

## Agent-first tool design (design for the LLM that will call the tools)

- **API coverage vs. workflow tools:** Balance comprehensive API endpoint coverage with specialized workflow tools. Workflow tools can be more convenient for specific tasks; comprehensive coverage gives agents flexibility to compose operations. Performance varies by client — some clients benefit from code execution that combines basic tools, others work better with higher-level workflows. **When uncertain, prioritize comprehensive API coverage.**
- **Tool naming and discoverability:** Clear, descriptive tool names help agents find the right tools quickly. Use consistent prefixes (e.g., `github_create_issue`, `github_list_repos`) and action-oriented naming. (Full naming rules: see the naming mini.)
- **Tools should enable complete workflows, not just wrap API endpoints.** Tool names should reflect natural task subdivisions.
- **Keep tool operations focused and atomic.**

## Token-consciousness (context is scarce)

- Agents benefit from **concise tool descriptions** and the ability to **filter/paginate** results. Design tools that return **focused, relevant data**.
- **Response formats should optimize for agent context efficiency.** Omit verbose metadata; return only what the task needs. Some clients support code execution which can help agents filter and process data efficiently.
- Prefer **human-readable identifiers** where appropriate (display names with IDs, human-readable datetimes) so the agent doesn't waste effort decoding opaque values.
- Tools that return large JSON objects or lists can overwhelm the LLM — reduce information returned, paginate, and truncate with clear messages.

## Error-message discipline

- **Error messages must guide agents toward solutions** with specific suggestions and next steps — clear, actionable, and educational. An error should tell the agent what to do next (e.g., suggest a filter to reduce results, or the correct alternative tool).
- Descriptions must **precisely and unambiguously match actual functionality** — never over- or under-claim what a tool does.

## Composability / DRY (applies to every implementation)

Your implementation MUST prioritize composability and code reuse:

1. **Extract common functionality:** reusable helper functions for operations used across multiple tools; shared API clients for HTTP requests; centralized error-handling logic; business logic in dedicated composable functions; shared markdown/JSON field-selection & formatting.
2. **Avoid duplication:** NEVER copy-paste similar code between tools. If you write similar logic twice, extract it into a function. Common operations (pagination, filtering, field selection, formatting) should be shared. Authentication/authorization logic should be centralized.

## Strategic design checklist (cross-cutting — verify on every server)

- [ ] Tools enable complete workflows, not just API endpoint wrappers
- [ ] Tool names reflect natural task subdivisions
- [ ] Response formats optimize for agent context efficiency
- [ ] Human-readable identifiers used where appropriate
- [ ] Error messages guide agents toward correct usage

(Language-specific implementation and code-quality checklists live in the Python and Node minis.)
