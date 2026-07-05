---
pairs-with:
  - code-review/02-security-review.md
---

# Middleware, CORS, Observability & Rate Limiting

Cross-cutting concerns belong in middleware and app-level config, not scattered through individual handlers.

**CORS.** If a browser front-end on another origin calls the API, configure `CORSMiddleware` with an explicit allowlist of origins. Never combine `allow_origins=["*"]` with `allow_credentials=True` — it is both insecure and rejected by browsers. List the exact front-end origins, methods, and headers you actually need.

```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Request logging & correlation.** Add middleware that assigns each request a correlation id — from an incoming `X-Request-ID` header or a freshly generated UUID — binds it to the logger, and logs method, path, status code, and duration. Structured JSON logs make a request traceable across services. Never log request bodies that may carry secrets or PII.

**Rate limiting.** Protect auth and expensive endpoints with rate limits (a library like `slowapi`, or an upstream API gateway). Limit by client identity or IP, return `429` with a `Retry-After` header when a caller exceeds the limit, and apply stricter limits to login/token endpoints to blunt credential-stuffing attacks.

**Health & readiness.** Expose a lightweight `/health` (the process is up) and a `/ready` (dependencies are reachable) endpoint for orchestrators and load balancers. Keep `/health` dependency-free so a slow database doesn't make the instance look dead and get killed. Emit basic metrics — request count, latency, error rate — for monitoring dashboards and alerts.

**Timeouts everywhere.** Set request and outbound-call timeouts so a slow client or hung downstream can't hold a worker indefinitely. Combined with rate limiting, this is your first line of defense against both accidental overload and abuse.
