# Meridian Software Inc. — Investment Committee Work-Up

*B2B SaaS (vertical ERP). All figures USD thousands unless noted (per-share and multiples in USD/x). Source: `eval2/fixtures/meridian_financials.json`. Valuation date 2026-01-01.*

## Executive Summary (BLUF)

Meridian is a vertical-ERP SaaS business that turned the corner from an operating loss in FY2023 to an 11% operating margin in FY2025, growing revenue 25–30%/year, while cutting leverage (D/E 1.53x → 0.64x) and moving to a net-cash balance sheet (~$18.5M cash vs. $8.0M debt). A discounted-cash-flow model built on the supplied 2026–2030 growth/margin fade and a 10.06% WACC yields a base-case equity value of **USD 22.34/share**, with a sensitivity range of **USD 18.75 – 27.70/share** across ±1pt WACC and ±0.5pt terminal-growth. The DCF-implied EV/Revenue (2.86x trailing, 2.29x forward) sits at or below typical mid-growth vertical-SaaS comps (~4–7x), so the valuation is not aggressive — if anything conservative. A bottom-up driver model for FY2026 puts revenue at $79.9M (bear) / $83.7M (base) / $87.3M (bull), bracketing the DCF's own 2026 top-down assumption ($85.3M) and supporting the DCF's plausibility.

**Valuation range: USD 18.75 – 27.70 per share; base case USD 22.34/share.**

**Key risks:**
- **Terminal-value concentration** — the Gordon-growth terminal value is 78.9% of enterprise value, near the top of the normal 60–80% band, so the valuation leans heavily on out-year growth/margin and long-run WACC/g assumptions rather than the explicit 2026–2030 cash flows.
- **Short balance-sheet history** — liquidity, leverage, and efficiency ratios are only computable for FY2024–FY2025 (no FY2023 balance sheet was supplied), so the deleveraging and liquidity-improvement trend, while consistent, is a two-point read rather than an established multi-year pattern; FY2023's negative EBIT (interest coverage was negative that year) shows the current comfort is recent.
- **Retention economics dominate the 2026 outlook** — a ±7pt swing in annual net revenue retention (105% vs. 118%) moves FY2026 revenue by roughly ±$3.7M, more than the bookings-growth lever, and DSO has been flat at ~61 days (not improving) even as other metrics strengthen.

**Three focal points for the committee:**
1. **How much of the equity value is a bet on the terminal period.** With TV at ~79% of EV, the committee should stress-test the 2.5% terminal growth rate and the assumption that EBIT margin keeps expanding to 18% by 2030, not just the explicit-period numbers.
2. **NRR, not new bookings, is the single largest lever on next year's revenue.** The bull/base/bear range ($87.3M/$83.7M/$79.9M) is driven mostly by the compounding effect of churn/retention on the existing $71.5M ARR base — retention-program investment and renewal risk deserve more committee attention than the sales pipeline.
3. **Request a fuller balance-sheet history.** Leverage and liquidity look strong today (D/E 0.64x, current ratio 1.52x, 15.0x interest coverage), but this is confirmed for only one full year-over-year comparison; a FY2023 balance sheet (or FY2026 actuals as they emerge) would let the committee confirm this is a durable trend rather than a two-year snapshot.

---

## 1. Financial Health Snapshot (FY2023–FY2025)

**Data-availability note:** the balance sheet in the source data is only provided for FY2024 and FY2025 (no FY2023 balance sheet). Profitability metrics therefore cover FY2023–FY2025; liquidity, leverage, and efficiency ratios that require balance-sheet data cover FY2024–FY2025 only (a two-point trend, not three). This gap is stated rather than papered over.

### 1.1 Profitability

Operating income is derived as Revenue − COGS − (S&M + R&D + G&A), where D&A is embedded in opex per the source note (no separate D&A line to strip out).

| Metric | FY2023 | FY2024 | FY2025 | Trend |
|---|---:|---:|---:|---|
| Revenue | $42,000 | $54,600 | $68,250 | +30.0% ('24), +25.0% ('25) |
| Gross profit | $27,300 | $37,128 | $47,775 | — |
| **Gross margin** | 65.0% | 68.0% | 70.0% | ▲ steadily expanding |
| Operating income (EBIT) | ($2,900) | $2,730 | $7,509 | — |
| **Operating margin** | (6.9%) | 5.0% | 11.0% | ▲ crossed to profitable in FY24 |
| Net income | ($3,500) | $1,530 | $5,259 | — |
| **Net margin** | (8.3%) | 2.8% | 7.7% | ▲ |
| **ROE** (NI / ending equity) | n/a (no FY23 equity) | 26.0% | 42.3% | ▲ |
| ROE (NI / average equity, FY25 only) | — | — | 57.5% | supplementary |

