## [2.4.0] - 2026-07-05

### ⚠ Breaking change — action required

**`target_db` renamed to `destination` in `dbsync.yaml`.** Configs using the old key are no longer recognized.

- **Affected:** anyone with a `target_db:` entry in `dbsync.yaml`.
- **Migrate:** rename the key — no value change needed.

  ```yaml
  # before
  target_db: my_warehouse

  # after
  destination: my_warehouse
  ```

- **Verify:** run `dbsync sync --dry-run`; it fails fast if `destination` is missing.

### Added
- `--dry-run` flag on `sync` to preview a run without writing changes.
- Parallel table sync — 4 workers by default, configurable with `--workers`.

### Changed
- Minimum supported Python version is now 3.10.
- Postgres batch inserts now use `COPY`, ~6x faster than the previous insert path.

### Fixed
- Unicode table names failed during Postgres introspection (#412).
- Connection pool was exhausted when syncing more than 50 tables (#398).
- `--exclude` glob patterns were incorrectly case-sensitive on macOS.

LOADED: monolithic/SKILL.md
