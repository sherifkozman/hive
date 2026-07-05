# Claude API CLI Chatbot (`chat.ts`)

A small, complete TypeScript CLI chatbot built on `@anthropic-ai/sdk`. It streams
responses, supports two tools (a calculator and a mock weather lookup) with full
parallel tool-use round-tripping, keeps correct conversation state across turns,
takes a `--model` flag, and handles rate limits, overload, context overflow, and
Ctrl-C aborts.

## Model recommendation

The CLI defaults to `claude-opus-4-8` (this project's standing "most capable
unless told otherwise" policy), but for *this specific use case* — a chat REPL
with two lightweight tools (arithmetic, a weather stub) — the pragmatic choice
depends on what you're optimizing for:

| Model | Context | Input/Output $ per 1M | Why you'd pick it here |
|---|---|---|---|
| `claude-opus-4-8` (default) | 1M | $5 / $25 | Best raw capability and most reliable tool-call judgment (when to call the calculator vs. answer directly, cleanly handling ambiguous locations for the weather tool). Highest cost and slightly higher per-token latency — overkill for pure arithmetic/lookup chat, but the safest default if you don't want to think about model choice per query. |
| `claude-sonnet-5` | 1M | $3 / $15 (intro $2/$10 through 2026-08-31) | **The best fit for this app in practice.** Same 1M context as Opus, materially cheaper, and more than capable enough for "decide whether to call calculator/get_weather and hold a conversation." Pick this with `--model claude-sonnet-5` if you're running the chatbot a lot or exposing it to many users. |
| `claude-haiku-4-5` | 200K | $1 / $5 | Lowest latency and cost, good for a snappy interactive feel. Worth it if the bot is *only* ever doing simple arithmetic/weather chat and you don't need nuanced multi-step tool orchestration. Smaller (200K) context window means the trim strategy below kicks in sooner. |

`--model` lets you override per run; the code below also queries the live
Models API (`client.models.retrieve`) at startup so the context-window trim
threshold and the per-request `max_tokens` ceiling are always correct for
whichever model you pick, current or future, rather than hardcoded per model.

## `chat.ts`

```typescript
#!/usr/bin/env node
/**
 * chat.ts — a small interactive CLI chatbot for the Claude API.
 *
 * Features:
 *  - Interactive REPL with streamed responses (printed as they arrive).
 *  - Two tools — calculator and a mock weather lookup — with the full
 *    tool-use round trip, including parallel tool calls in one turn.
 *  - Conversation state (including tool_use/tool_result blocks) is kept
 *    correctly across turns.
 *  - `--model` flag (default: claude-opus-4-8).
 *  - Error handling: rate limits, overloaded (529), context-window overflow
 *    (client-side trim strategy), and a clean Ctrl-C abort mid-stream.
 *
 * Run with: npx tsx chat.ts [--model <id>]
 */

import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// Resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login`
// profile from the environment automatically — no key hardcoded here.
const client = new Anthropic();

const DEFAULT_MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT =
  "You are a helpful CLI assistant. Use the calculator tool for arithmetic " +
  "instead of computing it yourself, and use get_weather for weather " +
  "questions. You may call multiple tools in parallel when the user asks " +
  "about more than one thing at once.";

function parseArgs(argv: string[]): { model: string } {
  let model = DEFAULT_MODEL;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--model" && argv[i + 1]) {
      model = argv[i + 1];
      i++;
    } else if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
    }
  }
  return { model };
}

// ---------------------------------------------------------------------------
// Model limits (live lookup — avoids hardcoding per-model context windows)
// ---------------------------------------------------------------------------

interface ModelLimits {
  maxInputTokens: number;
  maxOutputTokens: number;
}

