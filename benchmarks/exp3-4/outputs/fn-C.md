# Meridian Software Inc. — Liquidity & Leverage Assessment (FY2025 vs FY2024)

*All figures in USD thousands unless noted. Source: `eval2/fixtures/meridian_financials.json`.*

## Inputs used

| Item | FY2024 | FY2025 |
|---|---:|---:|
| Cash & equivalents | 12,000 | 18,500 |
| Accounts receivable | 9,100 | 11,375 |
| Other current assets | 1,700 | 2,000 |
| **Total current assets** | **22,800** | **31,875** |
| Accounts payable | 3,600 | 4,200 |
| Deferred revenue (current) | 10,920 | 13,650 |
| Accrued liabilities | 2,600 | 3,100 |
| **Total current liabilities** | **17,120** | **20,950** |
| Long-term debt (only debt on balance sheet) | 9,000 | 8,000 |
| Total assets | 32,000 | 41,375 |
| Shareholders' equity | 5,880 | 12,425 |
| Revenue | 54,600 | 68,250 |
| COGS | 17,472 | 20,475 |
| Sales & marketing | 19,110 | 22,522 |
| R&D | 9,828 | 11,602 |
| G&A | 5,460 | 6,142 |
| Interest expense | 550 | 500 |
| EBIT (Revenue − COGS − S&M − R&D − G&A) | 2,730 | 7,509 |

No inventory line exists (asset-light SaaS business), and the fixture reports only one interest-bearing liability (long-term debt) — no current portion of debt or revolver is broken out, so "total debt" = long-term debt in both years.

## 1. Ratio calculations

### Current Ratio = Current Assets / Current Liabilities
- FY2024: 22,800 / 17,120 = **1.33**
- FY2025: 31,875 / 20,950 = **1.52**

### Quick Ratio = (Current Assets − Inventory) / Current Liabilities
No inventory exists, so the textbook quick ratio equals the current ratio:
- FY2024: 22,800 / 17,120 = **1.33**
- FY2025: 31,875 / 20,950 = **1.52**

A more conservative, SaaS-relevant cut also strips out "other current assets" (largely prepaid expenses — not convertible to cash), using only Cash + AR:
- FY2024: (12,000 + 9,100) / 17,120 = **1.23**
- FY2025: (18,500 + 11,375) / 20,950 = **1.43**

### Cash Ratio = Cash & Equivalents / Current Liabilities
- FY2024: 12,000 / 17,120 = **0.70**
- FY2025: 18,500 / 20,950 = **0.88**

### Working Capital = Current Assets − Current Liabilities
- FY2024: 22,800 − 17,120 = **$5,680K**
- FY2025: 31,875 − 20,950 = **$10,925K**

### Debt-to-Equity = Total Debt / Shareholders' Equity
- FY2024: 9,000 / 5,880 = **1.53x**
- FY2025: 8,000 / 12,425 = **0.64x**

### Debt-to-Assets = Total Debt / Total Assets
- FY2024: 9,000 / 32,000 = **0.28** (28.1%)
- FY2025: 8,000 / 41,375 = **0.19** (19.3%)

### Interest Coverage (EBIT basis) = EBIT / Interest Expense
- FY2024 EBIT = 54,600 − 17,472 − 19,110 − 9,828 − 5,460 = 2,730; Coverage = 2,730 / 550 = **4.96x**
- FY2025 EBIT = 68,250 − 20,475 − 22,522 − 11,602 − 6,142 = 7,509; Coverage = 7,509 / 500 = **15.02x**

### Net Debt = Total Debt − Cash & Equivalents
- FY2024: 9,000 − 12,000 = **−$3,000K** (net cash position)
- FY2025: 8,000 − 18,500 = **−$10,500K** (net cash position)

## 2. Interpretation against SaaS-appropriate benchmarks

