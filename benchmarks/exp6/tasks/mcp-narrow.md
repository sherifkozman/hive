# Task: mcp-builder / NARROW

Write the complete tool definitions (Python, using the MCP Python SDK /
FastMCP style) for an MCP server exposing a task-tracker API — ONLY the tool
layer, no server scaffolding beyond what a single file needs to be runnable:

Tools: `create_task(title, priority, due_date?)`, `list_tasks(status?,
assignee?, limit?)`, `complete_task(task_id)`. In-memory store is fine.

What is being evaluated (do these well):
- Input schemas: types, constraints, enums, defaults, optionality — rigorous.
- Tool descriptions written so an LLM agent reliably picks the right tool and
  arguments (this is the core of the task).
- Error handling and error messages designed for agent consumption
  (actionable, structured, non-throwing where the agent should retry).
- Response payloads: shape, what to include/omit, token-consciousness.

Deliver one complete runnable `server.py` in a fenced block plus a short
rationale for your schema/description/error choices. Do NOT add auth,
transport config, deployment, or extra tools.
