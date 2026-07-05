
# Security Review

Security bugs are the highest-value finding. Work these categories on any change touching input, storage, or external systems.

**Injection.** Untrusted input reaching an interpreter (SQL, shell, LDAP, XML, template) needs parameterization, not concatenation. Flag `f"SELECT ... WHERE id = {user_id}"` and `execute("... %s" % val)`; require bound parameters: `execute("... WHERE id = %s", (user_id,))`. For shell, flag `os.system` and `subprocess.run(..., shell=True)` with interpolated input; require `shell=False` with an arg list. Watch ORM/NoSQL operators injected via user-controlled dicts.

**Path traversal.** When a path comes from input, `../` can escape the intended directory. Require canonicalization + containment: resolve the real path and verify it's inside the base (`Path.resolve().is_relative_to(base)` or `realpath(p).startswith(base)`). Reject absolute paths and null bytes.

**Secrets.** Flag hardcoded API keys, passwords, tokens, private keys in source — including test fixtures and example configs. Secrets belong in env vars or a secret manager, never the repo or logs. Check that logs and error messages don't echo credentials.

**Crypto.** Flag MD5/SHA-1 for security use and passwords stored with a fast hash or none — passwords need bcrypt/scrypt/argon2 with per-user salt. Flag ECB mode, static/zero IVs, and reused IVs. Require a CSPRNG (`secrets`, `os.urandom`) for tokens, never `random`. Check TLS verification isn't disabled (`verify=False`).

**AuthN vs AuthZ.** Authentication is who you are; authorization is what you may do. The classic bug (IDOR): an endpoint authenticates the user but never checks the requested object belongs to them. Verify every object access is scoped to the caller's permissions, and that "internal"/admin routes have access control.

**Other high-value checks.** SSRF (server fetching a user-supplied URL — allowlist hosts, block internal ranges); unsafe deserialization (`pickle`, `yaml.load` without `SafeLoader`); open redirects; missing rate limits on auth endpoints. Validate and bound all input at the trust boundary.
