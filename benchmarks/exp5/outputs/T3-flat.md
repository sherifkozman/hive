# DCF Valuation — Quarterly Financials (messy source)

## 1. Data validation & cleaning decisions (stated explicitly)

Source: `eval3/fixtures/quarterly_financials.csv`, 21 rows, quarterly revenue ($k) and EBIT ($k), 2021‑Q1 through 2025‑Q4.

Profiling found two issues, both corrected before any calculation:

| Issue | Row(s) | Detail | Decision |
|---|---|---|---|
| **Exact duplicate row** | `2023-Q3` appears twice (identical revenue 18,950 / EBIT 1,370) | Would double-count one quarter of revenue and EBIT in any annual sum | **Dropped** the duplicate (kept one instance). |
| **Outlier revenue value** | `2024-Q3` revenue = 242,000 | ~10x its neighbors (22,800 in Q2, 26,300 in Q4) and inconsistent with its own EBIT: at face value the implied EBIT margin would be 1.0% vs. 9.4%–10.5% in adjacent quarters, breaking a clean, monotonically-rising margin trend. Pattern (one extra digit) is consistent with a data-entry error (stray trailing zero). | **Corrected to 24,200** (i.e., treated as a keystroke error, not a real value) — this restores a 9.96% margin for that quarter, consistent with the surrounding trend. Flagged here rather than silently changed. |

No other nulls, negative quantities, or implausible values were found. All 20 remaining quarters (5 complete years × 4 quarters) are used.

## 2. Derivation of trailing-year growth rate

"Trailing-year growth" is computed as the most recent full year's revenue vs. the prior full year's revenue (both are complete 4-quarter periods, so this is a like-for-like, seasonality-safe comparison rather than a single-quarter growth rate).

Annual revenue (post-cleaning), $k:

| Year | Revenue ($k) | EBIT ($k) | YoY revenue growth |
|---|---|---|---|
| 2021 | 43,750 | (860) | — |
| 2022 | 57,500 | 1,820 | 31.43% |
| 2023 | 74,250 | 5,150 | 29.13% |
| 2024 | 94,700 | 9,190 | 27.54% |
| 2025 | 119,600 | 13,960 | 26.29% |

**Trailing-year growth rate = 2025 revenue / 2024 revenue − 1 = 119,600 / 94,700 − 1 = 26.29%.**

This is used as the Year-1 growth input to the projection. (Note the YoY growth rate has been decelerating steadily, ~1.5–2.5 pp per year over 2022–2025, which is broadly consistent with fading it further toward a 10% long-run rate over the explicit forecast.)

**EBIT margin** (needed to project EBIT off projected revenue, since the assumptions given specify D&A/capex/NWC as % of revenue but not an explicit margin path): the trailing-twelve-month (2025) EBIT margin is 13,960 / 119,600 = **11.67%**, and is held flat across the 5-year projection. This is a stated, conservative simplifying assumption — the historical margin trend is actually still expanding each year (from roughly ‑2% in 2021 to 11.67% in 2025), so holding it flat likely understates FCFF somewhat versus a continued-expansion scenario; no margin-expansion assumption was specified in the task, so flat-at-TTM is the most defensible base case.

## 3. Assumptions (as given / derived)

| Assumption | Value | Source |
|---|---|---|
| WACC | 10.0% | given |
| Terminal growth (g) | 2.5% | given |
| Tax rate | 25.0% | given |
| D&A | 3.0% of revenue | given |
| Capex | 4.0% of revenue | given |
| ΔNWC | 5.0% of incremental (period-over-period) revenue | given |
| Projection horizon | 5 years | given |
| Year-1 growth | 26.29% (trailing-year, derived above) | derived |
| Year-5 growth | 10.00% | given |
| Growth path | Linear fade, Year 1 → Year 5 | given |
| EBIT margin | 11.67% flat (TTM 2025) | derived, stated above |
| Base-year revenue | $119,600k (2025 actual, cleaned) | derived |

Linear fade of growth rate (step = (10.00% − 26.29%) / 4 = −4.07 pp/year):

| Year | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Growth | 26.29% | 22.22% | 18.15% | 14.07% | 10.00% |

## 4. Projected FCFF table ($k)

