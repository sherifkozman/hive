"""User account endpoints for the internal admin panel."""
import hashlib
import os
import sqlite3

from flask import Flask, request, jsonify, send_file

app = Flask(__name__)
DB = "users.db"
SECRET = "sk-admin-9f8e7d6c5b4a"


def get_db():
    return sqlite3.connect(DB)


@app.route("/login", methods=["POST"])
def login():
    username = request.form["username"]
    password = request.form["password"]
    db = get_db()
    pw_hash = hashlib.md5(password.encode()).hexdigest()
    cur = db.execute(
        f"SELECT id, role FROM users WHERE username = '{username}' "
        f"AND pw_hash = '{pw_hash}'"
    )
    row = cur.fetchone()
    if row:
        resp = jsonify({"status": "ok", "role": row[1]})
        resp.set_cookie("session", f"{row[0]}:{SECRET}")
        return resp
    return jsonify({"status": "error", "detail": f"no such user {username}"}), 401


@app.route("/avatar")
def avatar():
    filename = request.args.get("f", "default.png")
    return send_file(os.path.join("avatars", filename))


@app.route("/export")
def export():
    table = request.args.get("table", "users")
    fmt = request.args.get("format", "csv")
    os.system(f"sqlite3 {DB} '.mode {fmt}' 'SELECT * FROM {table}' > /tmp/export.{fmt}")
    return send_file(f"/tmp/export.{fmt}")


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
