## 3. Driver-Based 4-Quarter 2026 Revenue Forecast

### 3.1 Method and assumptions

Inputs used (`forecast_inputs_2026`): beginning ARR $71,500K; Q1 new-bookings pipeline $6,800K; quarterly bookings growth 6%; gross churn (annual) 8%; net revenue retention (NRR, annual) 112%; sales cycle 90 days; headcount plan 312/328/341/355 (Q1–Q4); fully-loaded cost/head $168K/yr.

The model treats ARR as the driver and derives GAAP-style quarterly subscription revenue from it (Revenue = Customers × ARPU × Retention, per the SaaS driver framework), decomposed as:

- **Existing-book roll-forward**: annual NRR (112%) and annual gross churn (8%) are both stated as *annual* rates and are converted to quarterly compounding rates so that four quarters compound back to the annual figures:
  - Quarterly churn = 1 − (1 − 8%)^(1/4) = **2.06%/quarter**
  - Quarterly net-retention multiplier = 112%^(1/4) = **1.0287 (+2.87%/quarter)** — this single multiplier is applied to each quarter's beginning ARR and nets churn against expansion/upsell (i.e., embeds both effects, consistent with the NRR definition).
- **New bookings**: Q1 new-ARR bookings = $6,800K (given), grown 6% q/q for Q2–Q4 (given driver), i.e., Q2 = $7,208K, Q3 = $7,640K, Q4 = $8,099K.
- **Ramp-lag assumption (stated gap-fill)**: the fixture gives `sales_cycle_days: 90` (~1 quarter) with no explicit rule connecting it to revenue. We assume this represents the time from deal-close/booking to the new ARR going "live" (implementation/onboarding), so bookings closed in quarter *t* begin contributing to ARR and revenue starting quarter *t+1*. This is the only interpretation that gives the 90-day input analytical use; it also conservatively avoids double-counting Q1 bookings as both "pipeline" and "closed-and-live" in the same period. Q4 2026 bookings therefore carry into Q1 2027 ARR (outside this forecast window).
- **ARR → Revenue conversion**: quarterly recognized revenue = average of beginning- and ending-quarter ARR, divided by 4 (mid-point convention, since ARR is an annualized exit run-rate and bookings/churn occur throughout the quarter).
- Headcount plan and cost/head are cost-side (S&M capacity) drivers, not used directly in the revenue build; flagged only as a capacity sanity check in 3.4.

### 3.2 Base case (fixture-stated drivers, unmodified)

Drivers: bookings growth 6%/qtr, gross churn 8%/yr, NRR 112%/yr.

| Quarter | New bookings booked ($K) | New ARR going live ($K) | Beginning ARR ($K) | Ending ARR ($K) | Quarterly revenue ($K) |
|---|---|---|---|---|---|
| Q1 2026 | 6,800 | 0 | 71,500 | 73,555 | 18,132 |
| Q2 2026 | 7,208 | 6,800 | 73,555 | 82,469 | 19,503 |
| Q3 2026 | 7,640 | 7,208 | 82,469 | 92,046 | 21,814 |
| Q4 2026 | 8,099 | 7,640 | 92,046 | 102,332 | 24,297 |
| **FY2026 total** | | | | **Exit ARR 102,332** | **83,746** |

FY2026 revenue = **$83,746K**, +22.7% vs. FY2025 actual ($68,250K).

### 3.3 Bull and bear scenarios

Per the three-scenario framework, drivers are flexed on pipeline size, bookings growth, churn, and NRR (bull favorable / bear adverse, not catastrophic):

| Driver | Bear | Base (fixture) | Bull |
|---|---|---|---|
| Q1 bookings pipeline | $5,780K (−15%) | $6,800K | $7,820K (+15%) |
| Quarterly bookings growth | 2%/qtr | 6%/qtr | 10%/qtr |
| Gross annual churn | 12% | 8% | 6% |
| Annual NRR | 105% | 112% | 118% |
| Implied quarterly churn | 3.15% | 2.06% | 1.54% |
| Implied quarterly net-retention mult. | 1.0123 (+1.23%) | 1.0287 (+2.87%) | 1.0423 (+4.23%) |

