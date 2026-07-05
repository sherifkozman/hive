
# Concurrency

Concurrency defects are subtle and rarely covered by tests, so review them deliberately whenever code is threaded, async, or shares state across requests.

- **Race conditions / check-then-act:** `if not exists(k): create(k)` run by two threads can both pass the check and both create. Require atomic operations, locks, or DB-level guarantees — a unique constraint plus `INSERT ... ON CONFLICT`, or a compare-and-swap. Any read-modify-write on shared data is suspect.
- **Shared mutable state:** module-level dicts, lists, counters, or caches mutated by concurrent requests without a lock. Remember `counter += 1` is not atomic — it's a read, an add, and a write, any of which can interleave. Prefer per-request state or thread-safe structures.
- **Deadlocks:** two locks acquired in inconsistent order across different code paths. Establish and follow a global lock ordering; hold locks for the shortest span possible.
- **Async pitfalls:** a blocking call (sync I/O, `time.sleep`, CPU-heavy loop) inside `async` code freezes the whole event loop and stalls every concurrent task. Also flag a forgotten `await` (the coroutine never runs), and task exceptions that are swallowed because no one awaits the task.
- **TOCTOU on the filesystem:** check-then-use races — `if os.path.exists(p): open(p)` — where the file changes between the two calls. Prefer a single atomic operation (open with the right flags, `O_CREAT|O_EXCL`) over stat-then-open.

Because these bugs surface only under specific interleavings, reason about "what if two callers hit this simultaneously" for every piece of shared state, rather than relying on tests to catch them. A useful mental model: mark every read-modify-write on shared data, then ask whether another thread could slip between the read and the write. If it could, and the outcome would be wrong, you have a race that needs a lock, an atomic primitive, or a database-level guarantee.
