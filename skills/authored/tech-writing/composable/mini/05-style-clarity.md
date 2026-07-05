---
pairs-with:
  - 08-faq-voice-tone.md
---

# Style & Clarity Rules

Concrete, enforceable rules, not "write clearly."

1. **Second person, imperative, active voice.** "Run `npm install`," not "The user should run" or "npm install is run." Address the reader as "you."
2. **Present tense** for behavior. "The endpoint returns 200," not "will return."
3. **One instruction per numbered step.** If a step contains "and," consider splitting. Number sequential actions; bullet unordered options.
4. **Lead sentences with the point.** Put the keyword first so scanners catch it: "To reset your password, open Settings" beats the reverse.
5. **Cut hedges and filler.** Delete "simply," "just," "easy," "obviously," "of course": they shame stuck readers and add nothing. Replace "in order to" → "to," "at this point in time" → "now," "utilize" → "use."
6. **Define each term on first use, then use it consistently.** Never call one thing "app," "service," and "instance" across three paragraphs. One term per concept.
7. **Format for meaning.** Code, filenames, commands, and literal UI labels in monospace; UI navigation in **bold**. Never wrap prose in code font for emphasis.
8. **Show, then tell.** Pair every abstract instruction with a concrete example. A working snippet is worth three sentences of description.
9. **Prefer specifics over vagueness.** "Wait about 30 seconds" beats "wait a while." "Returns up to 100 items" beats "returns several."

**Before/after:** *"It should be noted that in order to utilize the API, users will need to first obtain an authentication token."* → *"To use the API, first get an auth token."* (24 words → 9, identical meaning.)

**More edits:**
- "This functionality provides users with the ability to filter." → "You can filter results."
- "The system will automatically perform validation of the input." → "The system validates the input."
- "In the event that the request fails..." → "If the request fails..."

**Write for a global audience.** Short sentences, common words, no region-specific slang or idioms. Spell out ambiguous dates (2026-07-05, not 07/05/26). Enforce one style guide (capitalization, Oxford comma, product name) so the whole doc set reads as one voice.

Above all: **accuracy beats polish.** An inaccurate doc is worse than none: it destroys trust in the entire doc set. Test every command and code sample before publishing.
