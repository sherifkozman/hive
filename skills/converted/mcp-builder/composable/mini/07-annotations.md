# Tool Annotations

Provide annotations to help clients understand tool behavior. Set them on every tool.

| Annotation | Type | Default | Description |
|-----------|------|---------|-------------|
| `readOnlyHint` | boolean | false | Tool does not modify its environment |
| `destructiveHint` | boolean | true | Tool may perform destructive updates |
| `idempotentHint` | boolean | false | Repeated calls with same args have no additional effect |
| `openWorldHint` | boolean | true | Tool interacts with external entities |

**Important:** Annotations are **hints, not security guarantees**. Clients should not make security-critical decisions based solely on annotations.

Set each hint to accurately reflect the tool:
- `readOnlyHint`: true if the tool does not modify environment
- `destructiveHint`: false if the tool does not perform destructive operations
- `idempotentHint`: true if repeated calls have no additional effect
- `openWorldHint`: false if the tool does not interact with external entities

(Language-specific syntax — the `annotations={...}` dict in the `@mcp.tool` decorator for Python, and the `annotations` object in `registerTool` for Node — lives in the language minis.)
