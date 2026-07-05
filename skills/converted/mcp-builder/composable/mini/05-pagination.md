# Pagination

For tools that list resources:

- **Always respect the `limit` parameter.**
- **Implement pagination:** use `offset` or cursor-based pagination.
- **Return pagination metadata:** include `has_more`, `next_offset`/`next_cursor`, and `total_count`.
- **Never load all results into memory** — especially important for large datasets.
- **Default to reasonable limits:** 20–50 items is typical.

Example pagination response:

```json
{
  "total": 150,
  "count": 20,
  "offset": 0,
  "items": [...],
  "has_more": true,
  "next_offset": 20
}
```

(Language-specific pagination code — computing `has_more` and `next_offset` from `total`, `offset`, and returned items — lives in the Python and Node minis.)
