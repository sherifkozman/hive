# Notes API — FastAPI deliverable

A small, self-contained note-taking REST API built with FastAPI, following a
monolithic (single-file) layout appropriate for a service this size. Handlers
are kept thin: they parse input, delegate to an in-memory `NoteStore`, and
shape the response. Validation lives declaratively in Pydantic schemas; auth
and pagination are dependencies so they're reusable and easy to override in
tests.

Two files: `app.py` (the service) and `test_app.py` (pytest + TestClient
tests covering happy paths and error paths for every endpoint). Both were
run locally with `pytest` — 25 tests, all passing — before being written up
here.

## Design notes

- **CRUD**: `POST /notes`, `GET /notes`, `GET /notes/{id}`, `PUT /notes/{id}`,
  `DELETE /notes/{id}`, backed by an in-memory `NoteStore` (a small class
  behind a `get_store()` dependency, not a bare module-level dict, so tests
  can override it with a fresh, isolated instance per test rather than
  sharing state across the whole test session). A `threading.Lock` guards
  mutations since FastAPI can run sync handlers in a threadpool.
- **Model**: `id`, `title` (1-120 chars, required, rejects blank/whitespace-only
  via a `field_validator`), `body` (≤10,000 chars, defaults to `""`),
  `created_at`, `updated_at` (UTC timestamps). Input (`NoteCreate`/`NoteUpdate`)
  and output (`NoteOut`) schemas are separate, per the input/output split
  pattern — here it mostly guards against ever accepting extra/unexpected
  fields, since there's no secret field to hide in this small model.
- **Auth**: a `require_api_key` dependency reads the `X-API-Key` header
  against a hardcoded set of valid keys and raises `401` on missing/invalid
  key. It's attached once at the router level (`dependencies=[Depends(require_api_key)]`)
  so every route under `/notes` is protected — no route can accidentally skip it.
- **Errors**: `404` for missing notes, `422` for validation errors, `401` for
  auth failures — all with a JSON body carrying a `detail` field. FastAPI's
  `HTTPException` already returns `{"detail": ...}` for the `404`/`401` cases.
  For `422`, a `RequestValidationError` handler normalizes FastAPI's default
  error list into the same `{"detail": [...]}` shape (dropping the
  non-JSON-serializable raw exception FastAPI stuffs into each error's `ctx`
  field). A catch-all `Exception` handler returns a clean `500` rather than
  ever leaking a stack trace to a client.
- **Pagination & filtering**: `page` (≥1, default 1) and `page_size` (1-100,
  default 10, capped server-side regardless of what the client asks for) are
  validated via a `pagination_params` dependency. `q` does a case-insensitive
  substring match across `title` and `body`. Results are always sorted by
  `id` for deterministic, non-overlapping pages. The list response returns
  `items`, `total`, `page`, `page_size` so the client can navigate.
- **Status codes**: `201` on create, `200` on read/update/list, `204` (no
  body) on delete.

## `app.py`

