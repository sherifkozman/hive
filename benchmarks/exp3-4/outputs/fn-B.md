# Meridian Software Inc. — Liquidity & Leverage Assessment (FY2025 vs. FY2024)

*Figures in USD thousands unless noted. Source: `eval2/fixtures/meridian_financials.json`.*

## Inputs used

**Balance sheet (as reported):**

| Item | FY2024 | FY2025 |
|---|---|---|
| Cash & equivalents | 12,000 | 18,500 |
| Accounts receivable | 9,100 | 11,375 |
| Other current assets | 1,700 | 2,000 |
| **Current assets (sum)** | **22,800** | **31,875** |
| Accounts payable | 3,600 | 4,200 |
| Deferred revenue (current) | 10,920 | 13,650 |
| Accrued liabilities | 2,600 | 3,100 |
| **Current liabilities (sum)** | **17,120** | **20,950** |
| Long-term debt | 9,000 | 8,000 |
| Total assets | 32,000 | 41,375 |
| Shareholders' equity | 5,880 | 12,425 |

No inventory line exists (consistent with a SaaS business). Total current assets + non-current assets (PP&E, intangibles) tie exactly to reported `total_assets`, and current liabilities + long-term debt tie exactly to reported `total_liabilities`, confirming the balance sheet is internally consistent and there is no other debt (e.g., no revolver, no current portion of long-term debt disclosed) beyond the single long-term debt line.

**Income statement (for interest coverage):**

| Item | FY2024 | FY2025 |
|---|---|---|
| Revenue | 54,600 | 68,250 |
| COGS | 17,472 | 20,475 |
| Sales & Marketing | 19,110 | 22,522 |
| R&D | 9,828 | 11,602 |
| G&A | 5,460 | 6,142 |
| **EBIT (Operating income)** = Revenue − COGS − S&M − R&D − G&A | **2,730** | **7,509** |
| Interest expense | 550 | 500 |

EBIT was derived rather than given directly; it was cross-checked by carrying EBIT − Interest − Tax through to Net Income: FY2024 gives 2,730 − 550 − 650 = 1,530 (matches reported net income of 1,530); FY2025 gives 7,509 − 500 − 1,750 = 5,259 (matches reported net income of 5,259). This confirms `d_and_a_included_in_opex` is informational only (D&A is already embedded within the opex lines above, not a separate deduction).

## 1. Ratio calculations

### Current Ratio — Current Assets / Current Liabilities
- FY2024: 22,800 / 17,120 = **1.33x**
- FY2025: 31,875 / 20,950 = **1.52x**

### Quick Ratio — (Current Assets − Inventory) / Current Liabilities
Meridian carries no inventory, so the textbook quick ratio equals the current ratio here:
- FY2024: 22,800 / 17,120 = **1.33x**
- FY2025: 31,875 / 20,950 = **1.52x**

A stricter cut — cash + receivables only, excluding "other current assets" (typically prepaid expenses, not spendable) — gives a more conservative read:
- FY2024: (12,000 + 9,100) / 17,120 = **1.23x**
- FY2025: (18,500 + 11,375) / 20,950 = **1.43x**

### Cash Ratio — Cash & Equivalents / Current Liabilities
- FY2024: 12,000 / 17,120 = **0.70x**
- FY2025: 18,500 / 20,950 = **0.88x**

### Working Capital — Current Assets − Current Liabilities
- FY2024: 22,800 − 17,120 = **$5,680**
- FY2025: 31,875 − 20,950 = **$10,925**

### Debt-to-Equity — Total Debt / Shareholders' Equity
(Total Debt = long-term debt only; no other interest-bearing debt disclosed)
- FY2024: 9,000 / 5,880 = **1.53x**
- FY2025: 8,000 / 12,425 = **0.64x**

### Debt-to-Assets — Total Debt / Total Assets
- FY2024: 9,000 / 32,000 = **0.28x (28.1%)**
- FY2025: 8,000 / 41,375 = **0.19x (19.3%)**

### Interest Coverage (EBIT basis) — EBIT / Interest Expense
- FY2024: 2,730 / 550 = **4.96x**
- FY2025: 7,509 / 500 = **15.02x**

### Net Debt — Total Debt − Cash & Equivalents
- FY2024: 9,000 − 12,000 = **−$3,000** (net cash)
- FY2025: 8,000 − 18,500 = **−$10,500** (net cash)

## 2. Interpretation against healthy ranges (SaaS-adjusted)

