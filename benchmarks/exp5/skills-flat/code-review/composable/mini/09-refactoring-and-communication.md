
# Refactoring Strategy & Communicating Findings

## Refactoring safely

Refactor to reduce duplication and complexity, but protect behavior while you do it.

- **Characterize before you change.** Put tests around behavior-critical code before refactoring it, so you can prove behavior didn't change.
- **One kind of change at a time.** Keep pure refactors (no behavior change) in separate commits from behavior changes. This keeps review honest and lets `git bisect` isolate regressions.
- **Small, reversible steps:** extract a function, rename for clarity, replace a conditional with polymorphism, introduce a parameter object. Each step should leave the code working.
- **Watch false duplication.** Don't unify two blocks that only look alike — if they can evolve independently or already differ subtly, merging them couples unrelated things.
- **Resist scope creep.** Leave code better than you found it, but a refactor that balloons the diff balloons the risk and the review cost. Stay near the change you came to make.

## Severity triage

- **Critical / blocker:** security holes, data loss/corruption, crashes on common input. Must fix before merge.
- **Major:** correctness bugs on plausible inputs, missing error handling on important paths, significant performance regressions.
- **Minor:** edge cases, smaller performance issues, missing tests for lower-risk code.
- **Nit:** style, naming, non-blocking suggestions — label them so they aren't mistaken for blockers.

## Communicating findings

A finding only matters if it lands.
- Be specific and cite the line.
- Explain *why* it's a problem — the failing scenario — not just what to change.
- Suggest a concrete fix.
- Separate must-fix from nice-to-have; lead with what matters and don't bury a critical issue under nits.
- Ask when intent is unclear rather than assuming a mistake; praise good solutions. Review is collaborative, not adversarial.
