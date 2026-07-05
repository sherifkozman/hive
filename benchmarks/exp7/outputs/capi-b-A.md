# Claude API CLI Chatbot — `chat.ts`

A complete, single-file TypeScript CLI chatbot built on the official
`@anthropic-ai/sdk` TypeScript SDK. It supports streaming responses, two
tools (calculator + mock weather) with full parallel tool-use round-trips,
correct multi-turn conversation state, a `--model` flag, and error handling
for rate limits, overload, context-window overflow, and Ctrl-C mid-stream.

Three files are delivered: `package.json`, `tsconfig.json`, and `chat.ts`,
followed by a short README section.

## `package.json`

```json
{
  "name": "claude-chat-cli",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Interactive terminal chatbot for the Claude API with streaming and tool use.",
  "scripts": {
    "start": "tsx chat.ts",
    "build": "tsc",
    "start:built": "node dist/chat.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

> The exact `@anthropic-ai/sdk` version above may not be the latest published
> release — run `npm view @anthropic-ai/sdk version` and pin whatever is
> current before installing, since the SDK ships frequently.

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
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["chat.ts"]
}
```

## `chat.ts`

```ts
/**
 * chat.ts — an interactive terminal chatbot for the Claude API.
 *
 * Features:
 *   1. Streaming REPL: assistant text is printed as it arrives.
 *   2. Two tools (calculator, get_weather) with the full tool-use round trip,
 *      including parallel tool calls when the model requests more than one
 *      tool in a single turn.
 *   3. Conversation state (including tool_use / tool_result blocks) is kept
 *      correctly across turns.
 *   4. --model flag; see the model recommendation below and in the README.
 *   5. Error handling for rate limits (429), overloaded (529), context-window
 *      overflow (trimmed with a whole-turn-aware sliding window), and a clean
 *      Ctrl-C abort mid-stream that never leaves the conversation history in
 *      an invalid (non-alternating / orphaned tool_use) state.
 *
 * Run with:  ANTHROPIC_API_KEY=sk-ant-... npx tsx chat.ts --model claude-sonnet-4-5-20250929
 *
 * Model recommendation (see README for the full write-up):
 *   - claude-sonnet-4-5-20250929  -> default for this CLI. Best balance of
 *     tool-use reliability, latency, and cost for an interactive chatbot.
 *   - claude-opus-4-5             -> pick this if you need the highest
 *     reasoning quality on hard multi-step tool orchestration and can accept
 *     higher cost/latency.
 *   - claude-haiku-4-5            -> pick this for the cheapest, lowest
 *     latency option when the assistant's job is simple lookups/formatting.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'node:readline/promises';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_OUTPUT_TOKENS = 4096;
const CONTEXT_SAFETY_MARGIN = 8_000; // headroom for system prompt, tool schemas, and the next reply

// Context windows for current model families. Matched by prefix so dated
// snapshots (e.g. "claude-sonnet-4-5-20250929") still resolve correctly.
// All current Claude models ship a 200K-token context window by default;
// some (e.g. Sonnet) support an opt-in long-context beta well beyond that,
// which is out of scope for this default-config CLI.
const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-3-7-sonnet': 200_000,
  'claude-3-5-sonnet': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-opus': 200_000,
};
const DEFAULT_CONTEXT_WINDOW = 200_000;

const SYSTEM_PROMPT =
  'You are a helpful, concise assistant running in a terminal chat session. ' +
  'Use the calculator or get_weather tools whenever they would give a more ' +
  'accurate answer than reasoning alone. You may call multiple tools at once ' +
  'if the user asks for more than one independent fact.';

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'calculator',
    description:
      'Evaluate a basic arithmetic expression made of numbers, parentheses, ' +
      'and the operators + - * / % ^ (^ is exponentiation). Use this for any ' +
      'arithmetic instead of computing it yourself, to guarantee accuracy.',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The arithmetic expression to evaluate, e.g. "(3 + 4) * 2 / 7".',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'get_weather',
    description:
      'Get the current mock weather conditions for a named location. ' +
      'This returns simulated/demo data, not a real forecast.',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City and, optionally, region/country, e.g. "Cairo, Egypt".',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit. Defaults to celsius if omitted.',
        },
      },
      required: ['location'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/**
 * A small, dependency-free recursive-descent arithmetic evaluator.
 * Deliberately avoids eval()/Function() so a malicious or malformed
 * expression from the model can never execute arbitrary JS.
 * Supports: + - * / % ^ (right-assoc power), unary +/-, parentheses, decimals.
 */
function safeEvaluate(expression: string): number {
  const s = expression.replace(/\s+/g, '');
  if (!s) throw new Error('Empty expression');
  let i = 0;

  function peekChar(): string | undefined {
    return s[i];
  }

  function expectChar(ch: string): void {
    if (s[i] !== ch) {
      throw new Error(`Expected '${ch}' at position ${i}, found '${s[i] ?? 'end of input'}'`);
    }
    i++;
  }

  function parseNumber(): number {
    const start = i;
    while (i < s.length && /[0-9]/.test(s[i])) i++;
    if (i < s.length && s[i] === '.') {
      i++;
      while (i < s.length && /[0-9]/.test(s[i])) i++;
    }
    if (i < s.length && (s[i] === 'e' || s[i] === 'E')) {
      i++;
      if (i < s.length && (s[i] === '+' || s[i] === '-')) i++;
      while (i < s.length && /[0-9]/.test(s[i])) i++;
    }
    const numStr = s.slice(start, i);
    if (!numStr || numStr === '.') {
      throw new Error(`Invalid number at position ${start}`);
    }
    return Number(numStr);
  }

  function parseFactor(): number {
    const ch = peekChar();
    if (ch === '(') {
      i++;
      const value = parseExpression();
      expectChar(')');
      return value;
    }
    if (ch === '-') {
      i++;
      return -parseFactor();
    }
    if (ch === '+') {
      i++;
      return parseFactor();
    }
    return parseNumber();
  }

  // '^' is right-associative and binds tighter than * /
  function parsePower(): number {
    const base = parseFactor();
    if (peekChar() === '^') {
      i++;
      const exponent = parsePower();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parseTerm(): number {
    let value = parsePower();
    while (peekChar() === '*' || peekChar() === '/' || peekChar() === '%') {
      const op = s[i];
      i++;
      const rhs = parsePower();
      if (op === '*') value *= rhs;
      else if (op === '/') value /= rhs;
      else value %= rhs;
    }
    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (peekChar() === '+' || peekChar() === '-') {
      const op = s[i];
      i++;
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  const result = parseExpression();
  if (i < s.length) {
    throw new Error(`Unexpected character '${s[i]}' at position ${i}`);
  }
  if (!Number.isFinite(result)) {
    throw new Error('Result is not a finite number (check for division by zero)');
  }
  return result;
}

function mockWeather(location: string, unit: 'celsius' | 'fahrenheit') {
  // Deterministic pseudo-random "forecast" derived from the location string,
  // so repeated calls for the same city are stable within a session.
  let hash = 0;
  for (const ch of location.toLowerCase()) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const conditions = ['sunny', 'partly cloudy', 'overcast', 'light rain', 'thunderstorms', 'snow', 'windy'];
  const condition = conditions[hash % conditions.length];
  const tempCelsius = 5 + (hash % 30); // 5..34 C
  const temperature = unit === 'fahrenheit' ? Math.round((tempCelsius * 9) / 5 + 32) : tempCelsius;
  return {
    location,
    unit,
    temperature,
    condition,
    humidity_percent: 30 + (hash % 60),
    note: 'Mock data for demonstration only — not a real forecast.',
  };
}

interface ToolExecutionResult {
  content: string;
  isError: boolean;
}

async function executeTool(name: string, input: unknown): Promise<ToolExecutionResult> {
  try {
    if (name === 'calculator') {
      const { expression } = (input ?? {}) as { expression?: string };
      if (typeof expression !== 'string' || !expression.trim()) {
        throw new Error('`expression` must be a non-empty string');
      }
      const result = safeEvaluate(expression);
      return { content: JSON.stringify({ expression, result }), isError: false };
    }
    if (name === 'get_weather') {
      const { location, unit } = (input ?? {}) as { location?: string; unit?: 'celsius' | 'fahrenheit' };
      if (typeof location !== 'string' || !location.trim()) {
        throw new Error('`location` must be a non-empty string');
      }
      const report = mockWeather(location, unit === 'fahrenheit' ? 'fahrenheit' : 'celsius');
      return { content: JSON.stringify(report), isError: false };
    }
    return { content: `Unknown tool: ${name}`, isError: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: `Tool error: ${message}`, isError: true };
  }
}

// ---------------------------------------------------------------------------
// Context-window management
// ---------------------------------------------------------------------------

function getContextWindow(model: string): number {
  const key = Object.keys(CONTEXT_WINDOWS).find((k) => model.startsWith(k));
  return key ? CONTEXT_WINDOWS[key] : DEFAULT_CONTEXT_WINDOW;
}

/** Crude, dependency-free token estimate: ~4 characters per token. */
function roughTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function messageTokenCount(message: Anthropic.MessageParam): number {
  if (typeof message.content === 'string') {
    return roughTokenCount(message.content);
  }
  let total = 0;
  for (const block of message.content) {
    if (block.type === 'text') {
      total += roughTokenCount(block.text);
    } else if (block.type === 'tool_use') {
      total += roughTokenCount(JSON.stringify(block.input));
    } else if (block.type === 'tool_result') {
      const c = block.content;
      total += roughTokenCount(typeof c === 'string' ? c : JSON.stringify(c));
    }
  }
  return total;
}

/**
 * A "fresh" user turn is a user message that carries real user text, as
 * opposed to a user message that only relays tool_result blocks back to the
 * model. Grouping messages by fresh-turn boundaries lets us trim whole
 * exchanges at once, so we never orphan a tool_use from its tool_result (the
 * API rejects a tool_use with no matching tool_result, and vice versa).
 */
function isFreshUserTurn(message: Anthropic.MessageParam): boolean {
  if (message.role !== 'user') return false;
  if (typeof message.content === 'string') return true;
  return message.content.some((block) => block.type === 'text');
}

function groupIntoTurns(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[][] {
  const groups: Anthropic.MessageParam[][] = [];
  for (const message of messages) {
    if (groups.length === 0 || isFreshUserTurn(message)) {
      groups.push([message]);
    } else {
      groups[groups.length - 1].push(message);
    }
  }
  return groups;
}

/**
 * Trims the oldest whole turns from `messages` (in place) until the
 * estimated token count fits within the model's context window, minus
 * headroom for the system prompt, tool schemas, and the reply. Always keeps
 * at least the most recent turn, even if it alone is oversized (nothing more
 * we can safely do there without truncating the user's own message).
 * Returns true if any trimming occurred.
 */
function trimHistory(messages: Anthropic.MessageParam[], model: string, systemPromptTokens: number): boolean {
  const budget = getContextWindow(model) - MAX_OUTPUT_TOKENS - CONTEXT_SAFETY_MARGIN - systemPromptTokens;
  const groups = groupIntoTurns(messages);
  let total = 0;
  for (const group of groups) {
    for (const m of group) total += messageTokenCount(m);
  }

  let trimmed = false;
  while (total > budget && groups.length > 1) {
    const dropped = groups.shift()!;
    for (const m of dropped) total -= messageTokenCount(m);
    trimmed = true;
  }

  if (trimmed) {
    messages.length = 0;
    for (const group of groups) messages.push(...group);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIUserAbortError) {
    return '[Interrupted — response cancelled by user (Ctrl-C).]';
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return '[Authentication failed (HTTP 401). Check that ANTHROPIC_API_KEY is set and valid.]';
  }
  if (err instanceof Anthropic.RateLimitError) {
    const retryAfter = err.headers?.['retry-after'];
    return `[Rate limited (HTTP 429).${retryAfter ? ` Retry after ~${retryAfter}s.` : ' Please wait a moment.'} Try your message again.]`;
  }
  if (err instanceof Anthropic.InternalServerError) {
    // The 'overloaded_error' body type (HTTP 529, "Overloaded") is >= 500 and
    // lands here; distinguish it for a clearer message when present.
    const body = (err as unknown as { error?: { error?: { type?: string } } }).error;
    const isOverloaded = err.status === 529 || body?.error?.type === 'overloaded_error';
    return isOverloaded
      ? '[The API is temporarily overloaded (HTTP 529). Please retry shortly.]'
      : `[The API returned a server error (HTTP ${err.status}). Please retry shortly.]`;
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `[Request rejected (HTTP 400): ${err.message} — if this mentions token/context limits, history will be trimmed automatically before the next attempt.]`;
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return '[Request timed out. Check your connection and try again.]';
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return '[Network error reaching the Anthropic API. Check your connection and try again.]';
  }
  if (err instanceof Anthropic.APIError) {
    return `[API error (HTTP ${err.status ?? 'unknown'}): ${err.message}]`;
  }
  if (err instanceof Error) {
    return `[Unexpected error: ${err.message}]`;
  }
  return `[Unexpected error: ${String(err)}]`;
}

// ---------------------------------------------------------------------------
// One assistant turn, including the full tool-use round trip
// ---------------------------------------------------------------------------

/**
 * Streams one assistant turn for the current `messages` history, printing
 * text as it arrives. If the model requests tool use, executes every
 * requested tool (in parallel if there is more than one), appends the
 * tool_result block(s) as a single user message, and loops until the model
 * returns a final (non tool_use) turn.
 *
 * Mutates `messages` in place, pushing exactly one assistant message per
 * round (which may itself contain tool_use blocks) and one user message per
 * round of tool results. Throws on any streaming/API error — the caller is
 * responsible for deciding how to recover conversation state (see main()).
 */
async function runTurn(
  client: Anthropic,
  model: string,
  messages: Anthropic.MessageParam[],
  signal: AbortSignal,
): Promise<void> {
  let done = false;
  while (!done) {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      },
      { signal },
    );

    // Print text deltas as they arrive. The high-level MessageStream helper
    // derives this from raw `content_block_delta` events of type
    // `text_delta`; it also accumulates tool_use `input_json_delta` chunks
    // for us so `finalMessage()` returns fully-parsed tool inputs.
    stream.on('text', (delta) => {
      process.stdout.write(delta);
    });

    const response = await stream.finalMessage();
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      process.stdout.write('\n');
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
          console.log(`  [tool call] ${block.name}(${JSON.stringify(block.input)})`);
          const { content, isError } = await executeTool(block.name, block.input);
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content,
            ...(isError ? { is_error: true } : {}),
          };
        }),
      );

      // All tool_result blocks for this round go into a single user message.
      messages.push({ role: 'user', content: toolResults });
      // Loop again so the model can see the tool results and produce a reply.
    } else {
      done = true;
      process.stdout.write('\n');
    }
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  model: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let model = DEFAULT_MODEL;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--model' || arg === '-m') {
      model = argv[++i] ?? model;
    } else if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length);
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }
  return { model, help };
}

function printHelp(): void {
  console.log(`Claude CLI Chat

