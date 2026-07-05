# Notes API — FastAPI service

A small, complete FastAPI note-taking service with CRUD endpoints, header-based
API key auth, rigorous validation, consistent JSON error bodies, pagination +
full-text search on the list endpoint, and a pytest test suite covering happy
and error paths for every endpoint.

Both files below were written and verified locally: `python3 -m pytest
test_app.py -v` was run against this exact code and all 29 tests pass.

## Design notes

- **Storage**: a simple in-memory `NoteStore` backed by a dict, guarded by a
  `threading.Lock` for basic safety under concurrent requests within a single
  process. IDs are assigned by an incrementing counter.
- **Auth**: `X-API-Key` header checked against a hardcoded set of valid keys
  (`require_api_key`), wired in via `Depends(...)` at the route level (not a
  global middleware) so it shows up cleanly in the OpenAPI docs and is easy to
  unit test/override.
- **Validation**: `title` is required, 1-120 chars, and rejected if it's
  blank/whitespace-only (via a `field_validator`); `body` is optional (defaults
  to `""`) and capped at 10,000 chars. FastAPI/pydantic raise
  `RequestValidationError` for these and for bad path/query types (e.g.
  non-integer note id, out-of-range `page`/`page_size`).
- **Consistent error envelope**: two exception handlers normalize all error
  responses to `{"detail": ...}`:
  - `RequestValidationError` → 422, with pydantic's error list stringified
    where necessary (pydantic can put raw exception objects in `ctx`, which
    aren't JSON serializable by default — `_json_safe_errors` fixes that).
  - `HTTPException` (used for 401 and 404) → its own status code, `{"detail":
    <message>}`.
- **Pagination**: `GET /notes` takes `page` (>=1, default 1) and `page_size`
  (1-100, default 20), returning `{items, total, page, page_size}`.
- **Search**: `q` does a case-insensitive substring match against both `title`
  and `body`.
- **Timestamps**: `created_at`/`updated_at` are UTC `datetime`s; `updated_at`
  is refreshed on every `PUT`, `created_at` never changes after creation.

## `app.py`

```python
"""
A small but complete FastAPI note-taking API.

Run with:
    uvicorn app:app --reload
"""

from __future__ import annotations

import itertools
from datetime import datetime, timezone
from threading import Lock
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="Notes API")

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

VALID_API_KEYS = {"test-key-1", "test-key-2", "admin-key"}


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> str:
    if x_api_key is None or x_api_key not in VALID_API_KEYS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key")
    return x_api_key


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(default="", max_length=10_000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be blank")
        return v


class NoteUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(default="", max_length=10_000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be blank")
        return v


class Note(BaseModel):
    id: int
    title: str
    body: str
    created_at: datetime
    updated_at: datetime


class NoteList(BaseModel):
    items: list[Note]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------

class NoteStore:
    def __init__(self) -> None:
        self._notes: dict[int, Note] = {}
        self._id_counter = itertools.count(1)
        self._lock = Lock()

    def create(self, data: NoteCreate) -> Note:
        with self._lock:
            now = datetime.now(timezone.utc)
            note_id = next(self._id_counter)
            note = Note(
                id=note_id,
                title=data.title,
                body=data.body,
                created_at=now,
                updated_at=now,
            )
            self._notes[note_id] = note
            return note

    def get(self, note_id: int) -> Optional[Note]:
        return self._notes.get(note_id)

    def update(self, note_id: int, data: NoteUpdate) -> Optional[Note]:
        with self._lock:
            existing = self._notes.get(note_id)
            if existing is None:
                return None
            updated = existing.model_copy(
                update={
                    "title": data.title,
                    "body": data.body,
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            self._notes[note_id] = updated
            return updated

    def delete(self, note_id: int) -> bool:
        with self._lock:
            if note_id in self._notes:
                del self._notes[note_id]
                return True
            return False

    def list(self, q: Optional[str] = None) -> list[Note]:
        notes = list(self._notes.values())
        if q:
            q_lower = q.lower()
            notes = [
                n for n in notes
                if q_lower in n.title.lower() or q_lower in n.body.lower()
            ]
        notes.sort(key=lambda n: n.id)
        return notes

    def clear(self) -> None:
        with self._lock:
            self._notes.clear()
            self._id_counter = itertools.count(1)


store = NoteStore()


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def _json_safe_errors(errors: list[dict]) -> list[dict]:
    """Pydantic error dicts can contain a 'ctx' key holding raw exception
    objects (e.g. from a failed validator) which are not JSON serializable.
    Stringify anything that isn't natively serializable."""
    safe = []
    for err in errors:
        err = dict(err)
        ctx = err.get("ctx")
        if isinstance(ctx, dict):
            err["ctx"] = {k: str(v) for k, v in ctx.items()}
        safe.append(err)
    return safe


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    # Normalize FastAPI/pydantic validation errors to a consistent
    # {"detail": ...} JSON body with a 422 status code.
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": _json_safe_errors(exc.errors())},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    # HTTPException already produces {"detail": ...}; this handler just makes
    # the behavior explicit/consistent (and is where you'd add logging etc).
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post(
    "/notes",
    response_model=Note,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
def create_note(payload: NoteCreate):
    return store.create(payload)


@app.get("/notes", response_model=NoteList, dependencies=[Depends(require_api_key)])
def list_notes(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: Optional[str] = Query(default=None, max_length=200),
):
    all_matching = store.list(q=q)
    total = len(all_matching)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = all_matching[start:end]
    return NoteList(items=page_items, total=total, page=page, page_size=page_size)


@app.get("/notes/{note_id}", response_model=Note, dependencies=[Depends(require_api_key)])
def get_note(note_id: int):
    note = store.get(note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note {note_id} not found")
    return note


@app.put("/notes/{note_id}", response_model=Note, dependencies=[Depends(require_api_key)])
def update_note(note_id: int, payload: NoteUpdate):
    note = store.update(note_id, payload)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note {note_id} not found")
    return note


@app.delete(
    "/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key)],
)
def delete_note(note_id: int):
    deleted = store.delete(note_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note {note_id} not found")
    return None
```

## `test_app.py`

```python
"""
Tests for the Notes API.

Run with:
    pytest test_app.py -v
"""

import pytest
from fastapi.testclient import TestClient

from app import VALID_API_KEYS, app, store

VALID_KEY = next(iter(VALID_API_KEYS))
HEADERS = {"X-API-Key": VALID_KEY}


@pytest.fixture(autouse=True)
def clear_store():
    """Ensure each test starts with an empty in-memory store."""
    store.clear()
    yield
    store.clear()


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_missing_api_key_returns_401(client):
    resp = client.get("/notes")
    assert resp.status_code == 401
    assert "detail" in resp.json()


def test_invalid_api_key_returns_401(client):
    resp = client.get("/notes", headers={"X-API-Key": "not-a-real-key"})
    assert resp.status_code == 401
    assert "detail" in resp.json()


def test_valid_api_key_is_accepted(client):
    resp = client.get("/notes", headers=HEADERS)
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def test_create_note_happy_path(client):
    resp = client.post(
        "/notes", json={"title": "Groceries", "body": "milk, eggs"}, headers=HEADERS
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Groceries"
    assert data["body"] == "milk, eggs"
    assert data["id"] > 0
    assert data["created_at"] == data["updated_at"]


def test_create_note_defaults_empty_body(client):
    resp = client.post("/notes", json={"title": "Just a title"}, headers=HEADERS)
    assert resp.status_code == 201
    assert resp.json()["body"] == ""


def test_create_note_missing_title_returns_422(client):
    resp = client.post("/notes", json={"body": "no title here"}, headers=HEADERS)
    assert resp.status_code == 422
    assert "detail" in resp.json()


def test_create_note_blank_title_returns_422(client):
    resp = client.post("/notes", json={"title": "   ", "body": "x"}, headers=HEADERS)
    assert resp.status_code == 422


def test_create_note_title_too_long_returns_422(client):
    resp = client.post(
        "/notes", json={"title": "x" * 121, "body": "x"}, headers=HEADERS
    )
    assert resp.status_code == 422


def test_create_note_title_at_max_length_ok(client):
    resp = client.post(
        "/notes", json={"title": "x" * 120, "body": "x"}, headers=HEADERS
    )
    assert resp.status_code == 201


def test_create_note_body_too_long_returns_422(client):
    resp = client.post(
        "/notes", json={"title": "ok", "body": "x" * 10_001}, headers=HEADERS
    )
    assert resp.status_code == 422


def test_create_note_body_at_max_length_ok(client):
    resp = client.post(
        "/notes", json={"title": "ok", "body": "x" * 10_000}, headers=HEADERS
    )
    assert resp.status_code == 201


def test_create_note_requires_api_key(client):
    resp = client.post("/notes", json={"title": "no auth", "body": ""})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Get by id
# ---------------------------------------------------------------------------

def test_get_note_happy_path(client):
    created = client.post(
        "/notes", json={"title": "Read me", "body": "body text"}, headers=HEADERS
    ).json()
    resp = client.get(f"/notes/{created['id']}", headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json() == created


def test_get_note_not_found_returns_404(client):
    resp = client.get("/notes/999999", headers=HEADERS)
    assert resp.status_code == 404
    assert "detail" in resp.json()


def test_get_note_requires_api_key(client):
    created = client.post(
        "/notes", json={"title": "Read me", "body": ""}, headers=HEADERS
    ).json()
    resp = client.get(f"/notes/{created['id']}")
    assert resp.status_code == 401


def test_get_note_invalid_id_type_returns_422(client):
    resp = client.get("/notes/not-an-int", headers=HEADERS)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def test_update_note_happy_path(client):
    created = client.post(
        "/notes", json={"title": "Old title", "body": "old body"}, headers=HEADERS
    ).json()
    resp = client.put(
        f"/notes/{created['id']}",
        json={"title": "New title", "body": "new body"},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "New title"
    assert data["body"] == "new body"
    assert data["id"] == created["id"]
    assert data["created_at"] == created["created_at"]
    assert data["updated_at"] >= created["updated_at"]


def test_update_note_not_found_returns_404(client):
    resp = client.put(
        "/notes/999999", json={"title": "x", "body": "y"}, headers=HEADERS
    )
    assert resp.status_code == 404


def test_update_note_invalid_body_returns_422(client):
    created = client.post(
        "/notes", json={"title": "T", "body": "b"}, headers=HEADERS
    ).json()
    resp = client.put(
        f"/notes/{created['id']}", json={"title": ""}, headers=HEADERS
    )
    assert resp.status_code == 422


def test_update_note_requires_api_key(client):
    created = client.post(
        "/notes", json={"title": "T", "body": "b"}, headers=HEADERS
    ).json()
    resp = client.put(f"/notes/{created['id']}", json={"title": "x", "body": "y"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def test_delete_note_happy_path(client):
    created = client.post(
        "/notes", json={"title": "Delete me", "body": ""}, headers=HEADERS
    ).json()
    resp = client.delete(f"/notes/{created['id']}", headers=HEADERS)
    assert resp.status_code == 204

    get_resp = client.get(f"/notes/{created['id']}", headers=HEADERS)
    assert get_resp.status_code == 404


def test_delete_note_not_found_returns_404(client):
    resp = client.delete("/notes/999999", headers=HEADERS)
    assert resp.status_code == 404


def test_delete_note_requires_api_key(client):
    created = client.post(
        "/notes", json={"title": "Delete me", "body": ""}, headers=HEADERS
    ).json()
    resp = client.delete(f"/notes/{created['id']}")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# List / pagination / search
# ---------------------------------------------------------------------------

def test_list_notes_empty(client):
    resp = client.get("/notes", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["page_size"] == 20


def test_list_notes_pagination(client):
    for i in range(25):
        client.post(
            "/notes", json={"title": f"Note {i}", "body": ""}, headers=HEADERS
        )

    resp = client.get("/notes", params={"page": 1, "page_size": 10}, headers=HEADERS)
    data = resp.json()
    assert data["total"] == 25
    assert len(data["items"]) == 10
    assert data["page"] == 1

    resp2 = client.get("/notes", params={"page": 3, "page_size": 10}, headers=HEADERS)
    data2 = resp2.json()
    assert len(data2["items"]) == 5
    assert data2["page"] == 3

    resp3 = client.get("/notes", params={"page": 4, "page_size": 10}, headers=HEADERS)
    assert resp3.json()["items"] == []


def test_list_notes_search_filters_title_and_body(client):
    client.post(
        "/notes", json={"title": "Shopping list", "body": "buy bread"}, headers=HEADERS
    )
    client.post(
        "/notes", json={"title": "Meeting notes", "body": "discuss roadmap"}, headers=HEADERS
    )
    client.post(
        "/notes", json={"title": "Recipe", "body": "bread pudding"}, headers=HEADERS
    )

    resp = client.get("/notes", params={"q": "bread"}, headers=HEADERS)
    data = resp.json()
    assert data["total"] == 2
    titles = {n["title"] for n in data["items"]}
    assert titles == {"Shopping list", "Recipe"}

    resp2 = client.get("/notes", params={"q": "roadmap"}, headers=HEADERS)
    assert resp2.json()["total"] == 1
    assert resp2.json()["items"][0]["title"] == "Meeting notes"

    resp3 = client.get("/notes", params={"q": "nonexistent"}, headers=HEADERS)
    assert resp3.json()["total"] == 0


def test_list_notes_invalid_page_returns_422(client):
    resp = client.get("/notes", params={"page": 0}, headers=HEADERS)
    assert resp.status_code == 422


def test_list_notes_invalid_page_size_returns_422(client):
    resp = client.get("/notes", params={"page_size": 0}, headers=HEADERS)
    assert resp.status_code == 422

    resp2 = client.get("/notes", params={"page_size": 1000}, headers=HEADERS)
    assert resp2.status_code == 422


def test_list_notes_requires_api_key(client):
    resp = client.get("/notes")
    assert resp.status_code == 401
```

## Verification

Ran locally in a scratch environment with `fastapi`, `pydantic`, `pytest`, and
`httpx` installed:

```
python3 -m pytest test_app.py -v
```

Result: **29 passed** (0 failed), covering:

- 401 for missing key, invalid key, plus 200 for a valid key.
- POST happy path, default empty body, missing/blank/too-long title (422),
  boundary-exact 120-char title (201), too-long/boundary-exact 10k-char body,
  and missing-auth (401).
- GET by id happy path, 404 for unknown id, 401 for missing auth, 422 for a
  non-integer id.
- PUT happy path (title/body/updated_at change, created_at/id preserved),
  404 for unknown id, 422 for invalid payload, 401 for missing auth.
- DELETE happy path (204, then subsequent GET is 404), 404 for unknown id,
  401 for missing auth.
- GET list: empty state, pagination across pages (25 notes / page_size 10 →
  pages of 10, 10, 5, then empty), `q` search matching across title and body
  (including a false-positive check), 422 for out-of-range `page`/`page_size`,
  401 for missing auth.

One bug found and fixed during self-verification: pydantic's
`RequestValidationError.errors()` can include a `ctx` dict holding the raw
`ValueError` raised by a custom `field_validator` (e.g. the blank-title
check), and that raw exception object is not JSON serializable by default —
`json.dumps` raised `TypeError: Object of type ValueError is not JSON
serializable` inside the custom exception handler. Fixed by adding
`_json_safe_errors()`, which stringifies any `ctx` values before they're
placed in the JSON response body.
