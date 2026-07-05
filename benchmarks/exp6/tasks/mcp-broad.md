# Task: mcp-builder / BROAD

Design and implement a complete, production-quality MCP server (Python, MCP
Python SDK / FastMCP style) for a fictional "TeamWiki" product API, delivered
as complete file contents in fenced blocks:

API surface to expose (in-memory fake backend is fine, but design as if real):
search pages, read page, create page, update page, list spaces, get recent
changes.

Requirements — the full craft, not just code:
1. Tool inventory design: which operations become tools, naming, granularity
   (justify consolidations/omissions).
2. Rigorous input schemas + agent-optimized descriptions for every tool.
3. Pagination and response-size control (token-consciousness: truncation,
   `detail` levels, next-page affordances).
4. Error handling designed for agents (actionable messages, no stack traces),
   including not-found, validation, and simulated-backend-failure paths.
5. `server.py` complete and runnable; brief README section describing setup
   and a design-decisions section.
6. A short evaluation plan: 5 realistic agent questions you would use to test
   this server end-to-end, each with the expected tool-call sequence.
