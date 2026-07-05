# Meridian Software Inc. — Investment Committee Work-Up

*B2B SaaS, vertical ERP. All dollar figures in USD thousands except per-share values. Valuation date: 2026-01-01.*

---

## Executive Summary (BLUF)

**Meridian is a fast-scaling, recently-turned-profitable vertical SaaS company (FY2025 revenue $68.25M, +25.0% YoY; EBIT margin 11.0%; net margin 7.7%) with improving credit metrics (interest coverage 15.0x, D/E down to 0.64x) and strong FCF conversion (135% of net income).** A five-year FCFF DCF anchored on management's growth-fade / margin-expansion assumptions and a WACC of ~10.06% produces:

- **Enterprise Value ≈ $195M (base case), range ≈ $162M–$244M across the WACC (±1pt) / terminal-growth (±0.5pt) sensitivity grid**
- **Equity Value ≈ $205M (base case), range ≈ $172M–$254M** (net cash position of $10.5M added back)
- **Per-share value ≈ $22.34 (base case), range ≈ $18.75–$27.70** on 9.2M diluted shares
- Implied EV/2025 Revenue ≈ **2.9x** (EV/2026E Revenue ≈ 2.3x) — sits **below** the bundle's SaaS EV/Revenue framework for moderate/high-growth names (8–15x for 20–50% growth, 15–25x for >50% growth), which is a material internal tension flagged below.

**Three key risks:**
1. **Terminal-value dominance.** The terminal value is **78.9% of enterprise value** — just under the 80% threshold at which the method's reliability is considered compromised — so the valuation is highly leveraged to the terminal growth rate and long-run WACC; a 0.5pt swing in g alone moves per-share value by roughly $1.15–$1.30.
2. **Bottom-up vs. top-down revenue disconnect.** The ARR/bookings-driven 2026 forecast (Section 3) implies **27.3%–37.6%** FY2026 revenue growth even in the bear case, versus the **25.0%** growth baked into the DCF's top-down fade assumption. If the bottom-up build is credible, the DCF is conservative; if the DCF is right, the ARR-forecast methodology (or underlying bookings/retention assumptions) is overstating near-term momentum. This needs reconciliation with management before the committee anchors on either number.
3. **Thin equity base inflating ROE.** ROE of 42.3% (2025) reflects a small equity denominator ($12.4M) from recent historical losses, not an unusually capital-efficient business — DuPont decomposition (below) shows leverage/turnover, not just margin, are driving the ratio. Read ROE as noisy until the equity base matures.

**Three focal points for the committee:**
1. **WACC / terminal-growth calibration** — given TV's outsized weight, spend committee time on beta selection (1.3, unlevered/re-levered check) and whether 2.5% terminal growth is defensible, rather than on precision in the explicit forecast.
2. **Which 2026 revenue number to underwrite** — the DCF's 25% or the driver-based 27–38% range — and what bookings/NRR assumptions the deal team should validate directly with Meridian's RevOps team.
3. **Capital structure trajectory** — leverage nearly halved YoY (D/E 1.53x → 0.64x) and coverage strengthened to "very strong" (>10x); confirm this deleveraging is intentional policy (target D/(D+E) of 20% per the DCF assumptions) rather than opportunistic and likely to reverse.

---

## 1. Financial Health Snapshot (FY2023–FY2025)

**Data coverage caveat:** the income statement spans all three years, but the balance sheet only covers FY2024–FY2025 (no FY2023 balance sheet was provided) and cash-flow data is available only for FY2025. Liquidity, leverage, ROE, ROA, asset turnover, and DSO are therefore shown for 2024–2025 only; profitability margins and interest coverage are shown for the full three years. Per the analyst-method discipline, this gap is flagged rather than papered over with an assumption.

### 1.1 Profitability

