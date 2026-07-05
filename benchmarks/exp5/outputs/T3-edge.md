# DCF Valuation — Quarterly Financials (2021 Q1 – 2025 Q4)

## 1. Data Quality — Cleaning Decisions (stated before any calculation)

Profiling `quarterly_financials.csv` (20 expected quarters, 2021Q1–2025Q4) found 21 rows and two issues:

| Issue | Finding | Decision |
|---|---|---|
| **Duplicate row** | `2023-Q3` appears twice with identical `revenue_k=18950, ebit_k=1370` | Dropped the duplicate (kept one). Confirmed grain is now unique: 1 row = 1 quarter, 20 rows for 20 quarters. |
| **Revenue outlier** | `2024-Q3 revenue_k = 242,000` — ~10x the neighboring quarters (2024‑Q2: 22,800; 2024‑Q4: 26,300), while `ebit_k = 2,410` sits exactly on the surrounding EBIT trend | Treated as a fat-fingered extra zero and corrected to **24,200**. Rationale: implied QoQ growth with the correction is +6.1% (Q2→Q3) and +8.7% (Q3→Q4), consistent with the ±5–9% QoQ pattern seen throughout 2023–2025; taking the raw value would imply revenue jumping 10x then collapsing 89% next quarter with no EBIT or margin discontinuity, which is not plausible. **Flagged, not silently deleted** — if the raw figure is later confirmed correct, the trailing-growth derivation and every downstream number below must be re-run. |

All figures are in $ thousands (`_k`), unchanged unit throughout.

## 2. Trailing-Year Growth Rate — Derivation

Annual (calendar-year) revenue, summed from the cleaned quarterly data:

| Year | Revenue ($k) | EBIT ($k) | EBIT margin |
|---|---:|---:|---:|
| 2021 | 43,750 | (860) | (2.0%) |
| 2022 | 57,500 | 1,820 | 3.2% |
| 2023 | 74,250 | 5,150 | 6.9% |
| 2024 | 94,700 | 9,190 | 9.7% |
| 2025 | 119,600 | 13,960 | 11.7% |

**Trailing-year growth rate** = FY2025 revenue / FY2024 revenue − 1 = 119,600 / 94,700 − 1 = **26.29%**.

Cross-check via quarterly year-over-year growth (2025 quarter vs. same 2024 quarter): Q1 +27.1%, Q2 +26.8%, Q3 +25.6%, Q4 +25.9% — average ≈26.4%, consistent with the 26.29% annual figure. Using the annual (TTM-style) ratio as the single trailing-year growth figure, since it is the cleaner, standard basis and matches the quarterly cross-check within ~0.1pt.

## 3. Assumptions

Given: WACC 10%, terminal growth (g) 2.5%, tax rate 25%, D&A 3% of revenue, capex 4% of revenue, ΔNWC 5% of incremental revenue, 5-year explicit projection.

Revenue growth path: starts at the trailing-year rate (26.29%) in Year 1 and fades **linearly** to 10% by Year 5 (4 equal steps of −4.07pp/yr):

| Year | 1 | 2 | 3 | 4 | 5 |
|---|---:|---:|---:|---:|---:|
| Growth | 26.29% | 22.22% | 18.15% | 14.07% | 10.00% |

**EBIT margin (assumption not specified in the task, stated explicitly here):** held flat at the FY2025 trailing margin of **11.67%** (13,960/119,600). This is a deliberately conservative choice — margin expanded steadily from −2.0% (2021) to 11.7% (2025, ~+3–4pp/yr early on, decelerating to ~+2pp/yr by 2025) — so holding it flat avoids compounding an unstated margin-expansion assumption on top of an already-aggressive revenue fade. If margin expansion is expected to continue, EV below is a floor, not a central estimate.

## 4. Projected FCFF ($k)

FCFF = EBIT×(1−tax) + D&A − Capex − ΔNWC, discounted at WACC=10%.

| Year | Growth | Revenue | EBIT (11.67%) | NOPAT (×0.75) | D&A (3%) | Capex (4%) | ΔNWC (5%×ΔRev) | **FCFF** | Discount factor | **PV(FCFF)** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 26.29% | 151,047 | 17,631 | 13,223 | 4,531 | 6,042 | 1,572 | **10,140** | 0.9091 | 9,218 |
| 2 | 22.22% | 184,610 | 21,548 | 16,161 | 5,538 | 7,384 | 1,678 | **12,637** | 0.8264 | 10,444 |
| 3 | 18.15% | 218,111 | 25,458 | 19,094 | 6,543 | 8,724 | 1,675 | **15,238** | 0.7513 | 11,448 |
| 4 | 14.07% | 248,806 | 29,041 | 21,781 | 7,464 | 9,952 | 1,535 | **17,758** | 0.6830 | 12,129 |
| 5 | 10.00% | 273,687 | 31,945 | 23,959 | 8,211 | 10,948 | 1,244 | **19,978** | 0.6209 | 12,405 |

**Sum of PV(FCFF), Years 1–5 = 55,644 $k**

## 5. Terminal Value

Perpetuity-growth method on Year-5 FCFF:

```
TV = FCFF_5 × (1+g) / (WACC − g) = 19,978 × 1.025 / (0.10 − 0.025) = 273,035 $k
PV(TV) = TV / (1.10)^5 = 273,035 × 0.6209 = 169,533 $k
```

## 6. Enterprise Value

```
Enterprise Value = Σ PV(FCFF, Yr 1–5) + PV(TV)
                  = 55,644 + 169,533
                  = 224,996–225,177 ($k, rounding)
```

**Enterprise Value ≈ $225,177 thousand (~$225.2 million).**

Sanity check: PV(TV) is **75.3%** of EV — within the normal 60–80% band for a 5-year DCF, so the projection length is not distorting the result, but the value is still terminal-value-dominated: small changes in `g` or WACC move EV materially (a 0.5pt move in `g` typically shifts EV ~15–25% per standard DCF sensitivity). Given the "concise" scope requested, no full sensitivity grid is produced here, but this should be treated as a point estimate on a fairly aggressive Year‑1 growth assumption (26.3%, driven by 2025's strong quarters), not a tight number.

---
LOADED: skills/financial-analysis/composable/mini/00-core.md, skills/financial-analysis/composable/mini/04-dcf-projection-wacc.md, skills/financial-analysis/composable/mini/05-dcf-terminal-value-sensitivity.md, skills/data-analysis/composable/mini/01-data-quality-profiling.md, skills/data-analysis/composable/mini/02-aggregation-pitfalls.md, skills/data-analysis/composable/mini/03-time-series.md, skills/data-analysis/composable/mini/09-reproducibility-assumptions.md
