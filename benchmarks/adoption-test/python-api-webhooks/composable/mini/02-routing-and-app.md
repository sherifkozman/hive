---
pairs-with:
  - 03-pydantic-models.md
  - 04-validation-and-errors.md
---

# App Creation & Routing

Prefer an application factory plus one `APIRouter` per resource, versioned under a path prefix:

```python
from fastapi import FastAPI, APIRouter, Depends

def create_app() -> FastAPI:
    app = FastAPI(title="My API", version="1.0.0")
    app.include_router(users.router, prefix="/api/v1")
    return app

router = APIRouter(prefix="/users", tags=["users"])

@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    ...
```

**Always set `response_model`.** It filters output so you never leak internal fields (like a password hash), documents the schema in OpenAPI, and validates what you return.

**Status code discipline:**
- `201` for creation, `204` for deletes with no body, `200` for normal reads/updates.
- `400` malformed request, `401` unauthenticated, `403` authenticated-but-forbidden, `404` not found, `409` conflict (e.g. duplicate email), `422` validation, `429` rate limit, `500` unexpected.

**Resource naming:** use plural nouns for collections (`/users`, `/users/{id}`), not verbs. Nest sub-resources sparingly (`/users/{id}/orders`). Use path params for identity, query params for filtering/pagination.

Group related routes on one router with a shared `prefix` and `tags` (tags drive OpenAPI grouping). Mount routers in the factory rather than decorating a global `app`, so tests can build a fresh app instance and swap dependencies.

Keep handlers thin: parse the validated `payload`, call a service, return an object the `response_model` can serialize. Push branching, DB work, and business rules into services. A handler that is more than ~15 lines is usually doing too much — the logic belongs in a framework-agnostic service you can unit-test and reuse from a CLI or worker.

Prefer building the app in a factory over decorating a module-level global `app`. The factory lets tests construct a fresh instance and override dependencies per test, and keeps import-time side effects out of your modules.
