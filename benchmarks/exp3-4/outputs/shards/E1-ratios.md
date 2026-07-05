## 1. Financial Health Snapshot — Meridian Software Inc. (FY2023–FY2025)

*(B2B SaaS, vertical ERP; USD thousands unless noted. Source: `eval2/fixtures/meridian_financials.json`.)*

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
| ROE (NI / average equity, FY25 only, uses FY24–25 equity) | — | — | 57.5% | supplementary |

**Interpretation:** Meridian shows a textbook SaaS profitability ramp — gross margin climbing through the 65–70% band (in line with the 70–85% SaaS benchmark, still slightly below mature peers, consistent with a still-scaling COGS base) while operating margin flips from a mid-single-digit loss to double digits over two years as S&M/R&D/G&A grow slower than revenue (opex grew ~33% while revenue grew ~63% cumulatively over the period). Net margin lags operating margin due to interest expense and a rising cash tax charge (tax expense grew from $0 to $1,750 as the company turned profitable). ROE of 26–42% looks "excellent" against the generic >25% benchmark, but for a leveraged, thinly-capitalized SaaS company (FY24 equity of only $5,880) ROE is mechanically inflated by a small equity base — it should not be read as a sign of exceptional capital efficiency on its own (see DuPont/leverage note below).

**Rule of 40 check (SaaS-specific):** FY2025 revenue growth (25.0%) + operating margin (11.0%) = **36%**, just under the 40% bogey; using FCF margin (10.4%) instead of operating margin gives growth + FCF margin = **35.4%**. Both land just below the Rule-of-40 threshold — a reasonable, not exceptional, growth/profitability balance for a company still investing to scale, and directionally improving as margins expand.

### 1.2 Liquidity

Current assets = cash + accounts receivable + other current assets. Current liabilities = accounts payable + current deferred revenue + accrued liabilities. There is no inventory line (expected for a SaaS business), so the quick ratio is shown two ways: excluding "other current assets" (conservative) and equal to the current ratio (if other current assets are liquid, e.g., prepaid SaaS subscriptions vs. receivables-like items — treated conservatively as illiquid here).

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

**Interpretation:** FY2023's negative EBIT means interest could not be covered from operations at all (coverage is negative/meaningless as a ratio — a going-concern-adjacent signal in isolation, though the company also holds a net cash position per the DCF inputs). By FY2024, coverage reaches 5.0x (top of the "adequate" band); by FY2025 it is 15.0x — "very strong" — as EBIT nearly tripled while interest expense fell (debt was paid down from $9.0M to $8.0M). D/E fell from an "elevated" 1.53x to a "moderate" 0.64x in a single year, driven both by debt reduction and by equity roughly doubling from retained profits. Net of cash (~$18.5M cash vs. $8.0M debt at FY25), Meridian is in a net-cash position, which is the more decision-relevant leverage picture for a business with no near-term refinancing risk.

### 1.4 Efficiency

| Metric | FY2024 | FY2025 | Trend |
|---|---:|---:|---|
| Asset turnover (Revenue / total assets) | 1.71x | 1.65x | flat/slightly down (asset base grew faster than revenue as cash built up) |
| Receivables turnover (Revenue / AR) | 6.00x | 6.00x | flat |
| **DSO (365 / receivables turnover)** | 60.8 days | 60.8 days | flat |
| DSO using average AR (FY25 only, memo) | — | 54.8 days | — |

**Interpretation:** DSO of ~61 days sits in the "acceptable" 45–60-day band (borderline into "concern" territory at 60.8 exactly), which for enterprise/vertical-ERP SaaS with annual or multi-month billing cycles and a 90-day stated sales cycle (per the forecast inputs) is plausible and not alarming — vertical ERP contracts often carry longer payment terms than SMB SaaS. It has not improved over the one comparable year, so it is worth monitoring as revenue scales; unlike gross margin or leverage, collections efficiency shows no trend of improvement yet. Asset turnover is essentially flat (~1.7x), which for asset-light SaaS is a reasonable efficiency level, though the slight dip in FY2025 mainly reflects cash accumulation ($12.0M → $18.5M) rather than any operational inefficiency.

### 1.5 Overall Assessment

Meridian's trajectory over FY2023–FY2025 is a coherent, positive SaaS scaling story: **gross margin expanding (65%→70%), operating losses turning into an 11% operating margin, net margin flipping positive (from ‑8.3% to +7.7%), leverage falling sharply (D/E 1.53x→0.64x) while interest coverage strengthens (5.0x→15.0x), and liquidity improving (current ratio 1.33x→1.52x)** — all while growth remains strong (25–30% per year) and Rule-of-40 sits just under 40%. The one metric not improving is DSO (flat at ~61 days), and the FY2023 interest-coverage/negative-EBIT year is a reminder that the current comfortable coverage is a recent development, not a multi-year track record. Balance-sheet ratios are only available for two of the three fiscal years, so the leverage/liquidity/efficiency trend should be treated as directional rather than a fully established multi-year pattern.

---
LOADED: /home/user/hive/eval2/tasks/fin-broad.md, /home/user/hive/eval2/fixtures/meridian_financials.json, /home/user/hive/skills/financial-analysis/composable/INDEX.md, /home/user/hive/skills/financial-analysis/composable/mini/00-core.md, /home/user/hive/skills/financial-analysis/composable/mini/01-profitability-efficiency-ratios.md, /home/user/hive/skills/financial-analysis/composable/mini/02-liquidity-leverage-ratios.md, /home/user/hive/skills/financial-analysis/composable/mini/11-industry-adaptations.md
