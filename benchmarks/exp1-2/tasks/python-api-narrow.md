# Task: python-api / NARROW

You must implement a single Python FastAPI endpoint in a new file `app.py`:

`GET /products` — returns a paginated list of products from an in-memory list
(hardcode 25 sample products with id, name, price_cents, category).

Requirements:
- Query params: `page` (default 1), `page_size` (default 10, max 50),
  `category` (optional filter).
- Invalid params must return HTTP 422 with a helpful message (e.g. page=0,
  page_size=200, negative values).
- Response shape: `{"items": [...], "page": N, "page_size": N, "total": N,
  "total_pages": N}`.
- Include the code in your final answer as a single complete `app.py`.

Only pagination and input validation matter here. Do NOT add auth, a database,
POST endpoints, or deployment config.
