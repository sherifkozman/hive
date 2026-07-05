# 2. DCF Valuation — Meridian Software Inc.

*B2B SaaS (vertical ERP). All figures USD thousands except per-share (USD) and multiples. Valuation date 2026-01-01; explicit horizon 2026–2030.*

## 2.1 Discount Rate (WACC)

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

## 2.2 Driver Assumptions (as supplied)

- **Revenue growth:** 25.0% in 2026 fading linearly to 10.0% in 2030 → 25.00% / 21.25% / 17.50% / 13.75% / 10.00%.
- **EBIT margin:** 11.0% in 2026 expanding linearly to 18.0% in 2030 → 11.00% / 12.75% / 14.50% / 16.25% / 18.00%.
- **D&A** = 3.0% of revenue; **Capex** = 4.0% of revenue; **ΔNWC** = 5.0% of *incremental* revenue; **tax** = 25.0%.
- Base revenue 2025 = 68,250. Terminal growth g = 2.5%. Net debt = **−10,500** (net cash). Shares = 9,200k.

## 2.3 FCFF Projection (unlevered)

`FCFF = EBIT x (1−T) + D&A − Capex − ΔNWC`

| Year | Revenue | Growth | EBIT % | EBIT | NOPAT | D&A | Capex | ΔNWC | **FCFF** | DF @10.06% | PV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026 | 85,312.5 | 25.00% | 11.00% | 9,384.4 | 7,038.3 | 2,559.4 | 3,412.5 | 853.1 | **5,332.0** | 0.9086 | 4,844.9 |
| 2027 | 103,441.4 | 21.25% | 12.75% | 13,188.8 | 9,891.6 | 3,103.2 | 4,137.7 | 906.4 | **7,950.7** | 0.8256 | 6,564.3 |
| 2028 | 121,543.7 | 17.50% | 14.50% | 17,623.8 | 13,217.9 | 3,646.3 | 4,861.7 | 905.1 | **11,097.3** | 0.7502 | 8,325.1 |
| 2029 | 138,255.9 | 13.75% | 16.25% | 22,466.6 | 16,849.9 | 4,147.7 | 5,530.2 | 835.6 | **14,631.8** | 0.6816 | 9,973.7 |
| 2030 | 152,081.5 | 10.00% | 18.00% | 27,374.7 | 20,531.0 | 4,562.4 | 6,083.3 | 691.3 | **18,318.9** | 0.6194 | 11,346.2 |

**Sum of PV of explicit FCFF = 41,054.2**

## 2.4 Terminal Value (Gordon growth) & Enterprise Value

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

## 2.5 Sensitivity — WACC (±1pt) × Terminal Growth (±0.5pt)

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

## 2.6 Sanity Check — Implied EV/Revenue vs SaaS Comps

- Implied **EV/Revenue (2025 actual) = 194,990 / 68,250 = 2.86x**
- Implied **EV/Revenue (2026E) = 194,990 / 85,312 = 2.29x**

Benchmark: mid-growth vertical B2B SaaS (~20–25% revenue growth, ~70% gross margin, expanding operating margins toward the "Rule of 40") typically trades around **4–7x forward revenue** in normal markets and **~3–5x** in more conservative/compressed environments. Meridian's DCF-implied **2.86x trailing / 2.29x forward** sits **at or below** that range — i.e., the DCF is *not* rich; if anything it is conservative for a 25% grower with a credible margin-expansion path and a net-cash balance sheet. The output passes the sanity check: no upward gap to comps that would signal aggressive assumptions. The main caveat remains terminal-value dominance (2.4), which the sensitivity table quantifies.

*All figures independently recomputed in Python; the projection, WACC, TV, bridge, and both sensitivity grids reconcile exactly to the tables above.*

LOADED: /home/user/hive/eval2/tasks/fin-broad.md, /home/user/hive/eval2/fixtures/meridian_financials.json, /home/user/hive/skills/financial-analysis/composable/INDEX.md, /home/user/hive/skills/financial-analysis/composable/mini/00-core.md, /home/user/hive/skills/financial-analysis/composable/mini/04-dcf-projection-wacc.md, /home/user/hive/skills/financial-analysis/composable/mini/05-dcf-terminal-value-sensitivity.md, /home/user/hive/skills/financial-analysis/composable/mini/06-comparables-precedents.md
