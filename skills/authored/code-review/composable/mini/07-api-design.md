---
pairs-with:
  - python-api/02-routing-and-app.md
  - tech-writing/06-breaking-changes-migrations.md
---

# API & Interface Design

Interfaces are contracts; review them for clarity, consistency, and stability.

- **Intent-revealing naming.** Names should say what a thing is or does. Consistent parameter order and return types across a module reduce caller mistakes. A function named `get_user` that sometimes creates one is a lie.
- **Single responsibility.** A function should do one thing. Be wary of a boolean flag parameter that switches behavior (`render(data, is_admin=True)`). It usually means two functions crammed into one; split them so each name describes exactly what it does.
- **Predictable return types.** Don't sometimes return a list and sometimes a single item, or `None` on one path and `[]` on another for "nothing." Callers can't handle a type that shifts. Pick one shape (empty collection over `None` is usually kinder) and hold it.
- **Backward compatibility.** For public/shared interfaces, a changed signature or response shape breaks existing callers. Require additive change or a deprecation path, not a silent breaking change. Watch for a renamed field, a removed parameter, or a newly-required argument.
- **Fail-fast validation.** Validate arguments at the boundary with clear errors, so bad input is rejected where it enters rather than causing a confusing failure three layers down.
- **Small, injectable dependencies.** Prefer focused interfaces over god-objects, and pass dependencies in (injectable) rather than reaching for globals: it makes the unit testable and its contract explicit.

When reviewing a new interface, imagine writing a caller against it: is the correct usage obvious, is misuse hard, and will next year's change break me? If any answer is uncomfortable, note it.

Prefer interfaces that make the illegal state unrepresentable: a type or enum that can't hold a bad value beats runtime validation, and a required constructor argument beats a settable field the caller might forget. If a function needs a long comment to explain when to call it or what its return means, that's usually a sign the interface should be reshaped, not documented around.
