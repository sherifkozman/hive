# Tasks 8c: stack-scale skill routing (13-skill catalog)

Worker instruction (per task): "The skills library is at skills/ (catalog in
skills/README.md). Find and load whatever skill content this task needs,
following each skill's loading policy. Report every skill file you read."

- **T1:** Review this Python diff for security issues only: [diff provided
  in fixtures/t1_diff.py]. (Expected: code-review, security mini.)
- **T2:** Write release notes for dbsync 3.0 from these commits: [list in
  fixtures/t2_commits.txt]. (Expected: tech-writing, changelog + breaking
  changes minis.)
- **T3:** Our MCP server's tools keep getting picked wrongly by agents.
  Rewrite these three tool descriptions and schemas: [fixtures/t3_tools.md].
  (Expected: mcp-builder, naming + response/schema minis.)
- **T4:** Extract all tables from a scanned PDF contract into CSVs; give the
  complete runnable approach. (Expected: pdf, extraction + OCR minis.)
- **T5:** Compute liquidity and leverage ratios for the attached statements
  and flag concerns: [fixtures/meridian_financials.json]. (Expected:
  financial-analysis, liquidity/leverage mini.)
- **T6:** Draft the company-wide Slack post announcing our office move,
  from these facts: [fixtures/t6_facts.txt]. (Expected: internal-comms,
  general/announcement minis.)

Scoring (objective, no judges): right-skill rate, target-mini hit rate,
files and tokens read before first correct skill file, off-target loads.
Oracle condition: same tasks with the correct skill path given directly.
