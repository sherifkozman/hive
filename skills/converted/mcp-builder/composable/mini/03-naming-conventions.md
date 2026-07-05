# Naming Conventions (Server & Tools)

## Server naming

Follow these standardized naming patterns:

- **Python:** `{service}_mcp` (lowercase with underscores) — e.g., `slack_mcp`, `github_mcp`, `jira_mcp`, `stripe_mcp`.
- **Node/TypeScript:** `{service}-mcp-server` (lowercase with hyphens) — e.g., `slack-mcp-server`, `github-mcp-server`, `jira-mcp-server`, `stripe-mcp-server`.

The name should be:
- **General** — descriptive of the service being integrated, not tied to specific features.
- **Descriptive** of the service/API being integrated.
- **Easy to infer** from the task description.
- **Without version numbers** or dates.

## Tool naming

1. **Use snake_case:** `search_users`, `create_project`, `get_channel_info`.
2. **Include service prefix** — anticipate that your MCP server may be used alongside other MCP servers, so include the service context to prevent overlaps:
   - Use `slack_send_message` instead of just `send_message`
   - Use `github_create_issue` instead of just `create_issue`
   - Use `asana_list_tasks` instead of just `list_tasks`
3. **Be action-oriented:** start with verbs (get, list, search, create, etc.).
4. **Be specific:** avoid generic names that could conflict with other servers.

Format: `{service}_{action}_{resource}` — e.g., `slack_send_message`, `github_create_issue`.

## Tool design

- Tool descriptions must **narrowly and unambiguously** describe functionality.
- Descriptions must **precisely match actual functionality**.
- Provide tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) — see the annotations mini.
- Keep tool operations **focused and atomic**.
