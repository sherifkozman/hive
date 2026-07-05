---
pairs-with:
  - data-analysis/01-data-quality-profiling.md
---

# Core: Financial Analyst Method

Always-loaded foundation for a production-ready financial analysis toolkit providing ratio analysis, DCF valuation, budget variance analysis, and rolling forecast construction. Designed for financial modeling, forecasting & budgeting, management reporting, business performance analysis, and investment analysis. Load the focused minis (see INDEX) for formulas, benchmarks, methods, and tooling.

## The 5-Phase Workflow

### Phase 1: Scoping
- Define analysis objectives and stakeholder requirements
- Identify data sources and time periods
- Establish materiality thresholds and accuracy targets
- Select appropriate analytical frameworks

### Phase 2: Data Analysis & Modeling
- Collect and validate financial data (income statement, balance sheet, cash flow)
- **Validate input data completeness** before running ratio calculations (check for missing fields, nulls, or implausible values)
- Calculate financial ratios across 5 categories (profitability, liquidity, leverage, efficiency, valuation)
- Build DCF models with WACC and terminal value calculations; **cross-check DCF outputs against sanity bounds** (e.g., implied multiples vs. comparables)
- Construct budget variance analyses with favorable/unfavorable classification
- Develop driver-based forecasts with scenario modeling

### Phase 3: Insight Generation
- Interpret ratio trends and benchmark against industry standards
- Identify material variances and root causes
- Assess valuation ranges through sensitivity analysis
- Evaluate forecast scenarios (base/bull/bear) for decision support

### Phase 4: Reporting
- Generate executive summaries with key findings
- Produce detailed variance reports by department and category
- Deliver DCF valuation reports with sensitivity tables
- Present rolling forecasts with trend analysis

### Phase 5: Follow-up
- Track forecast accuracy (target: +/-5% revenue, +/-3% expenses)
- Monitor report delivery timeliness (target: 100% on time)
- Update models with actuals as they become available
- Refine assumptions based on variance analysis

## Data-Validation Discipline (do this before computing)

- **Validate completeness first**: check for missing fields, nulls, or implausible values before running any calculation. Forecasting without key driver inputs is a top accuracy killer.
- **Check plausibility**: values within sane bounds (e.g., margins ≤ 100%, positive denominators).
- **Cross-check outputs against sanity bounds**: reconcile DCF implied multiples against comparables; if terminal value exceeds 80% of enterprise value, shorten the projection or revisit assumptions; both TV methods (perpetuity vs exit multiple) should agree.

## Cross-Cutting Traps

- **Compare within industry**: ratios and multiples vary hugely across sectors; use direct peers, not just broad benchmarks.
- **Trends over snapshots**: a single period is insufficient; review 3–5 year trends.
- **Use multiple measures**: no single ratio or method tells the whole story.
- **Consider context**: accounting policies, business cycle, and company stage matter.
- **Watch for manipulation**: revenue-recognition changes, off-balance-sheet items, and one-time adjustments distort ratios.
- **Avoid confirmation bias**: never work backward from a desired conclusion.
- **Present ranges, not points**: always show sensitivity and quantify uncertainty rather than false precision.
- **Documentation**: document every assumption; explain 100% of material variances.

## Key Metrics & Targets

| Metric | Target |
|--------|--------|
| Forecast accuracy (revenue) | +/-5% |
| Forecast accuracy (expenses) | +/-3% |
| Report delivery | 100% on time |
| Model documentation | Complete for all assumptions |
| Variance explanation | 100% of material variances |
