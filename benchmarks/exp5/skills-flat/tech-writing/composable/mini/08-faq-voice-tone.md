
# FAQ Design, Voice & Tone

## FAQ design

FAQs are a last resort and a symptom, not a strategy. A "frequently asked question" usually means the primary docs failed to answer it in the right place — the durable fix is to answer it *there*, on the relevant page. Use an FAQ only for genuinely cross-cutting questions that don't belong to any single page: licensing, pricing, "is X supported," "how does this compare to Y."

Rules:
- Phrase each entry as the reader's *actual question in their words* ("Can I use this offline?"), not marketing framing ("Does our robust platform support disconnected operation?").
- Keep answers short and link to the authoritative page rather than duplicating content.
- Group by theme; order by frequency.
- Prune ruthlessly. If an FAQ grows past ~15 entries, the underlying docs need restructuring, not a longer FAQ.
- Never let the FAQ become the only place a fact lives — that fact belongs on a real page.

## Voice and tone

**Voice** is constant — your product's personality. **Tone** flexes with the reader's emotional state. Calibrate tone to context:
- Routine how-to: neutral, efficient, confident.
- Error messages and troubleshooting: calm, blame-free, helpful — never cute when a user is frustrated. No jokes on error pages.
- Onboarding: warmer, more encouraging.

**Worked example — same information, tone tuned to context:**
- Success/onboarding: "Nice — your first deploy is live. Next, add a custom domain."
- Error state: "The deploy failed because the build step exited with code 1. Check the build log below, then retry." (No "oops!", no exclamation, no blame on the user.)

Universal rules: be respectful and inclusive — avoid "simply/just," avoid idioms that don't translate, avoid ableist or exclusionary metaphors. Be consistent: pick and enforce conventions in a style guide (capitalization, Oxford comma, "email" vs "e-mail," how you name the product). Write for a global audience with short sentences and common words, and spell out ambiguous dates (2026-07-05).

The test: read your error and troubleshooting copy imagining the reader is stressed and behind schedule. If any word would irritate that reader — a "simply," a joke, a shrug — cut it. Tone failures do the most damage exactly when the reader most needs help.
