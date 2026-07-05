# Partitioning and Large Tables

## When partitioning actually helps

Declarative partitioning splits one logical table into physical child tables
by range, list, or hash of a partition key. It pays off when queries and
maintenance can exploit **partition pruning** — the planner skipping whole
child tables that can't match the query's `WHERE` clause — and when it lets
you drop/archive old data cheaply (`DROP`/`DETACH` a partition instead of a
slow bulk `DELETE` that then needs vacuuming). Classic fit: time-series or
event data range-partitioned by `created_at` (e.g. monthly), where old
partitions are archived or dropped wholesale and most queries filter by a
recent time range.

Partitioning is **not** a general performance fix for "the table is slow" —
if queries don't filter on the partition key, every query still has to
touch every partition (no pruning), and you've added overhead (more
relations, more planning work, more indexes to maintain) for no benefit. A
well-indexed single table is usually better than a prematurely partitioned
one at moderate scale (roughly tens of millions of rows, workload-dependent)
— check whether indexing alone (`02-index-design.md`) solves the problem
before reaching for partitioning.

## Partition key choice drives pruning

The partition key must appear in `WHERE` clauses (as an equality or a bounded
range) for pruning to trigger; `EXPLAIN` shows this directly — a pruned plan
lists only the relevant child partitions under the `Append`/scan node,
an unpruned plan lists all of them. If the dominant query pattern doesn't
naturally filter on a single obvious column, partitioning likely won't earn
its overhead. For queries that need pruning on more than one dimension,
consider composite partitioning (e.g. range by month, subpartitioned by
list on tenant) only once a single-key scheme is proven insufficient — added
partitioning layers add planning overhead too.

## Indexes and constraints on partitioned tables

An index created on the parent (`CREATE INDEX ON parent (col)`) automatically
propagates to all existing and future partitions as a matching local index —
this is the normal way to index a partitioned table. Unique constraints
(including primary keys) on a partitioned table **must include the partition
key** as part of the unique/primary key columns — Postgres cannot enforce
global uniqueness across partitions otherwise. This is a common surprise
when converting an existing table (whose primary key was just `id`) to
partitioned — the primary key becomes `(id, created_at)` or similar, which
can ripple into foreign keys referencing it.

## Detach/attach for archiving without long locks

`ALTER TABLE parent DETACH PARTITION child CONCURRENTLY` removes a partition
from the partitioned table without a long-held exclusive lock (unlike a
non-concurrent detach), letting you archive or drop old data online. Attaching
a new partition (`ATTACH PARTITION ... FOR VALUES ...`) is fast if Postgres
can verify the incoming data already satisfies the partition bounds via an
existing `CHECK` constraint on the table being attached — without that
constraint, attaching triggers a full validation scan under lock. Add a
matching `CHECK` constraint to a plain table before attaching it as a
partition to avoid that scan.

## Converting an existing large table

There's no in-place "make this table partitioned" operation — converting
requires creating a new partitioned table and moving data in (commonly via
logical replication, `pg_partman`, or a dual-write/backfill-then-cutover
approach for zero/low downtime). Plan this as a migration project with its
own testing, not a quick config change; verify query plans against the new
structure (partition pruning actually triggering) before cutting over
traffic.