**Interpretation:** Meridian shows a textbook SaaS profitability ramp — gross margin climbing through the 65–70% band (in line with the 70–85% SaaS benchmark, still slightly below mature peers, consistent with a still-scaling COGS base) while operating margin flips from a mid-single-digit loss to double digits over two years as S&M/R&D/G&A grow slower than revenue (opex grew ~33% while revenue grew ~63% cumulatively over the period). Net margin lags operating margin due to interest expense and a rising cash tax charge (tax expense grew from $0 to $1,750 as the company turned profitable). ROE of 26–42% looks strong against the generic >25% benchmark, but for a leveraged, thinly-capitalized SaaS company (FY24 equity of only $5,880) ROE is mechanically inflated by a small equity base — it should not be read as a sign of exceptional capital efficiency on its own.

**Rule of 40 check (SaaS-specific):** FY2025 revenue growth (25.0%) + operating margin (11.0%) = **36%**, just under the 40% bogey; using FCF margin (10.4%) instead of operating margin gives growth + FCF margin = **35.4%**. Both land just below the Rule-of-40 threshold — a reasonable, not exceptional, growth/profitability balance for a company still investing to scale, and directionally improving as margins expand.

### 1.2 Liquidity

Current assets = cash + accounts receivable + other current assets. Current liabilities = accounts payable + current deferred revenue + accrued liabilities. There is no inventory line (expected for a SaaS business), so the quick ratio is shown conservatively excluding "other current assets."

| Metric | FY2024 | FY2025 | Trend |
|---|---:|---:|---|
| Current assets | $22,800 | $31,875 | — |
| Current liabilities | $17,120 | $20,950 | — |
| **Current ratio** | 1.33x | 1.52x | ▲ acceptable → healthy |
| **Quick ratio** (cash + AR only, conservative) | 1.23x | 1.43x | ▲ healthy |
| Cash ratio (memo) | 0.70x | 0.88x | ▲ strong |

**Interpretation:** Both years sit in the "acceptable-to-healthy" 1.0–3.0x current-ratio band, improving year over year, and cash alone would cover 70–88% of current liabilities. However, a large share of current liabilities is **deferred revenue** ($10,920 in FY24, $13,650 in FY25 — roughly 64–65% of current liabilities), which is a non-cash obligation settled by delivering already-paid-for service rather than by disbursing cash. This is a favorable, SaaS-specific distortion: the "real" cash-liquidity picture is stronger than the ratio implies, since deferred revenue will not require a cash outflow to extinguish. Liquidity is not a near-term concern in either year.

### 1.3 Leverage

Debt-to-equity is calculated using reported long-term debt (the only interest-bearing debt disclosed) over shareholders' equity. Interest coverage = Operating income (EBIT) / interest expense.

| Metric | FY2023 | FY2024 | FY2025 | Trend |
|---|---:|---:|---:|---|
| LT debt | n/a | $9,000 | $8,000 | debt being paid down |
| Shareholders' equity | n/a | $5,880 | $12,425 | equity building via retained earnings |
| **D/E (LT debt / equity)** | n/a | 1.53x | 0.64x | ▼ sharp deleveraging |
| Interest expense | $600 | $550 | $500 | declining (consistent with debt paydown) |
| **Interest coverage (EBIT/interest)** | (4.8x) | 5.0x | 15.0x | ▲ from distressed to very strong |

**Interpretation:** FY2023's negative EBIT means interest could not be covered from operations at all that year (coverage is negative/meaningless in isolation — a going-concern-adjacent signal, though the company also holds a net-cash position per the DCF inputs). By FY2024, coverage reaches 5.0x (top of the "adequate" band); by FY2025 it is 15.0x — "very strong" — as EBIT nearly tripled while interest expense fell (debt was paid down from $9.0M to $8.0M). D/E fell from an "elevated" 1.53x to a "moderate" 0.64x in a single year, driven both by debt reduction and by equity roughly doubling from retained profits. Net of cash (~$18.5M cash vs. $8.0M debt at FY25), Meridian is in a net-cash position, which is the more decision-relevant leverage picture given no near-term refinancing risk.

### 1.4 Efficiency

| Metric | FY2024 | FY2025 | Trend |
|---|---:|---:|---|
| Asset turnover (Revenue / total assets) | 1.71x | 1.65x | flat/slightly down (asset base grew faster than revenue as cash built up) |
| Receivables turnover (Revenue / AR) | 6.00x | 6.00x | flat |
| **DSO (365 / receivables turnover)** | 60.8 days | 60.8 days | flat |