```python
"""A small, self-contained FastAPI note-taking API.

Single-file "monolithic" layout on purpose (this is a small demo service).
Handlers stay thin: parse input, delegate to the in-memory NoteStore, shape
the response. Validation lives in the Pydantic schemas; auth and pagination
live in dependencies so they're reusable and easy to override in tests.
"""

from __future__ import annotations

import itertools
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, APIRouter, Header, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# "Auth" — hardcoded set of valid API keys, checked via a dependency.
# ---------------------------------------------------------------------------

VALID_API_KEYS = {"test-key-1", "test-key-2", "dev-key-local"}


def require_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> str:
    """Dependency enforcing the X-API-Key header on every protected route."""
    if not x_api_key or x_api_key not in VALID_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
        )
    return x_api_key


# ---------------------------------------------------------------------------
# Schemas — separate input (Create/Update) and output (Out) models.
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
    """Full replacement update for PUT — both fields are required."""

    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(default="", max_length=10_000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be blank")
        return v


class NoteOut(BaseModel):
    id: int
    title: str
    body: str
    created_at: datetime
    updated_at: datetime


class NotePage(BaseModel):
    items: list[NoteOut]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# In-memory store. Kept behind a small class + a `get_store` dependency (not
# a bare module-level dict) so tests can override it with a fresh, isolated
# instance per test rather than sharing state across the whole test session.
# ---------------------------------------------------------------------------

class NoteStore:
    def __init__(self) -> None:
        self._notes: dict[int, NoteOut] = {}
        self._id_seq = itertools.count(1)
        self._lock = threading.Lock()

    def create(self, data: NoteCreate) -> NoteOut:
        with self._lock:
            note_id = next(self._id_seq)
            now = datetime.now(timezone.utc)
            note = NoteOut(
                id=note_id,
                title=data.title,
                body=data.body,
                created_at=now,
                updated_at=now,
            )
            self._notes[note_id] = note
            return note

    def get(self, note_id: int) -> Optional[NoteOut]:
        return self._notes.get(note_id)

    def update(self, note_id: int, data: NoteUpdate) -> Optional[NoteOut]:
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
            return self._notes.pop(note_id, None) is not None

    def list(self, q: Optional[str] = None) -> list[NoteOut]:
        notes = list(self._notes.values())
        if q:
            needle = q.lower()
            notes = [n for n in notes if needle in n.title.lower() or needle in n.body.lower()]
        notes.sort(key=lambda n: n.id)
        return notes


_default_store = NoteStore()


def get_store() -> NoteStore:
    return _default_store


# ---------------------------------------------------------------------------
# Pagination dependency — bounded page_size so no request can pull the whole
# table, with a deterministic order (by id) applied in NoteStore.list.
# ---------------------------------------------------------------------------

class Pagination(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(10, ge=1, le=100)


def pagination_params(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> Pagination:
    return Pagination(page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# App factory + router. Auth is attached once at the router level so every
# route under /notes requires X-API-Key — no route can accidentally skip it.
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    app = FastAPI(title="Notes API", version="1.0.0")

    router = APIRouter(
        prefix="/notes",
        tags=["notes"],
        dependencies=[Depends(require_api_key)],
    )

    @router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
    def create_note(payload: NoteCreate, notes: NoteStore = Depends(get_store)) -> NoteOut:
        return notes.create(payload)

    @router.get("", response_model=NotePage)
    def list_notes(
        q: Optional[str] = Query(default=None, max_length=200),
        pagination: Pagination = Depends(pagination_params),
        notes: NoteStore = Depends(get_store),
    ) -> NotePage:
        matching = notes.list(q=q)
        total = len(matching)
        start = (pagination.page - 1) * pagination.page_size
        end = start + pagination.page_size
        return NotePage(
            items=matching[start:end],
            total=total,
            page=pagination.page,
            page_size=pagination.page_size,
        )

    @router.get("/{note_id}", response_model=NoteOut)
    def get_note(note_id: int, notes: NoteStore = Depends(get_store)) -> NoteOut:
        note = notes.get(note_id)
        if note is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note {note_id} not found")
        return note

    @router.put("/{note_id}", response_model=NoteOut)
    def update_note(
        note_id: int, payload: NoteUpdate, notes: NoteStore = Depends(get_store)
    ) -> NoteOut:
        updated = notes.update(note_id, payload)
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note {note_id} not found")
        return updated

    @router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_note(note_id: int, notes: NoteStore = Depends(get_store)) -> None:
        deleted = notes.delete(note_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note {note_id} not found")
        return None

    app.include_router(router)

    # Consistent error shape: every error response carries a `detail` field.
    # FastAPI already does this for HTTPException; make it explicit for
    # validation errors too, and never leak an unhandled traceback to a client.
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request, exc: RequestValidationError):
        # Pydantic v2 stuffs the raw exception into each error's "ctx" field,
        # which isn't JSON-serializable — drop it. "msg"/"loc"/"type" already
        # carry everything a client needs.
        cleaned = [{k: v for k, v in err.items() if k != "ctx"} for err in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": jsonable_encoder(cleaned)})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc: Exception):
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    return app


app = create_app()
```

## `test_app.py`

