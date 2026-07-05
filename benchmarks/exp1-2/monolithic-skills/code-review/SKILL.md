# Code Review & Refactoring

Expert guidance for reviewing code and driving refactors. Covers review method, security review, correctness bugs, concurrency, error handling, performance, API design, spotting missing tests, refactoring strategy, and communicating findings with severity triage. The through-line: find the defects that matter, prove they're real, and communicate them so they get fixed.

## Mindset & method

A review's job is to find the defects that matter and communicate them so they get fixed. Everything else is secondary. Read the change with a threat model in mind: what does this code trust, what can an attacker or a buggy caller feed it, and what happens when each assumption is false? Bugs live where assumptions meet reality.

Review the diff, but read enough surrounding code to understand invariants — a change is only correct relative to the contract of the functions it calls and the callers it serves. A line that looks fine in isolation may violate a precondition established elsewhere, or rely on one that no longer holds.

Work in passes rather than one linear read:
1. Understand intent and the happy path — what is this trying to do?
2. Hunt correctness and security defects — where does it break?
3. Consider concurrency, error handling, and performance.
4. Assess tests and design — is the change complete and maintainable?

Prioritize by impact: a security hole or data-corruption bug outranks a style nit every time. Spend your attention budget on the code that can hurt — input handling, auth, money, state mutation, external calls — and skim boilerplate. For each candidate defect, construct the concrete input or interleaving that triggers it; a finding you can trace to a failing scenario is strong, a vague "this looks risky" is weak and erodes trust in the review. Stay collaborative: assume competence, ask when intent is unclear, and don't bury a critical issue under a pile of nits.

## Security review

Security bugs are the highest-value finding. Work through these categories on every change that touches input, storage, or external systems.

**Injection.** Any time untrusted input reaches an interpreter — SQL, shell, LDAP, XML, a template — you need parameterization, not string concatenation. Flag `f"SELECT ... WHERE id = {user_id}"` and `cursor.execute("... %s" % val)`; require bound parameters (`cursor.execute("... WHERE id = %s", (user_id,))`). For shell, flag `os.system` and `subprocess.run(..., shell=True)` with interpolated input; require `shell=False` with an argument list. For NoSQL and ORMs, watch for operators injected via user-controlled dicts.

**Path traversal.** When a filename or path comes from input, `../` can escape the intended directory. Require canonicalization and containment checks: resolve the real path and verify it is inside the allowed base (`os.path.realpath(p).startswith(base)` or `Path.resolve().is_relative_to(base)`). Reject absolute paths and null bytes.

**Secrets.** Flag hardcoded API keys, passwords, tokens, and private keys in source — including test fixtures and example configs. Secrets belong in environment variables or a secret manager, never in the repo or logs. Check that logging and error messages don't echo credentials or tokens.

**Crypto.** Flag MD5/SHA-1 for security purposes and any password stored with a fast hash or none at all — passwords need bcrypt/scrypt/argon2 with a per-user salt. Flag ECB mode, static or zero IVs, and IVs reused across messages. Require a CSPRNG (`secrets`, `os.urandom`) for tokens — never `random` for anything security-relevant. Check that TLS verification isn't disabled (`verify=False`).

**AuthN vs AuthZ.** Distinguish authentication (who are you) from authorization (may you do this). The classic bug: an endpoint authenticates the user but never checks that the requested resource belongs to them (IDOR — insecure direct object reference). Verify every object access is scoped to the caller's permissions. Check for missing access control on "internal" or admin routes.

**Other high-value checks.** SSRF (server fetching a user-supplied URL — validate host allowlists, block internal ranges), deserialization of untrusted data (`pickle`, `yaml.load` without `SafeLoader`), open redirects, and missing rate limits on auth endpoints. Validate and bound all input at the trust boundary.

## Correctness bugs

These are the defects that make code do the wrong thing on some input. For each candidate, construct the concrete triggering input.

- **Off-by-one and boundary errors:** empty collections, single-element cases, the last index, inclusive vs exclusive ranges. Most boundary bugs hide at size 0 and size 1.
- **None/null handling:** a value that can be `None` used without a guard; `dict.get()` returning `None` then dereferenced; a function returning `None` on a path the caller doesn't expect.
- **Type and coercion bugs:** comparing strings to ints, truthiness of `0`/`""`/`[]` mistaken for "missing" (use explicit `is None`), integer vs float division.
- **Incorrect conditionals:** inverted logic, `and`/`or` precedence, `==` vs `is`, De Morgan mistakes, a `not` binding to the wrong clause.
- **Mutable default arguments** (`def f(x, acc=[])`) — the default is created once and shared across all calls, so it accumulates; use `None` and initialize inside.
- **Loop and state bugs:** modifying a collection while iterating it, an accumulator reset in the wrong scope, an early `return`/`break` skipping cleanup or a later necessary step.
- **Resource leaks:** files, sockets, DB connections not closed on every path (including exceptions) — require context managers (`with`).
- **Floating-point money:** never use binary floats for currency; rounding errors accumulate. Use integer cents or `Decimal`.