Usage:
  npx tsx chat.ts [--model <model-id>]

Options:
  --model, -m <id>   Model to use (default: ${DEFAULT_MODEL})
  --help, -h         Show this help message

Model recommendation:
  claude-sonnet-4-5-20250929   Default. Best balance of tool-use reliability,
                                latency, and cost for an interactive chatbot.
  claude-opus-4-5               Highest reasoning quality for hard multi-step
                                tool orchestration; higher cost & latency.
  claude-haiku-4-5               Cheapest and fastest; best for simple lookups.

In-chat commands:
  exit | quit | :q   Leave the chat
  Ctrl-C             While a response is streaming: abort just that response.
                     While idle at the prompt: exit the program.
`);
}

// ---------------------------------------------------------------------------
// Main REPL
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { model, help } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('Set it with: export ANTHROPIC_API_KEY="sk-ant-..."');
    process.exit(1);
  }

  // apiKey defaults to process.env.ANTHROPIC_API_KEY; passed explicitly here
  // for clarity. maxRetries covers transient network hiccups/429/5xx with
  // the SDK's built-in exponential backoff (honoring Retry-After) before any
  // of our own error handling below ever sees the failure.
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 4,
  });

  const messages: Anthropic.MessageParam[] = [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let isStreaming = false;
  let controller: AbortController | null = null;

  // readline's own 'SIGINT' event lets us distinguish "abort the in-flight
  // response" from "exit the program" depending on what's happening when
  // Ctrl-C is pressed, without corrupting conversation state either way.
  rl.on('SIGINT', () => {
    if (isStreaming && controller) {
      controller.abort();
    } else {
      console.log('\nGoodbye!');
      rl.close();
      process.exit(0);
    }
  });

  console.log(`Claude CLI chat — model: ${model}`);
  console.log('Type "exit" to quit. Press Ctrl-C to interrupt a response mid-stream.\n');

  while (true) {
    let input: string;
    try {
      input = await rl.question('You: ');
    } catch {
      break; // interface closed (e.g. stdin ended)
    }

    const trimmed = input.trim();
    if (!trimmed) continue;
    if (['exit', 'quit', ':q'].includes(trimmed.toLowerCase())) break;

    messages.push({ role: 'user', content: trimmed });

    if (trimHistory(messages, model, roughTokenCount(SYSTEM_PROMPT))) {
      console.log('[context trimmed: dropped the oldest turn(s) to stay within the model\'s context window]');
    }

    controller = new AbortController();
    isStreaming = true;
    process.stdout.write('Claude: ');

    try {
      await runTurn(client, model, messages, controller.signal);
    } catch (err) {
      console.log(`\n${describeError(err)}`);
      // Whatever failed — abort, rate limit, overload, or anything else —
      // the last pushed message may be a lone 'user' message (the prompt
      // that triggered this turn, or a tool_result relay from a failed
      // follow-up call). If we let the next loop iteration push another
      // fresh 'user' message on top of that, the conversation would have two
      // consecutive user turns, which the API rejects. Insert a short
      // assistant placeholder to restore valid alternation and make the
      // failure visible in the transcript.
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages.push({
          role: 'assistant',
          content: [{ type: 'text', text: '[No response — the previous request did not complete.]' }],
        });
      }
    } finally {
      isStreaming = false;
      controller = null;
      console.log();
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
```

