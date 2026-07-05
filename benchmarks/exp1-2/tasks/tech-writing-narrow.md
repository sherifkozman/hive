# Task: tech-writing / NARROW

Write release notes (CHANGELOG entry, version 2.4.0) for a developer tool
called `dbsync`, from these raw commit messages:

```
fix: handle unicode table names in postgres introspection (fixes #412)
feat: add --dry-run flag to sync command
feat: parallel table sync, 4 workers default, --workers flag
fix: connection pool exhaustion when >50 tables (fixes #398)
perf: batch inserts now use COPY on postgres, ~6x faster
breaking: renamed config key `target_db` to `destination` in dbsync.yaml
fix: --exclude glob patterns were case-sensitive on macOS
docs: fix typo in README
chore: bump minimum python to 3.10
```

Requirements: audience is existing users upgrading; group appropriately;
breaking changes and required migration steps must be impossible to miss;
mention perf numbers where known; omit noise that users don't care about.
Output only the changelog entry in Markdown.
