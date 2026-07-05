---
pairs-with:
  - code-review/02-security-review.md
---

# Pagination, Filtering & Sorting

Never return an unbounded collection. Offer limit/offset for simple cases, keyset (cursor) for large or fast-changing data.

**Limit/offset:**
```python
class Page(BaseModel):
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)

@router.get("", response_model=PageOut[UserOut])
def list_users(p: Page = Depends(), db: Session = Depends(get_db)):
    q = select(User).order_by(User.id)
    total = db.scalar(select(func.count()).select_from(User))
    rows = db.scalars(q.limit(p.limit).offset(p.offset)).all()
    return {"items": rows, "total": total, "limit": p.limit, "offset": p.offset}
```

Note the `le=100` cap — clients can't request unbounded pages.

**Keyset pagination** avoids the deep-offset performance cliff (offset scans and discards skipped rows): `WHERE id > :cursor ORDER BY id LIMIT :n`, returning the last id as the next cursor. Use it for large tables and infinite scroll.

**Deterministic ordering is mandatory.** Always apply an `ORDER BY` with a unique tiebreaker (e.g. `ORDER BY created_at, id`). Without it, rows can shift between pages and clients see duplicates or gaps.

**Safe filtering & sorting** — the security-critical part:
- Expose an explicit allowlist of filter fields as typed query params. Never build SQL from raw client strings and never `eval` a filter expression.
- Map sort keys through a whitelist dict to columns:

```python
SORTABLE = {"email": User.email, "created": User.created_at}
col = SORTABLE.get(sort_key)
if col is None:
    raise HTTPException(400, "invalid sort field")
q = q.order_by(col.desc() if descending else col.asc())
```

This prevents SQL injection and stops clients sorting by or filtering on private columns. Always use parameterized queries / the ORM, never string interpolation.

**Response metadata.** Return enough for the client to navigate: the items plus `limit`/`offset` (or a `next_cursor`), and a `total` only when it's cheap — a `COUNT(*)` over a huge filtered table can cost as much as the page query itself, so for large datasets prefer cursor pagination with a `has_more` flag and omit the total. Cap the maximum page size server-side (`le=100`) regardless of what the client asks for, so no single request can pull the whole table.
