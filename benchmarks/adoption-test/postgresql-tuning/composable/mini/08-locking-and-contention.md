# Locking and Contention

## Row-level vs table-level locks

Ordinary `SELECT ... FOR UPDATE`, `UPDATE`, `DELETE` take row-level locks
that don't conflict with unrelated rows — normal OLTP concurrency doesn't
need table-level locking at all. Contention problems usually come from one
of: many transactions racing for the *same* row (a hot counter row, a
single "queue head" row), an explicit table-level lock
(`LOCK TABLE`, or implicitly via certain `ALTER TABLE` forms), or a long-held
lock from a transaction that hasn't committed.

## DDL lock levels — why some migrations are "free" and others aren't

`ALTER TABLE` operations vary hugely in lock strength:

- Adding a column with **no default**, or with a default that Postgres can
  apply as metadata-only (constant default, on modern Postgres versions),
  is fast and takes a brief `ACCESS EXCLUSIVE` lock just for the catalog
  update.
- Adding a column with a **volatile default** or one requiring a full
  rewrite, adding a `CHECK`/`NOT NULL` constraint without a pre-validated
  equivalent, or changing a column's type, requires scanning/rewriting the
  whole table under `ACCESS EXCLUSIVE` — blocking all reads and writes for
  the duration on a large table. Prefer: add the column nullable, backfill in
  batches, then add `NOT NULL` via a `CHECK (col IS NOT NULL) NOT VALID`
  followed by `VALIDATE CONSTRAINT` (the `VALIDATE` step takes only a brief
  lock and scans without blocking writers, unlike adding `NOT NULL` directly).
- `CREATE INDEX` / `DROP INDEX` without `CONCURRENTLY` block writes for the
  build duration; with `CONCURRENTLY` they don't (see `02-index-design.md`).

Always check a migration's lock implications against current Postgres
version behavior and table size before running it against a live table —
"this ALTER is instant on my dev DB" often means dev's table is empty, not
that the lock is cheap.

## Idle-in-transaction is a double problem

A transaction left open (`BEGIN` issued, then the client goes idle without
`COMMIT`/`ROLLBACK` — common with connection-pool misuse or a forgotten
transaction in application code) holds whatever locks it acquired for as long
as it sits idle, blocking other transactions that need conflicting locks. It
also prevents autovacuum from advancing its cleanup horizon for as long as
it's open, since Postgres must preserve row versions that might still be
visible to it — directly feeding bloat (`06-vacuum-and-bloat.md`). Set
`idle_in_transaction_session_timeout` to a sane bound (e.g. a few minutes)
so misbehaving clients don't sit indefinitely; check `pg_stat_activity` for
`state = 'idle in transaction'` sessions when diagnosing an unexplained lock
wait or bloat spike.

## Diagnosing a lock wait live

Query `pg_locks` joined to `pg_stat_activity` to find blocking chains:
sessions with `granted = false` are waiting, and the blocking session can be
found via `pg_blocking_pids(pid)`. A query that "just hangs" with no CPU/I/O
activity and an unremarkable plan is very often waiting on a lock, not
executing slowly — check this *before* re-running `EXPLAIN` repeatedly on a
query that already has a fine plan.

## Deadlocks

Postgres detects deadlocks automatically and aborts one of the participating
transactions (logged with the competing queries and lock info at default log
levels for a deadlock, controllable via `log_lock_waits` for slow lock waits
short of a full deadlock). Avoid them by having transactions acquire locks
in a consistent order across the codebase (e.g. always lock rows in
ascending primary-key order for multi-row updates) rather than relying on
retry-after-deadlock as the primary strategy — retries are a reasonable
safety net, not a substitute for consistent lock ordering.

## Advisory locks for application-level coordination

For coordination that isn't naturally a row lock (e.g. "only one worker
processes this logical job at a time" across processes), `pg_advisory_lock`/
`pg_try_advisory_lock` provide session- or transaction-scoped locks keyed by
an arbitrary bigint (or two ints), without needing a real row to lock.
Session-scoped advisory locks interact badly with connection poolers in
transaction-pooling mode (`05-connection-pooling.md`) — the lock is tied to
the backend connection, which may be handed to a different client after the
transaction ends; use transaction-scoped advisory locks
(`pg_advisory_xact_lock`) under a pooled setup instead.
