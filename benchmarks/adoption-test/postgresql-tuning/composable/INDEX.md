# PostgreSQL Performance Tuning — Mini-Skill Index

Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If you judge most of this skill relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.

- `00-core.md` — Measure-first discipline, realistic scale, lock-aware DDL, config semantics — **always load**
- `01-reading-explain-plans.md` — EXPLAIN/ANALYZE, plan nodes, cost vs actual, buffers. Load when diagnosing a slow query.
- `02-index-design.md` — Index types, column order, covering/partial/expression indexes, CONCURRENTLY. Load when adding/auditing indexes.
- `03-query-rewriting.md` — Index-defeating predicates, N+1, subqueries, IN lists, DISTINCT cost. Load when rewriting slow SQL.
- `04-joins-and-statistics.md` — Join choice, ANALYZE/pg_stats, extended statistics. Load when a join plan/estimate looks wrong.
- `05-connection-pooling.md` — PgBouncer modes, prepared-statement pitfalls, sizing. Load when configuring a pooler.
- `06-vacuum-and-bloat.md` — Autovacuum tuning, bloat, VACUUM FULL/pg_repack, wraparound. Load when a table is bloated.
- `07-memory-and-config.md` — shared_buffers, work_mem, page costs, checkpoints. Load when tuning postgresql.conf.
- `08-locking-and-contention.md` — Lock levels, DDL strength, idle-in-transaction, deadlocks. Load when a query hangs.
- `09-partitioning-and-scale.md` — Partitioning, pruning, partition keys, detach/attach. Load when a table is huge.
- `10-monitoring-and-diagnosis.md` — pg_stat_statements, pg_stat_activity, auto_explain. Load when triaging "what's slow."
