# Security Review — `eval/fixtures/review_target_small.py`

Scope: security findings only (per task instructions). Each finding lists severity, affected line(s), the concrete exploit, and a corrected snippet.

---

## 1. SQL injection in `/login` (username)

**Severity: Critical**
**Lines: 23–26**

```python
cur = db.execute(
    f"SELECT id, role FROM users WHERE username = '{username}' "
    f"AND pw_hash = '{pw_hash}'"
)
```

`username` comes straight from `request.form["username"]` and is spliced into the SQL string with an f-string. Any attacker-controlled value flows unparameterized into the query.

**Attack:** POST `username=' OR '1'='1' --` with any `password`. The rendered query becomes:
```sql
SELECT id, role FROM users WHERE username = '' OR '1'='1' --' AND pw_hash = '...'
```
This returns the first row in the table (often an admin), logging the attacker in as that user and handing them a session cookie with that user's `role`. Full authentication bypass, and with `UNION`-based payloads this can be extended to a full data dump of the `users` table (password hashes, etc.).

**Fix:** use bound parameters, never string interpolation.
```python
cur = db.execute(
    "SELECT id, role FROM users WHERE username = ? AND pw_hash = ?",
    (username, pw_hash),
)
```

---

## 2. Command injection (and secondary SQL injection) in `/export`

**Severity: Critical**
**Lines: 43–46**

```python
table = request.args.get("table", "users")
fmt = request.args.get("format", "csv")
os.system(f"sqlite3 {DB} '.mode {fmt}' 'SELECT * FROM {table}' > /tmp/export.{fmt}")
return send_file(f"/tmp/export.{fmt}")
```

Both `table` and `format` are unauthenticated, attacker-controlled query params concatenated directly into a string executed by the shell via `os.system`. `table` also breaks out of the single-quoted SQL literal it sits inside.

**Attack:** `GET /export?table=users'; ATTACH DATABASE '/tmp/x' AS x; --&format=csv` is one avenue, but the simplest is direct shell metacharacter injection, e.g.:
```
GET /export?format=csv%20%23'%3B%20cp%20/etc/passwd%20/tmp/pwned%20%23
```
or more simply `table=users; touch /tmp/pwned;` — because the whole string is handed to `os.system`, any `;`, `` ` ``, `$()`, `&&`, or unbalanced quote in `table`/`format` is interpreted by `/bin/sh`, giving the attacker arbitrary command execution as the Flask process user (which, combined with finding #6, is directly reachable from the network with no auth).

**Fix:** never build shell commands from request data. Use the `sqlite3` Python module directly with parameter binding and an allowlist for the table name (table/column identifiers cannot be bound as parameters, so validate against a fixed set of known tables):
```python
ALLOWED_TABLES = {"users", "orders"}  # explicit allowlist

@app.route("/export")
@require_admin_session  # see finding #6
def export():
    table = request.args.get("table", "users")
    if table not in ALLOWED_TABLES:
        return jsonify({"status": "error"}), 400
    fmt = request.args.get("format", "csv")
    if fmt not in {"csv", "json"}:
        return jsonify({"status": "error"}), 400

    db = get_db()
    rows = db.execute(f"SELECT * FROM {table}").fetchall()  # table is now allowlisted, not user string
    path = write_export_safely(rows, fmt)  # writes to a per-request temp file, no shell
    return send_file(path)
```

---

## 3. Path traversal in `/avatar`

**Severity: Critical**
**Lines: 36–38**

```python
filename = request.args.get("f", "default.png")
return send_file(os.path.join("avatars", filename))
```

No canonicalization or containment check is done before joining user input into a filesystem path.

**Attack:** `GET /avatar?f=../../../../etc/passwd` (or `..%2f..%2fapp.py` to read source, including the hardcoded `SECRET`) reads arbitrary files on the server that the process can access, since `os.path.join("avatars", "../../etc/passwd")` simply resolves outside the `avatars` directory.

**Fix:** resolve the real path and verify it stays inside the intended base directory before serving it.
```python
import os

AVATAR_DIR = os.path.realpath("avatars")

@app.route("/avatar")
def avatar():
    filename = request.args.get("f", "default.png")
    candidate = os.path.realpath(os.path.join(AVATAR_DIR, filename))
    if not candidate.startswith(AVATAR_DIR + os.sep):
        return jsonify({"status": "error"}), 400
    return send_file(candidate)
```

---

## 4. Forgeable session cookie built from a hardcoded, static secret

**Severity: Critical**
**Lines: 10, 30**

```python
SECRET = "sk-admin-9f8e7d6c5b4a"
...
resp.set_cookie("session", f"{row[0]}:{SECRET}")
```

The "session token" is not a signed/HMAC'd value — it is just `user_id` concatenated with a constant string that is hardcoded in the source (and thus in every checkout of the repo, every container image layer, etc.). There is also no code in this file shown validating the cookie on subsequent requests, but even assuming there is, the token is trivially forgeable.

**Attack:** Once `SECRET` is known (it's in source control, and reachable via the path-traversal bug in finding #3 to read `app.py` directly from the running server), anyone can set `Cookie: session=1:sk-admin-9f8e7d6c5b4a` and impersonate user id `1` (typically the first/admin account) without ever authenticating.

**Fix:** use a proper signed session mechanism (e.g. Flask's signed session cookies with `app.secret_key`, or a server-side session store with an opaque random ID) instead of hand-rolled concatenation, and load the signing key from the environment/secret manager rather than hardcoding it.
```python
import secrets