## Model recommendation (`--model`)

The CLI defaults to **`claude-sonnet-4-5-20250929`**. Rationale for an
interactive, tool-using chatbot like this one:

| Model | Capability | Latency | Cost | When to use here |
|---|---|---|---|---|
| `claude-opus-4-5` | Highest reasoning quality | Slowest | Highest | Swap in with `--model claude-opus-4-5` if conversations involve hard multi-step planning, ambiguous tool orchestration, or high-stakes correctness where cost/latency matter less than getting it right. |
| `claude-sonnet-4-5-20250929` (**default**) | Strong reasoning, excellent instruction-following and tool-use reliability | Fast | Mid | The best fit for a general-purpose REPL chatbot: reliably picks the right tool (including parallel calls), handles multi-turn context well, and is responsive enough for an interactive session without Opus-level cost. |
| `claude-haiku-4-5` | Good for straightforward tasks | Fastest | Lowest | Use with `--model claude-haiku-4-5` for high-volume or latency-sensitive deployments (e.g. a support widget) where most turns are simple lookups/formatting rather than deep reasoning. |

Notes:
- All three are tool-use capable and work with the exact code above — only
  the `model` string changes.
- Pin a dated snapshot (as the default does) for reproducible behavior in
  anything beyond local experimentation; un-dated aliases (e.g.
  `claude-sonnet-4-5`) track the latest snapshot and can change under you.
