---
pairs-with:
  - 02-aggregation-pitfalls.md
  - 09-reproducibility-assumptions.md
---

# Data Quality Profiling & Cleaning Decisions

Never compute a headline number before profiling the data. Rushing to a total on dirty data produces confident, wrong answers.

**Profiling checklist for every dataset:**
- **Shape and grain.** How many rows, and what does one row represent? "One row = one order line" vs "one row = one order" changes every aggregation. State the grain explicitly.
- **Row count vs. expected.** Does the count match what the business expects for the period? A month with 3x normal rows signals duplication or a double-loaded file.
- **Nulls per column.** Count and locate missing values. Revenue 8% null is a different problem from 0.1% null.
- **Ranges and distributions.** Min/max/quartiles for numerics. Negative prices, zero quantities, future dates, or a max 1000x the median flag problems.
- **Uniqueness.** Are IDs that should be unique actually unique? Duplicate order IDs are the classic silent inflator.
- **Categoricals.** How many distinct values? Look for the same thing spelled differently ("US", "USA", "United States"), stray whitespace, and case differences.

**Cleaning decisions must be explicit and defensible.** For each issue decide and record: drop, impute, cap, or keep-and-flag, and why.
- Missing revenue on 0.1% of rows: dropping is usually fine; note it.
- Missing region on 15% of rows: dropping biases the geography analysis. Keep as "Unknown" and report its size.
- One $2,000,000 transaction when the median is $200: investigate before deciding. It may be real (an enterprise deal) or an error (cents entered as dollars). **Never silently delete it.**

**Rule: every cleaning choice changes the answer, so every cleaning choice must be stated.** An analysis whose data decisions are hidden cannot be trusted or reproduced.

**Worked example.** You receive 50,000 sales rows. Profiling shows 51,200 order IDs but only 50,000 distinct (1,200 duplicates that would inflate any revenue sum). Region is null on 12% of rows. Two orders are dated in 2027. Actions: dedupe on order ID (document the key), keep null region as "Unknown (12%)", quarantine the future-dated rows pending a source check. Record all three decisions before computing a single total.
