# Index Design

## Default to B-tree, know when not to

`CREATE INDEX` defaults to B-tree, which handles `=`, ranges, `ORDER BY`, and
`IN`. Reach for a different index type only for a specific access pattern:
**GIN** for `jsonb` containment (`@>`), array containment, and full-text
`tsvector`; **GiST** for range types, geometric data, and exclusion
constraints; **BRIN** for very large, physically-correlated append-only
tables (e.g. a `created_at` column on an insert-ordered table) where a tiny
BRIN index can prune whole page ranges cheaply. Don't reach for GIN/GiST by
habit — they're heavier to build and maintain than a B-tree for data that
doesn't need them.

## Composite index column order matters

In a multi-column B-tree index, put **equality-filtered columns first, the
most selective range/sort column last**. `(status, created_at)` serves
`WHERE status = 'open' ORDER BY created_at` efficiently (equality narrows to
a contiguous index range, then the tail is already sorted); `(created_at,
status)` does not — the engine must scan a much wider index range and filter.
An index on `(a, b)` also serves queries filtering on `a` alone, but **not**
queries filtering on `b` alone — leading-column matters.

## Covering and partial indexes cut cost further

- **`INCLUDE`** — add non-key columns to the index leaf pages so a query can
  be answered as an Index Only Scan without a heap fetch:
  `CREATE INDEX ON orders (customer_id) INCLUDE (status, total);` Use when a
  hot query selects a few extra columns beyond the filter/sort keys.
- **Partial index** — index only the subset of rows a hot query actually
  filters for: `CREATE INDEX ON orders (created_at) WHERE status = 'pending';`
  Much smaller and cheaper to maintain than a full index when the predicate
  is selective and stable (e.g. "unprocessed" rows are a small, shrinking
  fraction of a large table).
- **Expression index** — if a query filters on a computed value
  (`WHERE lower(email) = ...`), index the expression itself:
  `CREATE INDEX ON users (lower(email));` A plain index on `email` cannot
  serve this predicate — the planner won't use it, because the on-disk index
  is sorted by raw `email`, not `lower(email)`. This is the most common
  "I have an index but it's not being used" trap; see also
  `03-query-rewriting.md` for the same trap on the query side.

## Don't accumulate redundant indexes

Every index is write cost: each `INSERT`/`UPDATE`/`DELETE` maintains every
index on the table. An index on `(a)` is redundant once `(a, b)` exists (the
leading column is already served); a unique index that duplicates a primary
key's column set is dead weight. Periodically check
`pg_stat_user_indexes.idx_scan` for indexes with near-zero scans on a
table with meaningful write volume — those are pure write-cost with no
read benefit and are candidates to drop.

## Build indexes without blocking writers

Plain `CREATE INDEX` takes a `SHARE` lock that blocks writes to the table for
the whole build. On any table with live write traffic, use
`CREATE INDEX CONCURRENTLY` instead — it takes longer and requires two table
scans, but doesn't block concurrent writes. Caveats: it cannot run inside a
transaction block, and if it fails partway it can leave an `INVALID` index
behind that must be dropped and retried (check
`pg_index.indisvalid`). The same `CONCURRENTLY` option exists for `DROP
INDEX`.

## Verify the index is actually used

After adding an index, re-run `EXPLAIN (ANALYZE, BUFFERS)` and confirm an
Index Scan/Index Only Scan/Bitmap Scan appears — don't assume from the
`CREATE INDEX` succeeding. A newly created index needs `ANALYZE` to update
planner statistics before the planner reliably picks it up on a
just-populated table.
