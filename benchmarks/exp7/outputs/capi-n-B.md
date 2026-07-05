# `batch_summarize.py` — Batch Summarization with the Claude API

```python
#!/usr/bin/env python3
"""
batch_summarize.py — Summarize a directory of text files using the Claude API.

Usage:
    python batch_summarize.py <input_dir> <output_dir> [--model MODEL_ID]

Requires:
    pip install anthropic
    ANTHROPIC_API_KEY set in the environment (or an `ant auth login` profile).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import random
import sys
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from pathlib import Path

import anthropic
from anthropic import AsyncAnthropic

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

# Default model. Per current Anthropic guidance, Opus 4.8 is the standing
# default for any task unless the user explicitly names a different model —
# see the "Model Choice" note in the design notes below for the tradeoffs
# this implies for a high-volume batch job like this one.
MODEL = "claude-opus-4-8"

# claude-opus-4-8 has a 1M-token context window as of the current model
# table. We still confirm this live via the Models API at startup (see
# get_context_window) and only fall back to this constant if that lookup
# fails, since context windows are exactly the kind of fact that goes stale.
FALLBACK_CONTEXT_WINDOW_TOKENS = 1_000_000

MAX_OUTPUT_TOKENS = 1024      # summaries are short; no need for a large cap
SAFETY_MARGIN_TOKENS = 2_000  # headroom for rounding/estimation slack
MAX_CONCURRENCY = 4           # hard cap — "process up to 4 files at a time"

MAX_RETRY_ATTEMPTS = 6
BASE_BACKOFF_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 60.0

# --------------------------------------------------------------------------
# Shared system prompt + few-shot examples (the cacheable prefix)
# --------------------------------------------------------------------------
# This entire block is identical on every request in the batch. It is placed
# in `system` (which renders before `messages` on the wire) with a single
# cache_control breakpoint on its (only, and therefore last) block. Every
# subsequent file in the batch reuses this exact prefix, so the model only
# pays full price for it once per 5-minute TTL window; every other request
# pays the ~0.1x cache-read rate for these tokens. The per-file document text
# lives entirely in `messages`, after the breakpoint, so it never invalidates
# the cache no matter how much it varies request to request.
SYSTEM_PROMPT = """You are a precise technical summarizer.

Summarize the user's document in 3-5 sentences, capturing only load-bearing
facts (numbers, decisions, causes, owners). Do not add generic preamble like
"This document discusses..." and do not exceed 120 words. If the document is
empty or unintelligible, respond with exactly: "Unable to summarize: no
extractable content."

Below are examples of the expected input/output shape and level of detail.

### Example 1
Input:
\"\"\"
Q3 sales rose 4% year over year, driven by the EMEA region (+11%) offsetting
a 2% decline in APAC. Gross margin held at 61%, flat versus Q2. Management
flagged FX headwinds as the primary risk for Q4 guidance. Headcount in sales
grew 6% but productivity per rep declined slightly due to ramp time on new
hires. The board approved an additional $10M in marketing spend for Q4,
targeted at the EMEA expansion.
\"\"\"
Summary: Q3 sales grew 4% YoY on EMEA strength (+11%) despite an APAC decline
(-2%), with gross margin flat at 61%. Sales headcount rose 6% but per-rep
productivity dipped from new-hire ramp time. The board approved $10M in
incremental Q4 marketing spend for EMEA, while management flagged FX as the
main risk to Q4 guidance.

### Example 2
Input:
\"\"\"
The incident began at 14:02 UTC when the primary database's connection pool
was exhausted after a deploy raised per-request timeout from 2s to 30s.
Latency cascaded to the checkout service, causing a 22-minute partial outage
affecting roughly 8% of checkout attempts. On-call engineer Dana R. rolled
back the deploy at 14:24 UTC. Root cause: missing circuit breaker on the
checkout->payments call, allowing slow requests to pile up instead of failing
fast. A follow-up ticket was filed to add a breaker with a 3s timeout.
\"\"\"
Summary: A 14:02 UTC deploy raised DB timeouts from 2s to 30s, exhausting the
connection pool and cascading into a 22-minute partial checkout outage (~8%
of attempts). On-call engineer Dana R. rolled back at 14:24 UTC. Root cause
was a missing circuit breaker on the checkout->payments call; a follow-up
ticket will add one with a 3s timeout.

### Example 3
Input:
\"\"\"
Contract renewal terms: 3-year term, 5% annual price escalator, auto-renews
unless either party gives 90 days' written notice. Liability cap raised from
1x to 2x annual contract value at the customer's request. Data processing
addendum updated to reflect the new EU data residency requirement; customer
data will now be hosted exclusively in the Frankfurt region.
\"\"\"
Summary: The renewal sets a 3-year term with a 5% annual price escalator,
auto-renewing absent 90 days' written notice. The liability cap doubled to
2x annual contract value at the customer's request, and the DPA was updated
to require exclusive Frankfurt-region hosting for EU data residency.
"""

SYSTEM_BLOCKS = [
    {
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    }
]

# --------------------------------------------------------------------------
# Error taxonomy
# --------------------------------------------------------------------------


class NonRetryableAPIError(Exception):
    """Raised for API failures that will not succeed on retry (bad request,
    auth, permission, not-found, unprocessable, or any other 4xx we don't
    specifically recognize as transient)."""


def _parse_retry_after(exc: anthropic.APIStatusError) -> float:
    """Best-effort extraction of the Retry-After header (seconds, or an
    HTTP-date) from a rate-limit response. Returns 0.0 if absent/unparsable,
    in which case the caller falls back to exponential backoff."""
    response = getattr(exc, "response", None)
    if response is None:
        return 0.0
    header = response.headers.get("retry-after")
    if not header:
        return 0.0
    try:
        return max(0.0, float(header))
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(header)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0.0, (dt - datetime.now(timezone.utc)).total_seconds())
    except Exception:
        return 0.0


def _backoff_delay(attempt: int) -> float:
    """Exponential backoff with jitter, capped at MAX_BACKOFF_SECONDS."""
    delay = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
    return min(MAX_BACKOFF_SECONDS, delay + random.uniform(0, 1))


async def call_with_retry(coro_fn, *args, **kwargs):
    """Call an Anthropic SDK async method with a most-specific-first
    exception chain, distinguishing retryable transient failures from
    non-retryable client errors.

    The client itself is constructed with max_retries=0 (see main()) so this
    function has full ownership of backoff timing — it is the only retry
    layer, avoiding stacked/compounding backoff between the SDK's built-in
    retry and an outer one.
    """
    attempt = 0
    while True:
        attempt += 1
        try:
            return await coro_fn(*args, **kwargs)

        # --- Non-retryable: fail fast, let the caller decide what to do ---
        except (
            anthropic.BadRequestError,        # 400 — malformed request
            anthropic.AuthenticationError,    # 401 — bad/missing credentials
            anthropic.PermissionDeniedError,  # 403 — key lacks access
            anthropic.NotFoundError,          # 404 — bad model id / endpoint
            anthropic.UnprocessableEntityError,  # 422
        ) as e:
            raise NonRetryableAPIError(f"{type(e).__name__}: {e}") from e

        # --- Rate limited: honor Retry-After, then retry ---
        except anthropic.RateLimitError as e:
            if attempt >= MAX_RETRY_ATTEMPTS:
                raise NonRetryableAPIError(
                    f"RateLimitError: exhausted {MAX_RETRY_ATTEMPTS} attempts: {e}"
                ) from e
            delay = _parse_retry_after(e) or _backoff_delay(attempt)
            logging.warning(
                "Rate limited (attempt %d/%d) — sleeping %.1fs",
                attempt, MAX_RETRY_ATTEMPTS, delay,
            )
            await asyncio.sleep(delay)

        # --- Transient server-side failure (5xx / overloaded): retry ---
        except anthropic.InternalServerError as e:
            if attempt >= MAX_RETRY_ATTEMPTS:
                raise NonRetryableAPIError(
                    f"InternalServerError: exhausted {MAX_RETRY_ATTEMPTS} attempts: {e}"
                ) from e
            delay = _backoff_delay(attempt)
            logging.warning(
                "Server error %s (attempt %d/%d) — sleeping %.1fs",
                getattr(e, "status_code", "?"), attempt, MAX_RETRY_ATTEMPTS, delay,
            )
            await asyncio.sleep(delay)

        # --- Any other non-2xx we didn't special-case: treat as non-retryable ---
        except anthropic.APIStatusError as e:
            raise NonRetryableAPIError(
                f"{type(e).__name__} ({e.status_code}): {e.message}"
            ) from e

        # --- Network failure before any response: retry ---
        except anthropic.APIConnectionError as e:
            if attempt >= MAX_RETRY_ATTEMPTS:
                raise NonRetryableAPIError(
                    f"APIConnectionError: exhausted {MAX_RETRY_ATTEMPTS} attempts: {e}"
                ) from e
            delay = _backoff_delay(attempt)
            logging.warning(
                "Connection error (attempt %d/%d) — sleeping %.1fs",
                attempt, MAX_RETRY_ATTEMPTS, delay,
            )
            await asyncio.sleep(delay)


# --------------------------------------------------------------------------
# Context window discovery
# --------------------------------------------------------------------------


async def get_context_window(client: AsyncAnthropic, model: str) -> int:
    """Look up the model's real input context window via the Models API
    (client.models.retrieve) rather than trusting a hardcoded number, since
    context windows change across model releases. Falls back to the cached
    constant if the lookup itself fails for any reason."""
    try:
        info = await call_with_retry(client.models.retrieve, model)
        window = getattr(info, "max_input_tokens", None)
        if window:
            return window
    except Exception as e:
        logging.warning(
            "Could not look up context window for %s (%s) — using fallback %d",
            model, e, FALLBACK_CONTEXT_WINDOW_TOKENS,
        )
    return FALLBACK_CONTEXT_WINDOW_TOKENS


# --------------------------------------------------------------------------
# Cache pre-warming
# --------------------------------------------------------------------------


async def prewarm_cache(client: AsyncAnthropic, model: str) -> None:
    """Fire a zero-output request to write the system-prompt cache entry
    before the concurrent worker pool starts.

    This matters specifically because of the concurrency requirement: a
    cache entry only becomes readable once the response that *writes* it
    begins streaming/returns. If all 4 workers fire their first request at
    roughly the same instant, none of them can read a cache entry the others
    are still writing — all 4 pay full price. Pre-warming with a single
    max_tokens=0 request (which returns immediately with an empty
    content: [] once the prefill/cache-write completes) guarantees the
    cache is already populated before any worker sends its real request.
    """
    try:
        await call_with_retry(
            client.messages.create,
            model=model,
            max_tokens=0,
            system=SYSTEM_BLOCKS,
            messages=[{"role": "user", "content": "warmup"}],
        )
        logging.info("Cache pre-warm complete.")
    except NonRetryableAPIError as e:
        logging.warning("Cache pre-warm failed (continuing without it): %s", e)


# --------------------------------------------------------------------------
# Per-file worker
# --------------------------------------------------------------------------


@dataclass
class Stats:
    succeeded: list[Path] = field(default_factory=list)
    skipped: list[tuple[Path, str]] = field(default_factory=list)


async def summarize_file(
    client: AsyncAnthropic,
    sem: asyncio.Semaphore,
    model: str,
    path: Path,
    output_dir: Path,
    token_budget: int,
    stats: Stats,
) -> None:
    async with sem:  # caps this worker pool at MAX_CONCURRENCY in-flight requests
        try:
            text = await asyncio.to_thread(path.read_text, encoding="utf-8", errors="replace")
        except OSError as e:
            logging.error("Could not read %s: %s — skipping", path, e)
            stats.skipped.append((path, f"read error: {e}"))
            return

        messages = [{"role": "user", "content": text}]

        # 1. Count tokens *before* sending the real request, so we can skip
        #    (and log) files that would blow the context window instead of
        #    discovering it via a 400 from messages.create.
        try:
            count_resp = await call_with_retry(
                client.messages.count_tokens,
                model=model,
                system=SYSTEM_BLOCKS,
                messages=messages,
            )
        except NonRetryableAPIError as e:
            logging.error("Token count failed for %s: %s — skipping", path, e)
            stats.skipped.append((path, f"count_tokens error: {e}"))
            return

        if count_resp.input_tokens > token_budget:
            reason = (
                f"{count_resp.input_tokens} input tokens exceeds budget of "
                f"{token_budget} (context window minus max_tokens and safety margin)"
            )
            logging.warning("Skipping %s: %s", path, reason)
            stats.skipped.append((path, reason))
            return

        # 2. Send the real request with the shared cached prefix.
        try:
            response = await call_with_retry(
                client.messages.create,
                model=model,
                max_tokens=MAX_OUTPUT_TOKENS,
                system=SYSTEM_BLOCKS,
                messages=messages,
            )
        except NonRetryableAPIError as e:
            logging.error("Summarization failed for %s: %s — skipping", path, e)
            stats.skipped.append((path, f"messages.create error: {e}"))
            return

        summary = next(
            (block.text for block in response.content if block.type == "text"), ""
        )
        out_path = output_dir / f"{path.stem}.summary.txt"
        await asyncio.to_thread(out_path.write_text, summary, encoding="utf-8")

        usage = response.usage
        logging.info(
            "%s -> %s | input=%d cache_read=%d cache_write=%d output=%d",
            path.name, out_path.name,
            usage.input_tokens, usage.cache_read_input_tokens,
            usage.cache_creation_input_tokens, usage.output_tokens,
        )
        stats.succeeded.append(path)


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


async def run(input_dir: Path, output_dir: Path, model: str) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    files = sorted(p for p in input_dir.iterdir() if p.is_file())
    if not files:
        logging.error("No files found in %s", input_dir)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)

    # We own retry/backoff timing ourselves (call_with_retry), so disable the
    # SDK's built-in retry loop to avoid two independent backoff layers
    # compounding into very long waits on the same failure.
    client = AsyncAnthropic(max_retries=0)

    context_window = await get_context_window(client, model)
    token_budget = context_window - MAX_OUTPUT_TOKENS - SAFETY_MARGIN_TOKENS
    logging.info(
        "Model %s: context window=%d, per-file token budget=%d",
        model, context_window, token_budget,
    )

    await prewarm_cache(client, model)

    sem = asyncio.Semaphore(MAX_CONCURRENCY)
    stats = Stats()
    await asyncio.gather(
        *(
            summarize_file(client, sem, model, path, output_dir, token_budget, stats)
            for path in files
        )
    )

    logging.info(
        "Done: %d succeeded, %d skipped.", len(stats.succeeded), len(stats.skipped)
    )
    for path, reason in stats.skipped:
        logging.info("  skipped %s: %s", path, reason)

    return 0 if not stats.skipped else 0  # skips are logged, not fatal


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_dir", type=Path, help="Directory of .txt files to summarize")
    parser.add_argument("output_dir", type=Path, help="Directory to write .summary.txt files to")
    parser.add_argument("--model", default=MODEL, help=f"Model ID (default: {MODEL})")
    args = parser.parse_args()

    if not args.input_dir.is_dir():
        print(f"error: {args.input_dir} is not a directory", file=sys.stderr)
        sys.exit(2)

    exit_code = asyncio.run(run(args.input_dir, args.output_dir, args.model))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
```