**Current ratio (1.33x → 1.52x):** Using generic industry benchmarks (1.5–3.0x = "healthy," 1.0–1.5x = merely "acceptable"), Meridian looks marginal in FY2024 and only just crosses into the healthy band in FY2025. This generic read is misleading for a subscription SaaS business: roughly 64–65% of current liabilities in both years is deferred revenue (10,920/17,120 = 63.8% in FY2024; 13,650/20,950 = 65.2% in FY2025). Deferred revenue is a non-cash obligation — it will be extinguished by delivering already-paid-for service, not by an outflow of cash — so it inflates the denominator and depresses the current ratio relative to a company with the same cash cushion but no subscription model. A cash-obligation-only ratio (current assets over cash-settled current liabilities: AP + accrued) is far stronger:
- FY2024: 22,800 / (3,600 + 2,600) = 3.68x
- FY2025: 31,875 / (4,200 + 3,100) = 4.37x

This confirms the improving headline current ratio understates true liquidity, and the trend (1.33x → 1.52x) is genuinely positive even before that adjustment.

**Quick ratio (1.33x → 1.52x, or 1.23x → 1.43x on the stricter cash+AR cut):** Because there is no inventory to exclude, the quick ratio equals the current ratio under the standard formula — a common SaaS quirk that makes the two ratios redundant here. The stricter cash+AR variant is a better test of near-term liquidity and also improved year over year, comfortably inside (and for FY2025, above) the "healthy" 1.0–2.0x band even before crediting the deferred-revenue distortion noted above.

**Cash ratio (0.70x → 0.88x):** Sits in the "strong" band (0.5–1.0x) both years and is trending toward "excessive" (>1.0x). Combined with the deferred-revenue point above, this signals Meridian is unlikely to face a near-term cash crunch — it holds substantial cash relative to liabilities that, for the largest component, will not require a cash payment at all.

**Working capital ($5.68M → $10.93M):** Nearly doubled year over year in absolute dollars, driven primarily by cash generation (cash grew $6.5M) outpacing the growth in deferred revenue and payables. A growing SaaS business with growing deferred revenue and growing working capital in tandem is a healthy pattern — it indicates the deferred-revenue growth is being driven by new bookings collected in cash up front, not by delayed collections.

**Debt-to-equity (1.53x → 0.64x):** By generic benchmarks this moved from "elevated" (0.8–2.0x) to "moderate" (0.3–0.8x). The improvement is driven by both numerator and denominator: $1M of debt was paid down while equity grew $6.5M, almost entirely from retained earnings (net income of $1.53M in FY2024 and $5.26M in FY2025, with no evidence of new equity issuance in the data). This is a genuine deleveraging trend, not merely a mechanical effect of raising capital.

**Debt-to-assets (28.1% → 19.3%):** Confirms the same deleveraging story from an asset-funding perspective — leverage on the balance sheet fell meaningfully even as total assets grew ~29%.

**Interest coverage (4.96x → 15.02x):** FY2024 sits in the "adequate" band (2.0–5.0x); FY2025 is "very strong" (>10.0x). The jump reflects EBIT nearly tripling on strong operating leverage (revenue +25%, but EBIT +175%) combined with a slightly lower interest expense (debt was paid down). Debt service risk from operating earnings is low and improving quickly.

**Net debt (−$3.0M → −$10.5M):** Meridian is in a net cash position in both years and the net cash cushion more than tripled. This is the single clearest solvency signal: the company could retire all interest-bearing debt today using cash on hand and still have $10.5M left over in FY2025 (vs. $3.0M in FY2024).

## 3. Overall verdict

Meridian's liquidity and solvency profile is solid and improving on every measure computed. Current and quick ratios look only borderline-acceptable at face value, but that read is a SaaS-specific artifact of deferred revenue — a non-cash liability — dominating current liabilities; adjusted for that, coverage of cash-settled obligations is very strong (3.7x–4.4x) and improving. Leverage nearly halved (D/E from 1.53x to 0.64x) while interest coverage roughly tripled (4.96x to 15.02x), and the company sits in a growing net-cash position (−$3.0M to −$10.5M net debt), so debt service risk is low. No red flags are present; the one yellow flag is the still-moderate stricter quick ratio in FY2024 (1.23x, below the "healthy" 1.0–2.0x midpoint) and the fact that deferred revenue's outsized share of current liabilities means standard liquidity ratios should not be read at face value for this business without the adjustment shown above — both are noted for context rather than as genuine solvency concerns given the FY2025 trajectory.

---
LOADED: SKILL.md, references/financial-ratios-guide.md, references/industry-adaptations.md