The discipline that separates a strong finding from noise: name the exact input and the wrong output it produces. "This crashes when `items` is empty because line 12 indexes `items[0]`" is actionable; "the loop looks off" is not.

## Concurrency

Concurrency defects are subtle and rarely covered by tests, so review them deliberately whenever code is threaded, async, or shares state across requests.

- **Race conditions / check-then-act:** `if not exists(k): create(k)` run by two threads can both pass the check and both create. Require atomic operations, locks, or DB-level guarantees — a unique constraint plus `INSERT ... ON CONFLICT`, or a compare-and-swap. Any read-modify-write on shared data is suspect.
- **Shared mutable state:** module-level dicts, lists, counters, or caches mutated by concurrent requests without a lock. `counter += 1` is not atomic — it's a read, an add, and a write, any of which can interleave. Prefer per-request state or thread-safe structures.
- **Deadlocks:** two locks acquired in inconsistent order across code paths. Establish and follow a global lock ordering; hold locks for the shortest span.
- **Async pitfalls:** a blocking call (sync I/O, `time.sleep`, CPU-heavy loop) inside `async` code freezes the whole event loop; a forgotten `await` means the coroutine never runs; task exceptions swallowed because no one awaits the task.
- **TOCTOU on the filesystem:** check-then-use races — `if os.path.exists(p): open(p)` — where the file changes between the two calls. Prefer a single atomic operation (open with `O_CREAT|O_EXCL`) over stat-then-open.

Because these bugs surface only under specific interleavings, reason about "what if two callers hit this simultaneously" for every piece of shared state, rather than relying on tests to catch them.

## Error handling

Good error handling is about failing safely and visibly, never silently.

- Flag bare `except:` and `except Exception: pass` — they hide bugs and turn failures into silent wrong behavior. Catch specific exceptions you can handle; log or re-raise the rest.
- Don't swallow an error and return a sentinel (`None`, `-1`, `[]`, `False`) that callers treat as success. Fail loudly or handle meaningfully; if you return a sentinel, make sure every caller checks it.
- Ensure cleanup runs on every path — `finally` or context managers, not cleanup duplicated before each `return` (the duplicated version always misses a path).
- Error messages should aid debugging without leaking internals to end users: log the detail (stack trace, ids) server-side, return a generic message to the client. Don't echo secrets, SQL, or file paths.
- Check that partial failures don't leave inconsistent state — wrap multi-step mutations in a transaction and roll back on error, or design idempotent/compensating steps. Verify the code doesn't commit step 1 then throw on step 2.
- Don't catch an exception only to raise a vaguer one that discards the stack and root cause — chain with `raise NewError(...) from exc` or let the original propagate.

The core question for any `try` block: if this raises, does the system end up in a known-good state, and will someone find out it happened? If either answer is no, it's a finding.

## Performance

Focus on algorithmic and I/O issues that scale badly with data or load; ignore micro-optimizations that don't matter.

- **N+1 queries:** a DB (or network) call inside a loop over rows — 1 query to list, then N to fetch each item's detail. Batch it into one query or eager-load. A `.get`/`.query`/`fetch` inside a `for` loop is a red flag.
- **Accidental O(n²):** membership tests against a list in a loop (`x in big_list`) — use a `set`/`dict` for O(1) lookup. Watch nested loops over the same large data and invariant work recomputed each iteration that could be hoisted out.
- **Unbounded memory:** loading an entire large file or result set into memory (`f.read()`, `.all()` on a huge table) — stream, chunk, or paginate.
- **Missing indexes / full scans** implied by query patterns; repeated identical queries that should be cached.
- **Chatty I/O:** many small network/disk calls that should be batched; a new connection per call instead of a reused pooled client.

Distinguish hot paths from cold — a slow one-time startup step rarely matters, a slow per-request or per-row path does. Estimate input size: O(n²) on n=10 is fine, on n=10⁶ it's fatal. When you claim something is slow, point to the scaling factor that makes it bite, and prefer measuring over asserting.

## API & interface design

Interfaces are contracts; review them for clarity, consistency, and stability.

