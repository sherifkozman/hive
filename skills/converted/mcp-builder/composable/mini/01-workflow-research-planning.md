# Workflow, Research & Planning (Phase 1)

Creating a high-quality MCP server involves **four main phases**: (1) Deep Research and Planning, (2) Implementation, (3) Review and Test, (4) Create Evaluations. This mini covers Phase 1 and how to navigate the reference documentation.

## Phase 1: Deep Research and Planning

### 1.1 Understand modern MCP design

The core design tensions (agent-first design, API coverage vs. workflow tools, naming/discoverability, context management, actionable errors) are covered in `00-core.md`. Internalize those before designing tools.

### 1.2 Study MCP protocol documentation

Navigate the MCP specification:
- Start with the sitemap to find relevant pages: `https://modelcontextprotocol.io/sitemap.xml`
- Then fetch specific pages with a `.md` suffix for markdown format (e.g., `https://modelcontextprotocol.io/specification/draft.md`).

Key pages to review:
- Specification overview and architecture
- Transport mechanisms (streamable HTTP, stdio)
- Tool, resource, and prompt definitions

### 1.3 Study framework documentation

**Recommended stack:**
- **Language: TypeScript** — high-quality SDK support and good compatibility in many execution environments (e.g. MCPB). AI models are good at generating TypeScript code, benefiting from its broad usage, static typing, and good linting tools.
- **Transport: Streamable HTTP** for remote servers, using **stateless JSON** (simpler to scale and maintain, as opposed to stateful sessions and streaming responses). **stdio** for local servers.

**Load framework documentation:**
- **MCP Best Practices** — core universal guidelines (see the naming, response-format, pagination, transport, security, annotations, error-handling, and testing minis).
- **For TypeScript (recommended):** Use WebFetch to load the TypeScript SDK README: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`. Then use the Node/TypeScript implementation minis.
- **For Python:** Use WebFetch to load the Python SDK README: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`. Then use the Python implementation minis.

### 1.4 Plan your implementation

- **Understand the API:** Review the service's API documentation to identify key endpoints, authentication requirements, and data models. Use web search and WebFetch as needed.
- **Tool selection:** Prioritize comprehensive API coverage. List the endpoints to implement, starting with the most common operations.

## Documentation library — what to load and when

**Core MCP documentation (load first):**
- MCP Protocol: start with the sitemap at `https://modelcontextprotocol.io/sitemap.xml`, then fetch specific pages with `.md` suffix.
- MCP Best Practices — universal guidelines including server/tool naming conventions, response format (JSON vs Markdown), pagination, transport selection (streamable HTTP vs stdio), security, and error handling.

**SDK documentation (load during Phase 1/2):**
- Python SDK: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- TypeScript SDK: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`

**Language-specific implementation guides (load during Phase 2):**
- Python (FastMCP): server initialization, Pydantic models, tool registration with `@mcp.tool`, complete working examples, quality checklist.
- TypeScript: project structure, Zod schema patterns, tool registration with `server.registerTool`, complete working examples, quality checklist.

**Evaluation guide (load during Phase 4):** question creation guidelines, answer verification strategies, XML format, example questions/answers, and running an evaluation with the provided scripts.

The remaining phases: Phase 2 (Implementation) and Phase 3 (Review and Test) — see `02-implementation-process.md`. Phase 4 (Create Evaluations) — see the evaluation minis.
