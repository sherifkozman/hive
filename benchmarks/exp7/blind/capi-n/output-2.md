# `batch_summarize.py` — Batch File Summarization with the Claude API

A production-quality script that summarizes every text file in a directory
using the Claude API: current SDK patterns, correct prompt-cache breakpoint
placement, pre-flight token counting against the model's real context window,
retry-after-aware error handling, and bounded concurrency (max 4 files in
flight at once).

```python
#!/usr/bin/env python3
"""
batch_summarize.py — Summarize a directory of text files with the Claude API.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...     # or use `ant auth login`
    python batch_summarize.py ./input_dir ./output_dir
    python batch_summarize.py ./input_dir ./output_dir --model claude-opus-4-8 --concurrency 4
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import random
import sys
from dataclasses import dataclass
from pathlib import Path

import anthropic

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
)
log = logging.getLogger("batch_summarize")

# --------------------------------------------------------------------------
# Model choice
# --------------------------------------------------------------------------
# claude-opus-4-8 is the current flagship model: 1M-token context window,
# strongest summarization quality per dollar once caching is accounted for
# (see design notes below for why raw per-token price is the wrong metric
# here), and it is the model this pipeline should default to unless the
# caller overrides --model. It also exposes `max_input_tokens` via the
# Models API so the token-budget check below is never hardcoded against a
# stale context-window number.
DEFAULT_MODEL = "claude-opus-4-8"

# Output is a short summary — no need for streaming or a large max_tokens.
MAX_OUTPUT_TOKENS = 1024

# Reserve headroom beyond the exact prompt + max_tokens so a slightly-off
# tokenizer edge case or the count_tokens/inference skew never trips a 400.
SAFETY_MARGIN_TOKENS = 1_000

# --------------------------------------------------------------------------
# Shared, cacheable prompt prefix: system instructions + few-shot examples.
# This is the *stable* part of every request. It must render byte-identical
# on every call for the cache to hit — no timestamps, no per-file content,
# no non-deterministic serialization anywhere in this block.
# --------------------------------------------------------------------------
SYSTEM_INSTRUCTIONS = """You are a precise technical summarizer. Given the \
contents of a text file, produce a concise summary (3-5 sentences) that \
captures the file's main purpose, key facts, and any action items. Do not \
include preamble like "This file is about" — start directly with the \
substance. If the file is empty or unintelligible, say so in one sentence."""

FEW_SHOT_EXAMPLES = """Here are examples of the expected input/output format:

Example 1
Input file (meeting_notes.txt):
"Standup 2026-01-14. Alice: finished the auth migration, blocked on staging \
creds from DevOps. Bob: onboarding new hire, slower velocity this week. \
Carol: filed three bugs in the payment webhook, will pair with Bob \
tomorrow. Action: someone needs to ping DevOps about staging creds today."
Summary: Team standup covering three workstreams: the auth migration is \
code-complete but blocked on staging credentials from DevOps, onboarding is \
reducing Bob's velocity this week, and Carol found three payment-webhook \
bugs she'll pair with Bob to fix. Action item: escalate the staging \
credentials request to DevOps today.

Example 2
Input file (readme_draft.txt):
"This library parses CSV files with configurable delimiters and quote \
characters. It streams rows instead of loading the whole file into memory, \
so it works on multi-GB files. Known limitation: it does not yet support \
embedded newlines inside quoted fields."
Summary: A streaming CSV parser supporting configurable delimiters and \
quote characters, designed to handle multi-gigabyte files without loading \
them fully into memory. Its one documented limitation is a lack of support \
for embedded newlines inside quoted fields.
"""

# Rendered system array. Render order for the whole request is
# tools -> system -> messages; a cache_control breakpoint on the *last*
# system block caches everything before it (instructions + few-shot) as one
# unit, since there are no tools in this pipeline.
#
# TTL choice: "1h" instead of the 5-minute default. A directory of files
# processed with only 4-way concurrency can easily take longer than 5
# minutes end-to-end (or run in bursts with gaps), and this prefix is reused
# by every single file in the batch — the doubled write cost (2x vs 1.25x)
# breaks even at 3 reads and this job will produce far more than 3 requests
# against the same prefix.
def build_system_blocks() -> list[dict]:
    return [
        {"type": "text", "text": SYSTEM_INSTRUCTIONS},
        {
            "type": "text",
            "text": FEW_SHOT_EXAMPLES,
            "cache_control": {"type": "ephemeral", "ttl": "1h"},
        },
    ]


def build_user_message(file_text: str) -> list[dict]:
    # Volatile, per-file content goes *after* the last breakpoint — it must
    # never carry cache_control itself, and nothing here should leak back
    # into the system blocks (no interpolating the filename/timestamp into
    # SYSTEM_INSTRUCTIONS, which would invalidate the shared cache for
    # every other file in the batch).
    return [{"role": "user", "content": f"Summarize this file:\n\n{file_text}"}]


# --------------------------------------------------------------------------
# Retry policy
# --------------------------------------------------------------------------
# The SDK itself auto-retries 429/5xx/connection errors (default
# max_retries=2). We disable that here (max_retries=0 per-call) and
# implement our own loop so we can: (a) honor a server-provided
# `retry-after` header exactly instead of blind exponential backoff, and
# (b) log every skip/retry with the filename for auditability, which the
# SDK's internal retry does not do.
MAX_ATTEMPTS = 5
BASE_DELAY = 1.0
MAX_DELAY = 60.0


class NonRetryable(Exception):
    """Raised to short-circuit the retry loop for a request that will never
    succeed no matter how many times it's retried (bad request, auth, etc.)."""


def _retry_after_seconds(exc: anthropic.RateLimitError) -> float | None:
    try:
        value = exc.response.headers.get("retry-after")
        return float(value) if value is not None else None
    except (AttributeError, ValueError):
        return None


async def call_with_retry(client: anthropic.AsyncAnthropic, **kwargs) -> anthropic.types.Message:
    """POST /v1/messages with retry logic that distinguishes retryable from
    non-retryable failures and honors `retry-after` when the API sends one."""
    last_exc: Exception | None = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return await client.with_options(max_retries=0).messages.create(**kwargs)

        # --- Non-retryable: bad request, auth, permissions, bad model id ---
        # These fail identically on every retry, so give up immediately.
        except (
            anthropic.BadRequestError,
            anthropic.AuthenticationError,
            anthropic.PermissionDeniedError,
            anthropic.NotFoundError,
            anthropic.UnprocessableEntityError,
        ) as exc:
            raise NonRetryable(f"{type(exc).__name__}: {exc.message}") from exc

        # --- Retryable: rate limited. Respect Retry-After if present. ---
        except anthropic.RateLimitError as exc:
            last_exc = exc
            delay = _retry_after_seconds(exc)
            if delay is None:
                delay = min(BASE_DELAY * (2 ** (attempt - 1)), MAX_DELAY)
            delay += random.uniform(0, 1)  # jitter, avoids a thundering herd
            log.warning(
                "rate limited (attempt %d/%d) — sleeping %.1fs (retry-after=%s)",
                attempt, MAX_ATTEMPTS, delay, _retry_after_seconds(exc),
            )
            await asyncio.sleep(delay)

        # --- Retryable: transient server-side failure (5xx / overloaded) ---
        # Non-retryable: any other 4xx not already special-cased above.
        except anthropic.APIStatusError as exc:
            if exc.status_code >= 500:
                last_exc = exc
                delay = min(BASE_DELAY * (2 ** (attempt - 1)), MAX_DELAY) + random.uniform(0, 1)
                log.warning(
                    "server error %s (attempt %d/%d) — sleeping %.1fs",
                    exc.status_code, attempt, MAX_ATTEMPTS, delay,
                )
                await asyncio.sleep(delay)
            else:
                raise NonRetryable(f"{exc.status_code} {exc.type}: {exc.message}") from exc

        # --- Retryable: network failure before any HTTP response arrived ---
        except anthropic.APIConnectionError as exc:
            last_exc = exc
            delay = min(BASE_DELAY * (2 ** (attempt - 1)), MAX_DELAY) + random.uniform(0, 1)
            log.warning(
                "connection error (attempt %d/%d) — sleeping %.1fs: %s",
                attempt, MAX_ATTEMPTS, delay, exc,
            )
            await asyncio.sleep(delay)

    raise RuntimeError(f"exhausted {MAX_ATTEMPTS} attempts") from last_exc


# --------------------------------------------------------------------------
# Token-budget pre-flight check
# --------------------------------------------------------------------------
@dataclass
class TokenBudget:
    max_input_tokens: int  # from the live Models API, not hardcoded
    usable_tokens: int     # max_input_tokens - max_tokens - safety margin


async def fetch_token_budget(client: anthropic.AsyncAnthropic, model: str) -> TokenBudget:
    model_info = await client.models.retrieve(model)
    max_input = model_info.max_input_tokens
    usable = max_input - MAX_OUTPUT_TOKENS - SAFETY_MARGIN_TOKENS
    log.info(
        "model %s: max_input_tokens=%d, usable after reserving output+margin=%d",
        model, max_input, usable,
    )
    return TokenBudget(max_input_tokens=max_input, usable_tokens=usable)


async def count_request_tokens(
    client: anthropic.AsyncAnthropic, model: str, system_blocks: list[dict], user_content: list[dict]
) -> int:
    resp = await client.messages.count_tokens(
        model=model,
        system=system_blocks,
        messages=user_content,
    )
    return resp.input_tokens


# --------------------------------------------------------------------------
# Per-file worker
# --------------------------------------------------------------------------
@dataclass
class FileResult:
    path: Path
    status: str  # "ok" | "skipped_too_large" | "failed"
    summary: str | None = None
    detail: str | None = None


async def summarize_file(
    client: anthropic.AsyncAnthropic,
    model: str,
    system_blocks: list[dict],
    budget: TokenBudget,
    path: Path,
    semaphore: asyncio.Semaphore,
) -> FileResult:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return FileResult(path, "failed", detail=f"read error: {exc}")

    user_content = build_user_message(text)

    # Count tokens for the *exact* request we're about to send (shared
    # system prefix + this file's content) before spending a real call.
    token_count = await count_request_tokens(client, model, system_blocks, user_content)
    if token_count > budget.usable_tokens:
        log.warning(
            "SKIP %s — %d tokens exceeds usable budget of %d (context window %d, "
            "reserved %d for output+margin)",
            path.name, token_count, budget.usable_tokens,
            budget.max_input_tokens, MAX_OUTPUT_TOKENS + SAFETY_MARGIN_TOKENS,
        )
        return FileResult(path, "skipped_too_large", detail=f"{token_count} tokens")

    # Bound concurrency to 4 in-flight requests. asyncio + a semaphore keeps
    # this safe without shared mutable state: each task owns its own local
    # variables, and results are returned (not appended to a shared list
    # from multiple threads), so there's no data race to guard with a lock.
    async with semaphore:
        try:
            response = await call_with_retry(
                client,
                model=model,
                max_tokens=MAX_OUTPUT_TOKENS,
                system=system_blocks,
                messages=user_content,
            )
        except NonRetryable as exc:
            log.error("FAILED %s — non-retryable: %s", path.name, exc)
            return FileResult(path, "failed", detail=str(exc))
        except Exception as exc:  # noqa: BLE001 - surface anything unexpected, don't crash the batch
            log.error("FAILED %s — %s", path.name, exc)
            return FileResult(path, "failed", detail=str(exc))

    summary_text = next(
        (block.text for block in response.content if block.type == "text"), ""
    )
    log.info(
        "OK %s — input=%d cache_read=%d cache_write=%d output=%d",
        path.name,
        response.usage.input_tokens,
        response.usage.cache_read_input_tokens,
        response.usage.cache_creation_input_tokens,
        response.usage.output_tokens,
    )
    return FileResult(path, "ok", summary=summary_text)


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------
async def run(input_dir: Path, output_dir: Path, model: str, concurrency: int) -> int:
    files = sorted(p for p in input_dir.iterdir() if p.is_file() and p.suffix in (".txt", ".md"))
    if not files:
        log.warning("no .txt/.md files found in %s", input_dir)
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    system_blocks = build_system_blocks()
    semaphore = asyncio.Semaphore(concurrency)

    async with anthropic.AsyncAnthropic() as client:
        budget = await fetch_token_budget(client, model)

        # Fire the first request alone and let it start streaming/return
        # before firing the rest. A cache entry only becomes readable once
        # the first response begins — N simultaneous requests against an
        # unwarmed prefix would all pay full (uncached) price. Sequencing
        # file[0] ahead of the semaphore-bounded pool lets it write the
        # cache; files[1:] then read it.
        first, rest = files[0], files[1:]
        first_result = await summarize_file(client, model, system_blocks, budget, first, semaphore)
        results = [first_result]

        if rest:
            tasks = [
                summarize_file(client, model, system_blocks, budget, p, semaphore)
                for p in rest
            ]
            results.extend(await asyncio.gather(*tasks))

    ok = skipped = failed = 0
    for r in results:
        if r.status == "ok":
            ok += 1
            out_path = output_dir / f"{r.path.stem}.summary.txt"
            out_path.write_text(r.summary or "", encoding="utf-8")
        elif r.status == "skipped_too_large":
            skipped += 1
        else:
            failed += 1

    log.info("done: %d ok, %d skipped (too large), %d failed", ok, skipped, failed)
    return 0 if failed == 0 else 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--concurrency", type=int, default=4)
    args = parser.parse_args()

    if not args.input_dir.is_dir():
        parser.error(f"{args.input_dir} is not a directory")

    exit_code = asyncio.run(
        run(args.input_dir, args.output_dir, args.model, args.concurrency)
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
```

