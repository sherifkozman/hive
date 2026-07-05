# Technical & Product Writing

Expert guidance for producing documentation that developers, operators, and end users actually succeed with. Covers audience analysis, document types, information architecture, style, breaking-change/migration writing, security and troubleshooting docs, FAQ design, and voice/tone.

## 1. Start with audience and job-to-be-done

Never write a doc until you can name (a) the reader, (b) the task they are mid-way through, and (c) what "done" looks like for them. Documentation is read by people under load — mid-incident, mid-integration, mid-evaluation — not studied leisurely.

Segment readers by three axes:
- **Expertise**: novice to the tool vs. expert who just needs the flag name. Novices need concepts and orientation; experts need a searchable reference and copy-paste snippets. Do not force an expert through a tutorial to find one parameter.
- **Goal**: evaluating (should I adopt this?), integrating (make it work now), operating (keep it running), debugging (why did it break?). Each goal wants a different document type.
- **Context of use**: at a terminal, on a phone during an incident, in a procurement meeting. Context dictates length, scannability, and where the answer must appear.

Worked example: a "How do I authenticate?" question comes from at least two readers. The evaluator wants to know *which* auth methods exist and their tradeoffs (one paragraph, a table). The integrator wants a working request *right now* (a labeled code block with a real-looking token). Answer both, in that order, and label them so each reader skips to their part.

Write down assumed prior knowledge explicitly at the top ("This guide assumes you have a running cluster and kubectl configured"). Unstated assumptions are the single largest cause of doc failure — the reader hits an undocumented prerequisite, gets stuck, and blames the product. Practical habits: write a one-line reader statement before drafting ("For an integrator who already has an API key and wants their first successful call"); list prerequisites as an up-front checklist, not scattered inline; and prefer specifics the reader can check ("you need Node 18+") over vague reassurance ("recent Node"). The audience decision drives every later choice — document type, structure, tone, depth — so getting it wrong makes even flawless prose fail, because it answers a question the reader did not ask.

## 2. Choose the right document type

Different reader goals map to distinct, non-interchangeable document types. Mixing them in one page is the most common structural mistake. The four canonical types:

- **Tutorial** (learning-oriented): a guided, guaranteed-to-succeed lesson for a newcomer. Linear, opinionated, one happy path, no alternatives, no error branches. Success = the reader built something and feels competent.
- **How-to / task guide** (problem-oriented): steps to accomplish a specific real-world task the reader already knows they need. Assumes competence. May list variations. Success = task completed.
- **Reference** (information-oriented): exhaustive, accurate description of the machinery — every parameter, return value, error code, config key. Dry, consistent, austere. Success = the reader found the exact fact and trusts it.
- **Explanation / concept** (understanding-oriented): the why — architecture, tradeoffs, mental models. Read away from the keyboard. Success = the reader understands and can reason about edge cases.

Keep these separate. A reference page cluttered with tutorial hand-holding frustrates experts; a tutorial padded with reference tables loses novices. When a page feels muddled, it is usually two types fighting — split it. To tell them apart in practice, ask what the reader is doing: learning the tool for the first time → tutorial; has a specific job to finish → how-to; needs a precise fact mid-work → reference; wants to understand tradeoffs before deciding → explanation.

Worked example: "Authentication" often needs three pages, not one. A *tutorial* walks a newcomer through their first authenticated call; a *reference* lists every auth method, scope, token lifetime, and error code; an *explanation* covers the auth model and its threat assumptions. One page trying to be all three serves none well. Signs you have mixed types: a tutorial with a giant parameter table, a reference page with encouraging asides ("Great, now let's..."), or a how-to that pauses to explain architecture. Move the mismatched content to the page whose type it fits, and link between them.

### README
A README is a landing page and router, not a manual. In order: one-sentence description of what this is and who it is for; a "why/what" paragraph; minimal install; a **60-second quickstart** that produces a visible result; then links out to deeper docs. Put the single most impressive working example above the fold. Badges and tables of contents come after the value is demonstrated, not before.

### Quickstart
Goal: shortest path from zero to a first success, ideally under 5 minutes. Prerequisites listed up front as a checklist. Every step is copy-pasteable and idempotent where possible. End with a concrete "you should now see X" checkpoint and one clear next step. Cut every optional detail; link it instead.

### Changelog / release notes
Two different artifacts for two audiences. A **changelog** is terse, chronological, developer-facing (grouped Added/Changed/Deprecated/Removed/Fixed/Security per Keep a Changelog). **Release notes** are narrative, user-facing: lead with headline value, explain impact, call out breaking changes prominently. Always: newest first, dated, with a stable version identifier. Never make readers diff two versions to learn what changed — that is the changelog's entire job.

