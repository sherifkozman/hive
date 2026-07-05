---
pairs-with:
  - 03-pydantic-models.md
  - code-review/05-error-handling.md
---

# Validation & Error Semantics

FastAPI auto-returns `422` with a structured body for schema violations, so don't fight it. Add cross-field checks with validators.

**Field validator** (single field):
```python
from pydantic import field_validator

@field_validator("password")
@classmethod
def strength(cls, v: str) -> str:
    if v.isalnum():
        raise ValueError("password needs a symbol")
    return v
```

**Model validator** (cross-field):
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

**Business errors** use `HTTPException` with the right status and a clear detail:

```python
user = db.get(User, user_id)
if user is None:
    raise HTTPException(status_code=404, detail="User not found")
```

**Status discipline:** `400` malformed, `401` unauthenticated, `403` forbidden, `404` missing, `409` conflict, `422` validation, `429` rate-limited, `500` unexpected.

**Consistent error shape + safe fallback.** Add a handler so uncaught errors are logged server-side and clients never see a stack trace:

```python
@app.exception_handler(Exception)
async def unhandled(request, exc):
    logger.exception("unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Internal error"})
```

Catch integrity errors at the boundary and translate them (`IntegrityError` → `409`) rather than letting them 500. Never swallow exceptions silently: either handle them meaningfully or let them propagate to the logging handler. Keep `detail` messages user-facing and free of internal identifiers, SQL, or secrets.

Prefer letting FastAPI/Pydantic reject malformed input with its automatic `422` over hand-writing validation in the handler, since declarative constraints on the schema are less error-prone and self-document in OpenAPI. Reserve `HTTPException` for business-rule failures the schema can't express (resource not found, permission denied, duplicate). Return the same error envelope everywhere so clients can parse failures uniformly.