async function getModelLimits(model: string): Promise<ModelLimits> {
  try {
    const info = await client.models.retrieve(model);
    // max_input_tokens / max_tokens are populated on the Models API response;
    // fall back defensively in case of an older/unusual model entry.
    return {
      maxInputTokens: info.max_input_tokens ?? 200_000,
      maxOutputTokens: info.max_tokens ?? 8_192,
    };
  } catch {
    // Models API lookup failed (offline, restricted key, unknown model id,
    // etc.) — don't block the whole CLI on startup, use conservative defaults.
    console.error(
      `[warning] Could not look up limits for model "${model}"; using conservative defaults.`,
    );
    return { maxInputTokens: 200_000, maxOutputTokens: 8_192 };
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

interface CalculatorInput {
  expression: string;
}

interface WeatherInput {
  location: string;
  unit?: "celsius" | "fahrenheit";
}

const tools: Anthropic.Tool[] = [
  {
    name: "calculator",
    description:
      "Evaluate a basic arithmetic expression (+, -, *, /, parentheses, " +
      "decimals). Use this whenever the user asks for a calculation instead " +
      "of computing it yourself.",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "A basic arithmetic expression, e.g. '(2 + 3) * 4'",
        },
      },
      required: ["expression"],
      additionalProperties: false,
    },
  },
  {
    name: "get_weather",
    description:
      "Look up the current weather for a city. This is a MOCK tool for " +
      "demo purposes — it does not call a real weather service.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City and state/country, e.g. 'Paris, France'",
        },
        unit: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "Temperature unit; defaults to celsius.",
        },
      },
      required: ["location"],
      additionalProperties: false,
    },
  },
];

function runCalculator(calcInput: CalculatorInput): string {
  const expr = calcInput.expression ?? "";
  // Whitelist characters before evaluating — this is a demo sandbox, not a
  // general-purpose expression parser.
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    return JSON.stringify({ error: "Expression contains disallowed characters." });
  }
  try {
    const value = Function(`"use strict"; return (${expr});`)();
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return JSON.stringify({ error: "Expression did not evaluate to a finite number." });
    }
    return JSON.stringify({ result: value });
  } catch (err) {
    return JSON.stringify({
      error: `Could not evaluate expression: ${(err as Error).message}`,
    });
  }
}

const MOCK_WEATHER: Record<string, { tempC: number; condition: string }> = {
  paris: { tempC: 18, condition: "partly cloudy" },
  london: { tempC: 15, condition: "light rain" },
  tokyo: { tempC: 27, condition: "humid, sunny" },
  "new york": { tempC: 22, condition: "clear" },
};

function runWeather(weatherInput: WeatherInput): string {
  const key = (weatherInput.location ?? "").split(",")[0].trim().toLowerCase();
  const entry = MOCK_WEATHER[key] ?? { tempC: 20, condition: "mild" };
  const unit = weatherInput.unit ?? "celsius";
  const temperature =
    unit === "fahrenheit" ? Math.round((entry.tempC * 9) / 5 + 32) : entry.tempC;
  return JSON.stringify({
    location: weatherInput.location,
    unit,
    temperature,
    condition: entry.condition,
    note: "Mock data for demo purposes only.",
  });
}

/** Executes a tool by name; never throws — tool errors are reported back to
 * Claude as a `tool_result` with `is_error: true` rather than dropped. */
function executeTool(name: string, toolInput: unknown): { content: string; isError: boolean } {
  try {
    switch (name) {
      case "calculator":
        return { content: runCalculator(toolInput as CalculatorInput), isError: false };
      case "get_weather":
        return { content: runWeather(toolInput as WeatherInput), isError: false };
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: `Tool "${name}" threw: ${(err as Error).message}`, isError: true };
  }
}

// ---------------------------------------------------------------------------
// Conversation state & context-window trim strategy
// ---------------------------------------------------------------------------

/**
 * Conversation state is a list of "turns". Each turn is itself a list of
 * MessageParam entries: the user's text message, followed by any number of
 * (assistant tool_use) / (user tool_result) pairs from the tool-use loop,
 * ending in a final assistant text reply. Grouping by turn means the trim
 * strategy below can only ever drop *whole* turns — it can never leave a
 * dangling tool_use with no matching tool_result, or split a turn in half.
 */
