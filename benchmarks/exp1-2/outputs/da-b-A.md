# Sales Performance Report — July 2025 to May 2026

Prepared for: VP of Sales
Source data: `eval/fixtures/sales.csv` (835 raw rows, 9 columns: order_id, date, region, category, sales_rep, quantity, unit_price, discount, revenue)

---

## 1. Data Quality Assessment

The raw file has 835 rows. Five distinct issues were found and corrected before any analysis below. All figures in this report are computed on the **cleaned** dataset (833 orders used for revenue/volume analysis) unless a table explicitly says "raw."

| # | Issue | Detail | How it was handled |
|---|-------|--------|---------------------|
| 1 | **Exact duplicate row** | Order `1201` (South / Electronics / rep_10, 2025-09-24, $4,450.78) appears twice, byte-for-byte identical. | Kept one copy, dropped the other. 835 → 834 unique orders. |
| 2 | **Missing quantity** | Order `1038` (East / Electronics, 2025-07-20) has a blank `quantity`. | Back-calculated from the other fields: `revenue / (unit_price × (1 − discount))` = 252.21 / (308.74 × 0.8) ≈ 1.02 → imputed as **1 unit**. This is the only imputed value in the dataset. |
| 3 | **Negative revenue** | Order `1082` (East / Office Supplies / rep_03, 2025-08-08): quantity 7, unit price $54.31, discount 20% → expected revenue ≈ $304, but recorded revenue is **-$316.98** (sign-flipped, not a plausible return given the matching magnitude). | Excluded from all revenue/AOV totals (treated as an unresolved data error, not a real transaction). Impact is immaterial to totals (~$317 on a ~$939K base) but the row itself is unreliable and is flagged for source-system follow-up. |
| 4 | **Unit-price outlier** | Order `1251` (East / Office Supplies / rep_02, 2025-10-13): `unit_price` recorded as **$99,999** against quantity 7 and revenue of only $313.53. Implied real unit price is $313.53 / 7 ≈ **$44.79**, consistent with other Office Supplies prices (category average ≈ $48). | Treated as a fat-finger data entry error. The order's `revenue` and `quantity` were kept (plausible), but this row is excluded from all unit-price averages/correlations so it doesn't distort them. |
| 5 | **Inconsistent category label casing** | Region value `north` (lowercase) appears once vs. 261 rows of `North`. | Normalized to title case (`North`). |

**Net result:** 834 unique orders; 833 used for revenue analysis (1 excluded negative-revenue row); no other nulls, no negative quantities/prices, discounts all within 0–30%, order IDs run 1001–1834 with no gaps.

### A more consequential issue: the `revenue` field doesn't reconcile with `quantity × unit_price × (1 − discount)`

For a "clean" transaction, `revenue` should equal `quantity × unit_price × (1 − discount)`. It does **not**, and the gap is not random noise — it is a systematic, growing bias:

| Month | Avg. (revenue − expected) / expected |
|-------|--------------------------------------|
| 2025-07 | +2% |
| 2025-08 | +5% |
| 2025-09 | +9% |
| 2025-10 | +12% |
| **2025-11** | **+56%** |
| **2025-12** | **+60%** |
| 2026-01 | +22% |
| 2026-02 | +25% |
| 2026-03 | +29% |
| 2026-04 | +32% |
| 2026-05 | +35% |

The gap climbs steadily from ~2% to ~12% over Jul–Oct 2025, **spikes to 56–60% in Nov–Dec**, resets down to ~22% in January, then resumes a steady climb through May 2026. Critically, this gap is nearly identical across every category (57.5%–58.1% in Nov–Dec) and every region (57.7%–58.1% in Nov–Dec) — a uniformity that rules out a single product, rep, or region as the cause. This has the signature of a systemic issue in how `revenue` is populated (e.g., a second fee/uplift or a join from a different source system), not a real market phenomenon.

**Assumption made for this report:** the `revenue` column, as recorded, is treated as the authoritative revenue figure for all totals/trends below (it's presumably what's actually invoiced/booked). `quantity`, `unit_price`, and `discount` are used only for unit-economics and discounting analysis. This is flagged again in Section 3 as it materially affects how November's growth should be interpreted.

---

## 2. Revenue Overview

### Headline numbers
- **Total revenue (cleaned):** $938,575.03 across 833 valid orders
- **Average order value (AOV):** $1,126.74 | **Median:** $583.36 (right-skewed — a handful of large Electronics/Furniture orders pull the mean up)
- **Date range:** 2025-07-01 to 2026-05-31 (11 months)
- **Total units sold:** 3,791

### Monthly trend

