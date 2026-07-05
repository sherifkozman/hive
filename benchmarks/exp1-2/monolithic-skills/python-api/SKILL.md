# Python REST API Development (FastAPI)

Expert guidance for building production REST APIs in Python with FastAPI. Covers project structure, routing, Pydantic models, validation, authentication, error handling, pagination/filtering, async/performance, and testing. The through-line: keep handlers thin, validate at the boundary, and make everything testable.

## Project structure & hygiene

Organize by feature, not by layer, once the app grows past a handful of endpoints. Layer-first layouts (`controllers/`, `services/`, `models/` each holding every feature) force you to touch many directories per change and scale badly. A pragmatic feature-aware layout:

```
app/
  main.py            # create_app(), mount routers, middleware
  core/
    config.py        # Settings (pydantic-settings)
    security.py      # hashing, JWT helpers
  db/
    session.py       # engine, SessionLocal, get_db dependency
  api/
    deps.py          # shared dependencies (auth, pagination)
    v1/
      users.py       # APIRouter for /users
      items.py
  models/            # SQLAlchemy ORM models
  schemas/           # Pydantic request/response models
  services/          # business logic, no framework imports
tests/
```

Keep business logic out of route handlers. A handler should parse input, call a service function, and shape the response. Services stay framework-agnostic and unit-testable — you can exercise the logic without spinning up HTTP, and you can reuse it from a CLI, a worker, or a scheduled job. A handler longer than ~15 lines is usually doing work that belongs in a service.

Use `pydantic-settings` for configuration so env vars are typed and validated at startup:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    database_url: str
    jwt_secret: str
    jwt_expire_minutes: int = 30

settings = Settings()  # raises on missing required vars — fail fast
```

Failing fast at boot beats discovering a missing variable on the first request in production. Pin dependencies (`requirements.txt` with hashes, or `pyproject.toml` + lockfile) so builds are reproducible. Never commit `.env` or secrets; load them from the environment. Run `ruff` for linting/formatting and `mypy` for types in CI. Keep one responsibility per module and avoid mutable global state shared across requests — it becomes a correctness and concurrency hazard.

## App creation & routers

Prefer an application factory and one `APIRouter` per resource. Version your API under a path prefix so you can evolve it without breaking clients:

```python
from fastapi import FastAPI, APIRouter, Depends

def create_app() -> FastAPI:
    app = FastAPI(title="My API", version="1.0.0")
    app.include_router(users.router, prefix="/api/v1")
    return app
```

```python
router = APIRouter(prefix="/users", tags=["users"])

@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    ...
```

A factory (rather than a module-level global `app` decorated everywhere) lets tests build a fresh app instance and swap dependencies. Group related routes on one router with a shared `prefix` and `tags`; tags drive OpenAPI grouping.

Always set `response_model` — it filters output (never leak a password hash), documents the schema in OpenAPI, and validates what you return. Use `status_code=201` for creation, `204` for deletes with no body, `200` for normal reads/updates. Use plural nouns for collections (`/users`, `/users/{id}`), not verbs; nest sub-resources sparingly (`/users/{id}/orders`). Path params identify a resource; query params filter and paginate.

## Pydantic models: request vs response

Separate input and output models. Never accept your ORM model or expose it directly.

```python
from pydantic import BaseModel, EmailStr, Field, field_validator

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if v.isalnum():
            raise ValueError("password needs a symbol")
        return v

class UserOut(BaseModel):
    model_config = {"from_attributes": True}  # read from ORM objects
    id: int
    email: EmailStr
    full_name: str
```

Key patterns:
- `from_attributes=True` (Pydantic v2) lets `response_model` read ORM instances directly, so you can `return user` and get a filtered `UserOut`.
- Use rich types — `EmailStr`, `HttpUrl`, `conint`, `Field(gt=0)` — so validation is declarative and lives in the schema.
- The input/output split is also your security boundary: a field that exists only on `UserCreate` (password) can never accidentally appear in `UserOut`.
- For partial updates (PATCH), make every field `Optional` with a default and apply only what the client sent via `payload.model_dump(exclude_unset=True)`. `exclude_unset` distinguishes "field omitted" from "field explicitly set to null" — essential for correct PATCH semantics.
- **Constrain everything:** string lengths, numeric bounds, list sizes. Unbounded input is a DoS and data-quality risk. For nested structures, define nested models rather than accepting a free-form `dict`, so every level is validated.

## Validation & error semantics

FastAPI auto-returns `422` with a structured body for schema violations — don't fight it. Add cross-field checks with a model validator:

```python
from pydantic import model_validator

class DateRange(BaseModel):
    start: date
    end: date

    @model_validator(mode="after")
    def check_order(self):
        if self.start > self.end:
            raise ValueError("start must be <= end")
        return self
```

For business errors, raise `HTTPException` with the right status and a clear detail:

```python
from fastapi import HTTPException

user = db.get(User, user_id)
if user is None:
    raise HTTPException(status_code=404, detail="User not found")
