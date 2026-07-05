# Implementation & Review Process (Phases 2–3)

Language-agnostic steps for building and then reviewing/testing the server. Use alongside the language-specific minis (Python or Node) for the actual code.

## Phase 2: Implementation

### 2.1 Set up project structure

See the language-specific minis for project setup:
- TypeScript: project structure, `package.json`, `tsconfig.json`.
- Python: module organization, dependencies.

### 2.2 Implement core infrastructure

Create shared utilities:
- API client with authentication
- Error handling helpers
- Response formatting (JSON/Markdown)
- Pagination support

### 2.3 Implement tools

For each tool:

**Input schema:**
- Use Zod (TypeScript) or Pydantic (Python)
- Include constraints and clear descriptions
- Add examples in field descriptions

**Output schema:**
- Define `outputSchema` where possible for structured data
- Use `structuredContent` in tool responses (TypeScript SDK feature)
- Helps clients understand and process tool outputs

**Tool description:**
- Concise summary of functionality
- Parameter descriptions
- Return type schema

**Implementation:**
- Async/await for I/O operations
- Proper error handling with actionable messages
- Support pagination where applicable
- Return both text content and structured data when using modern SDKs

**Annotations:**
- `readOnlyHint`: true/false
- `destructiveHint`: true/false
- `idempotentHint`: true/false
- `openWorldHint`: true/false

(Full annotation semantics: see the annotations mini.)

## Phase 3: Review and Test

### 3.1 Code quality

Review for:
- No duplicated code (DRY principle)
- Consistent error handling
- Full type coverage
- Clear tool descriptions

### 3.2 Build and test

**TypeScript:**
- Run `npm run build` to verify compilation
- Test with MCP Inspector: `npx @modelcontextprotocol/inspector`

**Python:**
- Verify syntax: `python -m py_compile your_server.py`
- Test with MCP Inspector

See the language-specific minis for detailed testing approaches and quality checklists.

## Phase 4: Create Evaluations

After implementing your MCP server, create comprehensive evaluations to test its effectiveness. Use evaluations to test whether LLMs can effectively use your MCP server to answer realistic, complex questions. The process (10 questions: tool inspection → content exploration → question generation → answer verification) and the harness for running them are covered in the evaluation minis.