**Interpretation:** DSO of ~61 days sits in the "acceptable" 45–60-day band (borderline into "concern" territory at 60.8 exactly), which for enterprise/vertical-ERP SaaS with annual or multi-month billing cycles and a 90-day stated sales cycle (per the forecast inputs, Section 3) is plausible and not alarming — vertical ERP contracts often carry longer payment terms than SMB SaaS. It has not improved over the one comparable year, so it is worth monitoring as revenue scales; unlike gross margin or leverage, collections efficiency shows no trend of improvement yet. Asset turnover is essentially flat (~1.7x), which for asset-light SaaS is a reasonable efficiency level, though the slight dip in FY2025 mainly reflects cash accumulation ($12.0M → $18.5M) rather than any operational inefficiency.

### 1.5 Overall Assessment

Meridian's trajectory over FY2023–FY2025 is a coherent, positive SaaS scaling story: **gross margin expanding (65%→70%), operating losses turning into an 11% operating margin, net margin flipping positive (from ‑8.3% to +7.7%), leverage falling sharply (D/E 1.53x→0.64x) while interest coverage strengthens (5.0x→15.0x), and liquidity improving (current ratio 1.33x→1.52x)** — all while growth remains strong (25–30% per year) and Rule-of-40 sits just under 40%. The one metric not improving is DSO (flat at ~61 days), and the FY2023 interest-coverage/negative-EBIT year is a reminder that the current comfortable coverage is a recent development, not a multi-year track record. Balance-sheet ratios are only available for two of the three fiscal years, so the leverage/liquidity/efficiency trend should be treated as directional rather than a fully established multi-year pattern.

---

## 2. DCF Valuation

### 2.1 Discount Rate (WACC)

**Cost of equity — CAPM:**

```
Re = Rf + Beta x ERP
Re = 4.20% + 1.30 x 5.50% = 4.20% + 7.15% = 11.35%
```
(No size or company-specific premium supplied; base CAPM used.)

**After-tax cost of debt:**

```
Kd(after-tax) = Pre-tax Kd x (1 - Tax) = 6.50% x (1 - 0.25) = 4.875%
```

**WACC (target weights, D/V = 20%, E/V = 80%):**

```
WACC = E/V x Re + D/V x Kd(at)
     = 0.80 x 11.35% + 0.20 x 4.875%
     = 9.080% + 0.975% = 10.055%  (~10.06%)
```

| Component | Value |
|---|---|
| Risk-free rate | 4.20% |
| Equity risk premium | 5.50% |
| Beta | 1.30 |
| Cost of equity (Re) | **11.35%** |
| Pre-tax cost of debt | 6.50% |
| After-tax cost of debt | **4.875%** |
| Weights (E / D) | 80% / 20% |
| **WACC** | **10.06%** |

### 2.2 Driver Assumptions (as supplied)

- **Revenue growth:** 25.0% in 2026 fading linearly to 10.0% in 2030 → 25.00% / 21.25% / 17.50% / 13.75% / 10.00%.
- **EBIT margin:** 11.0% in 2026 expanding linearly to 18.0% in 2030 → 11.00% / 12.75% / 14.50% / 16.25% / 18.00%.
- **D&A** = 3.0% of revenue; **Capex** = 4.0% of revenue; **ΔNWC** = 5.0% of *incremental* revenue; **tax** = 25.0%.
- Base revenue 2025 = 68,250. Terminal growth g = 2.5%. Net debt = **−10,500** (net cash). Shares = 9,200k.

### 2.3 FCFF Projection (unlevered)

`FCFF = EBIT x (1−T) + D&A − Capex − ΔNWC`

| Year | Revenue | Growth | EBIT % | EBIT | NOPAT | D&A | Capex | ΔNWC | **FCFF** | DF @10.06% | PV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026 | 85,312.5 | 25.00% | 11.00% | 9,384.4 | 7,038.3 | 2,559.4 | 3,412.5 | 853.1 | **5,332.0** | 0.9086 | 4,844.9 |
| 2027 | 103,441.4 | 21.25% | 12.75% | 13,188.8 | 9,891.6 | 3,103.2 | 4,137.7 | 906.4 | **7,950.7** | 0.8256 | 6,564.3 |
| 2028 | 121,543.7 | 17.50% | 14.50% | 17,623.8 | 13,217.9 | 3,646.3 | 4,861.7 | 905.1 | **11,097.3** | 0.7502 | 8,325.1 |
| 2029 | 138,255.9 | 13.75% | 16.25% | 22,466.6 | 16,849.9 | 4,147.7 | 5,530.2 | 835.6 | **14,631.8** | 0.6816 | 9,973.7 |
| 2030 | 152,081.5 | 10.00% | 18.00% | 27,374.7 | 20,531.0 | 4,562.4 | 6,083.3 | 691.3 | **18,318.9** | 0.6194 | 11,346.2 |

