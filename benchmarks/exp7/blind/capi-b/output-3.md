# TypeScript CLI Chatbot — `chat.ts`

A complete, single-file interactive REPL chatbot built on the Claude API via
the official `@anthropic-ai/sdk` TypeScript SDK. It streams responses token
by token, exposes two tools (a real arithmetic calculator and a mock weather
lookup) with a full tool-use round trip including parallel tool calls,
manages conversation state across turns (including tool results), trims
history when it approaches the context window, classifies API errors by
typed exception class, and cancels an in-flight request on Ctrl-C without
losing conversation state.

## Design notes / how requirements map to code

- **Streaming REPL** — `client.messages.stream(...)` + `stream.on("text", ...)`
  (the documented best-practice way to get plain-text deltas), read via
  Node's `readline`.
- **Tool use, incl. parallel calls** — a manual agentic loop (not the beta
  tool runner) so the loop can be paused for trimming, aborted on Ctrl-C, and
  keep full control of message history. All `tool_use` blocks in a single
  assistant turn are executed concurrently with `Promise.all` and their
  results are returned in **one** `user` message, per the documented rule
  that splitting `tool_result` blocks across multiple messages trains the
  model to stop batching calls.
- **Conversation state** — a single `Anthropic.MessageParam[]` array that the
  loop mutates by appending the full `response.content` (never just the text)
  after every assistant turn, and a single combined `tool_result` message
  after every tool round, exactly as shown in the skill's manual-loop pattern.
- **Model selection** — `--model` flag, default `claude-opus-4-8` per the
  skill's stated default policy ("always use `claude-opus-4-8` unless the
  user explicitly names a different model" — the flag *is* that explicit
  naming mechanism). See the recommendation table below.
- **Error handling** — a most-specific-first `instanceof` chain over the
  SDK's typed exception classes (`AuthenticationError`, `PermissionDeniedError`,
  `NotFoundError`, `RateLimitError`, `InternalServerError` — which is where
  529/overloaded lands, disambiguated via `.type === "overloaded_error"` —
  `APIConnectionError`, `APIError`), never string-matching.
- **Context-window trim strategy** — before every request, `client.messages.countTokens`
  is used to check input size against a per-model budget (75% of the model's
  context window, leaving headroom for `max_tokens` output and the next
  turn); if over budget, the oldest complete conversational "turn" (a real
  user message plus everything up to the next real user message — so a
  `tool_use`/`tool_result` pair is never split) is dropped and the count is
  re-checked, repeating until under budget or only the most recent turn
  remains.
- **Ctrl-C abort** — a single `AbortController` per in-flight request, whose
  `signal` is passed as the SDK's per-request options (the same second-argument
  `RequestOptions` slot the skill documents for per-call `timeout` overrides).
  `readline`'s `"SIGINT"` event either aborts the in-flight controller (if a
  request is running) or exits the process (if idle at the prompt). Because
  `history` is only mutated *after* a request resolves successfully (assistant
  content) or after tools finish executing (tool results), an aborted request
  never leaves a partial/corrupt entry in the transcript — the array simply
  ends on the last valid message, ready to resume.