Worked example of the same change written for each artifact:
- Changelog: `### Changed` / `- \`export()\` now streams results instead of buffering (#412).`
- Release note: "Large exports no longer run out of memory. `export()` now streams, so multi-gigabyte reports complete reliably. No code change needed unless you relied on the full result being in memory at once — see [migration]."

Common failures: a README that explains philosophy before showing the tool work; a quickstart padded with configuration options; release notes that bury a breaking change in a bullet list. Fix each by ruthlessly front-loading the reader's payoff and pushing detail to linked reference pages.

## 3. Information architecture

- **One page, one job.** If a page answers more than one reader question, split it.
- **Front-load the answer.** Inverted pyramid: conclusion/result first, then detail, then background. Readers scan the first line of each section and bail early.
- **Make it scannable.** Descriptive headings that state the task ("Rotate an API key") not vague nouns ("Keys"). A reader scanning the table of contents should be able to predict exactly what each page contains.
- **Progressive disclosure.** Common case in the main flow; rare cases, flags, and caveats in collapsible sections, footnotes, or linked pages. Don't tax the 90% to serve the 10%.
- **Parallel structure.** Sibling sections should share shape (e.g., every API method page: Description → Parameters → Returns → Errors → Example). Predictability lets readers navigate by muscle memory.
- **Link deliberately.** Link the first mention of a concept to its explanation. Don't bury a required prerequisite as an inline link mid-sentence — call it out as a prerequisite block.

Worked example: a page titled "Configuration" that dumps 40 settings alphabetically forces every reader to scan all of them. Restructure: lead with the 3 settings 90% of users change in a short "Common configuration" section; move the full list to a reference table below or on a linked page; give each setting a task-oriented sub-heading where relevant ("Increase the request timeout"). Good architecture is invisible — the reader lands on the right page, sees the answer at the top, and leaves. Bad architecture makes readers hunt, and hunting readers file support tickets or give up.

Checklist for a doc set: Can a reader find the right page in one guess from the nav? Does each page declare its audience and prerequisites? Is there exactly one canonical page per topic (no competing half-answers)? Does every page front-load its most important information, and are sibling pages structurally parallel?

## 4. Style and clarity rules

Concrete, enforceable rules — not "write clearly":

1. **Second person, imperative, active voice.** "Run `npm install`," not "The user should run" or "npm install is run." Address the reader as "you."
2. **Present tense** for how things behave. "The endpoint returns 200," not "will return."
3. **One instruction per numbered step.** If a step has an "and," consider splitting. Number sequential actions; bullet unordered options.
4. **Lead sentences with the point.** Put the keyword first so scanners catch it: "To reset your password, open Settings" beats "Open Settings, which you can find in order to reset your password."
5. **Cut hedges and filler.** Delete "simply," "just," "easy," "obviously," "of course" — they shame stuck readers and add nothing. Delete "in order to" → "to," "at this point in time" → "now," "utilize" → "use."
6. **Define the term on first use**, then use it consistently. Never call the same thing "app," "service," and "instance" across three paragraphs. Maintain a term-per-concept discipline.
7. **Format for meaning.** Code, filenames, commands, and literal UI labels in monospace; UI navigation in **bold**. Never wrap prose in code font for emphasis.
8. **Show, then tell.** Precede or follow every abstract instruction with a concrete example. A working snippet is worth three sentences of description.
9. **Prefer specifics over vagueness.** "Wait about 30 seconds" beats "wait a while." "Returns up to 100 items" beats "returns several."

Before/after: *"It should be noted that in order to utilize the API, users will need to first obtain an authentication token."* → *"To use the API, first get an auth token."* (24 words → 9, same meaning.)

More edits worth internalizing:
- "This functionality provides users with the ability to filter." → "You can filter results."
- "The system will automatically perform validation of the input." → "The system validates the input."
- "In the event that the request fails..." → "If the request fails..."

Above all, **accuracy beats polish**: test every command and code sample before publishing, because an inaccurate doc is worse than none — it destroys trust in the entire set.

## 5. Writing about breaking changes and migrations

This is where docs most often fail users, and where care matters most.

- **Announce loudly and early.** Breaking changes get a prominent, unmissable callout in release notes — not a buried bullet. State the version where the break lands.
- **Say what breaks, for whom.** "If you call `parse()` with a string, it now throws" — name the exact API, the exact condition, and who is affected. Let a reader determine in seconds whether they are impacted.
- **Always give the migration path.** A breaking change without a migration guide is a broken promise. Provide before/after code side by side. If migration can be automated (codemod, script), lead with that.
- **Explain the why briefly.** One sentence of rationale reduces anger and support load. "We changed this to prevent silent data loss."
- **State the timeline for deprecations.** Deprecated ≠ removed. Give the deprecation version, the removal version, and the recommended replacement. Keep deprecation warnings in the docs until removal is complete.