type Turn = Anthropic.MessageParam[];

/**
 * If the full conversation is over ~80% of the model's input context window,
 * permanently drop the oldest turns (never the in-progress one) until it
 * fits, re-measuring with the API's own tokenizer each time via
 * `messages.countTokens` rather than estimating locally.
 *
 * This is a simple client-side trim. For models that support it (Fable 5,
 * Opus 4.6/4.7/4.8, Sonnet 5/4.6) Anthropic also offers server-side beta
 * compaction (`betas: ["compact-2026-01-12"]` +
 * `context_management: { edits: [{ type: "compact_20260112" }] }`), which
 * *summarizes* rather than discards old turns — a better fit if you need the
 * model to still recall earlier context. This CLI uses the manual trim
 * instead so it also works on models without compaction support (e.g. Haiku).
 */
async function trimHistoryIfNeeded(
  turns: Turn[],
  model: string,
  maxInputTokens: number,
): Promise<void> {
  const trimThreshold = Math.floor(maxInputTokens * 0.8);

  while (turns.length > 1) {
    const { input_tokens } = await client.messages.countTokens({
      model,
      system: SYSTEM_PROMPT,
      tools,
      messages: turns.flat(),
    });

    if (input_tokens <= trimThreshold) break;

    console.error(
      `\n[context] ~${input_tokens} input tokens exceeds 80% of this model's ` +
        `${maxInputTokens}-token window — dropping the oldest turn to make room.`,
    );
    turns.shift(); // always keep the current (last, in-progress) turn intact
  }
}

// ---------------------------------------------------------------------------
// Errors & retry policy
// ---------------------------------------------------------------------------

function backoffMs(attempt: number): number {
  return 1000 * 2 ** attempt + Math.random() * 250; // 1s, 2s, 4s, ... + jitter
}

/**
 * Returns a retry delay for errors worth retrying at the application level
 * (on top of the SDK's own automatic retries for 429/5xx/network errors —
 * this is for when those are exhausted), or null if the error shouldn't be
 * retried automatically.
 */
function getRetryDelayMs(err: unknown, attempt: number): number | null {
  if (err instanceof Anthropic.RateLimitError) {
    const retryAfter = err.headers?.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : backoffMs(attempt);
  }
  if (err instanceof Anthropic.InternalServerError && err.status === 529) {
    // Overloaded — err.type is "overloaded_error" for this case.
    return backoffMs(attempt);
  }
  return null;
}

