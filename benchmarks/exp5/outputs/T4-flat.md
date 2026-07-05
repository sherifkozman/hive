# T4 — Code Review: `cache_stats.py` performance fix

## Problem analysis

`_events` is an append-only, never-trimmed list. `record_event()` is called on
every incoming event from many concurrent request threads, and `get_stats()`
is called on **every single request** to render the stats header. `get_stats()`
does a full linear scan of `_events` from scratch each time it runs.

That combination is the bug:

1. **Unbounded memory.** `_events` never shrinks or rolls over, so memory
   grows for the lifetime of the process. On a long-running, high-traffic
   service this is an eventual OOM risk, not just a slowdown.
2. **O(n) work recomputed on every request, where n only grows.**
   `get_stats()` re-derives the full aggregate (count/total/min/max per
   event type) from the entire history every time it's called, and it's
   called on every request. As the site accumulates events, every
   subsequent request's stats-header render gets slower — the per-request
   cost is O(n) and n increases with traffic, so total cost across the
   life of the process grows worse than linearly. This is exactly the
   "repeated identical expensive computation that should be cached
   incrementally" anti-pattern, and it's why the module is described as
   "unacceptable under load."
3. **Redundant recomputation.** `top_events()` calls `get_stats()`, paying
   the same full-history scan again for what is fundamentally the same
   aggregate, just sorted and truncated.

There is also a latent **concurrency** defect once you fix the above the
obvious way (maintaining running aggregates instead of a raw event log):
`record_event()` is invoked concurrently from many threads. Updating a
per-type aggregate (`count += 1`, `total += value`, conditionally updating
`first`/`last`) is a read-modify-write on shared mutable state. Even under
CPython's GIL, a compound operation like `rec["count"] += 1` is not a single
atomic bytecode — it's a get, an add, and a set, and the interpreter can
switch threads between those steps. Two threads incrementing the same
counter concurrently can lose an update. The fix must protect the shared
aggregate with a lock, and `get_stats()` must read a consistent snapshot
(also under the lock) rather than iterating a dict that another thread
could be mutating concurrently (which can also raise
`RuntimeError: dictionary changed size during iteration`).

The core fix: maintain a small, bounded, incrementally-updated aggregate
(one entry per distinct `event_type` — bounded and effectively constant
size for this application) instead of an ever-growing raw event log.
`record_event()` becomes O(1) per call; `get_stats()` becomes O(k) where
k = number of distinct event types, independent of how many events have
ever been recorded. Memory is now bounded by the number of event types,
not the number of events.

## Fixed module

```python
"""Site-wide event statistics, read on every request."""
import datetime
import threading

# Per-event-type running aggregate, updated incrementally on every
# record_event() call so get_stats() never has to replay history.
# Guarded by _lock because record_event() is called concurrently from
# many request threads and performs a read-modify-write on shared state.
_lock = threading.Lock()
_stats = {}  # event_type -> {"count", "total", "first", "last"}


def record_event(event_type, value=1.0):
    now = datetime.datetime.utcnow()
    with _lock:
        rec = _stats.get(event_type)
        if rec is None:
            _stats[event_type] = {
                "count": 1,
                "total": value,
                "first": now,
                "last": now,
            }
            return
        rec["count"] += 1
        rec["total"] += value
        if now < rec["first"]:
            rec["first"] = now
        if now > rec["last"]:
            rec["last"] = now


def get_stats():
    """Called by every request handler to render the stats header."""
    with _lock:
        # Snapshot under the lock: cheap (one dict per event type, a
        # handful of scalars each) and avoids iterating a dict that
        # another thread could be mutating concurrently.
        snapshot = {etype: dict(rec) for etype, rec in _stats.items()}

    result = {}
    for etype, rec in snapshot.items():
        result[etype] = {
            "count": rec["count"],
            "avg": rec["total"] / rec["count"],
            "first_seen": rec["first"].isoformat(),
            "last_seen": rec["last"].isoformat(),
        }
    return result


def top_events(n=10):
    stats = get_stats()
    return sorted(stats.items(), key=lambda kv: kv[1]["count"], reverse=True)[:n]
```

## Why each change is safe in this deployment

- **Incremental aggregate instead of raw event log.** `record_event()` only
  needs to update the four numbers that `get_stats()` ultimately reports
  (`count`, `total`, `first`, `last`) — it never needed the raw
  per-event history to compute those. Replacing the append-only list with
  a per-type running aggregate preserves the exact output contract of
  `get_stats()` (same keys, same values, same `count`/`avg`/`first_seen`/
  `last_seen` semantics) while making both functions cheap: O(1) writes,
  O(k) reads where k is the number of distinct event types actually seen
  (small and effectively bounded for a "site-wide event type" set,
  unlike the number of events, which is unbounded).
- **Lock around the aggregate update.** `record_event()`'s old form (a
  single `list.append`) was safe under the GIL because `append` is a
  single atomic operation. Once the fix moves to updating shared
  per-type counters, that read-modify-write is no longer a single atomic
  step, so it needs explicit protection. A single `threading.Lock` held
  for a few dict/arithmetic operations is negligible overhead (microseconds)
  compared to the O(n) scan it replaces, and there's no nested locking, so
  there's no deadlock risk.
- **Snapshot-then-format in `get_stats()`.** Copying the small per-type
  dicts while holding the lock, then formatting `isoformat()`/`avg` outside
  the lock, keeps the critical section short (good for a function called on
  every request) while still giving callers a consistent view instead of
  one that could change mid-iteration.
- **`top_events()` is unchanged** — it still calls `get_stats()`, but that
  call is now O(k) instead of O(n), so the redundancy that used to cost a
  second full-history scan is now negligible.
- **No behavior change for callers.** The public API (`record_event`,
  `get_stats`, `top_events`) and the shape/semantics of their return values
  are identical to the original; only the internal storage and update
  strategy changed, so this is safe to deploy as a drop-in replacement.

## Note (not fixed, out of scope for this task)

`datetime.datetime.utcnow()` is deprecated in modern Python in favor of
`datetime.datetime.now(datetime.timezone.utc)`. Left unchanged here to keep
this a pure performance fix with no change to the `isoformat()` output
format (a `timezone.utc`-aware timestamp serializes with a `+00:00` suffix
that naive `utcnow()` does not produce). Worth a follow-up, separate change.

LOADED: eval3/skills-flat/code-review/composable/INDEX.md, eval3/skills-flat/code-review/composable/mini/06-performance.md, eval3/skills-flat/code-review/composable/mini/04-concurrency.md, eval3/skills-flat/code-review/composable/mini/01-review-method.md, eval3/skills-flat/code-review/composable/mini/09-refactoring-and-communication.md
