---
pairs-with:
  - 08-driver-based-forecasting-scenarios.md
  - 10-reporting-exec-summary.md
---

# Budget Variance Analysis

Analyze actual vs budget vs prior-year performance with materiality filtering to explain what happened and drive corrective action.

## Core Calculations

- **Dollar variance** = Actual − Budget (also compute vs prior year).
- **Percentage variance** = (Actual − Budget) / Budget × 100%.
- Compute both against budget and against prior-year actuals for a full picture.

## Favorable / Unfavorable Classification

Direction depends on line-item type (revenue vs expense logic):
- **Revenue:** actual above budget is **favorable**; below is **unfavorable**.
- **Expense:** actual below budget is **favorable**; above is **unfavorable**.

Apply this sign logic per line item: never treat a raw positive dollar variance as automatically "good."

## Materiality Filtering

Filter to variances worth explaining using a materiality threshold: **default 10% or $50K** (whichever triggers). Tighten for sensitive analyses (e.g., 5% / $25K). Only material variances demand root-cause explanation, keeping reports focused.

## Breakdown & Reporting

- Break variances down by **department** and by **category** so ownership is clear.
- Generate an **executive summary** highlighting the largest and most material variances.
- Target: **explain 100% of material variances** with root causes.

## Variance Analysis Loop (feedback into forecasting)

After each period closes:
- Compare actual vs budget/forecast
- Identify root causes of significant variances
- Update driver assumptions based on learnings
- Document what changed and why

Build a **variance bridge** that walks from budget (or prior forecast) to the current actual/forecast, attributing the gap to specific drivers. This closed loop both explains the period and improves the next forecast's accuracy.

## Discipline

Validate input completeness before computing (missing or null line items produce misleading variances). Watch for reclassifications and one-time items that create apparent variances without economic substance.
