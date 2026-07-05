# T2 — python-api

Implement a FastAPI endpoint `GET /fetch-preview?url=...` that fetches the
given URL server-side and returns `{"status": <http status>, "title": <html
title or null>, "content_type": ...}`. Include input validation, sensible
error handling (unreachable host, timeouts, non-HTML), and pytest tests
(mock the outbound fetch). Deliver complete `app.py` + `test_app.py` in
fenced blocks. Skill domains available: `skills/python-api/composable/` and
`skills/code-review/composable/`.