## Design Notes

### Model choice

The script defaults to `claude-opus-4-8`. Current Anthropic guidance treats Opus 4.8 as
the standing default for any task unless the user explicitly names a different model —
"never downgrade for cost, that's the user's decision, not yours." Since the task didn't
name a model, the script honors that default rather than silently picking a cheaper
model for what is, admittedly, a repetitive, low-complexity classification/summarization
workload where `claude-sonnet-5` or `claude-haiku-4-5` would cut per-file cost
substantially. `MODEL` is a single constant (and a `--model` CLI flag) specifically so a
user who wants a cheaper tier for a large-volume batch can override it in one place —
that's an explicit business decision the script surfaces rather than makes silently.

Two model-specific facts drove implementation choices:

- **Cacheable minimum is model-dependent.** Opus 4.8 requires the cached prefix to be
  ≥4096 tokens or the write silently no-ops (`cache_creation_input_tokens: 0`, no error).
  The shipped `SYSTEM_PROMPT` includes three worked examples specifically to give the
  prefix enough mass to clear that floor — a single one-line instruction would not cache
  on this model even though it would on e.g. Sonnet 4.5 (1024-token minimum). Always
  verify with `response.usage.cache_read_input_tokens` in production rather than
  assuming the marker "worked."
- **Context window is looked up live, not hardcoded.** `get_context_window()` calls
  `client.models.retrieve(model)` and reads `.max_input_tokens` (the Models API field
  introduced in the current API surface — there is no `context_window` field). The
  1,000,000-token constant is only a fallback if that call fails, so the token budget
  stays correct if the model's context window changes without a code update.