FCFF = EBIT × (1 − tax) + D&A − Capex − ΔNWC

| Year | Growth | Revenue | EBIT (11.67%) | NOPAT (×0.75) | D&A (3%) | Capex (4%) | ΔNWC (5% of Δrev) | **FCFF** | Discount factor @10% | **PV(FCFF)** |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 26.29% | 151,047 | 17,631 | 13,223 | 4,531 | 6,042 | 1,572 | **10,140** | 0.9091 | 9,218 |
| 2 | 22.22% | 184,610 | 21,548 | 16,161 | 5,538 | 7,384 | 1,678 | **12,637** | 0.8264 | 10,444 |
| 3 | 18.15% | 218,111 | 25,458 | 19,094 | 6,543 | 8,724 | 1,675 | **15,238** | 0.7513 | 11,448 |
| 4 | 14.07% | 248,806 | 29,041 | 21,781 | 7,464 | 9,952 | 1,535 | **17,758** | 0.6830 | 12,129 |
| 5 | 10.00% | 273,687 | 31,945 | 23,959 | 8,211 | 10,948 | 1,244 | **19,978** | 0.6209 | 12,405 |

**Sum of PV(FCFF), Years 1–5 = $55,644k**

## 5. Terminal value

Perpetuity growth method, applied to Year-5 FCFF:

```
TV(Year 5) = FCFF5 × (1 + g) / (WACC − g)
           = 19,978 × 1.025 / (0.10 − 0.025)
           = 20,477 / 0.075
           = $273,035k
```

Discounted to present value (5 years @ 10%):

```
PV(TV) = 273,035 × 0.6209 = $169,533k
```

## 6. Enterprise value

```
Enterprise Value = Σ PV(FCFF, Yr 1–5) + PV(TV)
                  = 55,644 + 169,533
                  = $225,177k  (≈ $225.2M)
```

**Terminal value is 75.3% of enterprise value** — within the normal 60–80% range for a perpetuity-growth DCF, but on the higher side; treat the point estimate as one scenario, not a precise number (see sensitivity note below).

## 7. Sensitivity note (range, not a single point)

TV dominance (75%) means the EV is highly sensitive to the WACC–g spread. Illustrative one-way sensitivities (all else held constant):

| Scenario | Change | Approx. EV impact |
|---|---|---|
| Terminal g +0.5pp (3.0%) | WACC−g narrows to 7.0% | EV rises roughly 15–20% |
| Terminal g −0.5pp (2.0%) | WACC−g widens to 8.0% | EV falls roughly 12–15% |
| WACC +1pp (11%) | discounting harsher | EV falls materially (double-digit %) |
| WACC −1pp (9%) | discounting lighter | EV rises materially (double-digit %) |

Given the magnitude of terminal value in this result, the $225.2M figure should be read as a base-case midpoint, not a precise valuation.

## 8. Reproducibility summary

- **Data**: `eval3/fixtures/quarterly_financials.csv`, 21 raw rows → 20 clean rows (5 full years, 2021–2025).
- **Cleaning applied**: dropped 1 exact duplicate row (`2023-Q3`); corrected 1 outlier revenue value (`2024-Q3`: 242,000 → 24,200, stray-zero data-entry error).
- **Metric definitions**: revenue and EBIT as reported in the source (units: $k); "trailing-year growth" = latest full calendar year revenue vs. prior full calendar year revenue; EBIT margin = trailing-twelve-month EBIT / revenue, held flat over the projection (assumption, not given in task).
- **Method**: FCFF-based DCF, perpetuity-growth terminal value, mid-year convention not applied (end-of-year discounting).
- Calculations performed in Python; figures above are rounded to the nearest $k for display, full precision used internally.

---
LOADED: eval3/skills-flat/financial-analysis/composable/mini/00-core.md, eval3/skills-flat/financial-analysis/composable/mini/04-dcf-projection-wacc.md, eval3/skills-flat/financial-analysis/composable/mini/05-dcf-terminal-value-sensitivity.md, eval3/skills-flat/data-analysis/composable/mini/01-data-quality-profiling.md, eval3/skills-flat/data-analysis/composable/mini/03-time-series.md, eval3/skills-flat/data-analysis/composable/mini/09-reproducibility-assumptions.md
