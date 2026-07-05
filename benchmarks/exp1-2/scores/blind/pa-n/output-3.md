# Task: python-api / NARROW — Deliverable

A single-file FastAPI app implementing `GET /products`: a paginated, optionally
category-filtered listing over a hardcoded in-memory list of 25 sample
products.

Requirements covered:
- Query params `page` (default 1, must be ≥ 1), `page_size` (default 10, 1–50
  inclusive), optional `category` filter (case-insensitive exact match).
- Invalid params (e.g. `page=0`, `page_size=200`, negative values) return HTTP
  422 with a helpful, human-readable message via a custom
  `RequestValidationError` handler instead of FastAPI's default (still-valid
  but more verbose) 422 body.
- Response shape: `{"items": [...], "page": N, "page_size": N, "total": N,
  "total_pages": N}`, enforced by a `response_model` so the API contract is
  explicit and documented in OpenAPI.
- No auth, database, POST endpoints, or deployment config — only pagination
  and validation, per the task's scope.

## `app.py`

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


class ProductsPage(BaseModel):
    items: List[Product]
    page: int
    page_size: int
    total: int
    total_pages: int


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
@app.get("/products", response_model=ProductsPage)
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

    return ProductsPage(
        items=page_items,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )
```

## Design notes

- **Pagination is offset-based** (`page`/`page_size`), matching the task's
  requested response shape. `page_size` is capped server-side at 50 via
  `le=50` on the `Query`, so no request can pull the whole table regardless of
  what the client asks for.
- **Validation is declarative**: `ge=1` / `le=50` constraints on the `Query`
  parameters let FastAPI/Pydantic reject malformed input automatically,
  instead of hand-rolled `if` checks in the handler. This is less error-prone
  and self-documents in the OpenAPI schema.
- **Custom 422 handler**: FastAPI's default validation-error body is already
  structured JSON, but it nests raw Pydantic error dicts. The
  `validation_exception_handler` reshapes it into
  `{"detail": "...", "errors": ["page: Input should be greater than or equal to 1", ...]}`,
  which is more directly readable by a human or a simple client — satisfying
  the "helpful message" requirement explicitly.
- **`response_model=ProductsPage`** documents and enforces the response shape
  (filters out anything else the handler might accidentally return) rather
  than relying on returning a bare `dict` and hoping the shape stays correct.
- **`total_pages`** is computed with integer ceiling division and is `0` when
  a filter yields no results (rather than `1` with an empty page), which
  reads more naturally to API consumers checking "how many pages exist."
- **Category filter** is optional and does a case-insensitive exact match
  against the hardcoded category list (`electronics`, `books`, `clothing`,
  `home`, `toys`, `sports`, `beauty`), cycled across the 25 sample products.
  An unknown/non-matching category returns a valid `200` with `total: 0` and
  an empty `items` list (not a 404), since "no results" is a normal outcome
  for a filter, not an error.

## Self-verification

Ran locally via `fastapi.testclient.TestClient` against the app above:

- `GET /products` → `200`, `page=1`, `total=25`, 10 items returned.
- `GET /products?page=3&page_size=10` → `200`, returns the final 5 items
  (ids 21–25), `total_pages=3`.
- `GET /products?page=0` → `422`,
  `{"detail": "Invalid query parameters.", "errors": ["page: Input should be greater than or equal to 1"]}`.
- `GET /products?page_size=200` → `422`, `page_size` bound error (le=50).
- `GET /products?page_size=-5` → `422`, `page_size` bound error (ge=1).
- `GET /products?category=books` → `200`, `total=4`, all returned items have
  `category == "books"`.
- `GET /products?category=nonexistent` → `200`, `total=0`, `items=[]`,
  `total_pages=0`.

All checks passed as expected.
