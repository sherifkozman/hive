# PostgreSQL Performance Tuning — Core

## Measure before you tune

Never guess. A "slow query" complaint has at least six distinct root causes —
missing index, stale planner statistics, lock contention, table/index bloat,
memory misconfiguration, or a connection storm — and they call for different
fixes. Before changing anything:

1. Run `EXPLAIN (ANALYZE, BUFFERS)` on the actual slow query (never plain
   `EXPLAIN` — it shows estimates, not what happened). See
   `01-reading-explain-plans.md`.
2. Check `pg_stat_statements` to confirm this query is actually a top
   contributor to load, not just the one a user noticed. See
   `10-monitoring-and-diagnosis.md`.
3. Check `pg_stat_activity` for blocked/blocking sessions and long-running
   transactions before assuming the problem is the query's plan at all. See
   `08-locking-and-contention.md`.

Fixing the wrong layer (e.g. adding an index when the real problem is lock
contention from an idle-in-transaction session) wastes a deploy and doesn't
help.

## Test at realistic scale and statistics

The planner's choices depend on table size, data distribution, and how
current `ANALYZE` statistics are — not just schema. A query that seq-scans a
freshly created, still-empty staging table will index-scan once the table has
production-scale rows, and vice versa. Never validate a fix against an empty
or toy-sized table; use a prod-like snapshot or restore, and run `ANALYZE`
before judging a plan. Autovacuum lag or a bulk load without an `ANALYZE`
after it is a common reason a "correct" index still isn't chosen — see
`04-joins-and-statistics.md` and `06-vacuum-and-bloat.md`.

## Live tables need lock-aware DDL

`CREATE INDEX` (without `CONCURRENTLY`) and several `ALTER TABLE` forms take
locks that block writers, sometimes for the full duration of a build on a
large table. On anything with live traffic, default to `CREATE INDEX
CONCURRENTLY`, check the lock level of any `ALTER TABLE` you plan to run, and
never assume a migration window is empty of traffic. See
`02-index-design.md` and `08-locking-and-contention.md`.

## Config changes: know what "apply" means

Not all `postgresql.conf` parameters apply the same way: some take effect on
`SIGHUP`/reload (e.g. `work_mem`), others require a full postmaster restart
(e.g. `shared_buffers`, `max_connections`), and a few are per-session
(`SET LOCAL`). Confirm which before promising a fix is live, and load-test
config changes against realistic concurrency — a setting that helps one
connection can starve the instance under `max_connections` concurrent
sessions (`work_mem` in particular is per-sort/hash-operation, not per
query or per connection). See `07-memory-and-config.md`.