| Month | Revenue | Orders | Units | AOV |
|-------|---------:|-------:|------:|-----:|
| 2025-07 | $46,579 | 61 | 254 | $764 |
| 2025-08 | $69,750 | 80 | 399 | $872 |
| 2025-09 | $76,556 | 74 | 347 | $1,035 |
| 2025-10 | $77,457 | 83 | 381 | $933 |
| 2025-11 | $124,320 | 79 | 376 | $1,574 |
| 2025-12 | $95,598 | 78 | 342 | $1,226 |
| 2026-01 | $78,020 | 78 | 334 | $1,000 |
| 2026-02 | $66,783 | 65 | 287 | $1,027 |
| 2026-03 | $101,931 | 69 | 325 | $1,477 |
| 2026-04 | $100,753 | 84 | 370 | $1,199 |
| 2026-05 | $100,830 | 82 | 376 | $1,230 |

**Read this trend with the Section 1 caveat in mind.** November's $124K is the single biggest month, but order count (79) and units (376) were *flat or slightly down* vs. October (83 orders, 381 units) — the entire month-over-month jump (+60%) is explained by the revenue-formula gap spiking that month, not by more orders or bigger baskets. The underlying demand signal (orders, units) is comparatively flat/gently seasonal across the year; only the recorded revenue swings sharply.

### By region

| Region | Revenue | Share | Orders | Units | AOV |
|--------|--------:|------:|-------:|------:|-----:|
| North | $310,683 | 33.1% | 262 | 1,210 | $1,186 |
| East | $268,113 | 28.6% | 229 | 1,032 | $1,171 |
| South | $187,990 | 20.0% | 162 | 763 | $1,160 |
| West | $171,790 | 18.3% | 180 | 786 | $954 |

West has the most orders relative to revenue but the lowest AOV of any region (~19% below North/East/South) — it is generating volume but each order is worth less.

### By category

| Category | Revenue | Share | Orders | Units | AOV |
|----------|--------:|------:|-------:|------:|-----:|
| Electronics | $467,811 | 49.8% | 209 | 935 | $2,238 |
| Furniture | $329,630 | 35.1% | 196 | 954 | $1,682 |
| Apparel | $93,639 | 10.0% | 219 | 998 | $428 |
| Office Supplies | $47,496 | 5.1% | 209 | 904 | $227 |

Electronics and Furniture together drive 85% of revenue from only 49% of orders — high unit economics, low order count. Apparel and Office Supplies are high-frequency, low-ticket categories.

### Region × Category (revenue, $)

| Region | Apparel | Electronics | Furniture | Office Supplies |
|--------|--------:|------------:|----------:|-----------------:|
| East | 25,808 | 138,029 | 92,030 | 12,246 |
| North | 26,051 | 144,145 | 125,802 | 14,684 |
| South | 16,336 | 96,181 | 64,632 | 10,841 |
| West | 25,444 | 89,455 | 47,165 | 9,725 |

Electronics' share of regional revenue is consistent everywhere (46–52%), but Furniture's share swings from 40.5% in North down to 27.5% in West — West is comparatively Furniture-light, which (combined with its low AOV) helps explain why West lags.

### Sales reps (for context)

Revenue ranges from $91,582 (rep_06, top) to $61,437 (rep_02, bottom) — a 1.5x spread — on order counts that vary less (56–78 orders), so the gap is driven more by deal size than by activity level.

---

## 3. Three Non-Obvious Insights

**1. November's reported revenue surge is very likely a data artifact, not real demand growth.**
Revenue jumped 60% from October ($77,457) to November ($124,320), but order count fell slightly (83 → 79) and units sold fell slightly (381 → 376). The jump is fully explained by the revenue-vs-unit-economics gap widening from +12% to +56% that month (see Section 1), and the widening is uniform across every category and region — not concentrated in one product line that might justify a genuine price increase or holiday surcharge. **Recommendation for planning:** do not treat Nov/Dec 2025 as a demand baseline for forecasting or comp plans until the revenue field is reconciled with source systems.

**2. Discounting is not buying extra volume — it is close to pure margin giveaway.**
Correlation between `discount` and `quantity` per order is +0.065 (effectively zero); average units per order is essentially flat (4.4–5.2) across every discount tier from 0% to 30%. Total discount given away is **$106,609**, or **12.6% of gross list value** ($844,985) — with no measurable lift in basket size to show for it. If discounts were working as a volume lever, larger discounts should correlate with larger orders; they don't.

**3. Furniture is discounted nearly 2x as hard as Electronics for comparable volume.**
Furniture carries a 17.0% average discount (17.5% of its gross value given away, $54,463) versus Electronics' 9.5% average discount (9.5% of gross, $38,647) — despite the two categories selling almost identical unit volumes (954 vs. 935 units). Furniture is not out-selling Electronics because of its discount depth; it's giving away roughly $16K more in margin than Electronics did to move a smaller number of units, which points to a specific, fixable pricing/discount-approval gap in that category.

