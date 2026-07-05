# Notes API — FastAPI note-taking service

A small but complete FastAPI service implementing CRUD for notes, API-key
auth, rigorous validation, consistent JSON error bodies, pagination, and
full-text filtering, plus a pytest test suite covering happy and error
paths for every endpoint.

Verified locally: `python3 -m pytest test_app.py -q` → 24 passed.

## `app.py`

```python
"""A small, complete FastAPI note-taking service.

Endpoints (all require an `X-API-Key` header):
    POST   /notes          create a note
    GET    /notes          list notes (paginated, optional full-text `q` filter)
    GET    /notes/{id}     fetch a single note
    PUT    /notes/{id}     update a note (partial update semantics)
    DELETE /notes/{id}     delete a note
"""

from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# "Config" -- a hardcoded set of valid API keys is fine for this exercise.
# ---------------------------------------------------------------------------

VALID_API_KEYS: set[str] = {"secret-key-1", "secret-key-2", "test-key"}


# ---------------------------------------------------------------------------
# Pydantic models (request / response schemas kept separate from storage)
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
    """PUT payload. Fields are optional so a client may update just one of
    them; any field omitted keeps its current value."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    body: Optional[str] = Field(default=None, max_length=10_000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("title must not be blank")
        return v


class NoteOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
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
# In-memory storage
# ---------------------------------------------------------------------------


class NoteStore:
    """Thread-safe in-memory note storage."""

    def __init__(self) -> None:
        self._notes: dict[str, dict] = {}
        self._lock = Lock()

    def create(self, data: NoteCreate) -> dict:
        now = datetime.now(timezone.utc)
        note_id = uuid4().hex
        note = {
            "id": note_id,
            "title": data.title,
            "body": data.body,
            "created_at": now,
            "updated_at": now,
        }
        with self._lock:
            self._notes[note_id] = note
        return note

    def get(self, note_id: str) -> Optional[dict]:
        return self._notes.get(note_id)

    def update(self, note_id: str, data: NoteUpdate) -> Optional[dict]:
        with self._lock:
            note = self._notes.get(note_id)
            if note is None:
                return None
            changes = data.model_dump(exclude_unset=True)
            for key, value in changes.items():
                note[key] = value
            note["updated_at"] = datetime.now(timezone.utc)
            return dict(note)

    def delete(self, note_id: str) -> bool:
        with self._lock:
            return self._notes.pop(note_id, None) is not None

    def list(self, q: Optional[str] = None) -> list[dict]:
        notes = list(self._notes.values())
        if q:
            needle = q.lower()
            notes = [
                n
                for n in notes
                if needle in n["title"].lower() or needle in n["body"].lower()
            ]
        notes.sort(key=lambda n: n["created_at"])
        return notes

    def clear(self) -> None:
        with self._lock:
            self._notes.clear()


store = NoteStore()


def get_store() -> NoteStore:
    return store


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------


def require_api_key(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")
) -> str:
    if not x_api_key or x_api_key not in VALID_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
        )
    return x_api_key


# ---------------------------------------------------------------------------
# Pagination params
# ---------------------------------------------------------------------------


class PageParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


def page_params(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    app = FastAPI(title="Notes API", version="1.0.0")

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc: Exception) -> JSONResponse:
        # Never let clients see a stack trace; always return the same
        # error envelope ({"detail": ...}) used everywhere else.
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )

    router = APIRouter(
        prefix="/notes",
        tags=["notes"],
        dependencies=[Depends(require_api_key)],
    )

    @router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
    def create_note(
        payload: NoteCreate, note_store: NoteStore = Depends(get_store)
    ) -> dict:
        return note_store.create(payload)

    @router.get("", response_model=NotePage)
    def list_notes(
        q: Optional[str] = Query(default=None, max_length=200),
        params: PageParams = Depends(page_params),
        note_store: NoteStore = Depends(get_store),
    ) -> dict:
        notes = note_store.list(q=q)
        total = len(notes)
        start = (params.page - 1) * params.page_size
        end = start + params.page_size
        items = notes[start:end]
        return {
            "items": items,
            "total": total,
            "page": params.page,
            "page_size": params.page_size,
        }

    @router.get("/{note_id}", response_model=NoteOut)
    def get_note(note_id: str, note_store: NoteStore = Depends(get_store)) -> dict:
        note = note_store.get(note_id)
        if note is None:
            raise HTTPException(status_code=404, detail="Note not found")
        return note

    @router.put("/{note_id}", response_model=NoteOut)
    def update_note(
        note_id: str, payload: NoteUpdate, note_store: NoteStore = Depends(get_store)
    ) -> dict:
        note = note_store.update(note_id, payload)
        if note is None:
            raise HTTPException(status_code=404, detail="Note not found")
        return note

    @router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_note(note_id: str, note_store: NoteStore = Depends(get_store)) -> None:
        deleted = note_store.delete(note_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Note not found")
        return None

    app.include_router(router)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## `test_app.py`

```python
import pytest
from fastapi.testclient import TestClient

