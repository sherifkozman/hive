# Task: claude-api / BROAD

Build a small but complete TypeScript CLI chatbot (`chat.ts`) using the
Claude API:

1. Interactive REPL chat with streaming responses printed as they arrive.
2. Tool use: implement two tools (a calculator and a mock weather lookup),
   with correct tool-definition schemas and the full tool-use round-trip
   (including parallel tool calls if the model requests them).
3. Conversation state managed correctly across turns (including tool results).
4. Model selection: a --model flag with a documented recommendation of which
   current models fit this use case and why (cost/latency/capability).
5. Error handling: rate limits, overloaded errors, context-window overflow
   (trim strategy), and abort on Ctrl-C mid-stream without corrupting state.
6. A short README section: setup, env var for the key, run instructions.

Deliver complete file contents in fenced blocks. Accuracy against the actual
Claude API and TypeScript SDK (imports, method names, streaming event types,
tool-use message shapes, current model IDs) is the primary grading criterion.