Migration guide skeleton: *What changed* → *Who is affected* → *Before/after examples* → *Step-by-step migration* → *How to verify you migrated correctly* → *Rollback/fallback if it goes wrong*.

Worked micro-example callout:
> **Breaking (v3.0):** `client.fetch()` no longer accepts a callback. Passing a function as the second argument now throws `TypeError`.
> **Migrate:** `client.fetch(url, cb)` → `client.fetch(url).then(cb)`. See the [async migration guide].

Deprecation example:
> **Deprecated (v2.4):** `config.legacyMode` is deprecated and will be removed in v4.0. Use `config.compatibility` instead. Calls still work in v2.x and v3.x but log a warning.

Common failures to avoid: listing a breaking change with no fix; using vague language ("some APIs have changed") instead of naming them; removing something that was never formally deprecated; or hiding the break inside a long changelog where impacted users scroll past it.

## 6. Troubleshooting and security docs

**Troubleshooting** is organized by *symptom*, not by cause — the reader knows what they see, not why. Structure each entry: **Symptom** (the exact error message or observed behavior, verbatim so it's searchable) → **Cause** → **Fix** → **How to confirm it's fixed**. Include the literal error text; users paste error strings into search. Order entries by frequency. Add a "still stuck?" escape hatch (where to file an issue, what diagnostics to attach).

Worked example:
> **Symptom:** `Error: ECONNREFUSED 127.0.0.1:5432`
> **Cause:** The database isn't running, or the port is wrong.
> **Fix:** Start the database (`docker compose up db`) and confirm `DB_PORT` matches. **Confirm:** `psql -h localhost -p 5432` connects.

Common troubleshooting failures: organizing by internal component instead of user-visible symptom (readers can't map their error to your architecture), and paraphrasing error messages so they don't match what users actually see.

**Security documentation** demands extra precision because mistakes are costly:
- Be explicit and unambiguous — no "should probably." State exactly what is and isn't protected.
- Never show secrets, real tokens, or private keys in examples; use obvious placeholders (`YOUR_API_KEY`, `sk_test_...`). Warn against committing secrets.
- Document the secure default and clearly flag any insecure convenience option ("do not use in production").
- Separate "how to configure securely" from "our security model/threat model." Give a responsible-disclosure contact and the supported-versions policy.
- State the blast radius of permissions and tokens: scope, lifetime, revocation.

## 7. FAQ design

FAQs are a last resort and a symptom, not a strategy. A "frequently asked question" often means the primary docs failed to answer it in the right place — the durable fix is to answer it *there*. Use an FAQ only for genuinely cross-cutting questions that don't belong on any single page (licensing, pricing, "is X supported," "how does this compare to Y").

Rules: phrase each entry as the *reader's actual question in their words* ("Can I use this offline?") not marketing framing. Keep answers short and link to the authoritative page. Group by theme, order by frequency. Ruthlessly prune: if an FAQ grows past ~15 entries, the underlying docs need restructuring. Never let the FAQ become the only place a fact lives.

## 8. Voice and tone

**Voice** is constant (your product's personality); **tone** flexes with the reader's emotional state. Calibrate tone to context:
- Routine how-to: neutral, efficient, confident.
- Error messages and troubleshooting: calm, blame-free, helpful — never cute when a user is frustrated. Avoid jokes on error pages.
- Onboarding/marketing-adjacent: warmer, more encouraging.

Worked example — same information, tone tuned to context:
- Success/onboarding: "Nice — your first deploy is live. Next, add a custom domain."
- Error state: "The deploy failed because the build step exited with code 1. Check the build log below, then retry." (No "oops!", no exclamation, no blame on the user.)

Universal rules: be respectful and inclusive (avoid "simply/just," avoid idioms that don't translate, avoid ableist or exclusionary metaphors). Be consistent — pick and enforce conventions in a style guide (capitalization, Oxford comma, "email" vs "e-mail," how you refer to the product). Write for a global audience: short sentences, common words, no region-specific slang, spell out ambiguous dates (2026-07-05, not 07/05/26). The test: read your error and troubleshooting copy imagining the reader is stressed and behind schedule. If any word would irritate that reader — a "simply," a joke, a shrug — cut it. Tone failures do the most damage exactly when the reader most needs help.

## 9. Quality checklist before publishing

- Audience, prerequisites, and assumed knowledge stated up front.
- Right document type for the reader's goal; types not mixed.
- Most important information first; headings are task-descriptive and scannable.
- Every code sample is complete, correct, and copy-pasteable; every command tested.
- Placeholders obvious; no real secrets.
- Breaking changes flagged with migration paths; deprecations dated.
- No "simply/just/obviously"; active voice, present tense, second person.
- One term per concept, used consistently.
- Every claim is accurate — an inaccurate doc is worse than none, because it destroys trust in the whole set.