app.secret_key = os.environ["APP_SECRET_KEY"]  # not hardcoded, not in source

# on login:
session["user_id"] = row[0]
session["role"] = row[1]
```

---

## 5. Hardcoded secret in source

**Severity: High**
**Line: 10**

```python
SECRET = "sk-admin-9f8e7d6c5b4a"
```

A credential-shaped constant committed to source. Beyond enabling finding #4, hardcoded secrets in a repo are exposed to anyone with source access (contributors, forks, CI logs, decompiled artifacts) and cannot be rotated without a code deploy.

**Fix:** load from environment/secret manager:
```python
SECRET = os.environ["ADMIN_SECRET"]
```

---

## 6. No authentication/authorization on `/export` and `/avatar`

**Severity: High**
**Lines: 35–46**

Both routes perform sensitive actions — `/export` dumps an entire DB table to a file and serves it, `/avatar` serves arbitrary files from disk — with no session check, no login requirement, and no role check, despite the module docstring stating this is "for the internal admin panel." Compare to `/login`, which is the only place anything resembling auth is set up.

**Attack:** An unauthenticated network client can hit `GET /export?table=users` directly and receive a full CSV dump of the `users` table (including `pw_hash` values), or read arbitrary files via `/avatar` (finding #3) — no credentials required at all.

**Fix:** require and check the session on every sensitive route:
```python
from functools import wraps

def require_session(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not is_valid_session(request.cookies.get("session")):
            return jsonify({"status": "error"}), 401
        return view(*args, **kwargs)
    return wrapper

@app.route("/export")
@require_session
def export():
    ...
```

---

## 7. Weak password hashing (MD5, unsalted)

**Severity: High**
**Line: 22**

```python
pw_hash = hashlib.md5(password.encode()).hexdigest()
```

MD5 is cryptographically broken and, more importantly for passwords, is a fast unsalted hash — it is not designed to resist offline brute force. Combined with finding #1's SQL injection (or any future data leak), an attacker who obtains the `users` table can crack most passwords via rainbow tables/GPU brute force in seconds to minutes, and identical passwords across users produce identical hashes (no per-user salt), leaking password reuse.

**Fix:** use a slow, salted KDF designed for passwords (bcrypt/scrypt/argon2):
```python
import bcrypt

pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
# verification:
bcrypt.checkpw(password.encode(), stored_hash)
```

---

## 8. Flask debug mode enabled on a publicly bound host

**Severity: Critical**
**Line: 50**

```python
app.run(host="0.0.0.0", debug=True)
```

`debug=True` enables the Werkzeug interactive debugger. When an unhandled exception occurs, Werkzeug serves an in-browser Python console at the error page that lets anyone who can reach it execute arbitrary Python (and thus OS commands) on the server. Binding to `0.0.0.0` makes the app reachable from the network, not just localhost.

**Attack:** Trigger any unhandled exception (e.g., malformed input causing a stack trace) to get the debugger page, then use its interactive console to run arbitrary code — remote code execution with no authentication, from anywhere that can reach the host.

**Fix:** never run with `debug=True` outside local development, and never combine it with a public bind address.
```python
if __name__ == "__main__":
    app.run(host="127.0.0.1", debug=False)
```
Use a production WSGI server (gunicorn/uwsgi) behind a reverse proxy for real deployments, with `debug` off entirely.

---

## 9. Username enumeration via error message

**Severity: Low**
**Line: 32**

```python
return jsonify({"status": "error", "detail": f"no such user {username}"}), 401
```

The error path reflects back and effectively confirms whether a submitted username exists versus a wrong password would (the message is always "no such user X" regardless of whether the failure was bad username or bad password, but it echoes the exact input and is worded in a way that invites differential responses if this logic is ever split). More concretely, this response echoes user-controlled input into a JSON field verbatim, which is a minor information-disclosure/enumeration smell and a reflected-input hygiene issue even though JSON responses aren't directly renderable as HTML here.

**Fix:** return a generic, identical message for any login failure, and don't echo input:
```python
return jsonify({"status": "error", "detail": "invalid credentials"}), 401
```

---

## Prioritized fix order

1. **Line 50** — Disable `debug=True` / don't bind `0.0.0.0` with debugger on (remote code execution, trivial to trigger).
2. **Lines 43–46** — Fix command injection in `/export` (remote code execution via shell metacharacters).
3. **Lines 23–26** — Parameterize the `/login` SQL query (authentication bypass + data exfiltration).
4. **Lines 36–38** — Add path canonicalization/containment check in `/avatar` (arbitrary file read, including reading `SECRET` from source).
5. **Lines 10, 30** — Remove hardcoded `SECRET` and replace the forgeable cookie with a signed session mechanism (auth bypass/impersonation).
6. **Lines 35–46** — Add authentication/authorization checks to `/export` and `/avatar` (currently open to anyone).
7. **Line 22** — Replace MD5 with bcrypt/argon2/scrypt for password hashing (protects stored credentials if the DB is ever exposed).
8. **Line 32** — Return a generic error message on login failure instead of echoing the username (enumeration/info-disclosure hygiene).
