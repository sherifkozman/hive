# Task: python-api / BROAD

Build a small but complete FastAPI service for a note-taking API, delivered as
complete file contents in your final answer (files: `app.py`, `test_app.py`).

Requirements:
1. CRUD for notes: `POST /notes`, `GET /notes`, `GET /notes/{id}`,
   `PUT /notes/{id}`, `DELETE /notes/{id}`. In-memory store is fine.
2. Note model: id, title (1-120 chars, required), body (<=10k chars),
   created_at, updated_at. Validate rigorously.
3. Auth: all endpoints require header `X-API-Key`; a hardcoded set of valid
   keys is fine; 401 on missing/invalid key.
4. Consistent error handling: 404 for missing note, 422 for validation, 401
   for auth; JSON error bodies with a `detail` field.
5. List endpoint: pagination (`page`, `page_size`) and `q` full-text filter on
   title/body.
6. Tests: pytest + FastAPI TestClient covering happy paths AND error paths for
   every endpoint (aim for the important cases, not exhaustive permutations).