**Sum of PV of explicit FCFF = 41,054.2**

### 2.4 Terminal Value (Gordon growth) & Enterprise Value

```
TV(2030) = FCFF_2030 x (1 + g) / (WACC − g)
         = 18,318.9 x 1.025 / (0.10055 − 0.025)
         = 18,776.9 / 0.07555 = 248,535.8
PV of TV = 248,535.8 x 0.6194 = 153,936.0
```

| Bridge item | Value |
|---|---|
| PV of explicit FCFF (2026–30) | 41,054.2 |
| PV of terminal value | 153,936.0 |
| **Enterprise Value** | **194,990.1** |
| − Net debt (−10,500 → net cash) | +10,500.0 |
| **Equity Value** | **205,490.1** |
| ÷ Shares outstanding (9,200k) | |
| **Value per share** | **USD 22.34** |

*TV is 78.9% of EV — inside (but near the top of) the normal 60–80% band, so the valuation leans heavily on terminal assumptions; flagged, not disqualifying.*

### 2.5 Sensitivity — WACC (±1pt) × Terminal Growth (±0.5pt)

**Enterprise Value (USD thousands)**

| WACC \ g | 2.00% | 2.50% | 3.00% |
|---|---|---|---|
| **9.06%** | 214,053 | 228,056 | 244,372 |
| **10.06%** | 184,731 | **194,990** | 206,704 |
| **11.06%** | 161,972 | 169,745 | 178,483 |

**Value per share (USD)** — equity = EV + 10,500 net cash, ÷ 9,200k shares

| WACC \ g | 2.00% | 2.50% | 3.00% |
|---|---|---|---|
| **9.06%** | 24.41 | 25.93 | 27.70 |
| **10.06%** | 21.22 | **22.34** | 23.61 |
| **11.06%** | 18.75 | 19.59 | 20.54 |

**Valuation range ≈ USD 18.75 – 27.70/share**, base case **USD 22.34**. A ±0.5pt move in g shifts EV by roughly 6–7% here; the ±1pt WACC move is the larger lever (~13–17%).

### 2.6 Sanity Check — Implied EV/Revenue vs SaaS Comps

- Implied **EV/Revenue (2025 actual) = 194,990 / 68,250 = 2.86x**
- Implied **EV/Revenue (2026E) = 194,990 / 85,312 = 2.29x**

Benchmark: mid-growth vertical B2B SaaS (~20–25% revenue growth, ~70% gross margin, expanding operating margins toward the "Rule of 40") typically trades around **4–7x forward revenue** in normal markets and **~3–5x** in more conservative/compressed environments. Meridian's DCF-implied **2.86x trailing / 2.29x forward** sits **at or below** that range — i.e., the DCF is *not* rich; if anything it is conservative for a 25% grower with a credible margin-expansion path and a net-cash balance sheet. The output passes the sanity check: no upward gap to comps that would signal aggressive assumptions. The main caveat remains terminal-value dominance (2.4), which the sensitivity table quantifies.

---

## 3. Driver-Based 4-Quarter 2026 Revenue Forecast

### 3.1 Method and assumptions

Inputs used (`forecast_inputs_2026`): beginning ARR $71,500K; Q1 new-bookings pipeline $6,800K; quarterly bookings growth 6%; gross churn (annual) 8%; net revenue retention (NRR, annual) 112%; sales cycle 90 days; headcount plan 312/328/341/355 (Q1–Q4); fully-loaded cost/head $168K/yr.

The model treats ARR as the driver and derives GAAP-style quarterly subscription revenue from it, decomposed as:

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
- **Key uncertainty**: the largest swing factor between scenarios is the compounding effect of quarterly NRR/churn on the existing $71.5M ARR base — a ±7pt swing in annual NRR (105% vs. 118%) moves FY2026 revenue by roughly ±$3.7M versus base, more than the bookings-growth lever alone, consistent with the driver-sensitivity principle that retention economics dominate a mature-cohort SaaS forecast.

---

LOADED: routed-fanout (E1+E2+E3+synthesis)
