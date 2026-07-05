# Join Algorithms and Planner Statistics

## Why the planner picks the join it picks

The planner chooses among Nested Loop, Hash Join, and Merge Join based on
estimated row counts and available indexes/sort orders — not on some fixed
preference. Nested Loop wins when the outer side is small and the inner side
has (or can use) an index on the join key. Hash Join wins for larger,
unsorted inputs where one side fits in `work_mem` as a hash table. Merge
Join wins when both sides are already sorted on the join key (e.g. both
scanned via an index on that column). When a plan looks wrong, don't assume
the planner is "buggy" — check whether the *row estimates feeding it* are
wrong first; a bad join choice is almost always downstream of a bad
cardinality estimate somewhere in the tree (`01-reading-explain-plans.md`).

## Where estimates come from

The planner's row estimates come from statistics gathered by `ANALYZE`
(automatically triggered by autovacuum, or run manually), stored in
`pg_stats`: histogram of common values (`most_common_vals`/
`most_common_freqs`), a histogram of the rest of the distribution, `n_distinct`,
and `correlation` (how well physical row order matches column sort order —
high correlation makes an Index Scan cheaper by reducing random heap access).

**Stale statistics are a top cause of bad plans that "used to be fine."** A
bulk load, a large delete, or a schema change without a follow-up `ANALYZE`
leaves the planner working off an outdated picture. Symptom: `EXPLAIN
ANALYZE` shows a large gap between estimated and actual row counts on a node
with no complex predicate. Fix: `ANALYZE <table>;` (cheap, statistics-only,
no table rewrite). If autovacuum isn't keeping up, tune its thresholds
(`06-vacuum-and-bloat.md`) rather than relying on manual `ANALYZE` as the
long-term fix.

## Increasing statistics detail

`default_statistics_target` (default 100) controls histogram/MCV granularity
per column; raise it per-column for columns with skewed distributions that
the planner keeps misjudging: `ALTER TABLE t ALTER COLUMN c SET STATISTICS
500; ANALYZE t;` Higher targets cost more planning time and larger
`pg_statistic` rows — apply narrowly, not instance-wide, unless broad
misestimation is measured.

## Correlated columns need extended statistics

By default, Postgres estimates multi-column predicates assuming columns are
independent: `WHERE city = 'Austin' AND state = 'TX'` is estimated as
`P(city) * P(state)`, wildly underestimating rows when the columns are
correlated (every Austin row is already `state = 'TX'`), which starves the
plan of the row count reality and can pick a Nested Loop where a Hash Join
was warranted, or vice versa. Fix with extended statistics:
`CREATE STATISTICS stx (dependencies, mcv) ON city, state FROM addresses;`
then `ANALYZE addresses;`. Reach for this when `EXPLAIN ANALYZE` shows a
large misestimate on an `AND` of two correlated columns and raising
`default_statistics_target` alone doesn't fix it.

## n_distinct estimation on large tables

`n_distinct` is estimated from a sample, and on very large tables with a
column whose distinct-value count scales with table size (e.g. a synthetic
key-like column), the sampled estimate can be systematically wrong. Postgres
lets you override it manually: `ALTER TABLE t ALTER COLUMN c SET (n_distinct
= 50000);` (or a negative value, meaning "a fraction of rows," e.g. `-0.5` for
"distinct values scale as half of row count"). Use this only after confirming
via `SELECT count(DISTINCT c)` that the estimate is genuinely off, not as a
first-line fix.
