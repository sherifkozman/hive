---
pairs-with:
  - code-review/06-performance.md
  - code-review/04-concurrency.md
---

# Async, Performance & the Event Loop

FastAPI runs `async def` handlers on the event loop and plain `def` handlers in a threadpool. Understanding this split is essential for performance.

**The cardinal sin:** calling blocking I/O inside an `async def` handler — a sync DB driver, `requests`, `time.sleep`, or any CPU-heavy loop. It stalls the entire event loop, so every concurrent request stalls with it. Fixes:
- Make the handler plain `def` (FastAPI runs it in a threadpool), **or**
- Use async libraries: `httpx.AsyncClient` instead of `requests`, async SQLAlchemy / async drivers, `asyncio.sleep` instead of `time.sleep`.

Don't mix them: a `def` handler calling async code, or an `async def` handler calling blocking code, are both wrong.

**Database performance:**
- Use connection pooling (configure pool size to match worker count).
- Prevent N+1 queries with eager loading (`selectinload`, `joinedload`) when you access relationships in a loop.
- Push filtering/aggregation into SQL rather than loading rows and processing in Python.

**Outbound calls:**
- Reuse a single HTTP client with connection pooling; don't create a client per request.
- **Set timeouts on every outbound call** — a hung dependency without a timeout ties up a worker indefinitely.

**Caching:** add caching for hot read paths — HTTP `ETag`/`Cache-Control` headers for client/proxy caching, or Redis for shared server-side caching. Cache computed or expensive-to-fetch data with a sensible TTL and clear invalidation rules.

**General:** avoid mutable default arguments and shared global mutable state across requests (each request should get its own state). Profile before optimizing; most latency is I/O (DB and downstream calls), not Python CPU.

**Production concurrency model:** run multiple worker processes (`uvicorn`/`gunicorn`, sized roughly to cores for CPU-bound apps, higher for I/O-bound) behind a process manager. Each worker has its own event loop; scaling out processes is how you use multiple cores, since one Python process is GIL-bound for CPU work. Offload genuinely heavy or long-running work — report generation, image processing, third-party fan-out — to a background task queue (Celery, RQ, `arq`) and return `202 Accepted` with a status URL, rather than blocking a request worker for seconds.
