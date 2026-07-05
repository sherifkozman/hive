---
pairs-with:
  - 04-validation-and-errors.md
---

# Pydantic Models: Request vs Response

Separate input and output models. Never accept your ORM model directly, and never expose it raw.

```python
from pydantic import BaseModel, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)

class UserOut(BaseModel):
    model_config = {"from_attributes": True}  # read from ORM objects
    id: int
    email: EmailStr
    full_name: str
```

Key patterns:
- `from_attributes=True` (Pydantic v2) lets `response_model` read ORM instances directly, so you can `return user` and get a filtered `UserOut`.
- Use rich types (`EmailStr`, `HttpUrl`, `conint`, `Field(gt=0)`) so validation is declarative and lives in the schema.
- **Constrain everything:** string lengths, numeric bounds, list sizes. Unbounded input is a DoS and data-quality risk.
- The input/output split is also your security boundary: a field that only exists on `UserCreate` (password) can never accidentally appear in `UserOut`.

**Partial updates (PATCH):** make every field `Optional` with a default, then apply only what the client sent:

```python
class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=200)

data = payload.model_dump(exclude_unset=True)  # only fields the client provided
for k, v in data.items():
    setattr(user, k, v)
```

`exclude_unset=True` distinguishes "field omitted" from "field set to null", which is essential for correct PATCH semantics. For nested structures, define nested models rather than accepting free-form `dict`, so each level is validated.

Why the strict split matters in practice: your ORM model is a database concern that changes for storage reasons; your response model is an API contract clients depend on. Coupling them means a schema migration can silently change your public API or leak a newly-added internal column. Keeping `UserCreate`, `UserUpdate`, and `UserOut` distinct from the ORM `User` gives you three independent contracts you can evolve safely.
