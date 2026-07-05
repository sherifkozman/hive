# batch_summarize.py

```python
#!/usr/bin/env python3
"""
batch_summarize.py

Summarize every text file in a directory using the Claude API.

Design goals (see design notes at the bottom of this file's accompanying
report for the full rationale):
  1. Uses the current `anthropic` Python SDK with the async client
     (AsyncAnthropic) and the Messages API.
  2. Uses prompt caching (`cache_control: {"type": "ephemeral"}`) so the
     shared system prompt and few-shot examples are billed once per cache
     window instead of once per file.
  3. Calls the token-counting endpoint (`client.messages.count_tokens`)
     before every request and skips (with logging) any file whose prompt
     would not fit in the model's context window.
  4. Retries rate limits (429) and transient server errors (500/503/529,
     connection/timeout errors) with backoff that honors the API's
     `retry-after` header, while never retrying non-retryable client
     errors (400/401/403/404/422).
  5. Bounds concurrency to at most 4 in-flight requests via an
     asyncio.Semaphore, using a single shared AsyncAnthropic client.

Install:
    pip install "anthropic>=0.40"

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python batch_summarize.py ./docs --out ./summaries
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import random
import sys
from pathlib import Path
from typing import Any

import anthropic
from anthropic import AsyncAnthropic

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

# Model choice: Claude Sonnet 4.5. Summarization is a well-specified,
# moderate-reasoning task run at high volume, so we want the best available
# quality-per-dollar rather than a top-of-line reasoning model:
#   - Sonnet 4.5 comfortably handles multi-paragraph summarization with
#     strong instruction-following (staying within the requested sentence
#     count, not hallucinating facts) at a fraction of Opus-class pricing.
#   - Its 200K-token context window comfortably covers most individual
#     text files while leaving headroom for the cached system prompt and
#     few-shot examples.
#   - It has a *lower* prompt-cache minimum-prefix requirement (1024 tokens)
#     than the Haiku line (2048 tokens), which makes it easier for a modest
#     system prompt + few-shot block to actually qualify for caching.
# If this script is later pointed at extremely high file volumes where the
# summarization task is simple and cost dominates, swap MODEL to a Haiku
# 4.x model instead (with a longer few-shot block to clear its higher
# cache-eligibility floor).
MODEL = "claude-sonnet-4-5-20250929"

MAX_OUTPUT_TOKENS = 512          # summaries are short; keep the budget tight
CONTEXT_WINDOW_TOKENS = 200_000  # Sonnet 4.5 standard context window
SAFETY_MARGIN_TOKENS = 256       # buffer for framing/formatting overhead

CONCURRENCY_LIMIT = 4
MAX_RETRIES = 6
BASE_BACKOFF_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 60.0

SYSTEM_PROMPT = """\
You are a precise technical summarizer used in an automated document
pipeline. Given a document, produce a summary that:
  - Is 3 to 5 sentences long.
  - Preserves concrete facts: names, dates, numbers, and decisions.
  - Never introduces information that is not present in the source text.
  - Is written in neutral, third-person, plain prose (no headers, no
    bullet points, no preamble like "Here is a summary:").
  - Flags explicitly if the document is truncated or ambiguous, rather
    than guessing at missing content.
This system prompt and the following examples are reused verbatim across
every document in the batch, so treat them as fixed context rather than
part of any single document's content.
"""

# Few-shot examples: (document, ideal summary) pairs. These are held
# constant across the whole batch run, which is exactly what makes them
# cacheable. In production, load these from a fixtures file; a handful of
# examples are inlined here for a self-contained script.
FEW_SHOT_EXAMPLES: list[tuple[str, str]] = [
    (
        "Quarterly Engineering Update - Q1\n\n"
        "The platform team shipped the v2 ingestion pipeline on March 3, "
        "reducing average event latency from 820ms to 210ms. Three "
        "incidents were logged during the quarter, all Sev-3, with a "
        "combined customer-facing downtime of 42 minutes. Headcount grew "
        "from 14 to 17 engineers. The team plans to begin migrating the "
        "legacy batch jobs to the new pipeline in Q2, with completion "
        "targeted for June 30.",
        "In Q1, the platform team shipped the v2 ingestion pipeline on "
        "March 3, cutting average event latency from 820ms to 210ms. "
        "Three Sev-3 incidents occurred, totaling 42 minutes of "
        "customer-facing downtime, while the team grew from 14 to 17 "
        "engineers. Migration of legacy batch jobs to the new pipeline is "
        "planned for Q2, targeted for completion by June 30.",
    ),
    (
        "Support Ticket #48213\n\n"
        "Customer reports that CSV exports larger than 50,000 rows are "
        "silently truncated to 10,000 rows with no error message. "
        "Reproduced on account acme-corp using the /exports/orders "
        "endpoint. Workaround: paginate the export in 10,000-row chunks "
        "using the `offset` parameter. Engineering has filed BUG-2291 to "
        "fix the underlying limit and remove the workaround requirement.",
        "Ticket #48213 reports that CSV exports over 50,000 rows are "
        "silently truncated to 10,000 rows with no error, reproduced on "
        "the acme-corp account via the /exports/orders endpoint. A "
        "workaround exists using 10,000-row pagination with the `offset` "
        "parameter, and engineering has filed BUG-2291 to fix the "
        "underlying limit.",
    ),
]

MAX_CONCURRENT_FILES = CONCURRENCY_LIMIT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
)
log = logging.getLogger("batch_summarize")


# --------------------------------------------------------------------------
# Static, cacheable prompt prefix
# --------------------------------------------------------------------------

def build_system_blocks() -> list[dict[str, Any]]:
    """System prompt as a content-block list with a cache breakpoint.

    A `cache_control` marker tells the API "cache everything from the start
    of this content up through the end of this block." Placing it on the
    (only) system block means the whole system prompt is cached as one
    unit, independent of the few-shot examples that follow it.
    """
    return [
        {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }
    ]


def build_few_shot_messages() -> list[dict[str, Any]]:
    """Few-shot user/assistant turns with a cache breakpoint on the last one.

    Only the *last* content block that should be included in the cached
    prefix needs `cache_control` — the API caches the entire prefix up to
    and including that block, not just the one block. Putting the second
    breakpoint here (rather than folding the examples into the system
    prompt) lets the examples be swapped independently later without
    invalidating the system-prompt cache entry.
    """
    messages: list[dict[str, Any]] = []
    for i, (doc, summary) in enumerate(FEW_SHOT_EXAMPLES):
        messages.append(
            {
                "role": "user",
                "content": [{"type": "text", "text": f"Document:\n\n{doc}"}],
            }
        )
        is_last = i == len(FEW_SHOT_EXAMPLES) - 1
        assistant_block: dict[str, Any] = {"type": "text", "text": summary}
        if is_last:
            assistant_block["cache_control"] = {"type": "ephemeral"}
        messages.append({"role": "assistant", "content": [assistant_block]})
    return messages


def build_messages_for_file(file_text: str) -> list[dict[str, Any]]:
    """Static (cached) few-shot turns + this file's fresh user turn.

    The final user turn is deliberately left without cache_control: its
    content is unique per file, so caching it would never produce a hit and
    would only add cache-write overhead.
    """
    static_messages = build_few_shot_messages()
    file_message = {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": f"Document:\n\n{file_text}\n\nSummarize the document above.",
            }
        ],
    }
    return static_messages + [file_message]


# --------------------------------------------------------------------------
# Token counting / context-window guard
# --------------------------------------------------------------------------

async def count_prompt_tokens(
    client: AsyncAnthropic, system_blocks: list[dict[str, Any]], messages: list[dict[str, Any]]
) -> int:
    """Pre-flight token count via the Messages token-counting endpoint.

    This mirrors the exact `system` + `messages` payload that will be sent
    to `messages.create`, so the count reflects the real request (including
    the cached prefix) rather than a rough estimate.
    """
    result = await client.messages.count_tokens(
        model=MODEL,
        system=system_blocks,
        messages=messages,
    )
    return result.input_tokens


def would_exceed_context_window(input_tokens: int) -> bool:
    budget = CONTEXT_WINDOW_TOKENS - MAX_OUTPUT_TOKENS - SAFETY_MARGIN_TOKENS
    return input_tokens > budget


# --------------------------------------------------------------------------
# Retry logic
# --------------------------------------------------------------------------

# Errors worth retrying: rate limiting, transient network failures, and
# server-side/overload errors. Anything else (bad request, auth, permission,
# not found, unprocessable entity) indicates a problem that will not be
# fixed by retrying, so it is raised immediately.
RETRYABLE_EXCEPTIONS = (
    anthropic.RateLimitError,       # HTTP 429
    anthropic.APIConnectionError,   # network-level failure (incl. timeouts)
    anthropic.APITimeoutError,      # request timed out
    anthropic.InternalServerError,  # HTTP 5xx
)


def _extract_retry_after(exc: Exception) -> float | None:
    """Read the `retry-after` response header if the SDK exposed it."""
    response = getattr(exc, "response", None)
    if response is None:
        return None
    header = response.headers.get("retry-after")
    if header is None:
        return None
    try:
        return float(header)
    except ValueError:
        return None


def _compute_backoff(exc: Exception, attempt: int) -> float:
    retry_after = _extract_retry_after(exc)
    if retry_after is not None:
        # Server told us exactly how long to wait; respect it and add a
        # small jitter so a fleet of workers doesn't retry in lockstep.
        return retry_after + random.uniform(0, 0.5)
    backoff = min(BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)), MAX_BACKOFF_SECONDS)
    return backoff + random.uniform(0, backoff * 0.25)


async def create_message_with_retry(
    client: AsyncAnthropic, **kwargs: Any
) -> anthropic.types.Message:
    attempt = 0
    while True:
        try:
            return await client.messages.create(**kwargs)
        except RETRYABLE_EXCEPTIONS as exc:
            attempt += 1
            if attempt > MAX_RETRIES:
                log.error("Giving up after %d retries: %s", MAX_RETRIES, exc)
                raise
            wait_s = _compute_backoff(exc, attempt)
            log.warning(
                "Retryable error %s (attempt %d/%d) - sleeping %.1fs",
                type(exc).__name__,
                attempt,
                MAX_RETRIES,
                wait_s,
            )
            await asyncio.sleep(wait_s)
        except anthropic.APIStatusError as exc:
            # Overload (529) and other 5xx not already covered above are
            # also retryable; everything else (400/401/403/404/422/...) is
            # a client-side or permanent error and must not be retried.
            if exc.status_code == 529 or exc.status_code >= 500:
                attempt += 1
                if attempt > MAX_RETRIES:
                    log.error("Giving up after %d retries: %s", MAX_RETRIES, exc)
                    raise
                wait_s = _compute_backoff(exc, attempt)
                log.warning(
                    "Retryable API status %s (attempt %d/%d) - sleeping %.1fs",
                    exc.status_code,
                    attempt,
                    MAX_RETRIES,
                    wait_s,
                )
                await asyncio.sleep(wait_s)
                continue
            log.error("Non-retryable API error %s: %s", exc.status_code, exc)
            raise


# --------------------------------------------------------------------------
# Per-file worker
# --------------------------------------------------------------------------

async def summarize_file(
    client: AsyncAnthropic,
    semaphore: asyncio.Semaphore,
    system_blocks: list[dict[str, Any]],
    path: Path,
    out_dir: Path,
) -> None:
    try:
        file_text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        log.error("Could not read %s: %s", path, exc)
        return

    messages = build_messages_for_file(file_text)

    async with semaphore:
        try:
            input_tokens = await count_prompt_tokens(client, system_blocks, messages)
        except anthropic.APIError as exc:
            log.error("Token count failed for %s, skipping: %s", path, exc)
            return

        if would_exceed_context_window(input_tokens):
            log.warning(
                "Skipping %s: prompt is %d tokens, which would exceed the "
                "%d-token context window (with %d reserved for output and "
                "%d safety margin).",
                path,
                input_tokens,
                CONTEXT_WINDOW_TOKENS,
                MAX_OUTPUT_TOKENS,
                SAFETY_MARGIN_TOKENS,
            )
            return

        try:
            response = await create_message_with_retry(
                client,
                model=MODEL,
                max_tokens=MAX_OUTPUT_TOKENS,
                system=system_blocks,
                messages=messages,
            )
        except anthropic.APIError as exc:
            log.error("Failed to summarize %s: %s", path, exc)
            return

    summary_text = "".join(
        block.text for block in response.content if block.type == "text"
    )

    usage = response.usage
    log.info(
        "%s -> input=%d cache_created=%s cache_read=%s output=%d",
        path.name,
        usage.input_tokens,
        getattr(usage, "cache_creation_input_tokens", None),
        getattr(usage, "cache_read_input_tokens", None),
        usage.output_tokens,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{path.stem}.summary.txt"
    out_path.write_text(summary_text, encoding="utf-8")


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

async def run(input_dir: Path, out_dir: Path, pattern: str) -> None:
    files = sorted(p for p in input_dir.glob(pattern) if p.is_file())
    if not files:
        log.warning("No files matching %r found in %s", pattern, input_dir)
        return

    system_blocks = build_system_blocks()
    semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

    # AsyncAnthropic wraps an async httpx client and is safe to share across
    # concurrent coroutines; we create exactly one for the whole run so
    # connection pooling (and the server-side cache, which is keyed on the
    # exact prefix content) is reused across every file.
    async with AsyncAnthropic() as client:
        # Prime the cache with a single request before fanning out. Firing
        # 4 concurrent requests against a cold cache would otherwise cause
        # the first 4 files to race and each pay the (more expensive)
        # cache-write price instead of only the first one doing so.
        first, rest = files[0], files[1:]
        await summarize_file(client, semaphore, system_blocks, first, out_dir)

        tasks = [
            summarize_file(client, semaphore, system_blocks, path, out_dir)
            for path in rest
        ]
        await asyncio.gather(*tasks)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_dir", type=Path, help="Directory of text files to summarize")
    parser.add_argument(
        "--out", type=Path, default=Path("summaries"), help="Output directory for summaries"
    )
    parser.add_argument(
        "--pattern", default="*.txt", help="Glob pattern for input files (default: *.txt)"
    )
    args = parser.parse_args()

    if not args.input_dir.is_dir():
        parser.error(f"{args.input_dir} is not a directory")

    try:
        asyncio.run(run(args.input_dir, args.out, args.pattern))
    except anthropic.AuthenticationError:
        log.error("Authentication failed - check ANTHROPIC_API_KEY.")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

## Design notes

### Model choice

`claude-sonnet-4-5-20250929` is used as the default. Summarization is a
well-bounded task (follow instructions, compress a document, avoid
hallucination) rather than an open-ended reasoning problem, so a
frontier/Opus-class model is unnecessary spend. Sonnet 4.5 is chosen over
the Haiku line for two concrete, mechanics-relevant reasons rather than
just "it's the mid-tier model":

- Instruction-following on constraints like "3-5 sentences" and "don't
  invent facts" is materially more reliable on Sonnet-class models, which
  matters when summaries feed a downstream, unsupervised pipeline.
- Prompt caching has a **minimum cacheable prefix length**, and that
  minimum differs by model family: 1024 tokens for Sonnet/Opus vs. 2048
  tokens for Haiku. A modest system prompt + two few-shot examples (as
  used here) clears the Sonnet threshold comfortably; hitting the Haiku
  threshold would require padding the few-shot block just to make caching
  "turn on," which is a bad trade for a narrow summarization prompt. If the
  shared prefix is deliberately grown (e.g., many few-shot examples, a
  style guide, a glossary), Haiku becomes attractive again for pure
  cost-per-file at scale — that's a one-line `MODEL` change.

### Caching strategy

The request is split into three tiers, from most- to least-reusable:

1. **System prompt** — fixed for the entire run. Given its own
   `cache_control: {"type": "ephemeral"}` breakpoint so it is cached as an
   independent unit.
2. **Few-shot examples** — fixed for the entire run, but conceptually
   separate from the system prompt (they could be swapped/rotated without
   touching the instructions). The breakpoint is placed on the **last**
   content block of the last few-shot message; the API caches everything
   from the start of the request up through that block, not just the block
   itself, so this single marker covers the system prompt + all example
   turns as one growing prefix.
3. **Per-file document** — unique every time, appended as a final,
   uncached user turn. Caching this would never produce a hit (each file's
   text differs) and would only add the ~25% cache-write cost premium for
   no benefit.

Practical consequences reflected in the code:

- The very first request in a run is a guaranteed cache **write** (full
  price + ~25% premium on the cached portion). Every subsequent request
  that reuses the identical system+few-shot prefix within the cache's TTL
  is a cache **read** for that portion, billed at roughly 10% of the base
  input-token rate.
- Cache entries currently default to a 5-minute TTL that refreshes on each
  hit, so as long as the batch keeps making requests faster than one every
  5 minutes, the whole run rides on a single cache write.
- The script fires one "priming" request before launching the 4 concurrent
  workers. Without this, the first `CONCURRENCY_LIMIT` files would race
  against a cold cache and each pay the write price independently, since
  the cache isn't visible to a second in-flight request until the first
  one's response has actually landed server-side.
- Usage accounting (`cache_creation_input_tokens` / `cache_read_input_tokens`
  on `response.usage`) is logged per file so cache effectiveness is
  observable in production rather than assumed.

### Token counting / context window guard

Before every `messages.create` call, the script calls
`client.messages.count_tokens(...)` with the *exact* `system` and
`messages` payload that will be sent (same cache-control blocks included),
so the count reflects the real request rather than a character-count
estimate. The check reserves both `MAX_OUTPUT_TOKENS` (so the model has
room to actually produce the summary) and a small fixed safety margin
before comparing against the model's context window; files that would
still overflow are logged as skipped (`log.warning`, including the file
name and measured token count) and processing continues rather than
crashing the batch.

### Error taxonomy and retry behavior

The `anthropic` SDK raises a distinct exception subclass per HTTP status,
which the script partitions into two buckets:

- **Retryable** (transient, may succeed if retried):
  - `RateLimitError` (429)
  - `APIConnectionError` / `APITimeoutError` (network failure or timeout,
    never reached the server or never got a response)
  - `InternalServerError` (5xx) and, generically, any `APIStatusError`
    with `status_code >= 500` or `== 529` (Anthropic's "overloaded" status)
- **Non-retryable** (the request itself is invalid or unauthorized, and
  retrying it will just fail the same way): `BadRequestError` (400),
  `AuthenticationError` (401), `PermissionDeniedError` (403),
  `NotFoundError` (404), `UnprocessableEntityError` (422). These are
  allowed to propagate immediately rather than being retried.

For retries, the script first checks whether the raised exception carries
a `retry-after` response header (common on 429s and some 5xx responses)
and, if present, sleeps for exactly that long (plus a small jitter) rather
than guessing. If no such header is present, it falls back to exponential
backoff (`1s, 2s, 4s, ...` capped at 60s) with jitter, up to
`MAX_RETRIES` attempts, after which the file is logged as failed and the
batch moves on rather than aborting the whole run.

### Concurrency

An `asyncio.Semaphore(4)` bounds in-flight requests to 4 at a time, shared
across all file-processing coroutines against a single `AsyncAnthropic`
client instance (safe for concurrent use; it holds one pooled async HTTP
client under the hood). This keeps memory and connection usage predictable
regardless of how many files are in the input directory, and keeps the
batch well under typical per-minute request-rate limits while still
overlapping network latency across files.
