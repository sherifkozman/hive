# python-api / NARROW — deliverable

Single FastAPI endpoint `GET /products` with pagination and input validation
over a hardcoded in-memory list of 25 products. No auth, no database, no POST
endpoints, no deployment config, per the task's scope.

Design notes:
- `page` and `page_size` are validated declaratively via `Query(..., ge=1)` /
  `Query(..., ge=1, le=50)`. FastAPI/Pydantic reject out-of-range or
  non-integer values with an automatic `422` and a structured, helpful body
  before the handler body ever executes — this covers `page=0`,
  `page_size=200`, negative values, and non-numeric input.
- `page_size` is capped server-side at 50 regardless of what the client
  requests.
- `category` is an optional exact-match filter; an unknown category is not
  an error — it yields an empty `items` list with an accurate `total` of 0,
  consistent with how filters normally behave (no results found vs.
  malformed request).
- Pagination is deterministic: the in-memory list is defined in a fixed order
  (by `id`) and sliced by `page`/`page_size`, so results don't shift between
  calls.
- Response shape matches the spec exactly: `{"items": [...], "page": N,
  "page_size": N, "total": N, "total_pages": N}`.
- `response_model=ProductPage` documents and validates the output shape in
  OpenAPI and guarantees the response never leaks extra fields.

Self-verified locally with `TestClient` (no test file included, since the
task only requests `app.py`):
- Default call (`/products`) → 200, page 1, page_size 10, total 25,
  total_pages 3, 10 items returned.
- `page=3&page_size=10` → 200, last partial page with 5 items (ids 21-25).
- `page_size=50` (max allowed) → 200, all 25 items, total_pages 1.
- `page_size=200` → 422 with a `less_than_equal` validation message.
- `page=0` → 422 (`greater_than_equal`).
- `page=-1` → 422 (`greater_than_equal`).
- `page_size=-5` → 422 (`greater_than_equal`).
- `page=abc` (non-integer) → 422 (`int_parsing`).
- `category=books` → 200, only `books` items returned, correct total.
- `category=doesnotexist` → 200, empty `items`, `total=0`, `total_pages=0`
  (not a validation error — a filter with no matches).
- `page=99` (beyond range) → 200, empty `items`, `total`/`total_pages` still
  reflect the full unfiltered/filtered collection.

## `app.py`

```python
"""
Single-endpoint FastAPI app: GET /products

Returns a paginated list of products from a hardcoded in-memory list.
Only pagination and input validation are in scope (no auth, no DB, no
POST endpoints, no deployment config), per the task requirements.
"""

import math
from typing import Optional

from fastapi import FastAPI, Query
from pydantic import BaseModel

app = FastAPI(title="Products API", version="1.0.0")


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

class Product(BaseModel):
    id: int
    name: str
    price_cents: int
    category: str


_CATEGORIES = ["electronics", "books", "home", "toys", "sports"]

# 25 hardcoded sample products, deterministic and fully in-memory.
PRODUCTS: list[Product] = [
    Product(
        id=i,
        name=f"Product {i}",
        price_cents=500 + i * 137,
        category=_CATEGORIES[i % len(_CATEGORIES)],
    )
    for i in range(1, 26)
]


# ---------------------------------------------------------------------------
# Response shape
# ---------------------------------------------------------------------------

class ProductPage(BaseModel):
    items: list[Product]
    page: int
    page_size: int
    total: int
    total_pages: int


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

MAX_PAGE_SIZE = 50


@app.get("/products", response_model=ProductPage)
def list_products(
    page: int = Query(1, ge=1, description="1-indexed page number"),
    page_size: int = Query(
        10, ge=1, le=MAX_PAGE_SIZE, description="Items per page (max 50)"
    ),
    category: Optional[str] = Query(
        None, min_length=1, description="Exact-match category filter"
    ),
) -> ProductPage:
    """List products with pagination and an optional category filter.

    - `page` must be >= 1.
    - `page_size` must be between 1 and 50 (inclusive).
    - Values outside these bounds, or the wrong type (e.g. non-integer),
      are rejected by FastAPI/Pydantic with a 422 and a descriptive body
      before this function ever runs.
    - An unknown `category` is not an error: it simply yields an empty
      `items` list with an accurate `total`/`total_pages` of 0.
    """
    filtered = PRODUCTS
    if category is not None:
        filtered = [p for p in filtered if p.category == category]

    total = len(filtered)
    total_pages = math.ceil(total / page_size) if total else 0

    start = (page - 1) * page_size
    end = start + page_size
    items = filtered[start:end]

    return ProductPage(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
```

LOADED: monolithic/SKILL.md