```

Status code discipline: `400` malformed request, `401` unauthenticated, `403` authenticated but not allowed, `404` not found, `409` conflict (duplicate email), `422` validation, `429` rate limit, `500` unexpected. Return a consistent error shape. Add an exception handler for uncaught errors so clients never see a stack trace and you always log it:

```python
@app.exception_handler(Exception)
async def unhandled(request, exc):
    logger.exception("unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Internal error"})
```

Catch integrity errors at the boundary and translate them (e.g. `IntegrityError` → `409`) rather than letting them 500. Never swallow exceptions silently — handle them meaningfully or let them propagate to the logging handler. Keep `detail` messages user-facing and free of internal identifiers, SQL, or secrets.

## Dependencies & injection

Dependencies are FastAPI's core reuse mechanism: DB sessions, auth, pagination, feature flags. Use a generator dependency for resources needing teardown:

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Compose dependencies — an auth dependency yields the current user, and route-level dependencies enforce roles. `Depends` results are cached within a request, so `get_current_user` runs once even if several dependencies need it. This same mechanism is what makes the app testable: in tests you override `get_db` and `get_current_user` to inject a test session and a fake user.

Scope the DB session to the request (one session per request via the generator dependency), and manage transactions explicitly: commit once at the end of a successful unit of work, and roll back on error so a partial multi-step mutation never persists. Don't commit after each step — if a later step fails you're left with inconsistent data. Let the `finally` block close the session on every path. Keep the session out of module-level globals; a shared session across requests is not thread-safe and leaks state between callers.

## Authentication & authorization

Use OAuth2 password flow with JWT bearer tokens for typical APIs. Hash passwords with bcrypt/argon2 via `passlib` — never store plaintext, never a fast hash like SHA-256, which is trivially brute-forced.

```python
from passlib.context import CryptContext
from jose import jwt, JWTError

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_pw(p: str) -> str: return pwd.hash(p)
def verify_pw(p: str, h: str) -> bool: return pwd.verify(p, h)