| Metric | FY2023 | FY2024 | FY2025 | SaaS-appropriate read |
|---|---:|---:|---:|---|
| Revenue | $42.00M | $54.60M | $68.25M | +30.0% (24 vs 23), +25.0% (25 vs 24) |
| Gross Margin | 65.0% | 68.0% | 70.0% | Climbing through the SaaS 70–85% band; hit the low end of "good" in FY2025 — watch that hosting/support costs don't creep back up as the customer base scales |
| Operating Margin (EBIT) | (6.9)% | 5.0% | 11.0% | Crossed from "below average" to "acceptable" territory in two years; consistent with SaaS J-curve as S&M/R&D investment (still ~63% of revenue combined in 2025) is absorbed by scale |
| EBITDA | ($1.70M) | $4.33M | $9.51M | Turned solidly positive; D&A is modest (~3% of revenue), so EBIT and EBITDA trends move together |
| Net Margin | (8.3)% | 2.8% | 7.7% | "Acceptable" by FY2025 (3–10% band); trajectory is the story more than the level |
| Rule of 40 (Growth % + Op. Margin %) | n/a | 30.0 + 5.0 = **35.0** | 25.0 + 11.0 = **36.0** | Still below the 40 threshold but converging via margin expansion rather than growth deceleration — the healthier of the two paths |

*Note: EBIT reconciles exactly to the stated net income in every year once interest expense and tax are applied (verified: e.g., FY2025 EBIT $7.509M − interest $0.500M = pretax $7.009M − tax $1.750M = net income $5.259M ✓), confirming D&A is embedded within the reported opex lines rather than an additional charge.*

### 1.2 Liquidity

| Metric | FY2024 | FY2025 | Benchmark read |
|---|---:|---:|---|
| Current Ratio | 1.33 | 1.52 | Improving through the "acceptable" (1.0–1.5) into "healthy" (1.5–3.0) range |
| Quick Ratio (Cash+AR / Current Liabilities)* | 1.23 | 1.43 | Healthy; no inventory line exists (asset-light SaaS model), so this is close to the current ratio by construction |

\*Quick ratio computed conservatively as (Cash + AR) / Current Liabilities, excluding "other current assets" since its composition (e.g., prepaids) is not broken out and prepaids are not truly liquid — stated assumption given the data gap.

**Important nuance:** a large share of current liabilities is **deferred revenue** ($10.92M in 2024, $13.65M in 2025 — roughly 64–65% of current liabilities). Deferred revenue is a non-cash obligation to deliver service, not a cash claim; strict liquidity ratios therefore understate Meridian's true cash-liquidity position. This is a standard SaaS distortion the committee should keep in mind rather than reading the ratios at face value.

### 1.3 Leverage

| Metric | FY2023 | FY2024 | FY2025 | Benchmark read |
|---|---:|---:|---:|---|
| Debt-to-Equity (LT Debt / Equity) | n/a (no BS) | 1.53 | 0.64 | Moved from "elevated" (0.8–2.0) to "moderate" (0.3–0.8) — meaningful deleveraging, driven both by debt paydown ($9.0M→$8.0M) and equity build from retained earnings |
| Interest Coverage (EBIT/Interest) | (4.8)x | 5.0x | 15.0x | Distressed → "adequate" → "very strong" (>10x) in two years; reflects EBIT turning positive and growing much faster than interest expense, which itself declined |

### 1.4 Efficiency

| Metric | FY2024 | FY2025 | Read |
|---|---:|---:|---|
| DSO (AR/Revenue × 365) | 60.8 days | 60.8 days | Flat at the "acceptable" (45–60) / "concern" (>60) boundary — essentially unchanged; worth confirming this reflects standard quarterly/annual up-front invoicing terms for enterprise SaaS contracts rather than collections slippage, since two years of flat ~61-day DSO alongside 25%+ revenue growth is a reasonably clean signal (no deterioration), not obviously an efficiency win either |
| Asset Turnover (Revenue/Total Assets) | 1.71x | 1.65x | Well above the bundle's generic "Technology" reference range (0.5–1.0x), consistent with a capital-light subscription model carrying little PP&E/inventory; the generic tech benchmark under-fits a pure-play SaaS balance sheet, so this is a strength, not an outlier to worry about |
| FCF Conversion (2025 only: (CFO−CapEx)/Net Income) | — | 135% | CFO $9.8M − CapEx $2.7M = FCF $7.1M vs. net income $5.26M. Conversion >100% is typical and healthy for growing subscription businesses, driven by deferred-revenue collections running ahead of P&L recognition |