**Bear case**

| Quarter | Bookings ($K) | ARR live-add ($K) | Beg. ARR ($K) | End ARR ($K) | Revenue ($K) |
|---|---|---|---|---|---|
| Q1 | 5,780 | 0 | 71,500 | 72,378 | 17,985 |
| Q2 | 5,896 | 5,780 | 72,378 | 79,046 | 18,928 |
| Q3 | 6,014 | 5,896 | 79,046 | 85,911 | 20,620 |
| Q4 | 6,134 | 6,014 | 85,911 | 92,979 | 22,361 |
| **FY2026 total** | | | Exit ARR 92,979 | | **79,894** |

FY2026 revenue = **$79,894K**, +17.1% vs FY2025.

**Bull case**

| Quarter | Bookings ($K) | ARR live-add ($K) | Beg. ARR ($K) | End ARR ($K) | Revenue ($K) |
|---|---|---|---|---|---|
| Q1 | 7,820 | 0 | 71,500 | 74,521 | 18,253 |
| Q2 | 8,602 | 7,820 | 74,521 | 85,489 | 20,001 |
| Q3 | 9,462 | 8,602 | 85,489 | 97,703 | 22,899 |
| Q4 | 10,408 | 9,462 | 97,703 | 111,292 | 26,124 |
| **FY2026 total** | | | Exit ARR 111,292 | | **87,277** |

FY2026 revenue = **$87,277K**, +27.9% vs FY2025.

### 3.4 Scenario summary and cross-checks

| Scenario | FY2026 Revenue ($K) | YoY Growth | Exit ARR ($K) | Q4 run-rate implied growth (Q4 rev ×4 vs FY25) |
|---|---|---|---|---|
| Bear | 79,894 | +17.1% | 92,979 | 22,361×4=89,444 → +31.1% |
| **Base** | **83,746** | **+22.7%** | **102,332** | 24,297×4=97,187 → +42.4% |
| Bull | 87,277 | +27.9% | 111,292 | 26,124×4=104,494 → +53.1% |

- **Sanity check vs. DCF (Section 2) top-down assumption**: the DCF's stated 2026 growth input ("25% in 2026 fading linearly to 10% by 2030") implies FY2026 revenue of $68,250K × 1.25 = **$85,313K** — between the driver-model's base ($83,746K, −1.8% vs. DCF) and bull ($87,277K, +2.3% vs. DCF) cases. The bottom-up base case is directionally consistent with, but modestly more conservative than, the top-down DCF assumption; the bull case brackets it. This cross-consistency supports both models' plausibility; the ~2pt gap is attributable to the ramp-lag assumption in 3.1, which defers roughly half of Q4 2026 bookings' revenue contribution into 2027.
- **Capacity sanity check (not part of revenue calc)**: headcount grows from 312 (Q1) to 355 (Q4), +13.8% over the year, broadly in line with the base-case bookings growth path (6%/qtr compounding to ~26% for the year), suggesting the sales/CS org is scaling consistent with (not far ahead of or behind) the bookings plan.
- **Key uncertainty**: the largest swing factor between scenarios is the compounding effect of quarterly NRR/churn on the existing $71.5M ARR base — a ±7pt swing in annual NRR (105% vs. 118%) moves FY2026 revenue by roughly ±$3.7M versus base, more than the bookings-growth lever alone, consistent with the driver-sensitivity principle (rank by impact × uncertainty) that retention economics dominate a mature-cohort SaaS forecast.

LOADED: /home/user/hive/eval2/tasks/fin-broad.md, /home/user/hive/skills/financial-analysis/composable/INDEX.md, /home/user/hive/eval2/fixtures/meridian_financials.json, /home/user/hive/skills/financial-analysis/composable/mini/00-core.md, /home/user/hive/skills/financial-analysis/composable/mini/08-driver-based-forecasting-scenarios.md, /home/user/hive/skills/financial-analysis/composable/mini/11-industry-adaptations.md
