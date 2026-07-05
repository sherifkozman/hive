# Meridian Software Inc. — Liquidity & Leverage Assessment (FY2025 vs. FY2024)

*Currency: USD thousands. Source: `eval2/fixtures/meridian_financials.json`.*

Scope note: this memo covers liquidity and leverage only — no profitability, efficiency, DCF, forecast, or recommendations are included.

## 1. Computations (formula, inputs, result)

Balance-sheet inputs used throughout:

| Item | FY2024 | FY2025 |
|---|---|---|
| Cash | 12,000 | 18,500 |
| Accounts receivable | 9,100 | 11,375 |
| Other current assets | 1,700 | 2,000 |
| **Total current assets** | **22,800** | **31,875** |
| Accounts payable | 3,600 | 4,200 |
| Deferred revenue (current) | 10,920 | 13,650 |
| Accrued liabilities | 2,600 | 3,100 |
| **Total current liabilities** | **17,120** | **20,950** |
| Long-term debt | 9,000 | 8,000 |
| Total liabilities | 26,120 | 28,950 |
| Shareholders' equity | 5,880 | 12,425 |
| Total assets | 32,000 | 41,375 |

(No inventory line exists — expected for a SaaS business — so current assets = cash + AR + other current assets.)

### Current ratio = Current assets / Current liabilities
- FY2024: 22,800 / 17,120 = **1.33**
- FY2025: 31,875 / 20,950 = **1.52**

### Quick ratio = (Cash + Accounts receivable) / Current liabilities
(Other current assets excluded as a conservative proxy for non-liquid items such as prepaids; no inventory to exclude.)
- FY2024: (12,000 + 9,100) / 17,120 = 21,100 / 17,120 = **1.23**
- FY2025: (18,500 + 11,375) / 20,950 = 29,875 / 20,950 = **1.43**

### Cash ratio = Cash / Current liabilities
- FY2024: 12,000 / 17,120 = **0.70**
- FY2025: 18,500 / 20,950 = **0.88**

### Working capital = Current assets − Current liabilities
- FY2024: 22,800 − 17,120 = **5,680**
- FY2025: 31,875 − 20,950 = **10,925**