**Current ratio (1.33 → 1.52):** Generic textbook benchmarks flag 1.0–1.5 as merely "acceptable" and want to see 1.5–3.0 for "healthy." Taken at face value, Meridian looks only borderline-adequate in FY2024 and just crosses into "healthy" in FY2025. **This generic benchmark is misleading for a SaaS company**, because 63.8% (FY2024) and 65.2% (FY2025) of current liabilities are *deferred revenue* — cash already collected from customers for subscriptions not yet delivered/recognized. Deferred revenue will be extinguished by *providing service*, not by paying cash, so it is not comparable to a trade payable or a bank line that must be cash-settled. A cash-liability-only view is far stronger: current liabilities excluding deferred revenue are only $6,200K (FY2024) and $7,300K (FY2025), against current assets of $22,800K / $31,875K — implying an effective "cash-settled" coverage ratio of roughly 3.7x and 4.4x. The improvement from 1.33 to 1.52 is real (working capital nearly doubled), but the raw ratio understates true liquidity given the deferred-revenue composition.

**Quick ratio (1.33 → 1.52, or 1.23 → 1.43 on the Cash+AR-only cut):** Because there is no inventory to strip out, the textbook quick ratio is identical to the current ratio here — a case where the standard formula adds no new information for an asset-light SaaS business (inventory is simply not a relevant balance-sheet risk). The more informative conservative cut (Cash + AR only, excluding prepaids) still shows healthy levels (1.23x → 1.43x, within/above the 1.0–2.0 "healthy" band), and the same deferred-revenue caveat above applies to the denominator.

**Cash ratio (0.70 → 0.88):** This sits in the "strong" 0.5–1.0 band in both years and improved further in FY2025, indicating Meridian could cover the large majority of stated current liabilities from cash alone even before collecting a dollar of receivables. Given that most of "current liabilities" is non-cash-settling deferred revenue, this is arguably an understatement of true cash coverage against *actual* cash obligations (AP + accrued), which cash alone covers roughly 2x over in FY2025 (18,500 / 7,300).

**Debt-to-equity (1.53x → 0.64x):** FY2024's 1.53x sits in the "elevated" 0.8–2.0 band, driven by a small equity base (only one year removed from net losses) rather than heavy debt issuance. FY2025's 0.64x has moved into the "moderate" 0.3–0.8 band as retained earnings from FY2025's net income rebuilt equity to $12,425K while debt was paid down to $8,000K. Software/SaaS businesses are typically asset-light and lightly levered (little collateral, VC/equity-funded), so even the "moderate" 0.64x should be read as normal-to-conservative for the sector rather than compared to capital-intensive industry norms.

**Debt-to-assets (28.1% → 19.3%):** Consistent with the D/E trend — modest and declining leverage relative to a growing asset base, unremarkable for SaaS.

**Interest coverage (4.96x → 15.02x):** FY2024's 4.96x sits in the "adequate" 2.0–5.0 band; FY2025's 15.02x is "very strong" (>10x). The improvement is driven almost entirely by EBIT nearly tripling (2,730 → 7,509) on operating leverage from revenue growth (54,600 → 68,250, +25%) outpacing opex growth, combined with a slight reduction in interest expense as debt was repaid. Debt service risk from operating earnings is now negligible.

**Net debt (−$3,000K → −$10,500K):** Meridian is in a net cash position in both years and it deepened materially in FY2025 — debt is more than fully covered by cash on hand, which is typical and expected for a profitable/scaling SaaS company and a strong solvency signal independent of any ratio benchmark.

## 3. Overall verdict

Meridian's liquidity and solvency profile is sound and improving on every measure from FY2024 to FY2025: current, quick, and cash ratios all rose into healthy-to-strong territory, working capital nearly doubled, leverage (D/E and D/A) fell substantially, interest coverage strengthened from adequate to very strong, and the company sits in a growing net cash position. The one item warranting a **yellow flag** (not red) is that roughly two-thirds of current liabilities are deferred revenue, which mechanically depresses the current/quick ratios relative to a non-SaaS peer with the same cash cushion — the generic "1.5–3.0 is healthy" benchmark should not be applied literally without adjusting for this non-cash-settling liability, and readers should focus on the cash-liability-adjusted ratios (~3.7x–4.4x) or the cash ratio for a truer picture. No red flags are present: coverage of interest is ample, leverage is modest and declining, and net debt is negative in both years. Overall, Meridian's short-term and structural solvency risk is low.

LOADED: INDEX.md, 00-core.md, 02-liquidity-leverage-ratios.md, 11-industry-adaptations.md