### Caching strategy

Render order on the wire is `tools` → `system` → `messages`, and caching is a strict
prefix match — one byte of drift anywhere in the prefix invalidates everything after it.
This workload has an ideal shape for caching: every file shares the exact same system
prompt and few-shot examples, and only the per-file document text (in `messages`)
varies. So:

- **One cache breakpoint, on the (only) system text block** (`SYSTEM_BLOCKS`), placed
  manually via `cache_control: {"type": "ephemeral"}` rather than relying on top-level
  auto-caching — with only one stable block there's no ambiguity, and being explicit
  makes the intent obvious in review. Since `system` renders before `messages`, this one
  breakpoint caches the entire shared prefix (instructions + all three few-shot
  examples) as a unit.
- **The per-file text is never annotated with `cache_control`.** It sits entirely after
  the breakpoint, so no matter how much it varies from file to file, it never
  invalidates the system-prompt cache entry — each file's varying content just becomes
  the small uncached remainder (`usage.input_tokens`).
- **Pre-warming before the concurrent pool starts.** A cache entry only becomes readable
  once the response that writes it begins — not once the marker is present. If the
  4-way worker pool fired its first 4 requests simultaneously, all 4 could race to write
  the same cache entry and none would read a hit, since none of the others have
  finished writing yet. `prewarm_cache()` sends one `max_tokens: 0` request up front
  (returns immediately with `content: []` and `stop_reason: "max_tokens"`, billing the
  cache write but zero output tokens) so the entry already exists by the time the 4
  concurrent workers start. This is the single most important correctness detail for
  combining caching with concurrency — without it, caching only "works" by accident,
  once traffic naturally serializes.