- **Intent-revealing naming** and consistent parameter order and return types across a module. A function named `get_user` that sometimes creates one is a lie.
- **Single responsibility.** Be wary of a boolean flag parameter that switches behavior (`render(data, is_admin=True)`) — it usually means two functions crammed into one; split them.
- **Predictable return types:** don't sometimes return a list and sometimes a single item, or `None` on one path and `[]` on another for "nothing." Pick one shape (empty collection over `None` is usually kinder) and hold it.
- **Backward compatibility:** for public/shared interfaces, a changed signature or response shape breaks existing callers. Require additive change or a deprecation path, not a silent breaking change — watch for a renamed field, a removed parameter, or a newly-required argument.
- **Fail-fast validation** of arguments at the boundary with clear errors, so bad input is rejected where it enters rather than failing confusingly three layers down.
- **Small, injectable dependencies** over god-objects; pass dependencies in rather than reaching for globals, which makes the unit testable and its contract explicit.

When reviewing a new interface, imagine writing a caller against it: is correct usage obvious, is misuse hard, and will next year's change break me? Prefer interfaces that make the illegal state unrepresentable — a type or enum that can't hold a bad value beats runtime validation, and required constructor arguments beat a settable field the caller might forget. If a function needs a long comment to explain when to call it or what its return means, that's usually a sign the interface itself should be reshaped, not documented around.

## Missing tests

A change without tests for its risky behavior is incomplete. Reviewing tests is part of reviewing the change. Hunt untested branches: the error paths (does anything exercise the `except`, the validation rejection, the "not found" case?), the boundary inputs (empty, single, max, zero, negative, null), and the security check just added (is there a test proving the unauthorized caller is actually denied?).

When a bug is fixed, there should be a regression test that fails without the fix and passes with it — a fix with no test invites the bug's return and gives no evidence it works. Judge test quality, not just presence: a test that runs code but asserts nothing proves only that it doesn't crash. Require assertions on observable behavior — return values, side effects, raised exceptions. Flag tests with no meaningful assertion, tests coupled to implementation detail (they break on every refactor without validating the contract), and mocks of the very unit under test (you end up testing the mock). Prioritize: demand tests where risk is highest and correctness is least obvious — intricate branching, security boundaries, money calculations, concurrency-sensitive paths — and name the specific untested scenario so the author knows exactly what to add.

## Refactoring strategy

Refactor to reduce duplication and complexity, but do it safely. Establish characterization tests before changing behavior-critical code so you can prove you didn't change behavior. Make one kind of change at a time — separate pure refactors (no behavior change) from behavior changes in different commits, so review and `git bisect` stay clean. Prefer small, reversible steps: extract a function, rename for clarity, replace a conditional with polymorphism, introduce a parameter object; each step should leave the code working. Watch for false duplication — don't unify two blocks that only look alike, because if they can evolve independently, merging them couples unrelated things. Leave code better than you found it, but resist scope creep that balloons the diff and the risk; stay near the change you came to make.

## Communicating findings & severity triage

A finding only matters if it lands. For each issue, state the concrete impact and the fix, with enough context to reproduce.

Triage by severity:
- **Critical / blocker:** security holes, data loss/corruption, crashes on common input. Must fix before merge.
- **Major:** correctness bugs on plausible inputs, missing error handling on important paths, significant performance regressions.
- **Minor:** edge cases, smaller performance issues, missing tests for lower-risk code.
- **Nit:** style, naming, non-blocking suggestions — label them as such so they aren't confused with blockers.

Communication rules: be specific and cite the line; explain *why* it's a problem (the failing scenario), not just *what* to change; suggest a concrete fix; separate must-fix from nice-to-have. Ask questions when intent is unclear rather than assuming malice or incompetence. Praise good solutions too — review is collaborative, not adversarial. Don't drown a review in nits that bury the one critical finding; lead with what matters.

## Review checklist

A fast sweep to run against any non-trivial change:
- **Security:** untrusted input reaching SQL/shell/templates parameterized? Paths canonicalized and contained? No hardcoded secrets? Strong password hashing and a CSPRNG for tokens? Every object access authorized to the caller, not just authenticated? User-supplied URLs and deserialization guarded?
- **Correctness:** boundaries (empty/one/last) handled? `None` guarded? No mutable default args? Conditionals and operator precedence right? Money in `Decimal`/integers, not floats?
- **Concurrency:** shared mutable state locked or avoided? Check-then-act made atomic? Consistent lock ordering? No blocking calls in async code or forgotten `await`?
- **Errors:** no bare `except`/silent swallow? Cleanup on every path via context managers? Multi-step mutations transactional? Messages leak nothing sensitive?
- **Performance:** no query or network call inside a loop (N+1)? No list-membership tests in hot loops? Large data streamed, not fully loaded? Hot path vs cold assessed?
- **Design & tests:** interfaces intent-revealing, single-purpose, backward-compatible? Return types stable? Risky branches, error paths, and the new security check covered by meaningful, non-tautological tests, with a regression test for any fix?

Run the sweep, then focus attention on the two or three areas the change actually touches.