## Design Notes

### Model choice

`claude-opus-4-8` is the default flagship model and the right fit here: a
1M-token context window (files that would overflow a 200K-class model still
fit), strong summarization quality, and — critically for a *batch* pipeline
— its per-token price is not the right lens on cost. With the shared
system+few-shot prefix cached, every file after the first pays ~0.1x input
price for that shared portion; the marginal cost of running the batch on a
stronger model is small relative to the fixed cost of getting summaries
wrong and having to re-run. The script also does not hardcode the 1M figure:
`fetch_token_budget()` calls `client.models.retrieve(model)` and reads
`max_input_tokens` live, so the token-budget check stays correct if `--model`
is swapped for something with a different window (e.g. `claude-haiku-4-5` at
200K) without touching the code.

`max_tokens=1024` is deliberately small — the output is a short summary, so
there's no need for the 16K/64K defaults or streaming that apply to
long-form generation; a short non-streaming call comfortably avoids the SDK
HTTP timeout.

### Caching strategy

The cache key is a prefix match: `tools -> system -> messages`, and any byte
difference before a breakpoint invalidates everything after it. This
pipeline's only stable, reused content is the system instructions and the
few-shot examples — every file's content is unique and belongs strictly
*after* the cache boundary. Concretely:

- `build_system_blocks()` returns two system text blocks: instructions, then
  few-shot examples. The `cache_control: {"type": "ephemeral", "ttl": "1h"}`
  breakpoint sits on the **last** system block (the few-shot examples), which
  caches both blocks as one unit (there are no `tools` in this pipeline, so
  system is the first thing rendered).
