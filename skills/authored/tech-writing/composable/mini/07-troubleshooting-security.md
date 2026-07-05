---
pairs-with:
  - code-review/02-security-review.md
---

# Troubleshooting & Security Docs

**Troubleshooting** is organized by *symptom*, not by cause: the reader knows what they see, not why it happens. Structure each entry:

1. **Symptom**: the exact error message or observed behavior, quoted verbatim so it is searchable.
2. **Cause**: what produces it.
3. **Fix**: the steps to resolve it.
4. **Confirm**: how to verify it is actually fixed.

Include the literal error text; users paste error strings into search engines and your page's search box. Order entries by frequency (most common first). Add a "still stuck?" escape hatch: where to file an issue and which diagnostics (logs, version, config) to attach.

**Worked example:**
> **Symptom:** `Error: ECONNREFUSED 127.0.0.1:5432`
> **Cause:** The database isn't running, or the port is wrong.
> **Fix:** Start the database (`docker compose up db`) and confirm `DB_PORT` matches. **Confirm:** `psql -h localhost -p 5432` connects.

**Security documentation** demands extra precision, because mistakes here are costly:
- Be explicit and unambiguous: no "should probably." State exactly what is and isn't protected.
- **Never show real secrets, tokens, or private keys.** Use obvious placeholders (`YOUR_API_KEY`, `sk_test_...`). Warn readers against committing secrets to version control.
- Document the secure default, and clearly flag any insecure convenience option ("do not use in production").
- Separate "how to configure securely" (a how-to) from "our security model / threat model" (an explanation).
- Give a responsible-disclosure contact and a supported-versions policy.
- State the blast radius of permissions and tokens: their scope, lifetime, and how to revoke them.

**Common failures:** troubleshooting organized by internal component instead of user-visible symptom (readers can't map their error to your architecture); paraphrased error messages that don't match what users actually see; security examples containing real-looking keys that get copy-pasted into production; and vague hedging ("this is generally secure") that leaves the reader unable to make a safe decision. Precision and searchability are the whole game in both doc types.
