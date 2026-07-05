
# Dependencies, Authentication & Authorization

Dependencies are FastAPI's core reuse mechanism: DB sessions, auth, pagination. Use a generator dependency for resources needing teardown:

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`Depends` results are cached within a request, so `get_current_user` runs once even if several dependencies need it. Compose dependencies to build up context.

Scope the session to the request (one per request via the generator), and manage transactions explicitly: commit once at the end of a successful unit of work and roll back on error, so a partial multi-step mutation never persists. Don't commit after each step, and never share a session across requests in a module-level global — it isn't thread-safe and leaks state between callers. The `finally` block closes it on every path.

**Auth: OAuth2 password flow + JWT bearer tokens.** Hash passwords with bcrypt/argon2 via `passlib` — never plaintext, never a fast hash like SHA-256.

```python
from passlib.context import CryptContext
from jose import jwt, JWTError

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def make_token(sub: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": sub, "exp": exp}, settings.jwt_secret, algorithm="HS256")
```

Current-user dependency decodes, validates, and loads the user:

```python
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

def get_current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    exc = HTTPException(401, "Invalid credentials", {"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        raise exc
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise exc
    return user
```

Rules:
- **Always pass `algorithms=[...]` on decode** — omitting it enables `alg=none` token forgery.
- Keep tokens short-lived; pair with refresh tokens.
- **Authentication ≠ authorization.** Enforce ownership/roles in handlers or dependencies. Write a factory `require_role("admin")` returning a dependency that checks `current_user` and raises `403` — don't rely on authentication alone. The classic bug is an endpoint that verifies the caller is logged in but never checks the requested object belongs to them.

Dependency injection is also what makes the app testable: in tests you override `get_db` with a test session and `get_current_user` with a fake user, exercising real routes without real auth or a real database.
