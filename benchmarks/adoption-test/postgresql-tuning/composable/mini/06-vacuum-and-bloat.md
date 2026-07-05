# VACUUM, Autovacuum, and Bloat

## Why Postgres needs vacuum at all

Postgres uses MVCC: an `UPDATE` doesn't overwrite a row in place, it writes a
new row version and marks the old one dead; a `DELETE` just marks a row dead.
Dead row versions ("dead tuples") aren't reclaimed until `VACUUM` runs. Left
unchecked, dead tuples accumulate as **bloat** — tables and indexes grow
larger than their live data requires, scans read more pages than necessary,
and the visibility map goes stale (hurting Index Only Scans — see
`01-reading-explain-plans.md`).

## Autovacuum is on by default — tune it, don't disable it

Autovacuum runs automatically per table once dead-tuple count crosses a
threshold: `autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor *
reltuples` (defaults: 50 + 0.2 * row count). On a large table, 20% is a lot
of dead rows before vacuum even triggers — for high-churn large tables, lower
`autovacuum_vacuum_scale_factor` (even to near 0, relying more on the flat
`threshold`) per-table:

```sql
ALTER TABLE hot_table SET (autovacuum_vacuum_scale_factor = 0.01,
                            autovacuum_vacuum_threshold = 5000);
```

Also watch `autovacuum_vacuum_cost_limit`/`autovacuum_vacuum_cost_delay` —
these throttle vacuum's I/O impact; too aggressive throttling means vacuum
can't keep up on a busy, large database even though it's triggering on time.
Never just disable autovacuum to "stop the I/O spikes" — that guarantees
unbounded bloat and, eventually, transaction ID wraparound (below).

## Detecting bloat

Estimate table/index bloat via `pg_stat_user_tables` (`n_dead_tup` vs
`n_live_tup` gives a rough live signal) or the `pgstattuple` extension for an
exact measurement (`SELECT * FROM pgstattuple('my_table');` reports dead
tuple percentage directly, at the cost of a full scan). A table with
`n_dead_tup` consistently high relative to `n_live_tup` between autovacuum
runs means autovacuum isn't keeping pace with write volume — tune the
per-table settings above rather than only reacting with manual `VACUUM`.

## Reclaiming bloat once it's happened

Plain `VACUUM` marks space reusable by future writes to the *same table* but
does not shrink the file on disk or reduce index size. Options to actually
shrink:

- **`VACUUM FULL`** — rewrites the whole table into a new file, reclaiming
  disk space, but takes an `ACCESS EXCLUSIVE` lock for the duration —
  blocks all reads and writes. Only acceptable in a maintenance window on a
  small-enough table.
- **`pg_repack`** — third-party extension that rewrites a table online (no
  long exclusive lock) by building a shadow copy and swapping it in; the
  standard answer for de-bloating a large, live table without downtime.
- **`REINDEX CONCURRENTLY`** — rebuilds a bloated index without the long lock
  that plain `REINDEX` takes (index bloat accumulates independently of table
  bloat and is common after mass updates/deletes).

## Transaction ID wraparound — the failure mode, not just an optimization

Postgres transaction IDs are 32-bit and wrap around; `VACUUM` also "freezes"
old row versions so their visibility doesn't depend on a wrapping XID
comparison. If autovacuum cannot keep up with freezing (commonly because it's
disabled, starved by cost limits, or blocked from ever completing on a table
by a long-held lock), Postgres will eventually force a database-wide
"vacuum to prevent wraparound" and, if truly neglected, refuse new
transactions entirely at `autovacuum_freeze_max_age`. Watch
`age(datfrozenxid)` per database (`SELECT datname, age(datfrozenxid) FROM
pg_database;`) as a leading indicator, not just table bloat percentage — this
is the difference between "slow queries" and "database stopped accepting
writes."