**One explicit, flagged assumption:** the skill's docs show `AbortController`
wiring only for a different surface (self-hosted Managed Agent sandboxes),
and `messages.countTokens` is only shown with `{model, messages}` (no
`system`). Passing `signal` through the same `RequestOptions` second argument
documented for `timeout`, and passing `system` to `countTokens` (mirroring
`messages.create`'s shape, for a more accurate pre-flight estimate) are
reasonable, standard extrapolations from documented patterns, not something
found verbatim in the skill — flagging per the skill's own "never guess SDK
usage" caution.

---

## `chat.ts`

```typescript
#!/usr/bin/env node
/**
 * chat.ts — Interactive streaming CLI chatbot on the Claude API.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx chat.ts [--model <model-id>] [--effort <low|medium|high|max|xhigh>]
 *
 * Features:
 *   - Streaming REPL chat
 *   - Two tools: calculator (real arithmetic) + get_weather (mock)
 *   - Parallel tool-call execution, results returned in a single message
 *   - Context-window-aware history trimming via messages.countTokens
 *   - Typed error handling (rate limit / overloaded / connection / auth / ...)
 *   - Ctrl-C aborts only the in-flight request; idle Ctrl-C exits cleanly
 */

import * as readline from "node:readline";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  model: string;
  effort?: string;
}

function parseArgs(argv: string[]): CliArgs {
  let model = "claude-opus-4-8"; // default per the skill's model-selection policy — see README table
  let effort: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--model") {
      model = argv[++i];
    } else if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
    } else if (arg === "--effort") {
      effort = argv[++i];
    } else if (arg.startsWith("--effort=")) {
      effort = arg.slice("--effort=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: chat.ts [--model <model-id>] [--effort <low|medium|high|max|xhigh>]",
      );
      process.exit(0);
    }
  }
  return { model, effort };
}

const { model, effort } = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Client — zero-arg constructor resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
// / an `ant auth login` profile automatically. Never hardcode a key.
// ---------------------------------------------------------------------------

const client = new Anthropic();

const SYSTEM_PROMPT =
  "You are a helpful, concise CLI assistant. You have access to a calculator " +
  "tool and a get_weather tool (mock data, not a real forecast). Use them " +
  "whenever the user's request calls for arithmetic or current weather " +
  "conditions rather than computing or guessing the answer yourself.";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const tools: Anthropic.Tool[] = [
  {
    name: "calculator",
    description:
      "Evaluate a basic arithmetic expression made of numbers, + - * / and " +
      "parentheses. Call this whenever the user asks you to compute, " +
      "calculate, or evaluate a math expression — do not do the arithmetic " +
      "yourself, use this tool for exact results.",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "The arithmetic expression to evaluate, e.g. '(2 + 3) * 4 / 2'",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "get_weather",
    description:
      "Get the current mock weather conditions for a city. Call this when " +
      "the user asks about current weather, temperature, or conditions in " +
      "a location. This returns simulated data, not a real forecast.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "City and state/country, e.g. 'San Francisco, CA' or 'Paris, France'",
        },
        unit: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "Temperature unit. Defaults to fahrenheit if omitted.",
        },
      },
      required: ["location"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/** Safe recursive-descent arithmetic evaluator — no eval()/Function(). */
function evaluateExpression(expr: string): number {
  if (!/^[0-9+\-*/(). \t]+$/.test(expr)) {
    throw new Error("Expression may only contain digits, + - * / ( ) and spaces");
  }

  let pos = 0;
  const peek = (): string | undefined => expr[pos];
  const skipSpaces = (): void => {
    while (pos < expr.length && /\s/.test(expr[pos])) pos++;
  };

  function parseNumber(): number {
    skipSpaces();
    const start = pos;
    while (pos < expr.length && /[0-9]/.test(expr[pos])) pos++;
    if (expr[pos] === ".") {
      pos++;
      while (pos < expr.length && /[0-9]/.test(expr[pos])) pos++;
    }
    if (pos === start) throw new Error(`Expected a number at position ${start}`);
    return Number(expr.slice(start, pos));
  }

  function parseFactor(): number {
    skipSpaces();
    if (peek() === "(") {
      pos++;
      const value = parseExpression();
      skipSpaces();
      if (peek() !== ")") throw new Error("Missing closing parenthesis");
      pos++;
      return value;
    }
    if (peek() === "-") {
      pos++;
      return -parseFactor();
    }
    if (peek() === "+") {
      pos++;
      return parseFactor();
    }
    return parseNumber();
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      skipSpaces();
      if (peek() === "*") {
        pos++;
        value *= parseFactor();
      } else if (peek() === "/") {
        pos++;
        const divisor = parseFactor();
        if (divisor === 0) throw new Error("Division by zero");
        value /= divisor;
      } else {
        break;
      }
    }
    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();
    for (;;) {
      skipSpaces();
      if (peek() === "+") {
        pos++;
        value += parseTerm();
      } else if (peek() === "-") {
        pos++;
        value -= parseTerm();
      } else {
        break;
      }
    }
    return value;
  }

  const result = parseExpression();
  skipSpaces();
  if (pos !== expr.length) {
    throw new Error(`Unexpected character at position ${pos}: '${expr[pos]}'`);
  }
  return result;
}

const WEATHER_CONDITIONS = [
  "sunny",
  "partly cloudy",
  "overcast",
  "light rain",
  "thunderstorms",
  "windy",
  "clear skies",
  "foggy",
];

/** Deterministic mock — same city always returns the same reading, no network call. */
function mockWeather(location: string, unit: "celsius" | "fahrenheit"): string {
  let hash = 0;
  for (const ch of location.toLowerCase()) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const condition = WEATHER_CONDITIONS[hash % WEATHER_CONDITIONS.length];
  const fahrenheit = 40 + (hash % 60); // 40-99°F
  const temp =
    unit === "celsius" ? Math.round(((fahrenheit - 32) * 5) / 9) : fahrenheit;
  const symbol = unit === "celsius" ? "°C" : "°F";
  return `${temp}${symbol} and ${condition} in ${location}. (mock data — not a real forecast)`;
}

interface ToolExecutionResult {
  content: string;
  isError: boolean;
}

async function executeTool(name: string, input: unknown): Promise<ToolExecutionResult> {
  try {
    if (name === "calculator") {
      const { expression } = input as { expression?: unknown };
      if (typeof expression !== "string" || expression.trim() === "") {
        throw new Error("`expression` must be a non-empty string");
      }
      return { content: String(evaluateExpression(expression)), isError: false };
    }

    if (name === "get_weather") {
      const { location, unit } = input as { location?: unknown; unit?: unknown };
      if (typeof location !== "string" || location.trim() === "") {
        throw new Error("`location` must be a non-empty string");
      }
      const resolvedUnit: "celsius" | "fahrenheit" =
        unit === "celsius" ? "celsius" : "fahrenheit";
      return { content: mockWeather(location, resolvedUnit), isError: false };
    }

    return { content: `Unknown tool: ${name}`, isError: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: `Error: ${message}`, isError: true };
  }
}

// ---------------------------------------------------------------------------
// Context-window trim strategy
// ---------------------------------------------------------------------------

// Context windows from the skill's current-models table (cached 2026-06-24).
const CONTEXT_WINDOWS: Record<string, number> = {
  "claude-fable-5": 1_000_000,
  "claude-mythos-5": 1_000_000,
  "claude-opus-4-8": 1_000_000,
  "claude-opus-4-7": 1_000_000,
  "claude-opus-4-6": 1_000_000,
  "claude-sonnet-5": 1_000_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-haiku-4-5": 200_000,
};
const DEFAULT_CONTEXT_WINDOW = 200_000; // conservative fallback for unrecognized/older model IDs
const TRIM_HEADROOM_FRACTION = 0.75; // start trimming once input tokens exceed 75% of the window

/**
 * A "turn" starts at a genuine user message (plain text), as opposed to a
 * user message that's actually a tool_result continuation of the previous
 * assistant turn. Trimming always removes whole turns so a tool_use/tool_result
 * pair is never split, and the history always still starts with a real user turn.
 */
function isUserTurnStart(message: Anthropic.MessageParam): boolean {
  if (message.role !== "user") return false;
  if (typeof message.content === "string") return true;
  return !message.content.some((block) => block.type === "tool_result");
}

async function trimHistoryIfNeeded(
  history: Anthropic.MessageParam[],
): Promise<void> {
  const contextWindow = CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
  const budget = Math.floor(contextWindow * TRIM_HEADROOM_FRACTION);

  for (;;) {
    const turnStarts = history
      .map((m, i) => (isUserTurnStart(m) ? i : -1))
      .filter((i) => i >= 0);

    if (turnStarts.length <= 1) return; // never trim away the only remaining turn

    const { input_tokens } = await client.messages.countTokens({
      model,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    if (input_tokens <= budget) return;

    const dropUntil = turnStarts[1]; // start of the second-oldest turn
    history.splice(0, dropUntil); // drop the oldest turn in its entirety
    console.error(
      `\n[context trimmed: was ${input_tokens} input tokens (budget ${budget}); ` +
        `dropped oldest turn, ${history.length} messages remain]`,
    );
  }
}

// ---------------------------------------------------------------------------
// Error reporting — most-specific-first typed exception chain
// ---------------------------------------------------------------------------

function reportError(err: unknown): void {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error(
      "\n[auth error] Invalid or missing API key. Set ANTHROPIC_API_KEY, or run `ant auth login`.",
    );
  } else if (err instanceof Anthropic.PermissionDeniedError) {
    console.error("\n[permission error] Your API key can't access this model or feature.");
  } else if (err instanceof Anthropic.NotFoundError) {
    console.error(
      `\n[not found] '${model}' may be an invalid or retired model ID — check --model.`,
    );
  } else if (err instanceof Anthropic.RateLimitError) {
    console.error(
      "\n[rate limited] Too many requests. The SDK already retried automatically " +
        "(default max_retries=2); wait a bit before sending another message.",
    );
  } else if (err instanceof Anthropic.InternalServerError) {
    if (err.type === "overloaded_error") {
      console.error("\n[overloaded] Claude API is at capacity right now — please retry shortly.");
    } else {
      console.error("\n[server error] An Anthropic-side issue occurred — please retry.");
    }
  } else if (err instanceof Anthropic.APIConnectionError) {
    console.error("\n[connection error] Could not reach the Claude API — check your network.");
  } else if (err instanceof Anthropic.APIError) {
    console.error(`\n[api error ${err.status}] ${err.message}`);
  } else {
    console.error("\n[unexpected error]", err);
  }
  // No assistant turn is appended when a request fails, so `history` is left
  // exactly as it was before this attempt — valid and resumable.
}

// ---------------------------------------------------------------------------
// Conversation loop
// ---------------------------------------------------------------------------

const history: Anthropic.MessageParam[] = [];
let currentAbortController: AbortController | null = null;

async function runTurn(userText: string): Promise<void> {
  history.push({ role: "user", content: userText });

  for (;;) {
    await trimHistoryIfNeeded(history);

    const controller = new AbortController();
    currentAbortController = controller;

    let message: Anthropic.Message;
    try {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: 64000, // streaming requests can afford a high ceiling; timeouts aren't a concern
          system: SYSTEM_PROMPT,
          tools,
          messages: history,
          ...(effort ? { output_config: { effort } } : {}),
        },
        { signal: controller.signal },
      );

      stream.on("text", (delta) => process.stdout.write(delta));
      message = await stream.finalMessage();
    } catch (err) {
      currentAbortController = null;
      if (controller.signal.aborted) {
        console.log(
          "\n[cancelled — conversation state preserved, ready for your next message]",
        );
        return;
      }
      reportError(err);
      return;
    }
    currentAbortController = null;

    // Always append the full content blocks (not just extracted text) — this
    // preserves tool_use blocks needed for the next round.
    history.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "tool_use") {
      const toolUseBlocks = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // Execute all requested tools concurrently...
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          process.stdout.write(
            `\n  [tool call: ${block.name}(${JSON.stringify(block.input)})]\n`,
          );
          const { content, isError } = await executeTool(block.name, block.input);
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content,
            is_error: isError,
          };
        }),
      );

      // ...but return them all in a single user message, never split.
      history.push({ role: "user", content: toolResults });
      continue;
    }

    if (message.stop_reason === "pause_turn") {
      // Server-side tool loop hit its internal iteration limit; the assistant
      // turn is already appended above — resend as-is and the API resumes.
      continue;
    }

    if (message.stop_reason === "refusal") {
      const category = message.stop_details?.category ?? "unspecified";
      console.log(`\n[response declined — category: ${category}]`);
    }

    if (message.stop_reason === "max_tokens") {
      console.log(
        "\n[response truncated at max_tokens — consider a shorter or more focused follow-up]",
      );
    }

    console.log(); // newline after the streamed text
    return;
  }
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let busy = false;

console.log(`Claude CLI chatbot — model: ${model}${effort ? `, effort: ${effort}` : ""}`);
console.log("Type a message and press Enter. Type /exit to quit.");
console.log("Press Ctrl-C while a response is streaming to cancel just that request;");
console.log("press Ctrl-C at an empty prompt to exit.\n");

// A single SIGINT handler covers both cases: abort the in-flight request if
// one exists, otherwise exit. readline keeps listening for Ctrl-C throughout
// the process's lifetime (it is never paused), so this fires reliably even
// while we're mid-`await` inside runTurn().
rl.on("SIGINT", () => {
  if (currentAbortController) {
    currentAbortController.abort();
    return; // runTurn's catch block reports cancellation and returns to the prompt
  }
  console.log("\nGoodbye!");
  rl.close();
  process.exit(0);
});

rl.on("line", (line) => {
  const text = line.trim();

  if (busy) {
    // A request is already in flight; ignore extra input rather than
    // interleaving two concurrent turns against the same history array.
    return;
  }
  if (text === "") {
    rl.prompt();
    return;
  }
  if (text === "/exit" || text === "exit") {
    console.log("Goodbye!");
    rl.close();
    process.exit(0);
  }

  busy = true;
  runTurn(text)
    .catch((err) => reportError(err))
    .finally(() => {
      busy = false;
      rl.prompt();
    });
});

rl.prompt();
```

---

## `package.json`

```json
{
  "name": "claude-chat-cli",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "chat": "tsx chat.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["chat.ts"]
}
```

---

## README section

### Setup

```bash
npm install @anthropic-ai/sdk
npm install -D tsx typescript @types/node
```

### API key

The client resolves credentials automatically, in this order: `ANTHROPIC_API_KEY`
→ `ANTHROPIC_AUTH_TOKEN` → an active `ant auth login` profile. For local dev,
either export a key or run `ant auth login` once and leave the client's
zero-arg constructor as-is — don't hardcode a key in source.

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Run

```bash
npx tsx chat.ts
# or with an explicit model / effort:
npx tsx chat.ts --model claude-sonnet-5 --effort high
```

At the prompt, type a message and press Enter. Ask something like
*"What's 12% of 340, and what's the weather in Tokyo and in Lima?"* to see
both tools fire, including in parallel across the two cities. Type `/exit` to
quit, or press Ctrl-C (idle: exits; mid-response: cancels just that request).

### Model recommendation (`--model`)

Default is `claude-opus-4-8`, per the skill's stated policy of defaulting to
Opus 4.8 unless a different model is explicitly requested — the `--model`
flag is exactly that explicit request mechanism.

| Model | Context | Price (in/out per 1M) | Recommended for | Why |
|---|---|---|---|---|
| `claude-opus-4-8` (default) | 1M | $5 / $25 | General-purpose default | Best all-around tool-use accuracy and instruction-following for a chatbot that has to decide *when* to call the calculator vs. the weather tool vs. neither; no reason to trade capability away unless volume/cost pushes you to. |
| `claude-sonnet-5` | 1M | $2–3 / $10–15 (intro pricing through 2026-08-31) | Cost/latency-sensitive deployments at moderate-to-high volume | Same 1M context, materially cheaper and faster than Opus, still strong at the simple tool-selection reasoning this bot needs. Good default if this chatbot is user-facing at scale rather than a personal CLI. |
| `claude-haiku-4-5` | 200K | $1 / $5 | High-volume, latency-critical, simple lookups | Cheapest and fastest tier; fine if the workload is dominated by straightforward calculator/weather calls rather than open-ended conversation, and 200K context is enough for a CLI chat session. |
| `claude-fable-5` | 1M | $10 / $50 | Not recommended for this use case | Reserved for demanding, long-horizon agentic reasoning; premium pricing and a materially different API surface (always-on thinking, no `budget_tokens`, opt-in refusal fallbacks) are unjustified overhead for a two-tool calculator/weather chatbot. |

If you explicitly need a fixed thinking-token budget or an older model
(e.g. Sonnet 4.5), pass it via `--model` — this CLI's request shape (no
`temperature`/`top_p`/`top_k`, adaptive thinking only) targets the current
model family and does not set `thinking`/`budget_tokens` at all; older
models will simply run without thinking, which is fine for this tool set.

### Error handling summary

- **429 rate limit / 5xx / network** — the SDK's built-in retry (`max_retries: 2`
  default) already retries these with backoff before the error ever reaches
  this CLI's catch block; if it still surfaces, the CLI prints a specific
  message per error type (rate limited, overloaded, server error, connection
  error) rather than a generic failure, and leaves the conversation state
  untouched so you can just try again.
- **Context-window overflow** — before every request, `chat.ts` checks
  `messages.countTokens` against 75% of the selected model's context window
  and, if over budget, drops the oldest complete turn (never splitting a
  `tool_use`/`tool_result` pair) until back under budget.
- **Ctrl-C mid-stream** — aborts only the in-flight HTTP request via
  `AbortController`; because history is only appended to *after* a request
  succeeds, the transcript is left in a valid, resumable state with no
  partial/corrupt entries.