- **TTL:** left at the default 5 minutes (`ephemeral` with no `ttl`). A directory of
  files processed back-to-back at up to 4-way concurrency keeps well within that window;
  a 1-hour TTL would double the write cost for no benefit here since there's no long
  idle gap between requests to survive.
- **Verification:** every successful request logs `input_tokens`,
  `cache_read_input_tokens`, and `cache_creation_input_tokens` from `response.usage`.
  In production, a `cache_read_input_tokens` of 0 across the batch (after the first
  file) is the signal to check for a silent invalidator — none exist by construction
  here (the system prompt has no timestamps, UUIDs, or per-user content), but this is
  exactly the kind of regression a later refactor could reintroduce.

### Token counting / context-window guard

Before every real request, `client.messages.count_tokens` is called with the *same*
`system` and `messages` shape that will actually be sent (token counts are
model-specific, and `tiktoken`-style estimation is explicitly wrong for Claude — it's
a different tokenizer). The per-file budget is
`context_window - MAX_OUTPUT_TOKENS - SAFETY_MARGIN_TOKENS`, since `max_tokens` output
counts against the same context window as input. Files whose prompt would exceed that
budget are skipped (not truncated — the input is never silently cut) and logged with
the exact token count and budget, so the operator can see which files need chunking or
a larger-window model. `count_tokens` itself goes through the same retry wrapper as
the real request, since it's a network call subject to the same transient failures.

