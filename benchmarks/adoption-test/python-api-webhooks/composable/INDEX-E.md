# Python REST API (FastAPI) — Mini-Skill Index

Load the mini-skill(s) matching your current task.

- `01-project-structure.md` — Layout, settings, hygiene. Load when scaffolding a project or organizing modules/config.
- `02-routing-and-app.md` — App factory, APIRouter, status codes, resource naming. Load when defining endpoints or wiring routers.
  ↳ pairs-with: 03-pydantic-models, 04-validation-and-errors
- `03-pydantic-models.md` — Request/response models, from_attributes, PATCH. Load when designing schemas or shaping I/O.
  ↳ pairs-with: 04-validation-and-errors
- `04-validation-and-errors.md` — Field/model validators, HTTPException, status-code discipline, handlers. Load when handling bad input or errors.
  ↳ pairs-with: 03-pydantic-models, code-review/05-error-handling (load from skills/code-review/composable/mini/)
- `05-dependencies-and-auth.md` — Depends, DB session, OAuth2/JWT, password hashing, roles. Load when adding auth or injection.
  ↳ requires: code-review/02-security-review · pairs-with: 08-testing (load from skills/code-review/composable/mini/)
- `06-pagination-filtering.md` — Limit/offset, keyset cursors, safe filtering/sorting. Load when listing collections.
  ↳ pairs-with: code-review/02-security-review (load from skills/code-review/composable/mini/)
- `07-async-performance.md` — Event loop, blocking I/O, N+1, caching, timeouts. Load when tuning or writing async handlers.
  ↳ pairs-with: code-review/06-performance, code-review/04-concurrency (load from skills/code-review/composable/mini/)
- `08-testing.md` — TestClient, dependency overrides, fixtures, contract tests. Load when writing API tests.
  ↳ pairs-with: code-review/08-missing-tests (load from skills/code-review/composable/mini/)
- `09-middleware-observability.md` — CORS, request logging, rate limiting, health checks, timeouts. Load when wiring cross-cutting concerns or hardening for production.
  ↳ pairs-with: code-review/02-security-review (load from skills/code-review/composable/mini/)
