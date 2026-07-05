#!/usr/bin/env python3
"""Objective scoring for Experiment 8c: stack-scale skill routing.
Reads each worker's LOADED line and scores right-skill / target-mini / navigation."""
import re, os, math, json, sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
tok = lambda p: math.ceil(os.path.getsize(p) / 4) if os.path.exists(p) else 0

# scoring key: expected skill dir substring + target mini id(s) (at least one required)
KEY = {
    "T1": ("authored/code-review",      ["02-security-review"]),
    "T2": ("authored/tech-writing",     ["03-readme-quickstart-changelog", "06-breaking-changes-migrations"]),
    "T3": ("converted/mcp-builder",     ["03-naming-conventions", "04-response-formats"]),
    "T4": ("converted/pdf",             ["02-extraction", "04-images-ocr"]),
    "T5": ("authored/financial-analysis", ["02-liquidity-leverage-ratios"]),
    "T6": ("converted/internal-comms",  ["04-general-comms", "02-company-newsletter"]),
}

def loaded_files(md):
    txt = open(md).read()
    line = re.findall(r"^LOADED:(.*)$", txt, re.M)
    if not line:
        return []
    return [x.strip() for x in line[-1].split(",") if x.strip() and x.strip().lower() != "none"]

rows = []
for t in ["T1", "T2", "T3", "T4", "T5", "T6"]:
    md = os.path.join(os.path.dirname(__file__), "outputs", f"8c-{t}.md")
    if not os.path.exists(md):
        rows.append((t, "MISSING", "", "", "", ""))
        continue
    files = loaded_files(md)
    skill_sub, targets = KEY[t]
    right_skill = any(skill_sub in f for f in files)
    # off-target: loaded a mini from a DIFFERENT skill's mini dir
    other_skill = any(("/mini/" in f or "/composable/" in f) and skill_sub not in f
                      and "README.md" not in f and skill_sub.split("/")[0] not in ("",)
                      and not any(s in f for s in [skill_sub]) for f in files
                      if "/skills/" in f and "/mini/" in f)
    off = [f for f in files if "/mini/" in f and skill_sub not in f]
    target_hit = any(any(tg in f for tg in targets) for f in files)
    # token cost of skill files loaded (resolve paths)
    total = 0
    for f in files:
        p = f if os.path.isabs(f) else os.path.join(ROOT, f)
        p = os.path.normpath(p)
        if os.path.exists(p):
            total += tok(p)
    n = len([f for f in files if f.endswith(".md")])
    rows.append((t, "OK" if right_skill else "WRONG-SKILL",
                 "hit" if target_hit else "MISS",
                 len(off), n, total))

print(f"{'task':4} {'skill':12} {'target-mini':11} {'off-target':10} {'files':6} {'tokens':7}")
right = tgt = 0
for t, sk, tg, off, n, tks in rows:
    print(f"{t:4} {sk:12} {tg:11} {str(off):10} {str(n):6} {str(tks):7}")
    if sk == "OK": right += 1
    if tg == "hit": tgt += 1
done = [r for r in rows if r[1] != "MISSING"]
print(f"\nright-skill: {right}/{len(done)}   target-mini-hit: {tgt}/{len(done)}")
