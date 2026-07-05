# Changelog

## [2.4.0] - 2026-07-05

### Breaking changes

> **Action required before upgrading.**

- **Config key renamed:** `target_db` is now `destination` in `dbsync.yaml`. Rename the key in your config file — dbsync will not recognize the old name.
  - Before: `target_db: mydb`
  - After: `destination: mydb`
- **Minimum Python version is now 3.10.** If you run dbsync on an older Python, upgrade your runtime before installing 2.4.0.

### Added

- `--dry-run` flag on `sync` to preview changes without applying them.
- Parallel table sync, 4 workers by default; tune with `--workers`.

### Changed

- Postgres batch inserts now use `COPY`, ~6x faster.

### Fixed

- Unicode table names failed during Postgres introspection (#412).
- Connection pool was exhausted when syncing more than 50 tables (#398).
- `--exclude` glob patterns were case-sensitive on macOS.

LOADED: INDEX.md, 03-readme-quickstart-changelog.md, 06-breaking-changes-migrations.md, 05-style-clarity.md
