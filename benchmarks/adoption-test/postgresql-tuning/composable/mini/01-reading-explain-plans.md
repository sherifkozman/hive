# Reading EXPLAIN and EXPLAIN ANALYZE

## The two questions a plan answers

`EXPLAIN <query>` shows what the planner *thinks* it will do, using cost
estimates only — nothing runs. `EXPLAIN (ANALYZE, BUFFERS) <query>` actually
executes the query (wrap in a transaction and roll back for
non-idempotent statements) and reports real timings, row counts, and buffer
hits/misses per node. Always reach for `ANALYZE, BUFFERS` when diagnosing a
real slow query — cost estimates alone can't tell you if the planner's
row-count guess was wrong, which is the single most common cause of a bad
plan.

## Reading a node

Each plan node reports (roughly):

```
Index Scan using idx_orders_customer_id on orders
  (cost=0.43..8.45 rows=1 width=120)
  (actual time=0.021..0.023 rows=1 loops=1)
  Index Cond: (customer_id = 42)
  Buffers: shared hit=4
```

- **cost=startup..total** — arbitrary planner units, not milliseconds. Useful
  for comparing plan candidates, not for judging absolute speed.
- **actual time=startup..total** — real milliseconds, *per loop*, average
  across `loops`. For a node executed 1000 times in a nested loop, multiply
  `actual time` by `loops` to get its total contribution.
- **rows (estimate) vs rows (actual)** — the single most important
  cross-check. If estimated and actual rows differ by 10x+, planner
  statistics are stale or the predicate is inherently hard to estimate
  (correlated columns, skewed data) — see `04-joins-and-statistics.md`. A
  misestimate here is *why* the planner picked a bad join order or join
  algorithm elsewhere in the tree.
- **Buffers: shared hit=/read=** — `hit` came from the buffer cache, `read`
  from disk (or OS cache — Postgres can't distinguish). A node with a large
  `read` count relative to `hit` is not cached; that's a candidate for more
  `shared_buffers` or a smaller working set, not necessarily a missing index.

## Common node types and what they imply

- **Seq Scan** — full table scan. Fine for small tables or when returning
  most of the table; a red flag on a large table with a selective `WHERE`
  clause (implies a missing or unusable index — see `02-index-design.md` and
  `03-query-rewriting.md` for why an index might exist but not be used,
  e.g. a function wrapped around the column).
- **Index Scan** — reads the index, then fetches matching rows from the
  heap (table). Heap fetches cost random I/O; many of them on a poorly
  correlated table can be slower than a Seq Scan for a mid-size result set.
- **Index Only Scan** — satisfies the query from the index alone, no heap
  fetch, *provided* the visibility map marks the pages all-visible. A high
  "Heap Fetches" count here means the visibility map is stale — usually an
  autovacuum lag problem (`06-vacuum-and-bloat.md`), not an indexing one.
- **Bitmap Heap Scan / Bitmap Index Scan** — used when many rows match but
  not the whole table; builds a bitmap of matching pages to fetch heap pages
  in physical order instead of index order, reducing random I/O. Seeing this
  instead of a plain Index Scan is normal and often faster, not a problem to
  fix.
- **Nested Loop** — fine when the outer side is small (few rows); a Nested
  Loop over a large outer side with a large per-iteration inner cost is the
  classic N+1 shape inside a single SQL statement.
- **Hash Join** — builds an in-memory (or spilled-to-disk) hash table from
  the smaller side; watch for "Batches: N" > 1 in the actual output, which
  means the hash table spilled to disk because `work_mem` was too small.
- **Merge Join** — requires both sides sorted; good when inputs are already
  index-ordered, otherwise pays an explicit Sort.
- **Sort** — check `Sort Method`: `quicksort` fits in `work_mem`;
  `external merge` spilled to disk and is a `work_mem` sizing signal
  (`07-memory-and-config.md`).

## Planning time vs execution time

`EXPLAIN ANALYZE` also reports `Planning Time`. A high planning time relative
to execution time usually means either a very complex query (many joins/CTEs)
or the planner doing expensive constant-folding/partition-pruning work — it
is a separate problem from execution time and is not fixed by indexing.
