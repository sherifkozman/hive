---
pairs-with:
  - 08-missing-tests.md
---

# Correctness Bugs

These defects make code do the wrong thing on some input. Check each category, and for every candidate construct the concrete triggering input.

- **Off-by-one / boundary:** empty collections, single-element cases, the last index, inclusive vs exclusive ranges. Most boundary bugs hide at size 0 and size 1.
- **None/null handling:** a value that can be `None` used without a guard; `dict.get()` returning `None` then dereferenced; a function returning `None` on a path the caller doesn't expect.
- **Type and coercion bugs:** comparing strings to ints, truthiness of `0` / `""` / `[]` mistaken for "missing" (use explicit `is None`), integer vs float division.
- **Incorrect conditionals:** inverted logic, `and`/`or` precedence, `==` vs `is`, De Morgan mistakes, a `not` binding to the wrong clause.
- **Mutable default arguments:** `def f(x, acc=[])`: the default is created once and shared across all calls, so it accumulates. Use `None` and initialize inside the function.
- **Loop and state bugs:** modifying a collection while iterating it; an accumulator reset in the wrong scope; an early `return`/`break` that skips cleanup or a later necessary step.
- **Resource leaks:** files, sockets, DB connections not closed on every path (including exceptions). Require context managers (`with`).
- **Floating-point money:** never use binary floats for currency. Rounding errors accumulate. Use integer cents or `Decimal`.

The discipline that separates a strong finding from noise: name the exact input and the wrong output it produces. "This crashes when `items` is empty because line 12 indexes `items[0]`" is actionable; "the loop looks off" is not.
