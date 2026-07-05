# Query Rewriting Patterns

## Index-defeating predicates

A predicate that wraps the indexed column in a function or operator prevents
a plain B-tree index from being used, because the index is sorted by the raw
column value, not the transformed one:

- `WHERE lower(email) = 'x'` on an index over `email` → not used. Fix: index
  the expression (`02-index-design.md`) or rewrite to compare against a
  pre-normalized stored column.
- `WHERE created_at::date = '2026-01-01'` → not used if `created_at` is
  `timestamptz`; the cast defeats the index. Fix: rewrite as a range,
  `WHERE created_at >= '2026-01-01' AND created_at < '2026-01-02'`.
- `WHERE numeric_col = '5'` (text literal against a numeric column) can force
  an implicit cast that behaves the same way. Match literal types to column
  types.
- Leading wildcard `LIKE '%term'` cannot use a plain B-tree index (no
  fixed prefix to seek to); `LIKE 'term%'` can. For arbitrary substring or
  fuzzy search, use a trigram index (`pg_trgm` extension, GIN or GiST) or
  full-text search (`tsvector` + GIN), not `LIKE`.

## N+1 inside "a single feature"

The classic N+1 (one query to fetch a list, then one query per row for
related data) is usually an ORM/application-layer problem, not a single slow
SQL statement — but it shows up in `pg_stat_statements` as one query
executed thousands of times with tiny individual latency and large aggregate
time. Fix by batching: a single `WHERE id = ANY($1)` / `IN (...)` fetch for
all related rows, or a `JOIN`, instead of one round trip per parent row. See
`10-monitoring-and-diagnosis.md` for spotting this pattern via `calls` ×
`mean_exec_time`.

## Correlated subquery vs JOIN/EXISTS

`SELECT * FROM orders o WHERE o.total > (SELECT avg(total) FROM orders WHERE
customer_id = o.customer_id)` re-evaluates the subquery per outer row unless
the planner can flatten it. Prefer `EXISTS`/`NOT EXISTS` for
existence checks (`WHERE EXISTS (SELECT 1 FROM ... WHERE ...)`) over `IN
(SELECT ...)` with a subquery that can return NULLs — `NOT IN` against a
subquery containing any NULL silently returns zero rows, a well-known
correctness trap, not just a performance one. Prefer a `JOIN` (or a window
function for per-group aggregates) when you need the correlated value
alongside the row, not just as a filter.

## OR across columns, and UNION as a rewrite

`WHERE a = 1 OR b = 2` on two separately-indexed columns often can't use
either index efficiently as a single scan (it may use a `BitmapOr` of both,
which is fine, but check the plan). If the planner isn't combining them well,
rewriting as `SELECT ... WHERE a = 1 UNION SELECT ... WHERE b = 2` lets each
half use its own index scan independently, at the cost of a dedup step
(`UNION ALL` if duplicates are impossible or acceptable).

## Large IN lists and VALUES

A very large `IN (v1, v2, ..., v10000)` list can be slow to plan and to
execute as a sequence of ORs internally. For bulk lookups, prefer
`WHERE id = ANY($1::int[])` with the array passed as a single bind parameter,
or a `JOIN` against a `VALUES` list / temporary table — both plan and execute
better than a sprawling literal list, and avoid rebuilding the query string
(and blowing the prepared-statement plan cache) for every distinct list size.

## DISTINCT and GROUP BY cost

`SELECT DISTINCT` and `GROUP BY` both typically require a sort or hash of the
full result set before dedup/aggregation — they are not free. If the goal is
just "does at least one match exist," use `EXISTS` instead of
`DISTINCT`/`LIMIT 1` patterns. If grouping by a low-cardinality column that's
part of a composite index alongside the filter, check whether the plan can
use the index order to avoid an explicit sort (`GROUP BY` matching index
column order enables a `GroupAggregate` over pre-sorted input instead of a
`HashAggregate` + spill).
