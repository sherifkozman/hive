
# Choosing the Right Document Type

Reader goals map to four distinct, non-interchangeable document types. Mixing them in one page is the most common structural mistake in documentation.

- **Tutorial** (learning-oriented): a guided, guaranteed-to-succeed lesson for a newcomer. Linear, opinionated, one happy path, no alternatives, no error branches. Success = the reader built something and feels competent.
- **How-to / task guide** (problem-oriented): steps to accomplish a specific real-world task the reader already knows they need. Assumes competence. May list variations. Success = task completed.
- **Reference** (information-oriented): exhaustive, accurate description of the machinery — every parameter, return value, error code, config key. Dry, consistent, austere. Success = the reader found the exact fact and trusts it.
- **Explanation / concept** (understanding-oriented): the *why* — architecture, tradeoffs, mental models. Read away from the keyboard. Success = the reader can reason about edge cases.

Keep these separate. A reference page cluttered with tutorial hand-holding frustrates experts; a tutorial padded with reference tables loses novices. When a page feels muddled, it is usually two types fighting — split it.

**How to tell them apart in practice.** Ask what the reader is doing:
- Learning the tool for the first time → tutorial.
- Has a specific job to finish → how-to.
- Needs a precise fact mid-work → reference.
- Wants to understand tradeoffs before deciding → explanation.

**Worked example.** "Authentication" often needs three pages, not one: a *tutorial* that walks a newcomer through their first authenticated call; a *reference* listing every auth method, scope, token lifetime, and error code; and an *explanation* of the auth model and its threat assumptions. One page trying to be all three serves none well.

Signs you have mixed types: a tutorial with a giant parameter table; a reference page with encouraging asides ("Great, now let's..."); a how-to that pauses to explain architecture. Move the mismatched content to the page whose type it fits, and link between them.

Parallel structure within a type helps: every API method reference page should share one shape (Description → Parameters → Returns → Errors → Example) so readers navigate by muscle memory.
