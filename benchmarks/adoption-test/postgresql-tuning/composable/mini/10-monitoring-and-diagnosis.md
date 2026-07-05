# Monitoring and Ongoing Diagnosis

## pg_stat_statements — find what's actually slow, in aggregate

`pg_stat_statements` (enable via `shared_preload_libraries` — requires a
restart to add — then `CREATE EXTENSION pg_stat_statements;`) aggregates
execution stats per normalized query (literals stripped), which is what lets
you find the real cost driver instead of chasing whichever slow query a user
happened to notice. Key columns: `calls`, `total_exec_time`, `mean_exec_time`,
`rows`. Sort by `total_exec_time DESC` to find the top aggregate cost driver
(often a cheap-but-frequent query, not the slowest single one — that's the
N+1 signature: high `calls`, low `mean_exec_time`, high `total_exec_time`).
Sort by `mean_exec_time DESC` (filtering to reasonably-frequent queries) to
find individually slow queries worth an `EXPLAIN ANALYZE` pass. Reset
counters with `pg_stat_statements_reset()` after a deploy to isolate new
behavior.

## pg_stat_activity and wait events — what's happening right now

`SELECT * FROM pg_stat_activity WHERE state != 'idle';` shows live queries,
their `state`, and — critically — `wait_event_type`/`wait_event`, which says
*why* a backend isn't making progress: `Lock` (waiting on a lock — cross-
reference `pg_locks`, see `08-locking-and-contention.md`), `IO` (waiting on
disk), `Client` (waiting on the application to send/read), etc. A query
that's "slow" with `wait_event_type = 'Lock'` will not be fixed by
indexing or config changes — it's a contention problem, not a query-plan
problem. Check this before re-running `EXPLAIN` on a query that already has
a perfectly good plan.

## Table and index usage stats

`pg_stat_user_tables` gives `seq_scan`/`idx_scan` counts and
`n_live_tup`/`n_dead_tup` per table — a table with a high `seq_scan` count
and large `n_live_tup` is a missing-index candidate; rising `n_dead_tup`
between vacuums is a bloat/autovacuum-tuning candidate
(`06-vacuum-and-bloat.md`). `pg_stat_user_indexes.idx_scan` near zero on an
index that's existed a while flags it as unused write overhead
(`02-index-design.md`).

## Logging slow queries and auto_explain

`log_min_duration_statement` (milliseconds) logs any statement slower than
the threshold — a cheap, always-on safety net for catching outliers that
`pg_stat_statements`' averages might mask. For real plan-level visibility
without manually re-running `EXPLAIN`, the `auto_explain` extension
(`shared_preload_libraries`, then
`auto_explain.log_min_duration`/`auto_explain.log_analyze`) logs the actual
plan for slow queries as they happen in production — the most direct way to
catch a plan that degrades intermittently (e.g. only under specific
parameter values or at certain times) rather than reproducing it manually.
`auto_explain.log_analyze` adds the overhead of `ANALYZE` to every logged
query, so gate it with a duration threshold high enough to avoid adding
that overhead to the bulk of traffic.

## A monitoring cadence, not just point-in-time checks

Treat tuning as continuous, not a one-time pass: track `pg_stat_statements`
top queries and `pg_stat_user_tables` bloat/scan ratios on a recurring cadence
(dashboards or a scheduled report), because data volume and access patterns
shift — a fine query today can degrade months later purely from growth, with
no code change to blame. Correlate any regression against recent deploys,
data growth, and autovacuum/checkpoint activity in the logs before assuming
it's a new problem needing a new fix, rather than an existing risk that
finally crossed a threshold.
