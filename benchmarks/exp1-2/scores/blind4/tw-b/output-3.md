# envlock

Encrypt your `.env` files, commit them to git, and stop passing secrets around in Slack.

`envlock` is a command-line tool that encrypts the contents of `.env` files using [age](https://age-encryption.org) (X25519), so you can store secrets safely alongside your code and share them with your team through your existing `.envlock.toml` recipients list — no separate secrets server, no shared password, no plaintext files sitting on disk.

This guide is for developers who have never used `envlock`. It assumes you have a terminal, a project with a `.env` file, and (for team sharing) access to invite teammates by email.

## Why envlock

- **Commit secrets safely.** Encrypted `.env` files are safe to commit to git. Nobody reading your repo history sees plaintext.
- **No plaintext on disk, ever.** `envlock run` decrypts secrets in memory and injects them into your command's environment. It never writes a decrypted file to disk.
- **Per-person access, not a shared password.** Every team member gets their own age key. Add or remove someone's access by editing the recipients list in `.envlock.toml` — no password rotation required.
- **Fast to rotate.** One command re-encrypts your secrets and issues fresh keys.

## Quickstart

Takes under 5 minutes. By the end, you'll have an encrypted `.env` file and you'll have run a command against its decrypted values.

**Prerequisites:**
- A terminal on macOS or Linux
- A project directory containing a `.env` file

**1. Install envlock.**

On macOS, using Homebrew:

```
brew install envlock
```

On Linux, or if you don't use Homebrew:

```
curl -sSf https://envlock.dev/install.sh | sh
```

**2. Initialize envlock in your project.**

```
cd your-project
envlock init
```

This generates an age keypair, stores your private key in `~/.envlock/`, and creates a `.envlock.toml` file in your project with your public key listed as the first recipient.

**3. Encrypt your `.env` file.**

```
envlock encrypt .env
```

You should now see a `.env.age` file (or similar encrypted output) in your project directory. Commit this file to git — it's safe, it's encrypted.

**4. Run your app with decrypted secrets injected.**

```
envlock run -- node server.js
```

`envlock` decrypts your secrets in memory and passes them to `node server.js` as environment variables. Replace `node server.js` with your own start command. No plaintext file is written to disk at any point.

**Checkpoint:** your app started successfully, reading real secret values, without a plaintext `.env` file ever existing on disk. That's the whole workflow: encrypt once, `run` whenever you need decrypted values.

**Next:** add a teammate with `envlock share <email>` — see [Team onboarding](#team-onboarding) below.

## Command reference

### `envlock init`

Initializes envlock in the current project.

Generates an age (X25519) keypair, stores the private key in `~/.envlock/`, and creates a `.envlock.toml` file listing your public key as a recipient. Run this once per project, as the first person setting it up.

```
envlock init
```

### `envlock encrypt <file>`

Encrypts the given file for every recipient listed in `.envlock.toml`.

```
envlock encrypt .env
```

Produces an encrypted copy of `<file>` that only holders of a listed recipient's private key can decrypt. Safe to commit to git.

### `envlock decrypt <file>`

Decrypts the given file to plaintext on disk.

```
envlock decrypt .env.age
```

Use this when you need a plaintext `.env` file on disk temporarily — for example, to inspect values or hand off to a tool that requires a real file. Prefer `envlock run` when you just need to run a command, since it never touches disk.

Fails with exit code 3 and the message `file is not encrypted` if `<file>` is already plaintext. See [Troubleshooting](#troubleshooting--faq).

### `envlock run -- <cmd>`

Runs `<cmd>` with your secrets decrypted and injected as environment variables.

```
envlock run -- npm start
envlock run -- python app.py
```

`envlock run` never writes plaintext to disk — decrypted values exist only in the memory of the process it launches. This is the recommended way to use your secrets day to day.

### `envlock share <email>`

Adds a teammate as a recipient and re-encrypts your secrets for them.

```
envlock share teammate@example.com
```

Adds `teammate@example.com`'s public key to `.envlock.toml` and re-encrypts existing encrypted files so that teammate can decrypt them with their own key. Commit the updated `.envlock.toml` and re-encrypted files.

### `envlock rotate`

Re-encrypts your secrets under fresh keys.

```
envlock rotate
```

Generates a new keypair for you, re-encrypts existing secrets against the current recipients list, and updates `.envlock.toml`. Run this on a schedule (see [Security model](#security-model)) or immediately after removing a teammate's access.

## Team onboarding

Follow this guide once per new team member, after someone has already run `envlock init` and `envlock encrypt` in the project.

**If you're the new team member:**

1. Install envlock (see [Quickstart](#quickstart), step 1).
2. Run `envlock init` in the project directory. This generates your personal keypair and stores your private key in `~/.envlock/`. It does not grant you access by itself — someone with existing access must add you.
3. Send your public key or email to a teammate who already has access, and ask them to run `envlock share <your-email>`.
4. Pull the updated `.envlock.toml` and re-encrypted files from git.
5. Confirm you have access: `envlock run -- echo "$SOME_KNOWN_VAR"` should print the expected value.

**If you're granting access:**

1. Run `envlock share <new-teammate-email>`.
2. Commit and push the updated `.envlock.toml` and re-encrypted `.env` files.
3. Tell your teammate to pull and run `envlock init`, if they haven't already.

**Removing access:** delete the departing teammate's entry from `.envlock.toml`, then run `envlock rotate` to issue fresh keys and re-encrypt so their old key can no longer decrypt anything, even from a prior git commit.

## Security model

**What's encrypted:** the contents of any file you run `envlock encrypt` on. Encryption uses age with X25519 keypairs — one keypair per team member.

**What's not encrypted:** `.envlock.toml` itself is plaintext. It lists recipients' public keys, not secrets — public keys are safe to expose. Don't put secret values directly in `.envlock.toml`.

**Where keys live:** each person's private key is stored in `~/.envlock/` on their own machine. `envlock` never transmits your private key anywhere, and it never appears in `.envlock.toml` or in any committed file. Back it up yourself if you want to recover access after a lost machine; there's no server-side copy.

**Plaintext exposure:** `envlock run` decrypts secrets in memory only and passes them to the child process's environment — it never writes a plaintext file. `envlock decrypt` is the one command that does write plaintext to disk; treat any file it produces as sensitive, and don't commit it. Add plaintext `.env` files to `.gitignore`.

**Revocation:** removing someone from `.envlock.toml` stops them from decrypting *future* re-encryptions, but they may still hold decryptable copies of anything encrypted before you rotated. Always run `envlock rotate` immediately after removing a recipient to invalidate old ciphertext.

**Recommended rotation cadence:** run `envlock rotate` whenever a team member's access is revoked, and periodically (for example, quarterly) as routine hygiene.

**Placeholders in examples:** every email and secret value in this document (`teammate@example.com`, `$SOME_KNOWN_VAR`) is a placeholder. Never share real private keys, tokens, or `.env` plaintext outside `envlock`'s own commands.

## Troubleshooting & FAQ

**Symptom:** `Error: file is not encrypted` (exit code 3)
**Cause:** You ran `envlock decrypt` on a file that's already plaintext.
**Fix:** Confirm which file you meant to decrypt — you likely want the `.age` file, not the original. Run `envlock decrypt .env.age`, not `envlock decrypt .env`.
**Confirm:** the command exits 0 and prints the decrypted file's path.

**Symptom:** A new teammate runs `envlock run` and gets a decryption failure.
**Cause:** They haven't been added to `.envlock.toml` yet, or they're using a stale copy of an encrypted file from before `envlock share` ran.
**Fix:** Have an existing recipient run `envlock share <their-email>`, commit the result, and have the new teammate pull the latest `.envlock.toml` and encrypted files.
**Confirm:** `envlock run -- echo "$SOME_KNOWN_VAR"` prints the expected value.

**Symptom:** You committed a plaintext `.env` file by accident.
**Cause:** `.env` wasn't in `.gitignore`, or you committed the output of `envlock decrypt` directly.
**Fix:** Remove the file from git history, add `.env` to `.gitignore`, then run `envlock rotate` to invalidate any secret values that were exposed.
**Confirm:** `git log -p -- .env` no longer shows plaintext in new commits, and rotated secrets are in place.

**Can I use envlock offline?** Yes. `envlock encrypt`, `envlock decrypt`, and `envlock run` all operate on local keys and files; none require network access.

**Does `envlock run` leave anything behind after the command exits?** No. Decrypted values live only in the child process's memory for the lifetime of that process.

**Can I revoke just one person's access without rotating everyone's keys?** Yes. Remove their entry from `.envlock.toml` and run `envlock rotate` — this re-encrypts against the remaining recipients and issues you a fresh keypair, but doesn't require other team members to change anything on their end beyond pulling the updated files.

**Still stuck?** Include the exact error text and exit code, your `envlock` version, and (with secrets redacted) your `.envlock.toml` when you file an issue.
