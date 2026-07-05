# Error Handling

Good error handling is about failing safely and visibly, never silently.

- **Bare and blanket excepts.** Flag `except:` and `except Exception: pass`. They hide bugs and turn failures into silent wrong behavior. Catch the specific exceptions you can handle; log or re-raise the rest.
- **Silent failure via sentinels.** Don't swallow an error and return a sentinel (`None`, `-1`, `[]`, `False`) that callers treat as success. If you can't handle it, fail loudly. If you return a sentinel, make sure every caller checks it.
- **Cleanup on every path.** Files, locks, connections, and transactions must be released whether the code succeeds or raises. Use `finally` or context managers rather than duplicating cleanup before each `return`: the duplicated version always misses a path.
- **Message hygiene.** Error messages should aid debugging without leaking internals to end users: log the detail (stack trace, ids) server-side, return a generic message to the client. Don't echo secrets, SQL, or file paths.
- **Consistent state on partial failure.** A multi-step mutation that fails halfway can leave data inconsistent. Wrap it in a transaction and roll back on error, or design idempotent/compensating steps. Verify the code doesn't commit step 1, then throw on step 2.
- **Don't lose context.** Catching an exception only to raise a vaguer one discards the stack and the root cause. Chain exceptions (`raise NewError(...) from exc`) or let the original propagate.

The core question for any `try` block: if this raises, does the system end up in a known-good state, and will someone find out it happened? If either answer is no, it's a finding.