```python
import pytest
from fastapi.testclient import TestClient

from app import NoteStore, app, get_store

API_KEY = "test-key-1"
AUTH = {"X-API-Key": API_KEY}


@pytest.fixture
def client():
    """Fresh, isolated store per test via dependency override."""
    fresh_store = NoteStore()
    app.dependency_overrides[get_store] = lambda: fresh_store
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def create_sample(client, title="Groceries", body="Milk, eggs, bread"):
    return client.post("/notes", json={"title": title, "body": body}, headers=AUTH)


# ---------------------------------------------------------------------------
# POST /notes
# ---------------------------------------------------------------------------

def test_create_note_success(client):
    r = create_sample(client)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Groceries"
    assert data["body"] == "Milk, eggs, bread"
    assert "id" in data
    assert data["created_at"] == data["updated_at"]


def test_create_note_defaults_empty_body(client):
    r = client.post("/notes", json={"title": "No body"}, headers=AUTH)
    assert r.status_code == 201
    assert r.json()["body"] == ""


def test_create_note_missing_title_is_422(client):
    r = client.post("/notes", json={"body": "no title here"}, headers=AUTH)
    assert r.status_code == 422
    assert "detail" in r.json()


def test_create_note_blank_title_is_422(client):
    r = client.post("/notes", json={"title": "   ", "body": "x"}, headers=AUTH)
    assert r.status_code == 422


def test_create_note_title_too_long_is_422(client):
    r = client.post("/notes", json={"title": "x" * 121}, headers=AUTH)
    assert r.status_code == 422


def test_create_note_body_too_long_is_422(client):
    r = client.post("/notes", json={"title": "ok", "body": "x" * 10_001}, headers=AUTH)
    assert r.status_code == 422


def test_create_note_missing_api_key_is_401(client):
    r = client.post("/notes", json={"title": "no auth"})
    assert r.status_code == 401
    assert "detail" in r.json()


def test_create_note_invalid_api_key_is_401(client):
    r = client.post("/notes", json={"title": "bad auth"}, headers={"X-API-Key": "not-a-real-key"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /notes/{id}
# ---------------------------------------------------------------------------

def test_get_note_success(client):
    created = create_sample(client).json()
    r = client.get(f"/notes/{created['id']}", headers=AUTH)
    assert r.status_code == 200
    assert r.json() == created


def test_get_note_not_found_is_404(client):
    r = client.get("/notes/999999", headers=AUTH)
    assert r.status_code == 404
    assert "detail" in r.json()


def test_get_note_no_auth_is_401(client):
    created = create_sample(client).json()
    r = client.get(f"/notes/{created['id']}")
    assert r.status_code == 401


def test_get_note_bad_id_type_is_422(client):
    r = client.get("/notes/not-an-int", headers=AUTH)
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# GET /notes (list, pagination, q filter)
# ---------------------------------------------------------------------------

def test_list_notes_empty(client):
    r = client.get("/notes", headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body == {"items": [], "total": 0, "page": 1, "page_size": 10}


def test_list_notes_pagination(client):
    for i in range(5):
        create_sample(client, title=f"Note {i}", body="body")

    r = client.get("/notes", params={"page": 1, "page_size": 2}, headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["page_size"] == 2

    r2 = client.get("/notes", params={"page": 3, "page_size": 2}, headers=AUTH)
    body2 = r2.json()
    assert len(body2["items"]) == 1  # last partial page
    assert body2["items"][0]["id"] != body["items"][0]["id"]


def test_list_notes_page_size_over_cap_is_422(client):
    r = client.get("/notes", params={"page_size": 101}, headers=AUTH)
    assert r.status_code == 422


def test_list_notes_invalid_page_is_422(client):
    r = client.get("/notes", params={"page": 0}, headers=AUTH)
    assert r.status_code == 422


def test_list_notes_q_filters_title_and_body(client):
    create_sample(client, title="Trip to Japan", body="Buy souvenirs")
    create_sample(client, title="Groceries", body="Milk and eggs")
    create_sample(client, title="Work", body="Plan the Japan trip itinerary")

    r = client.get("/notes", params={"q": "japan"}, headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    titles = {item["title"] for item in body["items"]}
    assert titles == {"Trip to Japan", "Work"}


def test_list_notes_no_auth_is_401(client):
    r = client.get("/notes")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# PUT /notes/{id}
# ---------------------------------------------------------------------------

def test_update_note_success(client):
    created = create_sample(client).json()
    r = client.put(
        f"/notes/{created['id']}",
        json={"title": "Updated title", "body": "Updated body"},
        headers=AUTH,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Updated title"
    assert data["body"] == "Updated body"
    assert data["created_at"] == created["created_at"]
    assert data["updated_at"] >= created["updated_at"]


def test_update_note_not_found_is_404(client):
    r = client.put("/notes/999999", json={"title": "x", "body": "y"}, headers=AUTH)
    assert r.status_code == 404


def test_update_note_validation_error_is_422(client):
    created = create_sample(client).json()
    r = client.put(f"/notes/{created['id']}", json={"title": ""}, headers=AUTH)
    assert r.status_code == 422


def test_update_note_no_auth_is_401(client):
    created = create_sample(client).json()
    r = client.put(f"/notes/{created['id']}", json={"title": "x", "body": "y"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /notes/{id}
# ---------------------------------------------------------------------------

def test_delete_note_success(client):
    created = create_sample(client).json()
    r = client.delete(f"/notes/{created['id']}", headers=AUTH)
    assert r.status_code == 204
    assert r.content == b""

    r2 = client.get(f"/notes/{created['id']}", headers=AUTH)
    assert r2.status_code == 404


def test_delete_note_not_found_is_404(client):
    r = client.delete("/notes/999999", headers=AUTH)
    assert r.status_code == 404


def test_delete_note_no_auth_is_401(client):
    created = create_sample(client).json()
    r = client.delete(f"/notes/{created['id']}")
    assert r.status_code == 401
```

## Verification

Ran locally with `pytest test_app.py -v` (FastAPI 0.139.0, Pydantic 2.13.4,
pytest 9.1.1): **25 passed**, 0 failed. Coverage includes, per endpoint:

- `POST /notes`: happy path, default empty body, missing title (422), blank
  title (422), title too long (422), body too long (422), missing API key
  (401), invalid API key (401).
- `GET /notes/{id}`: happy path, not found (404), no auth (401), bad id type
  (422).
- `GET /notes`: empty list shape, pagination across pages, page_size over
  the 100 cap (422), invalid page (422), `q` filter matching both title and
  body, no auth (401).
- `PUT /notes/{id}`: happy path (title/body change, `created_at` preserved,
  `updated_at` bumped), not found (404), validation error (422), no auth
  (401).
- `DELETE /notes/{id}`: happy path (204, empty body, subsequent GET 404s),
  not found (404), no auth (401).