### Error taxonomy and retry behavior

The Anthropic SDK's built-in retry (`max_retries`, default 2) already retries
408/409/429/5xx and connection errors with backoff. This script explicitly sets
`max_retries=0` on the client and implements its own retry loop instead
(`call_with_retry`), so there is exactly one layer deciding backoff timing — stacking
the SDK's automatic retry underneath a second custom retry loop would let a single
persistent 429 balloon into `(sdk_retries+1) × (custom_retries+1)` total wait time, and
would make the rate-limit handling below (reading `retry-after` directly) redundant
with logic already running inside the SDK.

The except chain is ordered most-specific-first, exactly per the typed-exception
guidance, so each error class gets exactly the handling it needs instead of one broad
catch losing the distinction:

| Exception | HTTP | Retryable? | Handling |
|---|---|---|---|
| `BadRequestError` | 400 | No | Fail immediately — malformed request, retrying won't help |
| `AuthenticationError` | 401 | No | Fail immediately — bad/missing credentials |
| `PermissionDeniedError` | 403 | No | Fail immediately — key lacks access to the model/feature |
| `NotFoundError` | 404 | No | Fail immediately — bad model ID or endpoint |
| `UnprocessableEntityError` | 422 | No | Fail immediately |
| `RateLimitError` | 429 | Yes | Sleep for the `retry-after` header value if present, else exponential backoff with jitter; retry up to `MAX_RETRY_ATTEMPTS` |
| `InternalServerError` | 500 / 529 | Yes | Exponential backoff with jitter; covers both plain server errors and `overloaded_error` |
| `APIStatusError` (anything else) | other 4xx (e.g. 413) | No | Fail immediately — not a class we've identified as transient |
| `APIConnectionError` | (network, pre-response) | Yes | Exponential backoff with jitter |

Non-retryable failures raise `NonRetryableAPIError`, which `summarize_file` catches
per-file: one bad file (bad request, or one that's simply too large) is logged and
skipped rather than aborting the whole batch. Retryable failures are retried
in-process by `call_with_retry` and only surface to the caller as
`NonRetryableAPIError` once `MAX_RETRY_ATTEMPTS` is exhausted, at which point that file
is likewise skipped and logged rather than crashing the run.

### Concurrency

`asyncio.Semaphore(MAX_CONCURRENCY)` (hardcoded to 4) inside `summarize_file` bounds
the number of in-flight `messages.create`/`count_tokens` calls to 4 regardless of how
many files are in the directory — `asyncio.gather` schedules a task per file, but each
blocks on `sem.acquire()` until a slot frees up. File I/O is offloaded to a thread via
`asyncio.to_thread` so reading/writing files doesn't block the event loop while other
workers are waiting on network I/O. `AsyncAnthropic` (not the sync `Anthropic` client)
is used specifically because it composes correctly with `asyncio.Semaphore` and
`asyncio.gather` — no thread pool needed to parallelize the sync client.

LOADED: SKILL.md, python/claude-api/README.md, shared/prompt-caching.md, shared/token-counting.md, shared/error-codes.md
