# Project Structure & Hygiene

Organize by feature, not by layer, once past a handful of endpoints:

```
app/
  main.py            # create_app(), mount routers, middleware
  core/config.py     # Settings (pydantic-settings)
  core/security.py   # hashing, JWT helpers
  db/session.py      # engine, SessionLocal, get_db dependency
  api/deps.py        # shared dependencies
  api/v1/users.py    # APIRouter per resource
  models/            # SQLAlchemy ORM models
  schemas/           # Pydantic request/response models
  services/          # business logic, no framework imports
tests/
```

Keep business logic out of route handlers. A handler parses input, calls a service function, and shapes the response. Services stay framework-agnostic and unit-testable — this is what makes the codebase maintainable and lets you test logic without spinning up HTTP.

Use `pydantic-settings` so config is typed and validated at startup — fail fast on missing vars:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    database_url: str
    jwt_secret: str
    jwt_expire_minutes: int = 30

settings = Settings()  # raises on missing required vars
```

Hygiene checklist:
- Pin dependencies (`requirements.txt` with hashes, or `pyproject.toml` + lockfile).
- Never commit `.env` or secrets; load them from the environment.
- Run `ruff` (lint/format) and `mypy` (types) in CI.
- Keep one responsibility per module; avoid mutable global state shared across requests.
- Version the API under a path prefix (`/api/v1`) so you can evolve it without breaking clients.

Layer-first layouts (`controllers/`, `services/`, `models/` each holding every feature) force you to touch many directories per change and scale badly as the app grows; feature-aware grouping keeps related code together.

The payoff of this structure: routes stay thin, services are pure and testable, schemas are reusable, and configuration errors surface at boot rather than at request time.
