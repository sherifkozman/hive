# envlock

**Encrypted `.env` files, safe to commit, easy to share.**

`envlock` is a small command-line tool that encrypts your `.env` files so you can commit them straight into version control, share secrets with teammates without pasting them into Slack or 1Password, and run your app locally with real secrets injected in memory — never written to disk in plaintext.

---

## Table of Contents

- [Why envlock](#why-envlock)
- [Quickstart (under 5 minutes)](#quickstart-under-5-minutes)
- [Command Reference](#command-reference)
  - [`envlock init`](#envlock-init)
  - [`envlock encrypt`](#envlock-encrypt-file)
  - [`envlock decrypt`](#envlock-decrypt-file)
  - [`envlock run`](#envlock-run----cmd)
  - [`envlock share`](#envlock-share-email)
  - [`envlock rotate`](#envlock-rotate)
- [Team Onboarding Guide](#team-onboarding-guide)
- [Security Model](#security-model)
- [Troubleshooting / FAQ](#troubleshooting--faq)

---

## Why envlock

Every team eventually hits the same problem: `.env` files hold real secrets (API keys, database URLs, tokens), so they can't be committed to git — but keeping them out of git means they get passed around by hand, dropped in DMs, or silently drift out of sync between teammates' machines.

`envlock` solves this by encrypting your `.env` files in place:

- **Commit secrets safely.** Encrypted `.env` files are unreadable ciphertext. Check them into your repo like any other file.
- **No shared master password.** `envlock` uses modern asymmetric encryption (age/X25519), so adding or removing a teammate's access never requires rotating a shared secret that everyone knows.
- **Plaintext never touches disk when you run your app.** `envlock run -- <cmd>` decrypts secrets into memory and injects them as environment variables for a single command's lifetime — no temp files, no cleanup step to forget.
- **Fits your existing workflow.** One TOML file (`.envlock.toml`) tracks who has access. Everything else is your normal git flow: clone, pull, run.

If you've ever seen a `.env.example` file that's perpetually out of date, or had to re-send a teammate a `.env` over Slack after they got a new laptop, `envlock` is for you.

---

## Quickstart (under 5 minutes)

### 1. Install

**macOS (Homebrew):**

```bash
brew install envlock
```

**Linux / macOS (install script):**

```bash
curl -sSf https://envlock.dev/install.sh | sh
```

Verify it installed:

```bash
envlock --version
```

### 2. Initialize your project

From your project root (wherever your `.env` file lives):

```bash
envlock init
```

This generates your personal age (X25519) keypair, stores it under `~/.envlock/`, and creates a `.envlock.toml` file in the current directory listing you as the first recipient.

### 3. Encrypt your `.env` file

```bash
envlock encrypt .env
```

This produces `.env.age` (the encrypted version). Commit `.env.age` and `.envlock.toml` to git. Add your plaintext `.env` to `.gitignore` — it should never be committed.

```bash
echo ".env" >> .gitignore
git add .env.age .envlock.toml .gitignore
git commit -m "Add encrypted environment secrets"
```

### 4. Run your app with decrypted secrets

No need to manually decrypt to a file. Just wrap your normal start command:

```bash
envlock run -- npm start
```

`envlock` decrypts `.env.age` in memory and injects the resulting variables into the environment of `npm start`. Nothing plaintext ever hits disk.

**That's it — you're up and running.** Your secrets are encrypted at rest, safe to commit, and available to your app on demand.

---

## Command Reference

### `envlock init`

Initializes `envlock` for the current project and/or the current user.

```bash
envlock init
```

What it does:

- Generates an age (X25519) keypair for the current user, if one doesn't already exist in `~/.envlock/`.
- Creates a `.envlock.toml` file in the current directory (if one doesn't already exist), listing the current user as a recipient.
- Safe to re-run: running `init` again will not overwrite an existing keypair or `.envlock.toml`.

**Files touched:**

| Path | Purpose |
|---|---|
| `~/.envlock/identity.key` | Your private key (X25519). Never shared, never committed. |
| `~/.envlock/identity.pub` | Your public key. Shared with the team via `.envlock.toml`. |
| `.envlock.toml` | Per-project recipients list (public keys of everyone with access). |

---

### `envlock encrypt <file>`

Encrypts a plaintext file using age, targeting every recipient listed in `.envlock.toml`.

```bash
envlock encrypt .env
```

- Input: a plaintext file (commonly `.env`, but any file works — e.g. `.env.production`).
- Output: `<file>.age` (e.g. `.env.age`), written alongside the original.
- The plaintext file is left untouched on disk — `envlock` does not delete it automatically. Keep it out of git via `.gitignore`.
- If `.envlock.toml` has no recipients, `encrypt` will refuse to run — see [Troubleshooting](#no-recipients-configured).

**Example:**

```bash
envlock encrypt .env.production
# → writes .env.production.age
```

---

### `envlock decrypt <file>`

Decrypts an `.age`-encrypted file back to plaintext, using your local private key from `~/.envlock/`.

```bash
envlock decrypt .env.age
```

- Input: an encrypted file (must end in `.age`, e.g. `.env.age`).
- Output: the plaintext file with the `.age` suffix removed (e.g. `.env`).
- Requires that your public key is listed as a recipient in `.envlock.toml` at the time the file was last encrypted. If you were added after encryption, ask a teammate to run `envlock share <you@email.com>` and re-encrypt (see [`envlock share`](#envlock-share-email)).
- Running `decrypt` on a file that is already plaintext (not actually age-encrypted) fails with **exit code 3** and the message `file is not encrypted`. This is a safe no-op guard, not a crash — see [Troubleshooting](#file-is-not-encrypted-exit-code-3).

**Example:**

```bash
envlock decrypt .env.age
# → writes .env
```

Use this when you need an actual plaintext `.env` on disk (e.g. for tools that require a real file). For running your app, prefer `envlock run` instead, which avoids writing plaintext at all.

---

### `envlock run -- <cmd>`

Decrypts your project's secrets in memory and runs `<cmd>` with them injected as environment variables. **This is the recommended way to run your application day-to-day** — it never writes plaintext to disk.

```bash
envlock run -- npm start
envlock run -- python manage.py runserver
envlock run -- ./bin/worker
```

- Everything after `--` is treated as the command to execute, including its own flags.
- Decrypted variables are merged into the current process environment for the lifetime of `<cmd>` only. When `<cmd>` exits, nothing decrypted persists anywhere.
- Exit code of `envlock run` matches the exit code of `<cmd>`.
- Requires your key to be a recipient in `.envlock.toml`; otherwise decryption fails (same access model as `decrypt`).

**Why prefer this over `decrypt` + run:** `decrypt` leaves a plaintext `.env` sitting on disk until you remember to delete it. `envlock run` never creates that file in the first place — there's nothing to forget to clean up, and nothing for a misconfigured backup or `tar` command to accidentally scoop up.

---

### `envlock share <email>`

Grants a teammate access to the project's secrets by adding their public key to `.envlock.toml`, then re-encrypting existing secrets for the updated recipient list.

```bash
envlock share teammate@example.com
```

- Looks up (or prompts you to paste) the recipient's age public key and adds it to the `recipients` list in `.envlock.toml`.
- Re-encrypts the project's `.age` files so the new recipient can decrypt them going forward.
- Commit the updated `.envlock.toml` and `.age` file(s) so the change takes effect for everyone pulling the repo.

**Example:**

```bash
envlock share alex@company.com
git add .envlock.toml .env.age
git commit -m "Grant alex@company.com access to env secrets"
git push
```

To revoke access, remove the person's entry from `.envlock.toml` and re-run `envlock encrypt` on each secret file (see [Team Onboarding Guide](#team-onboarding-guide) and [Security Model](#security-model) for why re-encryption, not just deletion, is required to fully revoke access).

---

### `envlock rotate`

Rotates encryption by generating a fresh set of keys/values as needed and re-encrypting for the current recipient list. Use this after removing a teammate's access, after a suspected leak, or as routine hygiene.

```bash
envlock rotate
```

- Re-encrypts all tracked `.age` files in the project against the current `.envlock.toml` recipients, ensuring anyone previously removed can no longer decrypt new ciphertext.
- Recommended any time the recipients list shrinks (offboarding) or you suspect a key has been exposed.
- Commit the resulting changes, the same as after `share` or `encrypt`.

**Example — offboarding a teammate:**

```bash
# 1. Remove their entry from .envlock.toml (manually or via your team's process)
# 2. Rotate so old ciphertext they may still have access to is superseded
envlock rotate
git add .envlock.toml .env.age
git commit -m "Revoke access and rotate secrets"
git push
```

---

## Team Onboarding Guide

Follow this the first time your team adopts `envlock`, and again each time a new teammate joins.

### First-time project setup (one person, once)

1. Install `envlock` (see [Quickstart](#quickstart-under-5-minutes)).
2. Run `envlock init` in the project root. This creates your keypair and the project's `.envlock.toml`.
3. Encrypt existing secrets: `envlock encrypt .env`.
4. Add `.env` (and any other plaintext secret files) to `.gitignore`.
5. Commit `.envlock.toml` and the resulting `.env.age` file(s).

### Adding a new teammate

1. The new teammate installs `envlock` and runs `envlock init` on their own machine — this generates **their own** keypair under `~/.envlock/`. They do not need, and should never receive, anyone else's private key.
2. They send you their public key (`~/.envlock/identity.pub`), typically by opening a PR that adds it, or via any channel — public keys are not secret.
3. An existing team member with access runs:
   ```bash
   envlock share newteammate@example.com
   ```
4. That team member commits and pushes the updated `.envlock.toml` and re-encrypted `.age` file(s).
5. The new teammate pulls the latest changes and runs:
   ```bash
   envlock run -- <your usual start command>
   ```
   They now have working secrets with no plaintext ever emailed, DMed, or pasted anywhere.

### Removing a teammate (offboarding)

1. Remove their entry from `.envlock.toml`.
2. Run `envlock rotate` to re-encrypt against the new, smaller recipient list.
3. Commit and push. The offboarded teammate's local copy of any previously-decrypted `.env` files is now stale but harmless going forward — they can no longer decrypt anything encrypted after rotation.
4. If you believe the offboarded teammate retained copies of live secrets (API keys, DB passwords), also rotate those credentials at their source (e.g., your cloud provider, database), since `envlock rotate` only controls access to future ciphertext, not credentials already seen in plaintext.

### Day-to-day workflow for the whole team

- **Never commit plaintext `.env` files.** Only `.env.age` and `.envlock.toml` belong in git.
- **Always run the app via `envlock run --`**, not by manually decrypting, unless you have a specific reason to need a plaintext file on disk.
- **After pulling new commits**, if `.env.age` changed, just re-run `envlock run -- <cmd>` — there's no separate "sync" step.
- **When secrets themselves change** (e.g., a new API key), edit your local plaintext copy, then `envlock encrypt .env` and commit the updated `.env.age`.

---

## Security Model

**Encryption primitive.** `envlock` uses [age](https://age-encryption.org/) with X25519 (Curve25519 Diffie-Hellman) key exchange. Each user has an X25519 keypair rather than the whole team sharing one symmetric password.

**Key storage.**

- Private keys live only in `~/.envlock/` on each user's own machine and are never transmitted, committed, or included in any `.envlock.toml`.
- Public keys are not sensitive and are the only key material that ever leaves a user's machine — they're distributed via the `recipients` list in `.envlock.toml`, which is committed to the repo like any other file.

**Recipients and access control.**

- `.envlock.toml` defines the list of recipient public keys a project's secrets are encrypted for.
- Encrypting a file (`envlock encrypt`) targets exactly the recipients present in `.envlock.toml` at that moment. Anyone whose public key isn't listed cannot decrypt that ciphertext, even if they have the repo.
- Adding a recipient (`envlock share`) does not retroactively grant access to old commits' ciphertext blobs still reachable in git history — but it does re-encrypt the current file, and going forward that person can decrypt updates.
- Removing a recipient does not, by itself, invalidate that person's ability to decrypt ciphertext they've already fetched. You must run `envlock rotate` (or re-`encrypt`) after removing someone from `.envlock.toml` so that new ciphertext excludes them. Anything they already decrypted, or plaintext secrets they already saw (e.g. a real API key value), should be treated as compromised and rotated at the source system, not just re-encrypted by envlock.

**Runtime behavior.**

- `envlock run -- <cmd>` decrypts secrets into the memory of the `envlock` process and injects them into the environment of the child process it spawns. At no point does `envlock run` write a plaintext file to disk.
- `envlock decrypt <file>` does write plaintext to disk deliberately — that's its purpose — so treat any plaintext files it produces as sensitive: keep them `.gitignore`d and delete them when you no longer need them.

**What envlock does not protect against.**

- A compromised machine with a decrypted `.env` on disk or a live `envlock run` process can expose secrets in memory/process environment, same as any secrets manager.
- Secrets committed in plaintext *before* adopting `envlock` remain in git history unless you separately scrub history and rotate those credentials.
- `envlock` protects the confidentiality of secrets at rest and in transit through your repo; it is not a substitute for rotating leaked credentials at their origin (cloud provider, database, etc.).

---

## Troubleshooting / FAQ

#### "file is not encrypted" (exit code 3)

You ran `envlock decrypt` on a file that isn't actually age-encrypted ciphertext — often because it's already been decrypted, or you pointed at the plaintext `.env` instead of `.env.age` by mistake.

```
$ envlock decrypt .env
Error: file is not encrypted
$ echo $?
3
```

**Fix:** Check which file you meant to decrypt. If you're trying to get a fresh plaintext copy and one already exists, you don't need to do anything — it's already decrypted. If you're scripting around this, treat exit code `3` as "already plaintext" rather than a fatal error.

#### No recipients configured

`envlock encrypt` refuses to run if `.envlock.toml` has an empty or missing recipients list, since encrypting to nobody would produce ciphertext no one (including you) could open.

**Fix:** Run `envlock init` to ensure you're listed as a recipient, then retry `envlock encrypt`.

#### I can't decrypt a file a teammate encrypted

Your public key wasn't a recipient at the time that file was last encrypted. Ask whoever has access to run `envlock share <your-email>`, then pull the updated `.envlock.toml` and `.env.age`.

#### I lost my `~/.envlock/` directory (new laptop, wiped drive, etc.)

Your private key is gone with it, and there's no way to recover ciphertext encrypted to a lost key. Run `envlock init` to generate a new keypair, send your new public key to a teammate, and have them run `envlock share <your-email>` to grant the new key access again.

#### Do I need to run `envlock decrypt` before starting my app?

No — use `envlock run -- <your command>` instead. It decrypts secrets in memory and never writes a plaintext file, which is both faster and safer than decrypting first and running separately.

#### Where should `.env.age` and `.envlock.toml` live?

Both should be committed to your repository. `.env` (plaintext) should be in `.gitignore` and never committed.

#### How do I rotate a leaked secret (e.g. a leaked API key), not just envlock's encryption?

`envlock rotate` re-encrypts ciphertext for the current recipient list — it does not change the values inside your `.env`. If an actual credential leaked, generate a new value at its source (e.g. your cloud provider), update your plaintext `.env`, run `envlock encrypt`, and commit. Use `envlock rotate` in addition, if you're also narrowing who can access the file.

#### Can I use envlock with multiple environments (staging, production)?

Yes — encrypt each environment's file separately, e.g. `envlock encrypt .env.staging` and `envlock encrypt .env.production`, producing `.env.staging.age` and `.env.production.age`. Recipients in `.envlock.toml` apply per project; if you need different access levels per environment, keep those environments in separate directories/projects, each with its own `.envlock.toml`.

#### Does `envlock share` work with any email, or does the person need an account?

`envlock` has no central account system — "sharing" means adding someone's local age public key (generated by their own `envlock init`) to your project's `.envlock.toml`. The email is just a label for the recipient entry; the actual access grant is the public key itself.
