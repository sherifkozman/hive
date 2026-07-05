# envlock

Encrypt your `.env` files, commit them safely, and share secrets with your team without ever pasting them into Slack.

## What is envlock, and who is it for

envlock is a command-line secrets manager for `.env` files. It encrypts the values in your environment files using [age](https://age-encryption.org/) (X25519), so you can commit `.env.enc` to version control instead of `.gitignore`-ing your secrets and emailing them around. Anyone on your team with the right key can decrypt the file or run your app directly against the decrypted values — without a plaintext file ever touching disk.

You want envlock if:
- You currently share `.env` files over Slack, email, or a shared doc.
- You've ever committed a real API key by accident.
- You want new team members to get working credentials in one command instead of a manual handoff.

This guide assumes you have a terminal open, a project with a `.env` file, and (for team features) the email addresses of teammates you want to share with.

## Quickstart (under 5 minutes)

**Prerequisites:**
- macOS, Linux, or WSL
- An existing `.env` file in your project

**1. Install envlock.**

```
brew install envlock
```

Or, without Homebrew:

```
curl -sSf https://envlock.dev/install.sh | sh
```

**2. Initialize envlock in your project.**

```
envlock init
```

This generates your age keypair in `~/.envlock/` and creates a `.envlock.toml` config file in your project, listing you as a recipient.

**3. Encrypt your `.env` file.**

```
envlock encrypt .env
```

This produces `.env.enc`. Commit `.env.enc` to version control. Do not commit the original `.env` — add it to `.gitignore` now if it isn't already there.

**4. Run your app with decrypted secrets.**

```
envlock run -- npm start
```

envlock decrypts your secrets in memory and injects them as environment variables into `npm start`. No plaintext file is written to disk at any point.

**Checkpoint:** your app is running with the same environment variables that were in your original `.env`, and the only file on disk is the encrypted `.env.enc`.

**Next step:** read [Team onboarding](#team-onboarding) to add a teammate as a recipient.

## Command reference

### `envlock init`

Initializes envlock for the current project.

- Generates an age (X25519) keypair and stores it in `~/.envlock/`, if one doesn't already exist.
- Creates a `.envlock.toml` file in the current directory with you as the sole recipient.

**Example:**
```
envlock init
```

### `envlock encrypt <file>`

Encrypts `<file>` to `<file>.enc` using age, targeting every recipient listed in `.envlock.toml`.

- The plaintext file is left untouched on disk — add it to `.gitignore` yourself.
- Re-running `encrypt` on the same file overwrites the existing `.enc` file with a fresh ciphertext for the current recipient list.

**Example:**
```
envlock encrypt .env
# writes .env.enc
```

### `envlock decrypt <file>`

Decrypts `<file>` (an `.enc` file) to plaintext on disk, using your private key in `~/.envlock/`.

- Fails with exit code 3 and `file is not encrypted` if you point it at a file that is already plaintext. See [Troubleshooting](#troubleshooting--faq).

**Example:**
```
envlock decrypt .env.enc
# writes .env
```

### `envlock run -- <cmd>`

Decrypts your secrets in memory and runs `<cmd>` with them injected as environment variables. Never writes plaintext to disk.

Use this instead of `decrypt` whenever you just need your app to have the right environment — it's the safer default for day-to-day development.

**Example:**
```
envlock run -- npm start
envlock run -- python manage.py runserver
```

### `envlock share <email>`

Adds `<email>` as a recipient: their public age key is added to the recipients list in `.envlock.toml`, and any encrypted files are re-encrypted so they can decrypt them.

- The teammate must already have run `envlock init` at least once (locally or via your key server, per your team's setup) so their public key is available to add.

**Example:**
```
envlock share alex@example.com
```

### `envlock rotate`

Rotates encryption: generates fresh ciphertext for all tracked `.enc` files under the current recipients list, without changing anyone's keys.

Run this after removing a recipient, or periodically as a security practice, so that old ciphertext (which a removed teammate's key could still open) is replaced.

**Example:**
```
envlock rotate
```

## Team onboarding

Follow this once per new team member, after they've installed envlock (see [Quickstart](#quickstart-under-5-minutes)).

1. **New teammate runs `envlock init`** on their own machine. This generates their personal keypair in `~/.envlock/` — it never leaves their machine.
2. **New teammate sends you their public key or email**, per your team's key-distribution process (a public key is safe to paste anywhere — Slack, email, a PR comment).
3. **You run `envlock share <their-email>`** in the project directory. This adds them to `.envlock.toml` and re-encrypts existing `.enc` files so they can decrypt them.
4. **Commit the updated `.envlock.toml` and `.enc` files.** The new teammate can now pull the repo and run `envlock run -- <cmd>` immediately — no secrets were ever sent directly.
5. **When someone leaves the team, remove them from `.envlock.toml` and run `envlock rotate`.** This is required — simply deleting their line doesn't invalidate ciphertext they already have a key for.

**Checklist for a new project:**
- [ ] `envlock init` run once by the project creator
- [ ] `.env` encrypted, `.env.enc` committed, `.env` gitignored
- [ ] Each teammate has run `envlock init` and shared their public key
- [ ] Each teammate added via `envlock share`

## Security model

envlock encrypts your `.env` files using [age](https://age-encryption.org/) with X25519 (Curve25519 key exchange). This section describes what is and isn't protected.

**What's protected:**
- Files encrypted with `envlock encrypt` are unreadable without a private key belonging to a recipient in `.envlock.toml`.
- `envlock run` decrypts secrets in memory only and injects them into the child process's environment. Plaintext is never written to disk during this flow.

**What's not protected:**
- Your private key, stored unencrypted in `~/.envlock/`. Anyone with access to that directory (or a backup of it) can decrypt everything you're a recipient on. Treat `~/.envlock/` like an SSH key directory: don't back it up to shared or untrusted storage, and don't commit it.
- The running process started by `envlock run` — its environment variables are visible to anything with equivalent OS-level access to that process (e.g., `/proc/<pid>/environ` on Linux, or a process inspector). envlock protects secrets at rest and in transit, not from a compromised machine or a malicious co-located process.
- Files you decrypt with `envlock decrypt`. Once written to disk as plaintext, they're an ordinary file — delete them when you're done, and keep them out of version control.

**Key scope and revocation:**
- Recipients are scoped per-project, via the recipients list in `.envlock.toml`. Being a recipient on one project's `.envlock.toml` grants no access to any other project.
- Removing someone from `.envlock.toml` stops future encryptions from targeting their key, but does **not** revoke their ability to decrypt ciphertext they already have. Run `envlock rotate` immediately after removing a recipient to re-encrypt all tracked files, and treat the situation as urgent if the departure was not voluntary.

**Secure defaults:**
- `envlock encrypt` and `envlock run` are the recommended day-to-day commands. `envlock decrypt` produces plaintext on disk and should be used sparingly — prefer `envlock run` wherever you're launching a process rather than inspecting a file by hand.
- Never commit an unencrypted `.env`. Never commit anything from `~/.envlock/`.

If you discover a security issue in envlock itself, report it to the maintainers rather than filing a public issue.

## Troubleshooting & FAQ

### Troubleshooting

**Symptom:** `Error: file is not encrypted` (exit code 3)
**Cause:** You ran `envlock decrypt` on a file that's already plaintext — most often because you ran `decrypt` twice, or pointed it at a `.env` instead of a `.env.enc`.
**Fix:** Confirm which file you meant to decrypt. If you already have the plaintext you need, no action is required. If you meant to decrypt the encrypted version, run `envlock decrypt .env.enc` (check the exact filename with `ls`).
**Confirm:** The command exits 0 and the target file's contents are readable plaintext.

**Symptom:** A teammate can't decrypt a file you just shared with them.
**Cause:** Either they haven't run `envlock init` yet (no keypair to add), or the `.envlock.toml` / re-encrypted `.enc` files from your `envlock share` weren't committed and pulled.
**Fix:** Confirm they've run `envlock init`. Confirm you ran `envlock share <their-email>` and committed both `.envlock.toml` and the updated `.enc` files. Have them pull the latest commit.
**Confirm:** `envlock run -- <cmd>` succeeds on their machine.

**Symptom:** `envlock run` starts your process but a variable you expect is missing.
**Cause:** The variable isn't in the `.env` file that was encrypted, or you encrypted an older version of `.env` before adding it.
**Fix:** Add the variable to your local `.env`, then re-run `envlock encrypt .env` to refresh `.env.enc`, and commit the result.
**Confirm:** `envlock run -- env` (or your shell's equivalent) lists the variable.

**Still stuck?** File an issue with your envlock version (`envlock --version`), OS, and the exact error text. Don't attach your `.envlock.toml` recipients list or any `.enc` file unless you're sure it contains no secrets you want to keep private — the ciphertext itself is safe to share, but check with your team first.

### FAQ

**Do I still need `.gitignore` for `.env`?**
Yes. envlock encrypts `.env` into `.env.enc`; it doesn't make the original plaintext `.env` safe to commit. Keep `.env` in `.gitignore` and commit only `.env.enc`.

**Can I use envlock without a team — just for myself?**
Yes. `envlock init` and `envlock encrypt` work for a single user; `share` and multi-recipient rotation only matter once you add teammates.

**What happens if I lose my private key?**
You lose the ability to decrypt files you were a recipient on. Anyone else already listed in `.envlock.toml` can re-run `envlock share` for a new key you generate, after you `envlock init` again. There is no recovery mechanism for a lost key by design — that's what makes it a private key.

**Does `envlock run` ever write plaintext to disk?**
No. It decrypts secrets in memory and injects them into the child process's environment only. Use `envlock decrypt` if you specifically need a plaintext file, and clean it up afterward.

**Can I encrypt files other than `.env`?**
Yes — `envlock encrypt <file>` works on any file; it's commonly used for `.env` but isn't limited to that name or format.

LOADED: INDEX.md, 01-audience-analysis.md, 02-document-types.md, 03-readme-quickstart-changelog.md, 04-information-architecture.md, 05-style-clarity.md, 07-troubleshooting-security.md, 08-faq-voice-tone.md