### 1.5 Returns — ROE, ROA, and DuPont Decomposition

| Metric | FY2024 | FY2025 | Read |
|---|---:|---:|---|
| ROE | 26.0% | 42.3% | "Good" → "excellent" (>25%) by the generic benchmark, but see DuPont below — leverage inflates this |
| ROA | 4.8% | 12.7% | "Acceptable" → "excellent" (>12%) |

**DuPont (ROE = Net Margin × Asset Turnover × Equity Multiplier):**

| Year | Net Margin | × Asset Turnover | × Equity Multiplier (Assets/Equity) | = ROE |
|---|---:|---:|---:|---:|
| 2024 | 2.80% | × 1.706 | × 5.44 | = 26.0% |
| 2025 | 7.71% | × 1.650 | × 3.33 | = 42.3% |

The 2024 ROE of 26% is driven mostly by a **very high equity multiplier (5.44x)** — i.e., a thin equity base — not superior operating returns; note the multiplier nearly halved by 2025 (3.33x) as retained earnings rebuilt equity, and ROE *still* rose because margin expansion (2.8%→7.7%) and turnover more than offset the deleveraging. That combination (margin up, leverage down, ROE up) is the healthiest possible read, but the absolute ROE level should not be compared naively to mature-company benchmarks given how recently the equity base was rebuilt from losses.

---

## 2. DCF Valuation

### 2.1 Cost of Capital

**Cost of Equity (CAPM):**
```
Re = Rf + Beta × ERP = 4.2% + 1.30 × 5.5% = 4.2% + 7.15% = 11.35%
```
No size premium or company-specific risk adjustment was supplied in the inputs; per the disclosed-assumptions discipline, we assume **0%** for both rather than inventing a figure — this is a conservative simplification worth flagging, since a company of Meridian's scale (~$68M revenue) would often warrant a small positive size premium (0–5% per the standard CAPM build), which would push Re (and WACC) modestly higher than shown here.

**After-tax Cost of Debt:**
```
Rd(after-tax) = Pre-tax Rd × (1 − Tax Rate) = 6.5% × (1 − 0.25) = 6.5% × 0.75 = 4.875%
```

**WACC** (target capital structure: 20% debt / 80% equity, per DCF assumptions):
```
WACC = (E/V × Re) + (D/V × Rd,after-tax)
     = (0.80 × 11.35%) + (0.20 × 4.875%)
     = 9.080% + 0.975%
     = 10.055%
```

### 2.2 Revenue & Margin Path (linear fades per stated assumptions)

Growth fades linearly from 25% (2026) to 10% (2030); EBIT margin expands linearly from 11% (2026) to 18% (2030). Both interpreted as straight-line (4 equal steps across 5 years) in the absence of a stated curve shape.

**Validation check:** FY2025 revenue actually grew 25.0% over FY2024 ($54.60M → $68.25M is exactly +25.0%) — matching the DCF's assumed *starting* 2026 growth rate of 25%. This is a useful internal consistency check: the model's near-term growth assumption is simply "hold the current realized growth rate for one more year, then fade it," which is a defensible base case rather than an arbitrary number.

| Year | Growth | EBIT Margin |
|---|---:|---:|
| 2026 | 25.00% | 11.00% |
| 2027 | 21.25% | 12.75% |
| 2028 | 17.50% | 14.50% |
| 2029 | 13.75% | 16.25% |
| 2030 | 10.00% | 18.00% |

### 2.3 FCFF Projection (2026–2030)

```
UFCF = EBIT × (1 − Tax) + D&A − CapEx − ΔNWC
D&A = 3.0% of revenue; CapEx = 4.0% of revenue; ΔNWC = 5.0% of incremental (Y/Y) revenue; Tax = 25%
```