def make_token(sub: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": sub, "exp": exp}, settings.jwt_secret, algorithm="HS256")
```

The current-user dependency decodes and validates the token, then loads the user:

```python
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

def get_current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    creds_exc = HTTPException(401, "Invalid credentials", {"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        raise creds_exc
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise creds_exc
    return user
```

Rules of thumb:
- **Always specify the allowed `algorithms` on decode** — omitting it enables `alg=none` token forgery, a well-known JWT attack.
- Keep tokens short-lived and pair them with refresh tokens.
- **Authentication is not authorization.** Enforce ownership/role checks inside handlers or dependencies, not just "is this user logged in." The classic bug is an endpoint that authenticates the caller but never checks the requested resource belongs to them. For roles, write a dependency factory: `require_role("admin")` returning a dependency that inspects `current_user` and raises `403`.

## Pagination, filtering & sorting

Never return an unbounded collection. Offer limit/offset for simple cases and keyset (cursor) pagination for large or fast-changing data.

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

Note the `le=100` cap — clients cannot request an unbounded page. Keyset pagination avoids the deep-offset performance cliff (offset scans and discards skipped rows): `WHERE id > :cursor ORDER BY id LIMIT :n`, returning the last id as the next cursor. Use it for large tables and infinite scroll.

Always apply a deterministic `ORDER BY` with a unique tiebreaker (e.g. `ORDER BY created_at, id`) or pages will overlap and clients see duplicates or gaps.

For filtering, expose an explicit allowlist of filter fields as typed query params — never build SQL from raw strings, and never `eval` a filter expression. Map sort keys through a whitelist dict to columns:

```python
SORTABLE = {"email": User.email, "created": User.created_at}
col = SORTABLE.get(sort_key)
if col is None:
    raise HTTPException(400, "invalid sort field")
q = q.order_by(col.desc() if descending else col.asc())
```

This prevents SQL injection and stops clients sorting by or filtering on a private column. Always use the ORM or parameterized queries, never string interpolation.

Return enough metadata for the client to navigate — the items plus `limit`/`offset` or a `next_cursor` — but include a `total` only when it's cheap. A `COUNT(*)` over a huge filtered table can cost as much as the page query itself, so for large datasets prefer cursor pagination with a `has_more` flag and omit the total. Cap the maximum page size server-side regardless of what the client requests, so no single call can pull the whole table.

## Async, performance & the event loop

FastAPI runs `async def` handlers on the event loop and plain `def` handlers in a threadpool. The cardinal sin: calling blocking I/O — a sync DB driver, `requests`, `time.sleep`, a CPU-heavy loop — inside an `async def` handler. It stalls the whole loop, so every concurrent request stalls with it. Either make the handler `def` (threadpool) or use async libraries: `httpx.AsyncClient` instead of `requests`, async SQLAlchemy, `asyncio.sleep` instead of `time.sleep`. Don't mix: a `def` handler calling async code, or an `async def` handler calling blocking code, are both wrong.

Database and I/O performance:
- Use connection pooling for the DB (size the pool to worker count).
- Prevent N+1 queries with eager loading (`selectinload`, `joinedload`) when you access relationships in a loop.
- Push filtering/aggregation into SQL rather than loading rows and processing in Python.
- Reuse a single pooled HTTP client rather than creating one per request.
- **Set timeouts on every outbound call** — a hung dependency without a timeout ties up a worker indefinitely.

Add caching for hot read paths — HTTP `ETag`/`Cache-Control` for client/proxy caching, or Redis for shared server-side caching, with a sensible TTL and clear invalidation. Profile before optimizing; most API latency is I/O (the database and downstream calls), not Python CPU.

Concurrency model in production: run multiple worker processes (e.g. `uvicorn`/`gunicorn` workers sized roughly to CPU cores for a CPU-bound app, higher for I/O-bound) behind a process manager. Each worker has its own event loop; scaling out processes is how you use multiple cores, since a single Python process is bound by the GIL for CPU work. Offload genuinely heavy or long-running work (report generation, image processing, third-party fan-out) to a background task queue (Celery, RQ, or `arq`) and return `202 Accepted` with a status URL, rather than blocking a request worker for seconds.

## Middleware, CORS, observability & rate limiting

Cross-cutting concerns belong in middleware and app-level config, not scattered through handlers.

**CORS.** If a browser front-end on another origin calls the API, configure `CORSMiddleware` with an explicit allowlist of origins — never `allow_origins=["*"]` together with `allow_credentials=True`, which is both insecure and rejected by browsers. List the exact front-end origins, methods, and headers you need.

```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
```

**Request logging & correlation.** Add middleware that assigns each request a correlation id (from an incoming `X-Request-ID` header or a fresh UUID), binds it to the logger, and logs method, path, status, and duration. Structured JSON logs make requests traceable across services. Never log request bodies that may contain secrets or PII.

**Rate limiting.** Protect auth and expensive endpoints with rate limits (a library like `slowapi`, or an API gateway). Limit by client identity or IP, return `429` with a `Retry-After` header when exceeded, and apply stricter limits to login/token endpoints to blunt credential stuffing.

**Health & readiness.** Expose a lightweight `/health` (process is up) and a `/ready` (dependencies reachable) endpoint for orchestrators and load balancers. Keep `/health` dependency-free so a slow database doesn't make the pod look dead and get killed during an incident. Emit basic metrics (request count, latency, error rate) for monitoring, and set request timeouts so a slow client can't hold a worker forever.

## Testing with pytest + TestClient

Test through the API with `TestClient` (sync) or `httpx.AsyncClient` (async). Override dependencies to inject a test DB and fake auth — this is the payoff of dependency injection.

```python
from fastapi.testclient import TestClient

@pytest.fixture
def client():
    app.dependency_overrides[get_db] = lambda: test_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def test_create_user(client):
    r = client.post("/api/v1/users", json={"email": "a@b.com",
                    "password": "s3cret!!", "full_name": "A"})
    assert r.status_code == 201
    assert "password" not in r.json()

def test_create_user_rejects_short_password(client):
    r = client.post("/api/v1/users", json={"email": "a@b.com",
                    "password": "x", "full_name": "A"})
    assert r.status_code == 422
```

Test the contract, not the implementation: status codes for success and each error path; response shape and the absence of sensitive fields (password hashes, internal ids); auth enforced (unauthenticated → `401`, wrong user/role → `403`); validation rejecting bad input (`422`); pagination bounds (the `limit` cap holds). Use a fresh transactional DB per test — create the schema then wrap each test in a rollback, or use a disposable SQLite / testcontainers Postgres. Use `pytest.fixture` for setup/teardown and `parametrize` for edge cases, and build test data with factories (`factory_boy` or plain builders) rather than copy-pasted dicts. Keep tests fast and isolated; mock only external services (payment gateways, third-party APIs), never your own code — a test that passes against a mock of your service proves nothing about the service. Cover the contract deliberately: a happy-path test per endpoint, one per error branch (404, 409, 422), an auth test (401 unauthenticated, 403 wrong role/owner), and a pagination test asserting the `limit` cap holds. Prefer many small focused tests over a few sprawling ones — when a focused test fails, its name tells you what broke.

## Common pitfalls checklist

- Leaking internal fields — always use a `response_model`, never return ORM objects raw.
- Blocking calls in `async def` handlers — stalls the event loop.
- Unbounded input or result sets — constrain body fields and always paginate.
- Missing `algorithms=[...]` on JWT decode — enables `alg=none` forgery.
- Fast/plaintext password storage — use bcrypt/argon2.
- Mutable default arguments and shared global state across requests.
- Non-deterministic pagination ordering — add a unique tiebreaker.
- Swallowing exceptions or leaking stack traces — log server-side, return clean errors.
- Building SQL/filters from raw client strings — allowlist fields, use parameters.
- Business logic in route handlers — push it into testable services.
