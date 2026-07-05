# Code Review & Refactoring — Mini-Skill Index

Load the mini-skill(s) matching what you're reviewing.

- `01-review-method.md` — Mindset, passes, prioritization. Load at the start of any review.
- `02-security-review.md` — Injection, path traversal, secrets, crypto, authz/IDOR, SSRF. Load when code touches input, storage, or external systems.
- `03-correctness-bugs.md` — Off-by-one, None handling, coercion, mutable defaults, leaks, money. Load when checking logic correctness.
- `04-concurrency.md` — Races, shared state, deadlocks, async, TOCTOU. Load when code is threaded, async, or shares state.
- `05-error-handling.md` — Bare excepts, silent failure, cleanup, transactions. Load when reviewing error paths.
- `06-performance.md` — N+1, O(n²), unbounded memory, chatty I/O. Load when assessing efficiency.
- `07-api-design.md` — Naming, single responsibility, compatibility, return types. Load when reviewing interfaces.
- `08-missing-tests.md` — Untested branches, regression tests, weak tests. Load when assessing test coverage.
- `09-refactoring-and-communication.md` — Safe refactoring + severity triage and feedback. Load when refactoring or writing up findings.