function reportError(err: unknown): void {
  if (err instanceof Anthropic.NotFoundError) {
    console.error(`\n[error] Not found (404): ${err.message}`);
  } else if (err instanceof Anthropic.RateLimitError) {
    console.error(`\n[error] Rate limited (429): ${err.message}`);
  } else if (err instanceof Anthropic.InternalServerError && err.status === 529) {
    console.error(
      `\n[error] Claude is temporarily overloaded (529). Try again shortly, or ` +
        `switch to a less-loaded model with --model claude-haiku-4-5.`,
    );
  } else if (err instanceof Anthropic.InternalServerError) {
    console.error(`\n[error] Anthropic server error (${err.status}): ${err.message}`);
  } else if (err instanceof Anthropic.AuthenticationError) {
    console.error(
      "\n[error] Authentication failed (401). Set ANTHROPIC_API_KEY, or run `ant auth login`.",
    );
  } else if (err instanceof Anthropic.APIConnectionError) {
    console.error(`\n[error] Network error talking to the Anthropic API: ${err.message}`);
  } else if (err instanceof Anthropic.APIError) {
    console.error(`\n[error] API error (status ${err.status ?? "?"}): ${err.message}`);
  } else {
    console.error(`\n[error] Unexpected error: ${(err as Error)?.message ?? err}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// The agentic tool-use loop for a single turn (streaming)
// ---------------------------------------------------------------------------

async function runAgentTurn(
  model: string,
  maxInputTokens: number,
  maxOutputTokens: number,
  turns: Turn[],
  turn: Turn,
  setActiveStream: (s: ReturnType<typeof client.messages.stream> | null) => void,
): Promise<void> {
  const requestMaxTokens = Math.min(maxOutputTokens, 64_000);

  while (true) {
    await trimHistoryIfNeeded(turns, model, maxInputTokens);

    const stream = client.messages.stream({
      model,
      max_tokens: requestMaxTokens,
      system: SYSTEM_PROMPT,
      tools,
      messages: turns.flat(),
    });
    setActiveStream(stream);

    stream.on("text", (delta) => {
      process.stdout.write(delta);
    });

    let message: Anthropic.Message;
    try {
      message = await stream.finalMessage();
    } finally {
      setActiveStream(null);
    }
    process.stdout.write("\n");

    // Preserve full content blocks (not just extracted text) — required to
    // keep tool_use blocks intact for the next iteration.
    turn.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "max_tokens") {
      console.error("[warning] Response was cut off at the max_tokens limit.");
    }
    if (message.stop_reason === "refusal") {
      console.error(
        `[warning] Claude declined to continue.${
          message.stop_details ? ` (${JSON.stringify(message.stop_details)})` : ""
        }`,
      );
    }
    if (message.stop_reason === "pause_turn") {
      // A server-side tool paused mid-turn; resend as-is (assistant turn
      // already appended above) to let Claude continue.
      continue;
    }

    const toolUseBlocks = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      break; // end_turn / max_tokens / refusal — nothing left to execute
    }

    // Parallel tool calls: Claude may request several tool_use blocks in one
    // message. Execute them concurrently, then return every tool_result in a
    // single user message (never split across multiple user messages).
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        const { content, isError } = executeTool(block.name, block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content,
          is_error: isError,
        };
      }),
    );

    turn.push({ role: "user", content: toolResults });
  }
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

const MAX_TURN_RETRIES = 3;

async function main(): Promise<void> {
  const { model } = parseArgs(process.argv.slice(2));
  const { maxInputTokens, maxOutputTokens } = await getModelLimits(model);

  console.log(`Claude CLI chat — model: ${model} (context: ${maxInputTokens} tokens)`);
  console.log(
    "Type a message and press Enter. Ctrl-C aborts a response that's currently " +
      "streaming; Ctrl-C again with nothing in flight (or /exit) quits.\n",
  );

  const turns: Turn[] = [];
  const rl = readline.createInterface({ input, output });

  let activeStream: ReturnType<typeof client.messages.stream> | null = null;

  rl.on("SIGINT", () => {
    if (activeStream) {
      console.log("\n[Ctrl-C] aborting current response...");
      activeStream.abort();
    } else {
      console.log("\nBye!");
      rl.close();
      process.exit(0);
    }
  });

  for (;;) {
    const userInput = await rl.question("You> ").catch(() => null);
    if (userInput === null) break; // stdin closed (e.g. Ctrl-D)
    const trimmed = userInput.trim();
    if (!trimmed) continue;
    if (trimmed === "/exit") break;

    const turn: Turn = [{ role: "user", content: userInput }];
    turns.push(turn);

    let attempt = 0;
    for (;;) {
      try {
        await runAgentTurn(
          model,
          maxInputTokens,
          maxOutputTokens,
          turns,
          turn,
          (s) => {
            activeStream = s;
          },
        );
        break;
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError) {
          // User-initiated Ctrl-C: discard the whole in-progress turn so no
          // dangling tool_use / partial assistant message is left behind.
          // `turns` (and thus future requests) are unaffected otherwise.
          turns.pop();
          break;
        }

        const retryDelayMs = getRetryDelayMs(err, attempt);
        if (retryDelayMs !== null && attempt < MAX_TURN_RETRIES) {
          attempt++;
          console.error(
            `\n[retry] ${(err as Error).message} — retrying in ` +
              `${Math.round(retryDelayMs / 1000)}s (attempt ${attempt}/${MAX_TURN_RETRIES})...`,
          );
          // Roll the turn back to just the original user text before
          // retrying, discarding any partial assistant/tool_result state
          // from the failed attempt.
          turn.length = 1;
          await sleep(retryDelayMs);
          continue;
        }

        turns.pop();
        reportError(err);
        break;
      }
    }
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

## `package.json`

```json
{
  "name": "claude-cli-chat",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx chat.ts",
    "build": "tsc",
    "start:built": "node dist/chat.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["chat.ts"]
}
```

## `.env.example`

```bash
# Copy to .env and fill in, or export directly in your shell.
ANTHROPIC_API_KEY=sk-ant-...
```

## README — Setup & Usage

### Requirements

- Node.js 18+
- An Anthropic API key, or credentials from `ant auth login`

### Setup

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
# Alternative: run `ant auth login` once and skip the env var entirely —
# the SDK's zero-arg `new Anthropic()` picks up the active profile automatically.
```

### Run

```bash
npx tsx chat.ts                            # defaults to claude-opus-4-8
npx tsx chat.ts --model claude-sonnet-5    # cheaper/faster, still 1M context
npx tsx chat.ts --model=claude-haiku-4-5   # lowest cost/latency
```

Or via the npm script: `npm start -- --model claude-sonnet-5`.

Type a message and press Enter — the reply streams token-by-token as it's
generated. Try:

- `"What's (14 + 3) * 6 / 2?"` — exercises the `calculator` tool.
- `"What's the weather in Tokyo and in London?"` — exercises `get_weather`
  with two **parallel** tool calls in a single turn.

Controls:

- **Ctrl-C** while a response is streaming — aborts just that response; the
  conversation history is rolled back to before the question, so state stays
  consistent and you can keep chatting.
- **Ctrl-C** with nothing in flight, or typing `/exit` — quits the program.

### What's implemented

- **Streaming**: `client.messages.stream(...)` + `stream.on("text", ...)` +
  `stream.finalMessage()`.
- **Tools**: two custom tools (`calculator`, `get_weather`) via plain JSON
  Schema `input_schema` definitions, run through a manual agentic loop (so
  Ctrl-C, retries, and trimming can all hook into it) rather than the SDK's
  higher-level tool runner. Parallel `tool_use` blocks in one assistant
  message are executed concurrently and returned as `tool_result` blocks in a
  single following user message, per the API's requirements.
- **Conversation state**: grouped into per-turn arrays so the context-window
  trim strategy can only ever drop whole turns, never split a
  `tool_use`/`tool_result` pair.
- **Model selection**: `--model`/`--model=` flag; per-model input/output
  token limits are fetched live via `client.models.retrieve(model)` rather
  than hardcoded, so the trim threshold and per-request `max_tokens` stay
  correct for any model.
- **Error handling**: a most-specific-first `instanceof` chain over the
  SDK's typed exceptions (`RateLimitError`, `InternalServerError` w/ 529
  overload check, `AuthenticationError`, `NotFoundError`,
  `APIConnectionError`, base `APIError`), with a small app-level exponential
  backoff/retry (on top of the SDK's own automatic retries) for rate limits
  and overload, and a clean rollback-and-report path for everything else.
- **Context-window overflow**: before every request, `messages.countTokens`
  measures the real input size; if it's over 80% of the model's context
  window, the oldest whole turns are dropped until it fits again.
- **Ctrl-C mid-stream**: `stream.abort()` is called from the readline
  interface's `SIGINT` handler; the resulting `Anthropic.APIUserAbortError`
  is caught and the in-progress turn is discarded so history never contains
  a dangling `tool_use` or partial assistant message.

LOADED: skills/converted/claude-api/composable/INDEX.md, skills/converted/claude-api/composable/presets/typescript.md, skills/converted/claude-api/composable/mini/14-error-codes.md
