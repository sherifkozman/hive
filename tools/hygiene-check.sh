#!/usr/bin/env bash
# Repository hygiene gate: fails when secret-shaped values, personal
# identifiers, machine-specific paths, or internal working files appear in
# TRACKED content. Run locally (`tools/hygiene-check.sh`) or via CI.
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0

report() { echo "HYGIENE FAIL [$1]:"; echo "$2" | head -10; FAIL=1; }

# 1. Secret-shaped values (placeholders like sk-ant-your-key-here are exempt).
HITS=$(git grep -nIE "sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{32,}|npm_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|xox[bp]-[0-9]|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" -- . ':!tools/hygiene-check.sh' 2>/dev/null | grep -v "your-key-here" || true)
[ -n "$HITS" ] && report "secret-shaped value" "$HITS"

# 2. Personal identifiers (owner email domain).
HITS=$(git grep -nIE "[a-zA-Z0-9._%+-]+@naya\.finance" -- . ':!tools/hygiene-check.sh' 2>/dev/null || true)
[ -n "$HITS" ] && report "personal email" "$HITS"

# 3. Machine-specific paths (real home dirs / session temp dirs; the
#    anonymous /home/user sandbox convention used by benchmark protocols is fine).
HITS=$(git grep -nIE "/Users/[a-z]+/|/private/tmp/claude" -- . ':!tools/hygiene-check.sh' 2>/dev/null || true)
[ -n "$HITS" ] && report "machine-specific path" "$HITS"

# 4. Internal working files must never be tracked.
HITS=$(git ls-files | grep -E "^tasks/|^docs/superpowers/|^\.claude/settings" || true)
[ -n "$HITS" ] && report "internal working file tracked" "$HITS"

if [ "$FAIL" -eq 0 ]; then
  echo "hygiene: clean"
else
  echo ""
  echo "See tools/hygiene-check.sh for the checked classes. Redactions of"
  echo "benchmark evidence must be logged (see benchmarks/exp7/REDACTIONS.md)."
  exit 1
fi
