# Memory and Configuration Tuning

## The core memory knobs and how they compound

- **`shared_buffers`** — Postgres's own page cache. Common starting point:
  ~25% of system RAM (higher isn't automatically better — the OS page cache
  also caches the same files, and very large `shared_buffers` can add
  checkpoint-flushing overhead). Requires a **postmaster restart** to change.
- **`effective_cache_size`** — not an allocation, just a hint to the planner
  about how much memory (Postgres buffers + OS cache combined) is realistically
  available for caching, used to judge whether an Index Scan's random I/O
  will likely hit cache. Set to roughly 50–75% of system RAM. Reloadable
  without restart (`SIGHUP`).
- **`work_mem`** — memory allowed **per sort or hash operation**, not per
  query and not per connection. A single complex query with several sorts/
  hashes (and parallel workers, each getting their own allocation) can use
  a large multiple of `work_mem`. Setting it too high instance-wide risks
  memory exhaustion under concurrency; setting it too low forces sorts/hashes
  to spill to disk (`external merge` in `EXPLAIN ANALYZE`, or extra `Batches`
  on a Hash Join — see `01-reading-explain-plans.md`). Prefer a moderate
  global default plus a per-session `SET work_mem = '...'` bump for specific
  known-heavy reporting/batch queries, rather than raising the global default
  to satisfy one workload.
- **`maintenance_work_mem`** — used for `VACUUM`, `CREATE INDEX`,
  `ALTER TABLE ADD FOREIGN KEY`, and similar maintenance operations. Safe to
  set much higher than `work_mem` (these don't run with the same
  concurrency), which speeds up index builds and vacuum significantly.

## Cost estimation constants for modern storage

`random_page_cost` (default 4.0) and `seq_page_cost` (default 1.0) tell the
planner how expensive random vs sequential I/O is, calibrated originally for
spinning disks. On SSD/NVMe-backed storage (the common case today, including
most managed cloud Postgres), random access is much cheaper relative to
sequential than the default assumes — lowering `random_page_cost` to
somewhere around 1.1–1.5 makes the planner more willing to choose Index
Scans over Seq Scans where they're actually faster. This is one of the
highest-leverage single-parameter changes on cloud/SSD deployments and is
easy to miss because the defaults date from a different storage era.

## Checkpoint tuning

Checkpoints flush dirty buffers to disk and are needed for crash recovery,
but frequent checkpoints cause I/O spikes and increased WAL volume from
full-page writes. `max_wal_size` (checkpoint trigger by WAL volume) and
`checkpoint_timeout` (trigger by time) both bound how far apart checkpoints
are; `checkpoint_completion_target` (near 0.9) spreads a checkpoint's I/O
over more of the interval instead of bursting it, smoothing write-heavy
workload latency spikes. Symptom of checkpoints being too frequent: periodic
latency spikes visible in monitoring that line up with checkpoint log
entries (enable `log_checkpoints` to confirm).

## Parallel query settings

`max_parallel_workers_per_gather` controls how many workers a single query
node can use; `parallel_setup_cost`/`parallel_tuple_cost` influence whether
the planner bothers. Parallel plans help large sequential scans/aggregates/
sorts but each worker gets its own `work_mem` allocation — raising both
`work_mem` and parallelism together multiplies memory pressure faster than
either alone; size them jointly against expected concurrent query count, not
independently.

## Apply, then verify — don't just set and forget

After any config change: confirm it actually applied
(`SHOW <param>;` or `SELECT * FROM pg_settings WHERE name = '...'` which also
shows whether a restart is `pending_restart`), and re-run
`EXPLAIN (ANALYZE, BUFFERS)` on the target query to confirm the plan and
timing actually changed as expected — a config change that "should" help but
doesn't move the measured plan is a sign the real bottleneck is elsewhere
(see `00-core.md`'s measure-first discipline).