| ($000s) | 2026 | 2027 | 2028 | 2029 | 2030 |
|---|---:|---:|---:|---:|---:|
| Revenue | 85,313 | 103,441 | 121,544 | 138,256 | 152,082 |
| EBIT | 9,384 | 13,189 | 17,624 | 22,467 | 27,375 |
| NOPAT (EBIT × 75%) | 7,038 | 9,892 | 13,218 | 16,850 | 20,531 |
| + D&A (3% rev) | 2,559 | 3,103 | 3,646 | 4,148 | 4,562 |
| − CapEx (4% rev) | (3,413) | (4,138) | (4,862) | (5,530) | (6,083) |
| − ΔNWC (5% of Δrev) | (853) | (906) | (905) | (836) | (691) |
| **FCFF** | **5,332** | **7,951** | **11,097** | **14,632** | **18,319** |

### 2.4 Terminal Value, Enterprise Value, Equity Value, Per-Share Value

**Gordon Growth terminal value** (terminal growth g = 2.5%, per stated assumption):
```
TV(2030) = FCFF(2030) × (1+g) / (WACC − g) = 18,319 × 1.025 / (0.10055 − 0.025) = 18,326.4 / 0.07555 = 248,536
PV(TV) = 248,536 / (1.10055)^5 = 153,936
```

| | Value ($000s) |
|---|---:|
| Sum of PV(FCFF 2026–2030) | 41,054 |
| PV(Terminal Value) | 153,936 |
| **Enterprise Value** | **194,990** |
| TV as % of EV | **78.9%** — just under the 80% caution threshold; within normal range for a Gordon-growth DCF but a reminder that this valuation is fundamentally a bet on the durability of Meridian's business a decade+ out, not on the explicit 5-year plan |
| − Net Debt (2025: net **cash** of $10.5M) | (10,500) |
| **Equity Value** | **205,490** |
| ÷ Diluted Shares (000s) | 9,200 |
| **Value per Share** | **$22.34** |

Meridian carries **net cash**, not net debt, as of 2025 ($18.5M cash vs. $8.0M LT debt), so the EV→equity bridge *adds* value rather than subtracting it.

### 2.5 Sensitivity — Per-Share Value (WACC × Terminal Growth)

| WACC \ Terminal g | 2.0% | 2.5% (base) | 3.0% |
|---|---:|---:|---:|
| **9.055%** (WACC −1pt) | $24.41 | $25.93 | $27.70 |
| **10.055%** (base) | $21.22 | **$22.34** | $23.61 |
| **11.055%** (WACC +1pt) | $18.75 | $19.59 | $20.54 |

Enterprise Value across the same grid, for reference ($000s): ranges from **$161,972** (high WACC / low g) to **$244,372** (low WACC / high g), vs. base case **$194,990**.