- The per-file content lives entirely in the `messages` array, after the
  last breakpoint, and never gets a `cache_control` marker — if it did,
  every file would write a distinct (never-reread) cache entry instead of
  reading the shared one.
- **1-hour TTL over the 5-minute default:** the write premium is higher
  (2x vs 1.25x), which only pays off after 3 reads instead of 2 — but a
  directory-wide batch bounded to 4 concurrent requests will produce far
  more than 3 requests against the identical prefix, and a 1-hour TTL
  survives gaps between bursts (e.g., if the directory listing is large and
  processing spans minutes).
- **Cache-warm ordering:** a cache entry only becomes readable once the
  first request against that prefix *begins* returning. If all N requests
  fired simultaneously against a cold cache, none would find a prior entry
  to read — they'd all write. `run()` therefore sends file 0 by itself,
  waits for it to complete (which writes the cache), and only then starts
  the semaphore-bounded pool for the rest, so files 1..N read what file 0
  wrote.
- Nothing volatile (timestamps, per-file names, request IDs) is
  interpolated into `SYSTEM_INSTRUCTIONS` or `FEW_SHOT_EXAMPLES` — that's
  the most common silent-invalidator bug, and it would defeat caching for
  every file in the batch, not just one.
- `response.usage.cache_read_input_tokens` / `cache_creation_input_tokens`
  are logged per file specifically so a cache regression (all-zero reads
  after file 0) is visible in the logs rather than silently eating cost.