from app import VALID_API_KEYS, app, store

API_KEY = next(iter(VALID_API_KEYS))
HEADERS = {"X-API-Key": API_KEY}


@pytest.fixture(autouse=True)
def reset_store():
    store.clear()
    yield
    store.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_missing_api_key_returns_401(client):
    r = client.get("/notes")
    assert r.status_code == 401
    assert "detail" in r.json()


def test_invalid_api_key_returns_401(client):
    r = client.get("/notes", headers={"X-API-Key": "nope"})
    assert r.status_code == 401
    assert "detail" in r.json()


def test_create_requires_api_key(client):
    r = client.post("/notes", json={"title": "Hi"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def test_create_note_happy_path(client):
    r = client.post("/notes", json={"title": "Hello", "body": "World"}, headers=HEADERS)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Hello"
    assert data["body"] == "World"
    assert "id" in data and data["id"]
    assert "created_at" in data
    assert "updated_at" in data


def test_create_note_defaults_empty_body(client):
    r = client.post("/notes", json={"title": "Hello"}, headers=HEADERS)
    assert r.status_code == 201
    assert r.json()["body"] == ""


def test_create_note_missing_title_422(client):
    r = client.post("/notes", json={"body": "no title"}, headers=HEADERS)
    assert r.status_code == 422
    assert "detail" in r.json()


def test_create_note_blank_title_422(client):
    r = client.post("/notes", json={"title": "   "}, headers=HEADERS)
    assert r.status_code == 422


def test_create_note_title_too_long_422(client):
    r = client.post("/notes", json={"title": "x" * 121}, headers=HEADERS)
    assert r.status_code == 422


def test_create_note_body_too_long_422(client):
    r = client.post(
        "/notes", json={"title": "ok", "body": "x" * 10_001}, headers=HEADERS
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------


def test_get_note_happy_path(client):
    created = client.post(
        "/notes", json={"title": "A", "body": "B"}, headers=HEADERS
    ).json()
    r = client.get(f"/notes/{created['id']}", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_get_note_not_found_404(client):
    r = client.get("/notes/does-not-exist", headers=HEADERS)
    assert r.status_code == 404
    assert "detail" in r.json()


def test_get_note_requires_api_key(client):
    created = client.post("/notes", json={"title": "A"}, headers=HEADERS).json()
    r = client.get(f"/notes/{created['id']}")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


def test_update_note_happy_path(client):
    created = client.post(
        "/notes", json={"title": "A", "body": "B"}, headers=HEADERS
    ).json()
    r = client.put(f"/notes/{created['id']}", json={"title": "A2"}, headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "A2"
    assert body["body"] == "B"  # untouched field preserved
    assert body["updated_at"] >= created["updated_at"]


def test_update_note_not_found_404(client):
    r = client.put("/notes/does-not-exist", json={"title": "A2"}, headers=HEADERS)
    assert r.status_code == 404


def test_update_note_invalid_payload_422(client):
    created = client.post("/notes", json={"title": "A"}, headers=HEADERS).json()
    r = client.put(f"/notes/{created['id']}", json={"title": ""}, headers=HEADERS)
    assert r.status_code == 422


def test_update_note_body_too_long_422(client):
    created = client.post("/notes", json={"title": "A"}, headers=HEADERS).json()
    r = client.put(
        f"/notes/{created['id']}", json={"body": "x" * 10_001}, headers=HEADERS
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


def test_delete_note_happy_path(client):
    created = client.post("/notes", json={"title": "A"}, headers=HEADERS).json()
    r = client.delete(f"/notes/{created['id']}", headers=HEADERS)
    assert r.status_code == 204
    r2 = client.get(f"/notes/{created['id']}", headers=HEADERS)
    assert r2.status_code == 404


def test_delete_note_not_found_404(client):
    r = client.delete("/notes/does-not-exist", headers=HEADERS)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# List / pagination / filtering
# ---------------------------------------------------------------------------


def test_list_notes_empty(client):
    r = client.get("/notes", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_list_notes_pagination(client):
    for i in range(5):
        client.post(
            "/notes", json={"title": f"Note {i}", "body": ""}, headers=HEADERS
        )
    r = client.get("/notes", params={"page": 1, "page_size": 2}, headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["page_size"] == 2

    r2 = client.get("/notes", params={"page": 3, "page_size": 2}, headers=HEADERS)
    assert len(r2.json()["items"]) == 1

    r3 = client.get("/notes", params={"page": 4, "page_size": 2}, headers=HEADERS)
    assert r3.json()["items"] == []


def test_list_notes_page_size_cap_rejected(client):
    r = client.get("/notes", params={"page_size": 1000}, headers=HEADERS)
    assert r.status_code == 422


def test_list_notes_invalid_page_rejected(client):
    r = client.get("/notes", params={"page": 0}, headers=HEADERS)
    assert r.status_code == 422


def test_list_notes_filter_q_matches_title_or_body(client):
    client.post(
        "/notes",
        json={"title": "Shopping list", "body": "milk, eggs"},
        headers=HEADERS,
    )
    client.post(
        "/notes", json={"title": "Work", "body": "finish report"}, headers=HEADERS
    )

    r = client.get("/notes", params={"q": "milk"}, headers=HEADERS)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Shopping list"

    r2 = client.get("/notes", params={"q": "report"}, headers=HEADERS)
    items2 = r2.json()["items"]
    assert len(items2) == 1
    assert items2[0]["title"] == "Work"

    r3 = client.get("/notes", params={"q": "nonexistent"}, headers=HEADERS)
    assert r3.json()["items"] == []


def test_list_notes_requires_api_key(client):
    r = client.get("/notes")
    assert r.status_code == 401
```

## Notes on design decisions

- **Storage**: a simple thread-safe `NoteStore` (dict + `Lock`) in-memory,
  keyed by a `uuid4().hex` string id. Good enough for the exercise; swap for
  a real DB session dependency later without changing the route signatures.
- **Auth**: `X-API-Key` header checked by a single `require_api_key`
  dependency mounted once on the whole `/notes` router (`dependencies=[...]`),
  so every route enforces it uniformly instead of repeating the check.
- **Validation**: request/response schemas are separate (`NoteCreate`,
  `NoteUpdate`, `NoteOut`) so the API contract is decoupled from storage
  representation. Field constraints (`min_length`, `max_length`) plus a
  `field_validator` reject blank/whitespace-only titles that length
  constraints alone wouldn't catch. FastAPI's built-in `422` handling is used
  as-is (already returns a `detail` field) rather than reinventing it.
- **PUT semantics**: implemented as a partial update (fields omitted keep
  their previous value, via `model_dump(exclude_unset=True)`) since the task
  only specifies one update endpoint and this is the more forgiving,
  commonly-used option for a note-taking API.
- **Errors**: `404` for missing notes, `401` for missing/invalid API key,
  `422` for validation, and a catch-all `Exception` handler returning a
  `500` with the same `{"detail": ...}` envelope so no endpoint ever leaks a
  stack trace.
- **Pagination**: `page` (>=1) and `page_size` (1..100, capped so no request
  can pull the whole store) query params; response includes `items`,
  `total`, `page`, `page_size`. `q` performs a case-insensitive substring
  match against both `title` and `body`.
- **Tests**: 24 pytest cases using `TestClient`, covering the happy path and
  the auth/validation/not-found error branches for every endpoint, plus
  pagination bounds and the `q` filter. Verified locally with
  `python3 -m pytest test_app.py -q` — all 24 pass.