- Exact per-token pricing changes over time — check
  https://www.anthropic.com/pricing before making a final cost call; the
  relative ordering (Haiku cheapest → Sonnet mid → Opus priciest, same order
  for latency) has held consistently across model generations.

## README (setup, environment, running)

### Setup

```bash
npm install
```

This installs `@anthropic-ai/sdk` plus `typescript`/`tsx` for local
development.

### API key

Get a key from the Anthropic Console (https://console.anthropic.com/) and
export it as an environment variable — the SDK reads it automatically:

```bash
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

The CLI checks for this variable on startup and exits with a clear error if
it's missing.

### Running

Fastest path, no build step, using `tsx`:

```bash
npx tsx chat.ts
npx tsx chat.ts --model claude-opus-4-5
npx tsx chat.ts --help
```

Or compile with `tsc` and run the plain JS output:

```bash
npm run build
node dist/chat.js --model claude-haiku-4-5
```

### Using it

- Type a message and press Enter; the reply streams in as it's generated.
- Ask something that needs arithmetic ("what's 12% of 8,450 divided by 3?")
  or weather ("what's the weather in Lisbon and in Nairobi?") to see tool
  use — the second example triggers two parallel `get_weather` calls in one
  turn.
- Press **Ctrl-C** while a response is streaming to abort just that response
  (the conversation stays intact and you can keep chatting); press Ctrl-C
  while idle at the `You:` prompt to exit the program.
- Type `exit`, `quit`, or `:q` to leave normally.

LOADED: none
