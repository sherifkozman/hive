## 2.4.0

### ⚠ Breaking Changes

- The config key `target_db` has been renamed to `destination` in `dbsync.yaml`.
  **Migration required:** open your `dbsync.yaml` and rename `target_db` to
  `destination` before upgrading, or `dbsync` will fail to start.

  ```diff
  - target_db: my_warehouse
  + destination: my_warehouse
  ```

- Minimum supported Python version is now **3.10**. Upgrade your Python
  runtime before installing this release.

### Features

- Added `--dry-run` flag to `sync` to preview changes without writing to the
  destination.
- Table sync now runs in parallel (4 workers by default); tune concurrency
  with the new `--workers` flag.

### Performance

- Postgres inserts are now batched using `COPY`, making sync roughly **6x
  faster**.

### Fixes

- Fixed handling of Unicode table names during Postgres introspection
  (#412).
- Fixed connection pool exhaustion when syncing more than 50 tables (#398).
- `--exclude` glob patterns are no longer case-sensitive on macOS.

LOADED: none
