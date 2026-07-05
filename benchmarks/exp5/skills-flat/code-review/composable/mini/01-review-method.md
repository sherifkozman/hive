
# Review Mindset & Method

A review's job is to find the defects that matter and communicate them so they get fixed. Everything else is secondary.

**Read with a threat model.** For the code in front of you, ask: what does it trust? What can an attacker or a buggy caller feed it? What happens when each assumption is false? Bugs live where assumptions meet reality.

**Read enough context.** Review the diff, but read the surrounding code to understand invariants. A change is only correct relative to the contract of the functions it calls and the callers it serves. A line that looks fine in isolation may violate a precondition established elsewhere.

**Work in passes, not one linear read:**
1. Understand intent and the happy path — what is this trying to do?
2. Hunt correctness and security defects — where does it break?
3. Consider concurrency, error handling, and performance.
4. Assess tests and design — is the change complete and maintainable?

**Prioritize by impact.** A security hole or data-corruption bug outranks a style nit every time. Spend your attention budget on the code that can hurt: input handling, auth, money, state mutation, external calls. Skim boilerplate.

**Reproduce before you report.** For each candidate defect, construct the concrete input or interleaving that triggers it. A finding you can trace to a failing scenario is strong; a vague "this looks risky" is weak and erodes trust in the review.

**Stay collaborative.** Assume competence; ask when intent is unclear rather than assuming a mistake. The goal is better code merged, not a scorecard. Lead with the findings that matter and don't bury a critical issue under a pile of nits.

**A fast sweep to run against any non-trivial change:**
- Security: untrusted input reaching SQL/shell/templates parameterized? Paths canonicalized and contained? No hardcoded secrets? Strong password hashing, CSPRNG for tokens? Every object access authorized, not just authenticated?
- Correctness: boundaries (empty/one/last) handled? `None` guarded? No mutable default args? Money in `Decimal`/integers?
- Concurrency: shared state locked or avoided? Check-then-act atomic? No blocking call in async code?
- Errors: no bare `except`/silent swallow? Cleanup on every path? Multi-step mutations transactional?
- Performance: no query/network call in a loop (N+1)? No list-membership tests in hot loops? Large data streamed?
- Design & tests: interfaces single-purpose and backward-compatible? Risky branches and the new security check covered by meaningful tests, with a regression test for any fix?

Run the sweep, then focus your attention on the two or three areas the change actually touches — the checklist finds candidates, deep reading confirms them.
