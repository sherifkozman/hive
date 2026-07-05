# envlock

Encrypt the secrets in your `.env` files, commit them to git, and share them with your team — without ever putting plaintext credentials in a repo, a Slack message, or a password manager export.

**This guide is for developers who have never used envlock.** It assumes you have a terminal, a project with a `.env` file, and (for team features) teammates who also use envlock. No prior knowledge of `age` or encryption tools is required.

## Contents

- [Why envlock](#why-envlock)
- [Quickstart](#quickstart-under-5-minutes)
- [Command reference](#command-reference)
- [Team onboarding guide](#team-onboarding-guide)
- [Security model](#security-model)
- [Troubleshooting / FAQ](#troubleshooting--faq)

## Why envlock

Most teams handle `.env` secrets one of two bad ways: they leave them out of git entirely (so onboarding a new developer means Slacking them a plaintext file), or they commit them anyway (so every fork, backup, and CI log now has a copy of production credentials).

envlock encrypts your `.env` files with modern, audited encryption (age, X25519) so you can commit `.env.encrypted` files straight into your repository. Teammates with access decrypt them locally in one command. Running `envlock run -- <cmd>` goes a step further: it injects your decrypted environment straight into a child process's memory and never writes plaintext to disk at all.

You get: encrypted secrets in version control, one-command onboarding for new teammates, and no plaintext `.env` file needed to run your app locally.

## Quickstart (under 5 minutes)

**Prerequisites:**
- macOS or Linux with a terminal
- Either Homebrew, or `curl` and permission to run shell scripts
- A project directory with a `.env` file you want to protect

### 1. Install envlock

```
brew install envlock
```

Or, without Homebrew:

```
curl -sSf https://envlock.dev/install.sh | sh
```

### 2. Initialize envlock in your project

```
cd your-project
envlock init
```

This generates an age (X25519) keypair and stores it in `~/.envlock/`. It also creates a `.envlock.toml` file in your project listing who can decrypt its secrets (you, to start).

### 3. Encrypt your `.env` file

```
envlock encrypt .env
```

This produces `.env.encrypted`. Commit that file to git — never commit the plaintext `.env`. Add `.env` to your `.gitignore` if it isn't already there.

### 4. Run your app with secrets injected

```
envlock run -- npm start
```

envlock decrypts your secrets in memory and passes them to `npm start` as environment variables. No plaintext file is written to disk at any point.

**Checkpoint:** if your app starts up and reads its usual environment variables (database URL, API keys, etc.) without a `.env` file present, envlock is working.

**Next step:** if you're rolling this out to a team, see [Team onboarding guide](#team-onboarding-guide).

## Command reference

Each command below follows the same shape: description, usage, options/behavior, example.

### `envlock init`

**Description:** Generates an age (X25519) keypair for the current user (if one doesn't already exist in `~/.envlock/`) and creates a `.envlock.toml` recipients file in the current project.

**Usage:**
```
envlock init
```

**Behavior:** Safe to run once per machine and once per project. Running it again in a project that already has a `.envlock.toml` does not overwrite existing recipients.

**Example:**
```
$ envlock init
Generated keypair: ~/.envlock/identity.age
Created .envlock.toml with 1 recipient (you)
```

### `envlock encrypt <file>`

**Description:** Encrypts a plaintext file (typically `.env`) to `<file>.encrypted`, addressed to every recipient listed in `.envlock.toml`.

**Usage:**
```
envlock encrypt <file>
```

**Behavior:** Reads the recipients list from `.envlock.toml` in the current project. The original plaintext file is left untouched — encrypt does not delete it. Commit the resulting `.encrypted` file; keep the plaintext file out of git.

**Example:**
```
$ envlock encrypt .env
Encrypted .env -> .env.encrypted (3 recipients)
```

### `envlock decrypt <file>`

**Description:** Decrypts an encrypted file back to plaintext, using your local private key.

**Usage:**
```
envlock decrypt <file>
```

**Behavior:** `<file>` should be the `.encrypted` file (e.g., `.env.encrypted`); envlock writes the decrypted plaintext alongside it (e.g., `.env`). Requires that your public key is in the project's `.envlock.toml` recipients list. Running `decrypt` on a file that is already plaintext (not encrypted) exits with status 3 and the message `file is not encrypted` — see [Troubleshooting](#troubleshooting--faq).

**Example:**
```
$ envlock decrypt .env.encrypted
Decrypted .env.encrypted -> .env
```

### `envlock run -- <cmd>`

**Description:** Decrypts your project's secrets in memory and runs `<cmd>` with them injected as environment variables. Never writes plaintext to disk.

**Usage:**
```
envlock run -- <cmd> [args...]
```

**Behavior:** Everything after `--` is passed through as the command to run. Use this instead of `decrypt` for local development and CI so no plaintext `.env` file ever touches disk.

**Example:**
```
$ envlock run -- npm run dev
$ envlock run -- python manage.py runserver
```

### `envlock share <email>`

**Description:** Adds a teammate as a recipient so future `encrypt` runs (and re-encryptions) include their public key, letting them decrypt project secrets.

**Usage:**
```
envlock share <email>
```

**Behavior:** Looks up the recipient's public key (registered when they ran `envlock init`) and adds it to `.envlock.toml`. You must re-run `envlock encrypt <file>` after sharing so the encrypted file is regenerated for the new recipient list — sharing alone does not re-encrypt existing files.

**Example:**
```
$ envlock share alex@example.com
Added alex@example.com to .envlock.toml
Run `envlock encrypt .env` to re-encrypt for the new recipient.
```

### `envlock rotate`

**Description:** Rotates encryption by generating fresh ciphertext for all tracked encrypted files against the current recipients list — use after removing a recipient or on a regular security cadence.

**Usage:**
```
envlock rotate
```

**Behavior:** Re-encrypts every `*.encrypted` file in the project for the current recipient list in `.envlock.toml`. Run this immediately after removing someone from `.envlock.toml`, since removing a recipient does not retroactively revoke their access to previously encrypted ciphertext.

**Example:**
```
$ envlock rotate
Rotated 2 files for 3 recipients
```

## Team onboarding guide

Follow this once per new teammate.

**Prerequisites checklist (new teammate):**
- envlock installed (`brew install envlock` or the curl installer)
- Access to the team's git repository

**Steps:**

1. **New teammate generates a keypair.** They run:
   ```
   envlock init
   ```
   inside a clone of the project repository. This creates their personal key in `~/.envlock/` and prints their public key.

2. **New teammate shares their public key** with an existing team member who already has decrypt access (Slack, email — the public key is not secret and is safe to share in plaintext).

3. **An existing member adds them as a recipient:**
   ```
   envlock share newteammate@example.com
   ```

4. **The existing member re-encrypts** so the new recipient is actually included in the ciphertext:
   ```
   envlock encrypt .env
   ```
   Commit and push the updated `.env.encrypted`.

5. **The new teammate pulls the latest repo** and decrypts:
   ```
   git pull
   envlock decrypt .env.encrypted
   ```
   or, to avoid ever writing plaintext to disk:
   ```
   envlock run -- npm start
   ```

**When someone leaves the team:**
1. Remove their entry from `.envlock.toml` (manually, or via your team's process — envlock does not currently ship a `revoke` command; delete their recipient line).
2. Run `envlock rotate` to re-encrypt all secrets without their key.
3. Commit the rotated files. Their old copy of the ciphertext still exists in git history, but the current secrets are no longer decryptable by their key — if any exposed secret's value must be considered compromised, rotate the underlying credential too (e.g., the database password itself), not just the envlock encryption.

## Security model

**How envlock protects your secrets:** envlock encrypts files using [age](https://age-encryption.org) with X25519 (elliptic-curve Diffie-Hellman) keys. Each project's `.envlock.toml` lists the public keys of everyone who can decrypt that project's secrets. Encrypting a file produces ciphertext addressed to every recipient in that list; only someone holding the matching private key can decrypt it.

**Where keys live:** your private key is generated by `envlock init` and stored in `~/.envlock/` on your machine. It never leaves your machine and is never transmitted to envlock or any third party. Losing this directory means losing the ability to decrypt — there is no recovery mechanism; a teammate with existing access must `share` with your new key.

**What `envlock run` does and doesn't do:** `envlock run -- <cmd>` decrypts secrets in memory and injects them directly into the child process's environment. It does not write a plaintext file to disk at any point, so secrets are not left behind in your working directory, in editor swap files, or in disk-based backups. Secrets are still present in the memory of the running process, as with any environment variable — a process with `ptrace` access or a core dump of that process could still expose them. This is the same exposure profile as any tool that sets environment variables; envlock's guarantee is specifically about disk, not process memory.

**What is and isn't protected:**
- Protected: secrets at rest in your repository (as `.encrypted` files), secrets at rest on disk during local development when you use `run` instead of `decrypt`.
- Not protected: secrets after decryption to a plaintext file via `envlock decrypt` — that file is ordinary plaintext on disk and is your responsibility to keep out of git and delete when done. Do not commit decrypted files; keep `.env` in `.gitignore`.
- Not protected: a compromised machine with access to a valid private key in `~/.envlock/` — anyone with that key and access to the encrypted file can decrypt it.

**Revocation:** removing a recipient from `.envlock.toml` and running `envlock rotate` prevents that recipient's key from decrypting *future* ciphertext. It does not undo past exposure — anyone who already decrypted the secrets, or who kept an old copy of the ciphertext together with their still-valid old key before rotation, may still have access to the old values. Treat removal-plus-rotation as access control going forward, not as an undo button; rotate the underlying credentials themselves if a departure is adversarial.

**Reporting a vulnerability:** if you believe you've found a security issue in envlock itself, do not open a public GitHub issue. Email security@envlock.dev with details; do not include real secrets in your report.

## Troubleshooting / FAQ

### `Error: file is not encrypted` (exit code 3)

**Symptom:** running `envlock decrypt <file>` prints `file is not encrypted` and exits with status 3.

**Cause:** you ran `decrypt` on a file that is already plaintext — most commonly, running `envlock decrypt .env` instead of `envlock decrypt .env.encrypted`, or running `decrypt` twice on the same file.

**Fix:** check which file you meant to decrypt. Decrypt the `.encrypted` file, not the plaintext one:
```
envlock decrypt .env.encrypted
```

**Confirm:** the command exits 0 and prints a line like `Decrypted .env.encrypted -> .env`.

### A teammate can't decrypt after I shared with them

**Symptom:** a teammate you ran `envlock share` for still can't decrypt `.env.encrypted`.

**Cause:** `envlock share` adds them to the recipients list in `.envlock.toml`, but existing encrypted files were sealed before they were added. Sharing does not retroactively re-encrypt anything.

**Fix:** after sharing, re-encrypt the file and commit the result:
```
envlock share newteammate@example.com
envlock encrypt .env
git add .env.encrypted .envlock.toml
git commit -m "Add newteammate to envlock recipients"
```

**Confirm:** ask the teammate to `git pull` and run `envlock decrypt .env.encrypted` successfully.

### `envlock run` exits immediately with no output from my app

**Symptom:** `envlock run -- <cmd>` returns right away without your app's usual startup output.

**Cause:** usually the command after `--` is wrong, or there's no `.env.encrypted` in the current directory for envlock to decrypt.

**Fix:** confirm you're in the project directory containing `.envlock.toml` and `.env.encrypted`, and that the command works on its own with a manually-decrypted `.env` present. Then retry `envlock run -- <cmd>`.

**Confirm:** your app's normal startup logs appear, and any config values it prints match your expected (non-secret) settings.

### Can I use envlock without a team / just for myself?

Yes. `envlock init` and `envlock encrypt` work for a single user — `.envlock.toml` will simply list one recipient (you). Sharing and rotation only become relevant once you add teammates.

### Does envlock work offline?

Encrypting, decrypting, and running commands are all local operations against your own key material in `~/.envlock/` and the project's `.envlock.toml` — no network access is required for any of the commands in this guide.

### What happens if I delete `~/.envlock/`?

You lose your private key and can no longer decrypt anything encrypted for you. There is no recovery — a teammate who already has access must run `envlock init` won't help recreate the same key; you'll generate a new keypair and need to be re-shared (`envlock share you@example.com`) by someone with existing access, then have the project's secrets re-encrypted with `envlock encrypt`.

### Is it safe to commit `.env.encrypted` to a public repository?

The ciphertext itself does not reveal the plaintext secrets to anyone without a recipient's private key. That said, treat encrypted files with the same caution as any cryptographic artifact: use a public repository only if you're confident in the strength of age/X25519 and in keeping every recipient's private key secure, and always rotate real credentials (not just envlock's encryption) if you ever suspect a private key has leaked.

### Still stuck?

Open an issue with: your envlock version (`envlock --version`), the exact command you ran, and the full error text. Do not paste your `.env` contents or private key into a bug report.