### Token counting

Before every real request, `count_request_tokens()` calls
`client.messages.count_tokens(model=..., system=system_blocks,
messages=user_content)` — the same shared system blocks plus that file's
exact user message — and compares the result to `budget.usable_tokens`,
which is `max_input_tokens` (fetched live from the Models API) minus the
reserved output (`max_tokens=1024`) and a 1,000-token safety margin. Files
that would exceed the budget are skipped and logged with the actual token
count, never silently truncated. `count_tokens` is model-specific by
design (different models tokenize differently), so it's always called with
the same `model` the real request will use — never a cached/hardcoded
number, and never `tiktoken` (which is OpenAI's tokenizer and materially
undercounts Claude tokens).

### Error taxonomy

`call_with_retry()` catches exceptions most-specific-first, split into two
groups:

**Non-retryable — fail fast, log, move on:**
`BadRequestError` (400), `AuthenticationError` (401),
`PermissionDeniedError` (403), `NotFoundError` (404, e.g. a bad model ID),
`UnprocessableEntityError` (422), and any other `APIStatusError` with
`status_code < 500` not already listed. These represent a request that is
wrong or unauthorized in a way retrying will never fix; they're wrapped in
a local `NonRetryable` and bubble straight up to the per-file worker, which
logs and marks that file `failed` without blocking the rest of the batch.

