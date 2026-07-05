# Task: tech-writing / BROAD

Write the complete user-facing documentation for a fictional CLI tool
`envlock` — a secrets manager for .env files. Facts you must work from
(invent nothing that contradicts these; fill small gaps sensibly):

- Commands: `envlock init`, `envlock encrypt <file>`, `envlock decrypt <file>`,
  `envlock run -- <cmd>` (runs cmd with decrypted env injected),
  `envlock share <email>`, `envlock rotate`.
- Encryption: age (X25519), keys stored in `~/.envlock/`; team sharing via
  recipients list in `.envlock.toml`.
- Install: `brew install envlock` or `curl -sSf https://envlock.dev/install.sh | sh`.
- `envlock run` never writes plaintext to disk.
- Common failure: running `decrypt` on an already-decrypted file exits 3 with
  "file is not encrypted".

Deliver ONE Markdown document containing: a README-style overview with value
proposition, quickstart (under 5 minutes to first success), full command
reference, a team-onboarding guide, a security model section, and a
troubleshooting/FAQ section. Audience: developers who have never used it.
