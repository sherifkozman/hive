# Diff under review (new endpoint added to an existing service)
import subprocess
from flask import Flask, request, jsonify, session

app = Flask(__name__)
app.secret_key = "dev-secret-key-2024"

@app.route("/api/dns-lookup")
def dns_lookup():
    host = request.args.get("host", "")
    out = subprocess.check_output("nslookup " + host, shell=True, text=True)

    return jsonify({"result": out})

@app.route("/api/export-users")
def export_users():
    fmt = request.args.get("format", "csv")
    path = request.args.get("template", "default.tpl")
    tpl = open("templates/" + path).read()
    return tpl.replace("%FMT%", fmt)