**Retryable — back off and try again (up to `MAX_ATTEMPTS = 5`):**
`RateLimitError` (429) — the delay comes from the response's `retry-after`
header when the server sends one (the correct source of truth for how long
to wait), falling back to exponential backoff (`1s, 2s, 4s, 8s, 16s`, capped
at 60s) plus jitter only when no header is present; `APIStatusError` with
`status_code >= 500` (transient service errors / `529 overloaded_error`);
and `APIConnectionError` (network failure before any HTTP response — no
status code to branch on, so it's always treated as transient). Each retry
is logged with the attempt number and computed delay for observability.

The SDK's own built-in retry (`max_retries=2` by default, covering 429/5xx/
connection errors) is deliberately disabled per-call
(`client.with_options(max_retries=0)`) so this custom loop has exclusive
control over backoff timing and per-file logging — running both layers
stacked would make the effective retry count and delay hard to reason
about.

### Concurrency

`asyncio.Semaphore(concurrency)` (default 4) bounds the number of
in-flight `messages.create` calls; `AsyncAnthropic` plus `asyncio.gather`
means every file's work runs as an independent coroutine with its own
local state, so there is no shared-list-mutation-from-multiple-threads
hazard to guard with a lock — each task returns its `FileResult` and the
list is assembled after `gather` completes. The one exception to "just
throw all files at the semaphore" is the deliberate first-request-alone
step described above, which exists purely to let the shared cache entry
get written before the concurrent pool starts reading it.
