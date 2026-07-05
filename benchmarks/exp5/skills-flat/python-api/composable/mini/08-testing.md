
# Testing with pytest + TestClient

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
    assert "password" not in r.json()   # sensitive field must not leak

def test_rejects_short_password(client):
    r = client.post("/api/v1/users", json={"email": "a@b.com",
                    "password": "x", "full_name": "A"})
    assert r.status_code == 422
```

**Test the contract, not the implementation:**
- Status codes for success and each error path.
- Response shape, and that sensitive fields (password hashes, internal ids) are absent.
- Auth enforced — unauthenticated returns `401`, wrong-user/role returns `403`.
- Validation rejects bad input (`422`); pagination bounds hold (`limit` cap respected).

**Isolation & data:**
- Use a fresh transactional DB per test: create schema then wrap each test in a rollback, or use a disposable SQLite / testcontainers Postgres.
- `pytest.fixture` for setup/teardown; `parametrize` for edge cases.
- Build test data with factories (`factory_boy` or plain builder functions), not copy-pasted dicts.

Keep tests fast and isolated. Mock only external services (payment gateways, third-party APIs) — never mock your own code, or you test the mock instead of the behavior. A test that passes against a mock of your service proves nothing about the service.

Cover the full contract deliberately: a happy-path test per endpoint, plus one test per error branch (404, 409, 422), an auth test (401 unauthenticated, 403 wrong role/owner), and a pagination test asserting the `limit` cap is enforced. Prefer many small focused tests over a few sprawling ones — when a focused test fails, its name tells you what broke.
