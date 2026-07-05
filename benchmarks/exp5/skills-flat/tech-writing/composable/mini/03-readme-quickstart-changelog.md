
# README, Quickstart, Changelog & Release Notes

**README** — a landing page and router, not a manual. Order: one-sentence description of what this is and who it is for; a short "why/what" paragraph; minimal install; a **60-second quickstart** that produces a visible result; then links out to deeper docs. Put the single most impressive working example above the fold. Badges and tables of contents come *after* value is demonstrated, not before. A reader should learn what the thing is and see it work within the first screen.

**Quickstart** — the shortest path from zero to a first success, ideally under 5 minutes. List prerequisites up front as a checklist. Every step is copy-pasteable and idempotent where possible. End with a concrete checkpoint ("you should now see X") and exactly one clear next step. Cut every optional detail and link it instead; a quickstart that branches has failed at being quick.

**Changelog vs release notes** — two artifacts for two audiences; do not conflate them.
- A **changelog** is terse, chronological, developer-facing. Group entries per version as Added / Changed / Deprecated / Removed / Fixed / Security (the Keep a Changelog convention). Each entry is one line stating what changed.
- **Release notes** are narrative and user-facing. Lead with the headline value ("Exports are now 10x faster"), explain impact, and call out breaking changes prominently.

Both must be **newest first, dated, with a stable version identifier**. Never make a reader diff two versions to discover what changed — that is the changelog's entire job.

**Worked example — a changelog entry vs a release note for the same change:**
- Changelog: `### Changed` / `- \`export()\` now streams results instead of buffering (#412).`
- Release note: "Large exports no longer run out of memory. `export()` now streams, so multi-gigabyte reports complete reliably. No code change needed unless you relied on the full result being in memory at once — see [migration]."

Common failures: a README that explains philosophy before showing the tool work; a quickstart padded with configuration options; release notes that bury a breaking change in a bullet list. Fix each by ruthlessly front-loading the reader's payoff and pushing detail to linked reference pages.