---

## 4. Discounting Analysis: Is Discounting Working?

| Discount tier | Orders | Avg. revenue/order | Avg. units/order | Total revenue |
|---------------|-------:|--------------------:|-------------------:|----------------:|
| 0% | 219 | $1,287 | 4.42 | $281,876 |
| 1–10% | 265 | $1,105 | 4.49 | $292,788 |
| 11–20% | 192 | $952 | 4.45 | $182,732 |
| 21–30% | 157 | $1,154 | 4.96 | $181,180 |

- **Correlation(discount, revenue per order): -0.033** — essentially no relationship (slightly negative, if anything).
- **Correlation(discount, quantity per order): +0.065** — essentially no relationship.
- Discounted orders (any discount > 0) do **not** have meaningfully bigger baskets than full-price orders (avg. 4.5–5.0 units vs. 4.4 units at 0% discount) — the 21–30% tier's slightly higher average (4.96 units, on only 157 orders) is the closest thing to a signal here and is not strong enough to justify the margin cost.
- Discount usage varies meaningfully by category: **Furniture 17.0%** avg. discount vs. Apparel 10.2%, Office Supplies 10.8%, Electronics 9.5%. Regional discounting is flat (11–12% everywhere), so this is a category-specific pattern, not a regional one.

**Conclusion: discounting, as currently practiced, is not demonstrably working as a volume driver.** It correlates with neither bigger orders nor higher revenue per order, and one category (Furniture) is absorbing a disproportionate share of the giveaway. This doesn't mean *all* discounting is wasteful — some may be needed for competitive deals or specific customers — but there's no evidence in this data that broad, order-level discounting is paying for itself in volume.

---

## 5. Recommendations (Prioritized)

**1. (Urgent, data integrity) Reconcile the `revenue` field against unit economics before using Nov 2025–May 2026 figures for forecasting, board reporting, or comp calculations.**
The revenue-vs-formula gap is large (up to 60%), uniform across categories/regions (ruling out a real business cause), and growing month over month even outside the Nov-Dec spike. Expected impact: prevents basing forecasts, quotas, or commission payouts on an inflated demand signal — on the >$100K/month recorded in 4 of the last 5 months, even a 20–30 point correction in the gap represents tens of thousands of dollars in mis-stated monthly revenue. This is the highest-leverage action because every other number in this report inherits this uncertainty.

**2. (Medium-term, margin recovery) Tighten Furniture discount policy toward the Electronics benchmark.**
Furniture discounts (17.0% avg.) give away nearly 2x the rate of Electronics (9.5% avg.) to move a comparable number of units (954 vs. 935). Since Section 4 shows no volume payoff from deeper discounts, moving Furniture's average discount from 17% toward ~12% (still above Electronics, allowing for category norms) while holding unit volume roughly constant would recover on the order of **$15,000–20,000** in margin, based on the ~$54K currently given away in that category.

**3. (Growth) Close the West region's value gap.**
West has the lowest AOV ($954, ~20% below North/East/South) and the lowest Furniture mix (27.5% of regional revenue vs. 34–41% elsewhere), despite having more orders than South. Investigate whether this is a rep mix, pricing, or product-availability issue, and pilot bringing West's Furniture attach rate toward the East/South level (~34%). Even a partial correction — closing half the AOV gap across West's 180 orders — implies roughly **$18,000–20,000** in incremental revenue at current order volumes, without needing to acquire a single new customer.

---

## Assumptions Log (for reproducibility)

1. Deduplicated on exact full-row match (order 1201); kept first occurrence.
2. Missing quantity (order 1038) imputed as 1 via `revenue / (unit_price × (1 − discount))`, rounded to nearest integer.
3. Negative-revenue row (order 1082, -$316.98) excluded from all revenue/AOV/trend calculations as an unresolved data error; it is not excluded from the "raw duplicate" count in Section 1.
4. Unit-price outlier (order 1251, $99,999) excluded only from unit-price-based averages/correlations; its revenue and quantity were kept in revenue totals.
5. Region value `north` normalized to `North`.
6. `revenue` (as recorded) is treated as ground truth for all revenue totals/trends; `quantity`/`unit_price`/`discount` are used for unit-economics and discount analysis. The reconciliation gap between the two is treated as a data-quality finding, not corrected/rebased, since there is no way from this file alone to determine which side (revenue vs. the formula) is "wrong."
7. All dollar figures are in the currency implied by the source file (unlabeled; assumed USD).

LOADED: none
