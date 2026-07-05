
# Missing Tests

A change without tests for its risky behavior is incomplete. Reviewing tests is part of reviewing the change, not an afterthought.

**Hunt untested branches.** The happy path is usually covered; the defects hide in what isn't:
- Error paths — does anything exercise the `except`, the validation rejection, the "not found" case?
- Boundary inputs — empty, single-element, maximum size, zero, negative, null.
- The security check that was just added — is there a test proving the unauthorized caller is actually denied?

**Regression tests for fixes.** When a bug is fixed, there should be a test that fails without the fix and passes with it. A fix with no test invites the bug's return and gives no evidence the fix works.

**Judge test quality, not just presence.** A test that runs code but asserts nothing proves only that it doesn't crash. Require assertions on observable behavior — return values, side effects, raised exceptions. Flag:
- Tests with no meaningful assertion (can't fail).
- Tests coupled to implementation detail (they break on every refactor and don't validate contract).
- Mocks of the very unit under test — you end up testing the mock, not the code. Mock external boundaries, not the subject.

**Prioritize.** You won't demand tests for everything. Ask for them where risk is highest and correctness is least obvious: the intricate branching logic, the security boundary, the money calculation, the concurrency-sensitive path. A trivial getter needs less than a permissions check.

When you flag missing coverage, name the specific scenario that's untested and why it matters — "no test covers a withdrawal larger than the balance" — so the author knows exactly what to add.
