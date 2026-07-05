# python-api / NARROW — Deliverable

## Task

Implement a single FastAPI endpoint, `GET /products`, that returns a paginated
list of products from an in-memory list of 25 hardcoded sample products (each
with `id`, `name`, `price_cents`, `category`). Support `page`, `page_size`
(max 50), and an optional `category` filter, with HTTP 422 + a helpful
message for invalid pagination params, and a response shape of
`{"items": [...], "page": N, "page_size": N, "total": N, "total_pages": N}`.

## Design notes

- Pagination params are validated declaratively with FastAPI's `Query(...,
  ge=..., le=...)` constraints: `page` must be `>= 1` (rejects `0` and
  negative values), `page_size` must be in `[1, 50]` (rejects `0`, negatives,
  and anything above `50`, e.g. `200`).
- A custom `RequestValidationError` handler converts FastAPI/Pydantic's
  default validation-error payload into a clearer `{"detail": ...,
  "errors": [...]}` shape so 422 responses are self-explanatory (e.g.
  `"page_size: Input should be less than or equal to 50"`).
- `category` is an optional, case-insensitive exact-match filter. An
  unknown/non-matching category is not an error — it simply yields an empty
  `items` list with `total: 0` and `total_pages: 0`, since it's a filter, not
  a paging parameter (only pagination params are required to 422 per the
  task).
- `total` reflects the count *after* the category filter is applied;
  `total_pages` is `ceil(total / page_size)` (0 when there are no matching
  items). Requesting a page beyond the last page returns an empty `items`
  list with a `200` (not an error), since `page` itself is still a valid,
  in-range-constrained integer.
- 25 sample products are generated deterministically at import time, cycling
  through 7 categories (`electronics, books, clothing, home, toys, sports,
  beauty`) so the category filter has realistic, non-trivial groupings.

## Self-verification performed

Installed `fastapi`, `uvicorn`, and `httpx` locally and exercised the app via
Starlette's `TestClient` (no server process needed):

- `GET /products` (defaults) → 200, 10 items, `page=1, page_size=10, total=25,
  total_pages=3`.
- `GET /products?page=2&page_size=5` → 200, correct slice (ids 6-10),
  `total_pages=5`.
- `GET /products?category=books` → 200, only `books` items returned
  (`total=4`, `total_pages=1`).
- `GET /products?category=nope` → 200, `items=[]`, `total=0`,
  `total_pages=0` (no match is not an error).
- `GET /products?page=0` → 422 with message `"page: Input should be greater
  than or equal to 1"`.
- `GET /products?page_size=200` → 422 with message `"page_size: Input should
  be less than or equal to 50"`.
- `GET /products?page=-1` → 422 (negative page rejected).
- `GET /products?page_size=-5` → 422 (negative page_size rejected).
- `GET /products?page=100` (beyond last page) → 200, `items=[]`, but `total`
  and `total_pages` still reflect the full (unfiltered) collection.

All of the above matched expectations.

## Final answer — complete `app.py`

```python
"""
A small FastAPI service exposing a single paginated `/products` endpoint.

Run with:
    uvicorn app:app --reload
"""

from typing import List, Optional

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="Products API")


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
class Product(BaseModel):
    id: int
    name: str
    price_cents: int
    category: str


# ---------------------------------------------------------------------------
# Hardcoded in-memory sample data (25 products)
# ---------------------------------------------------------------------------
_CATEGORIES = ["electronics", "books", "clothing", "home", "toys", "sports", "beauty"]

PRODUCTS: List[Product] = [
    Product(
        id=i,
        name=f"Product {i}",
        price_cents=500 + i * 137,
        category=_CATEGORIES[(i - 1) % len(_CATEGORIES)],
    )
    for i in range(1, 26)
]


# ---------------------------------------------------------------------------
# Custom validation-error handler so 422 responses carry a clear,
# human-readable message instead of the raw pydantic error payload.
# ---------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", []) if part != "query")
        messages.append(f"{loc}: {err.get('msg')}")
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Invalid query parameters.",
            "errors": messages,
        },
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@app.get("/products")
async def list_products(
    page: int = Query(1, ge=1, description="1-indexed page number"),
    page_size: int = Query(10, ge=1, le=50, description="Number of items per page (max 50)"),
    category: Optional[str] = Query(None, description="Filter by exact category match"),
):
    items = PRODUCTS
    if category is not None:
        items = [p for p in items if p.category.lower() == category.lower()]

    total = len(items)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]

    return {
        "items": [p.model_dump() for p in page_items],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }
```

LOADED: none