### Debt-to-equity = Interest-bearing debt / Shareholders' equity
(Long-term debt is the only interest-bearing debt disclosed; consistent with the interest-expense line and the net-debt figure embedded in the fixture's own DCF assumptions.)
- FY2024: 9,000 / 5,880 = **1.53x**
- FY2025: 8,000 / 12,425 = **0.64x**
- *Memo (broader leverage view using total liabilities/equity, which also captures deferred revenue and payables):* FY2024 26,120/5,880 = 4.44x; FY2025 28,950/12,425 = 2.33x. This broader measure looks far more leveraged than the debt-only measure because it includes deferred revenue and payables, not just borrowed money — see Section 2.

### Debt-to-assets = Interest-bearing debt / Total assets
- FY2024: 9,000 / 32,000 = **0.28 (28%)**
- FY2025: 8,000 / 41,375 = **0.19 (19%)**

### Interest coverage (EBIT basis) = EBIT / Interest expense
EBIT = Revenue − COGS − Sales & Marketing − R&D − G&A. (D&A is disclosed as a memo item already embedded within COGS/opex, not an additive expense, so it is not subtracted again.)
- FY2024 EBIT = 54,600 − 17,472 − 19,110 − 9,828 − 5,460 = **2,730**
  - Coverage: 2,730 / 550 = **4.96x**
- FY2025 EBIT = 68,250 − 20,475 − 22,522 − 11,602 − 6,142 = **7,509**
  - Coverage: 7,509 / 500 = **15.02x**
- Sanity check: EBIT − interest − tax reproduces reported net income exactly both years (FY2024: 2,730 − 550 − 650 = 1,530 ✓; FY2025: 7,509 − 500 − 1,750 = 5,259 ✓), confirming the EBIT build is internally consistent with the income statement.

### Net debt = Interest-bearing debt − Cash
- FY2024: 9,000 − 12,000 = **(3,000)**, i.e., a net cash position
- FY2025: 8,000 − 18,500 = **(10,500)**, i.e., a net cash position (matches the fixture's own `net_debt_2025: -10,500`)

## 2. Interpretation for a B2B SaaS context

- **Current ratio (1.33 → 1.52):** Comfortably above the conventional 1.0 "danger" threshold and improving. However, generic benchmarks (e.g., "≥1.5–2.0 is healthy") are not directly transferable here: current liabilities include **deferred revenue** ($10,920 in FY2024, $13,650 in FY2025 — roughly 64–65% of current liabilities both years). Deferred revenue is a non-cash obligation that will be satisfied by delivering already-paid-for service, not by an outflow of cash. A generic reading of the current ratio therefore *understates* true cash liquidity — Meridian's ability to meet cash obligations is meaningfully better than the headline ratio suggests.
- **Quick ratio (1.23 → 1.43):** Still comfortably above 1.0 even after stripping non-cash/less-liquid current assets, and it improves in lockstep with the current ratio. Because SaaS receivables are typically high quality (subscription billings, low bad-debt risk) and there's no inventory risk, this is a reliable signal of genuine near-term liquidity strength.
- **Cash ratio (0.70 → 0.88):** Unusually strong for any industry — most companies run cash ratios well under 0.5. Combined with the deferred-revenue point above, this reinforces that Meridian could cover roughly 70–88% of stated current liabilities from cash alone, before ever collecting a receivable, which is atypical strength.
- **Working capital ($5,680 → $10,925):** Positive and nearly doubled year over year, driven by cash build (+$6,500) and receivables growth roughly in line with revenue growth, partly offset by growth in deferred revenue (a byproduct of a growing, cash-efficient subscription book rather than a warning sign).
- **Debt-to-equity (1.53x → 0.64x) and debt-to-assets (28% → 19%):** Leverage on an interest-bearing-debt basis has fallen sharply, driven by both debt paydown ($9,000 → $8,000) and rapid equity growth (accumulated profitability, since there's no evidence of new equity issuance in the data). Using total-liabilities/equity instead (4.44x → 2.33x) looks far more alarming, but that measure is misleading for SaaS: most of the "liability" growth is deferred revenue, which is not creditor debt and carries no repayment or covenant risk — it is arguably a sign of a healthy, growing bookings base. The debt-only measure is the more decision-relevant one here.
- **Interest coverage (4.96x → 15.02x):** Moved from an adequate-but-unremarkable level to a very strong one, driven by EBIT more than doubling while interest expense fell slightly (debt paydown). Coverage above ~10x is generally considered very low credit risk in any industry context; SaaS-specific benchmarks don't change this conclusion.
- **Net debt (net cash of $3,000 → net cash of $10,500):** Meridian holds more cash than debt in both years, and the net cash cushion more than tripled. This is a straightforwardly strong solvency signal with no SaaS-specific caveat needed.

## 3. Overall verdict

Meridian's liquidity and solvency position is strong and improving across every measure examined, and the improvement is broad-based rather than driven by a single line item. The headline current ratio understates true liquidity because roughly two-thirds of current liabilities is deferred revenue, a non-cash obligation typical of — and a healthy sign for — a growing SaaS business; the quick and cash ratios confirm genuine strength even after adjusting for that distortion. Leverage on an interest-bearing-debt basis is low and falling (debt-to-equity 1.53x→0.64x, debt-to-assets 28%→19%), interest coverage is very strong and rising (4.96x→15.02x), and the company sits in a growing net cash position (from $3.0M to $10.5M net cash). The only mild yellow flag is that a generic total-liabilities/equity lens (4.44x→2.33x) could be misread as high leverage by an analyst unfamiliar with SaaS deferred-revenue accounting; that reading should be discounted given the non-cash, non-creditor nature of deferred revenue. No red flags are present in the liquidity or leverage profile as of FY2025.
