# Python REST API (FastAPI): Mini-Skill Index

Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If most of this skill is relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.

- `01-project-structure.md` - Layout, settings, hygiene. Load when scaffolding a project or organizing modules/config.
- `02-routing-and-app.md` - App factory, APIRouter, status codes, resource naming. Load when defining endpoints or wiring routers.
- `03-pydantic-models.md` - Request/response models, from_attributes, PATCH. Load when designing schemas or shaping I/O.
- `04-validation-and-errors.md` - Field/model validators, HTTPException, status-code discipline, handlers. Load when handling bad input or errors.
- `05-dependencies-and-auth.md` - Depends, DB session, OAuth2/JWT, password hashing, roles. Load when adding auth or injection.
- `06-pagination-filtering.md` - Limit/offset, keyset cursors, safe filtering/sorting. Load when listing collections.
- `07-async-performance.md` - Event loop, blocking I/O, N+1, caching, timeouts. Load when tuning or writing async handlers.
- `08-testing.md` - TestClient, dependency overrides, fixtures, contract tests. Load when writing API tests.
- `09-middleware-observability.md` - CORS, request logging, rate limiting, health checks, timeouts. Load when wiring cross-cutting concerns or hardening for production.