The grid confirms the terminal-growth axis moves value by ~$1.2–$1.8/share per 0.5pt (consistent with the bundle's "0.5% change in g can move EV 15–25%" guidance — here roughly 10–13% swing in EV), while a full 1pt of WACC moves per-share value by roughly $2.75–$3.60 (~14–16%). WACC is the more powerful lever, and both are well within the standard sensitivity ranges — no red flags on model behavior.

### 2.6 Sanity Check — Implied Multiples

- **Implied EV/2025 Revenue ≈ 2.86x**; **Implied EV/2026E Revenue ≈ 2.29x**.
- Per the SaaS industry-adaptation framework, EV/Revenue multiples for a company growing 20–50% "should" sit around **8–15x** (moderate growth) up to 15–25x for >50% growth. Meridian's DCF-implied 2.3–2.9x is **well below** that band.

**Interpretation — this is a real tension, not a rounding issue.** Two explanations are plausible and the committee should distinguish between them:
1. The DCF's WACC (10.06%, driven by beta 1.3 and no size premium) combined with a 5-year explicit period fading to only 10% terminal growth may be **conservative relative to how the market actually prices comparable high-growth vertical SaaS** — i.e., the DCF may be a floor, and a comps-based cross-check (EV/Revenue or EV/ARR multiples from direct peers) would likely produce a materially higher valuation. This DCF was run without comparable-company data (none was supplied in the fixture), so this cross-check could not be completed here — **flagged as a data gap**: the committee should obtain a peer set (revenue growth, margin profile, ARR multiple) before finalizing a valuation range.
2. Alternatively, if 2.3–2.9x is judged to be the "right" multiple for Meridian specifically (e.g., due to a lower long-term margin ceiling, higher execution risk, or a smaller/less liquid public comp set), then the DCF and market framework are consistent and the SaaS benchmark simply doesn't apply cleanly to this name.

Given the DCF/comp gap could not be resolved with the data provided, **the committee should treat $18.75–$27.70/share as a DCF-only range, not a final fair-value conclusion**, pending a comparable-company cross-check.

---

## 3. Driver-Based 2026 Quarterly Revenue Forecast

### 3.1 Methodology & Stated Assumptions

Inputs provided: beginning 2026 ARR ($71.5M), Q1 bookings pipeline ($6.8M), quarterly bookings growth (6%), gross annual churn (8%), net revenue retention (112%), and a 90-day sales cycle. Several modeling choices were required to bridge these into quarterly GAAP-style revenue, and are stated explicitly (per the "document every assumption" discipline):

1. **Pipeline-to-bookings conversion:** the 90-day sales cycle is approximately one quarter, so we assume the stated Q1 "bookings pipeline" of $6.8M substantially converts into **closed new-logo ARR bookings within Q1** (i.e., treated as new bookings, not gross pipeline requiring a separate win-rate haircut). No win-rate/conversion-rate input was provided; if the committee's own diligence suggests a pipeline coverage ratio (e.g., 3–4x pipeline-to-bookings is typical), the $6.8M new-bookings figure would need to be reduced accordingly — **flagged as the single largest assumption in this section**.
2. **New-bookings growth:** the stated 6% quarterly bookings growth is applied to the new-bookings figure each subsequent quarter (Q2 = Q1 × 1.06, etc.), compounding.
3. **Existing-book dynamics (churn/expansion):** the 112% annual NRR is converted to a quarterly compounding factor: NRR^(1/4) = 1.12^0.25 = **1.02874** (i.e., ARR from the existing customer base grows ~2.87%/quarter net of churn and expansion, compounded). This is applied to the *beginning-of-quarter* ARR balance (which itself includes prior quarters' new bookings, since new logos become part of the retained base going forward).
4. **ARR → recognized revenue:** ARR is a run-rate (annualized) metric; recognized quarterly subscription revenue is approximated as **average(Beginning ARR, Ending ARR) / 4**, which assumes new bookings ramp roughly linearly through the quarter (a standard simplification, not the given point-in-time ARR ÷ 4, which would overstate revenue by assuming all bookings closed on day one).
5. **Gross churn (8%) vs. NRR (112%):** these are consistent (112% = 100% − 8% churn + ~20% expansion), so only NRR is used directly in the compounding to avoid double-counting.

### 3.2 Base Case (as-stated drivers: 112% NRR, 6% qoq bookings growth)

| Quarter | Beginning ARR | Retained + Expanded | New Bookings | Ending ARR | Quarterly Revenue |
|---|---:|---:|---:|---:|---:|
| Q1 | 71,500 | 73,555 | 6,800 | 80,355 | **18,982** |
| Q2 | 80,355 | 82,664 | 7,208 | 89,872 | **21,278** |
| Q3 | 89,872 | 92,455 | 7,641 | 100,095 | **23,746** |
| Q4 | 100,095 | 102,972 | 8,099 | 111,070 | **26,396** |
| **FY2026 Total** | | | | | **90,402** |

FY2026 base-case revenue of **$90.4M** implies **+32.5%** growth over FY2025's $68.25M — notably above the DCF's 25% assumption (see Section 2.6 tension and Executive Summary risk #2).

### 3.3 Bull Case

**Driver assumptions:** NRR improves to **120%** (stronger expansion / lower churn — e.g., successful upsell motion, competitor disruption) and bookings growth accelerates to **10% qoq** (faster new-logo acquisition, larger average deal size, or shorter sales cycles freeing up rep capacity). Q1 bookings held at the same $6.8M starting point (already substantially in-flight).

| Quarter | Beginning ARR | Ending ARR | Quarterly Revenue |
|---|---:|---:|---:|
| Q1 | 71,500 | 81,634 | 19,142 |
| Q2 | 81,634 | 92,921 | 21,820 |
| Q3 | 92,921 | 105,483 | 24,801 |
| Q4 | 105,483 | 119,453 | 28,117 |
| **FY2026 Total** | | | **93,879** |

FY2026 bull-case revenue **$93.9M**, **+37.6%** YoY.

### 3.4 Bear Case

**Driver assumptions:** NRR compresses to **104%** (higher churn or contraction from macro pressure / increased competition) and bookings growth slows to **2% qoq** (longer sales cycles, sales-capacity constraints, or softer demand). Q1 bookings held at $6.8M (already-committed near-term pipeline is the least likely lever to change on short notice).

| Quarter | Beginning ARR | Ending ARR | Quarterly Revenue |
|---|---:|---:|---:|
| Q1 | 71,500 | 79,005 | 18,813 |
| Q2 | 79,005 | 86,719 | 20,715 |
| Q3 | 86,719 | 94,648 | 22,671 |
| Q4 | 94,648 | 102,797 | 24,681 |
| **FY2026 Total** | | | **86,880** |

FY2026 bear-case revenue **$86.9M**, **+27.3%** YoY — still above the DCF's 25% top-down assumption, reinforcing the reconciliation flag in the Executive Summary: even the downside driver-based scenario runs ahead of the valuation model's revenue path.

### 3.5 Scenario Summary

| Scenario | NRR | Bookings Growth (qoq) | FY2026 Revenue | YoY Growth | Rough Probability |
|---|---:|---:|---:|---:|---:|
| Bear | 104% | 2% | $86.9M | 27.3% | ~20% |
| Base | 112% | 6% | $90.4M | 32.5% | ~55% |
| Bull | 120% | 10% | $93.9M | 37.6% | ~25% |

**Supporting context (not part of the revenue build):** the given headcount plan grows from 312 (Q1) to 355 (Q4), +13.8% over the year, at an average fully-loaded cost of $168K/head — implying incremental annualized headcount cost of roughly **$7.2M** by Q4 versus Q1. This hiring pace is directionally consistent with supporting 27–38% revenue growth (typical SaaS heads-to-growth ratios), but a full cost/opex forecast was outside this section's scope (the task calls for a revenue forecast; this is provided only as a plausibility cross-check on the driver set).

---

## Assumption Log (Consolidated)

- No size premium / company-specific risk premium added to CAPM (inputs did not specify one) — likely understates Re/WACC modestly for a company of this scale.
- Quick ratio computed as (Cash+AR)/Current Liabilities, excluding "other current assets," given no inventory line and no breakout of prepaid items.
- ROE/ROA/turnover/DSO/leverage ratios shown only for FY2024–FY2025 due to missing FY2023 balance sheet.
- FCF conversion shown for FY2025 only (only year with cash-flow data).
- Revenue growth and EBIT margin fades interpreted as linear (straight-line) between the stated 2026 and 2030 endpoints.
- D&A % and CapEx % of revenue held constant across 2026–2030 at the single stated rate (no path given).
- Q1 2026 bookings pipeline ($6.8M) treated as closed new bookings within the quarter (sales cycle ≈ 1 quarter), not gross pipeline requiring a win-rate haircut — the single largest judgment call in the revenue forecast.
- Quarterly revenue derived from ARR as average(beginning, ending ARR)/4, assuming linear in-quarter ramp of new bookings.
- Bull/bear NRR and bookings-growth levels are analyst-constructed (the fixture provided only base-case values); Q1 bookings held constant across scenarios since that pipeline is already substantially fixed at the valuation date.
- No comparable-company data was available in the provided fixture, so the EV/Revenue sanity check could not be resolved to a peer-validated conclusion — flagged as an open item for the committee.
