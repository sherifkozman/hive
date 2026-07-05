
# Writing About Breaking Changes & Migrations

This is where docs most often fail users, and where care matters most. A breaking change poorly documented turns into hours of user debugging and a flood of support requests.

**Rules:**
- **Announce loudly and early.** Breaking changes get a prominent, unmissable callout in release notes — not a buried bullet. State the exact version where the break lands.
- **Say what breaks, and for whom.** "If you call `parse()` with a string, it now throws" — name the exact API, the exact condition, and who is affected. A reader should determine in seconds whether they are impacted.
- **Always give the migration path.** A breaking change without a migration guide is a broken promise. Provide before/after code side by side. If migration can be automated (codemod, script), lead with that.
- **Explain the why, briefly.** One sentence of rationale reduces anger and support load: "We changed this to prevent silent data loss."
- **State deprecation timelines.** Deprecated ≠ removed. Give the deprecation version, the planned removal version, and the recommended replacement. Keep deprecation warnings in the docs until removal is complete.

**Migration guide skeleton:**
1. *What changed*
2. *Who is affected*
3. *Before / after examples*
4. *Step-by-step migration*
5. *How to verify you migrated correctly*
6. *Rollback / fallback if it goes wrong*

**Worked micro-example (a release-note callout):**
> **Breaking (v3.0):** `client.fetch()` no longer accepts a callback. Passing a function as the second argument now throws `TypeError`.
> **Migrate:** `client.fetch(url, cb)` → `client.fetch(url).then(cb)`. See the [async migration guide].

**Deprecation example:**
> **Deprecated (v2.4):** `config.legacyMode` is deprecated and will be removed in v4.0. Use `config.compatibility` instead. Calls still work in v2.x and v3.x but log a warning.

Common failures to avoid: listing a breaking change with no fix; using vague language ("some APIs have changed") instead of naming them; removing something that was never formally deprecated; or hiding the break inside a long changelog where impacted users scroll past it. Every breaking change should be findable, understandable, and actionable within a minute of a reader landing on the release notes.
