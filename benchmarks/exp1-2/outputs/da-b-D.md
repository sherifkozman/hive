# Sales Performance Report — July 2025 to May 2026

**Bottom line:** Revenue over the 11-month window totals **$938,258** across 834 orders. Growth is real but modest (~10% higher average monthly revenue in 2026 YTD vs. H2 2025), and a November–December spike is the clear seasonal high point. The more consequential finding is that **discounting shows no measurable link to order size or volume** — Furniture is discounted the hardest (82% of orders, ~21% average depth) yet its basket sizes are flat across discount levels, meaning roughly **$19k–$55k of list-price value is being given away with no evidence it buys extra sales.** Three prioritized actions below could recover tens of thousands of dollars with no observed downside to volume.

---

## 1. Data Quality Assessment

**Grain:** one row = one sales order (`order_id`). Raw file: 835 rows, 9 columns, spanning 2025-07-01 to 2026-05-31 (11 months).

| Issue found | Rows affected | Decision | Rationale |
|---|---|---|---|
| Exact duplicate order | 1 (`order_id 1201`, identical in every field) | **Dropped** the duplicate copy, kept one | A true duplicate row would double-count $4,450.78 in revenue; classic silent inflator. |
| Region casing inconsistency (`"north"` vs `"North"`) | 1 | **Normalized** to title case, folded into "North" | Same category, cosmetic difference; left unmerged it would fragment the region breakdown into a spurious 5th group. |
| Missing `quantity` | 1 (`order_id 1038`, 0.1% of rows) | **Imputed** with the dataset median (4 units), flagged | Too small to bias unit-based aggregates either way; revenue for that row is a separate recorded field and is unaffected by the imputation. |
| `unit_price` = 99,999 (vs. a $105.69 median, ~950x) | 1 (`order_id 1251`) | **Flagged and excluded** from unit-price/list-value averages; the order's revenue ($313.53, in-range) and order count were **kept** | Revenue for this row is normal-looking, so it is very likely a fat-fingered price entry (extra digits), not a fabricated order. Deleting the whole row would silently drop a real sale; deleting only the bad field preserves the order while preventing one price entry from swamping every price-based average. |
| Negative revenue | 1 (`order_id 1082`, −$316.98 vs. an expected ~+$304–$317 from qty × price × (1−discount)) | **Kept and flagged** as a likely return/refund or sign-entry error; included in totals (impact is $317 on a $938k base, i.e., 0.03%) | Per the "never silently delete" rule — the magnitude matches an ordinary order with a flipped sign, so it's plausible as a real return. Its effect on any headline number is negligible either way. |
| Nulls elsewhere (region, category, sales_rep, discount, revenue, date) | 0 | No action | Every other field is fully populated. |

**Clean analytic base after these decisions: 834 orders, $938,258.05 total revenue.** All figures below use this cleaned set unless noted.

---

## 2. Revenue Overview

### Headline numbers

| Metric | Value |
|---|---|
| Total revenue | **$938,258.05** |
| Orders | 834 |
| Units sold | 3,801 |
| Mean revenue/order | $1,125.01 |
| **Median** revenue/order | **$582.41** |

Mean is ~1.9x the median — revenue per order is right-skewed (a handful of large Electronics/Furniture orders pull the average up). **Use the median ($582) for typical-order planning; use the mean only for total-revenue math.**

### Trend over time

Comparing full 6-month (H2 2025) vs. full 5-month (2026 YTD) windows, using monthly averages so period lengths are comparable:

| Window | Months | Total revenue | Avg revenue/month |
|---|---|---|---|
| Jul–Dec 2025 | 6 | $489,942 | $81,657 |
| Jan–May 2026 | 5 | $448,316 | $89,663 |

**Average monthly revenue is up ~10% year-over-year run-rate.** The last observed month (May 2026) is a complete calendar month (31/31 days), so it is directly comparable — no partial-period adjustment needed.

Month-by-month (note the November–December spike, roughly +60% then a step down in January — a seasonal peak, not a trend break):

| Month | Revenue | Orders | MoM % |
|---|---|---|---|
| 2025-07 | $46,579 | 61 | — |
| 2025-08 | $69,433 | 81 | +49% |
| 2025-09 | $76,556 | 74 | +10% |
| 2025-10 | $77,457 | 83 | +1% |
| **2025-11** | **$124,320** | 79 | **+61%** |
| 2025-12 | $95,598 | 78 | −23% |
| 2026-01 | $78,020 | 78 | −18% |
| 2026-02 | $66,783 | 65 | −14% |
| 2026-03 | $101,931 | 69 | +53% |
| 2026-04 | $100,753 | 84 | −1% |
| 2026-05 | $100,830 | 82 | +0% |

### By region

| Region | Revenue | Orders | Avg order | Median order | % of total |
|---|---|---|---|---|---|
| North | $310,683 | 262 | $1,186 | $715 | 33.1% |
| East | $267,796 | 230 | $1,164 | $560 | 28.5% |
| South | $187,990 | 162 | $1,160 | $651 | 20.0% |
| West | $171,790 | 180 | $954 | $451 | 18.3% |

### By category

| Category | Revenue | Orders | Avg order | % of total |
|---|---|---|---|---|
| Electronics | $467,811 | 209 | $2,238 | 49.9% |
| Furniture | $329,630 | 196 | $1,682 | 35.1% |
| Apparel | $93,639 | 219 | $428 | 10.0% |
| Office Supplies | $47,179 | 210 | $225 | 5.0% |

**Electronics + Furniture = 85% of revenue from only 49% of orders** — these two categories carry the business; Apparel and Office Supplies drive order *count* but comparatively little revenue.

---

## 3. Three Non-Obvious Insights

### Insight 1 — Realized revenue-per-unit is decoupling from list price, and it's not a steady trend

Comparing average **list unit price** (from the `unit_price` field) against average **net realized price per unit** (`revenue ÷ quantity`) by month:

| Month | Avg list price | Avg net price/unit | Net ÷ (list × (1−discount)) |
|---|---|---|---|
| 2025-07 | $224 | $198 | 1.00x |
| 2025-09 | $220 | $212 | 1.08x |
| 2025-10 | $206 | $204 | 1.11x |
| **2025-11** | $234 | **$323** | **1.55x** |
| **2025-12** | $215 | **$299** | **1.59x** |
| 2026-01 | $224 | $242 | 1.23x |
| 2026-03 | $260 | $298 | 1.29x |
| 2026-05 | $230 | $268 | 1.35x |

Early in the window, revenue tracks almost exactly what list price, quantity, and discount predict (ratio ≈ 1.0). From November onward, actual revenue runs 20–60% **above** what those three fields explain, peaking in the Nov–Dec holiday months and re-climbing through 2026. **This is not simply "the holidays were good" — the gap is structural and growing even outside Nov–Dec** (1.11x in Oct → 1.35x in May). Something not captured by unit_price/discount/quantity — a real price increase, an upsell/attach-rate effect, or a shift toward higher-value SKUs within categories — is inflating realized revenue over time. Given it isn't visible in `unit_price`, finance/product should confirm whether this reflects a deliberate (and working) pricing change worth doubling down on, or a data-pipeline discrepancy worth fixing before it's relied on for forecasting.

### Insight 2 — West's "underperformance" is a category-mix problem, not a regional weakness

West has the lowest average order value ($954 vs. North's $1,186 — a $232/order gap). At first glance this looks like a regional execution issue. Breaking down each region's *order mix* by category tells a different story:

| Region | Apparel | Electronics | Furniture | Office Supplies |
|---|---|---|---|---|
| North | 24.4% | 24.8% | **29.0%** | 21.8% |
| East | 24.8% | 27.8% | 22.6% | 24.8% |
| South | 23.5% | 27.2% | 21.6% | 27.8% |
| **West** | **33.3%** | 20.0% | **18.3%** | 28.3% |

West sells proportionally *more* low-value Apparel/Office Supplies and *less* of the two big-ticket categories (Electronics + Furniture = 53.8% of North's orders vs. only 38.3% of West's). The gap is a **mix shift, not a weaker sales motion** — West reps aren't underselling Electronics/Furniture on a per-order basis (West's Electronics average order, $2,485, is actually in line with North's $2,218); West simply closes fewer of those orders relative to its Apparel/Office volume.

### Insight 3 — Revenue concentration is high enough to be a risk, not just a Pareto footnote

The top 10% of orders (83 orders) account for **32.9%** of total revenue; the top 20% account for **54.7%**. Combined with the category concentration above (Electronics + Furniture = 85% of revenue on 49% of orders), the business is exposed to a relatively small set of large, high-value transactions. A soft quarter in either of the two flagship categories — or a slowdown among the ~80 orders that make up a third of revenue — would move the topline far more than order-count trends alone would suggest. This is worth tracking as a concentration/risk metric, not only a revenue-mix curiosity.

---

## 4. Discounting Analysis: Is It Working?

**Overall:** 73.7% of orders carry some discount (**penetration**); among discounted orders the average cut is 16.0% (**depth**). Overall average discount across *all* orders is 11.8%.

### Penetration and depth by category

| Category | Penetration | Avg depth (discounted orders) | List-value given up | % of category list value |
|---|---|---|---|---|
| **Furniture** | **81.6%** | **20.9%** | **$54,463** | **17.5%** |
| Office Supplies | 75.2% | 14.4% | $4,764 | 11.1% |
| Apparel | 70.3% | 14.5% | $8,811 | 10.7% |
| Electronics | 68.4% | 13.9% | $38,832 | 9.5% |

Furniture stands out on **both** dimensions at once — the highest share of orders discounted *and* the deepest average cut — and gives up the largest share of its list value (17.5%) to discounting.

### Does discounting buy volume or bigger baskets? No measurable evidence that it does.

- Correlation between discount and revenue: **−0.03** (essentially zero, slightly negative)
- Correlation between discount and quantity: **+0.07** (essentially zero)
- Average units per order by discount depth: 0% → 4.41, 1–10% → 4.49, 11–20% → 4.48, 21–30% → 4.96 (flat, with the top bucket both smallest in count and containing the outlier-heavy tail)
- Average order revenue by discount bucket **falls** as discount increases in Electronics ($2,593 at 0% discount → $1,770 at 11–20% discount) — the opposite of "bigger discounts land bigger deals."

**Read on causation:** this data cannot distinguish "discounts fail to move volume" from "discounts are applied roughly independent of deal size to begin with" (i.e., the discount looks more like a habitual or rep-driven markdown than a targeted volume lever). What the data *can* say confidently: there is no observed positive association between discount depth and either revenue or units — the pattern one would expect if discounting were successfully driving incremental volume is absent.

**Margin caveat:** the dataset has no cost or margin field, so discount impact is measured here as **list-value given up** ($106,870 total, 12.6% of list value across all orders), not true margin erosion. If Furniture's cost structure resembles typical retail (30–40% margin), a 20.9% average discount would consume a large share of unit profit — but this cannot be confirmed without cost data. Recommendation 1 below is framed on the revenue-proxy number, with margin impact flagged as an open question for Finance.

---

## 5. Recommendations (prioritized by impact ÷ effort)

### 1. Cap Furniture discount depth at 15% — highest impact, low effort
**Finding it rests on:** Furniture has the highest discount penetration (81.6%) and depth (20.9%) of any category, gives up $54,463 in list value (17.5% of Furniture's list value), and shows no volume lift from discounting (flat units/order across discount bands; category-level discount/revenue correlation is ~0).
**Action:** Cap discretionary discounts on Furniture orders at 15%; require manager approval above that. 114 of 196 Furniture orders (58%) currently exceed 15%.
**Expected impact:** Recomputing those 114 orders at a 15% cap instead of their actual discount recovers **~$19,300 in list value** (from $46,783 given up today to $27,517), with no volume evidence suggesting this would cost sales.
**Confidence:** Medium. Based on revenue/volume correlation, not a controlled test, and margin impact is unconfirmed without cost data. Recommend piloting the cap in two regions for one quarter and measuring whether order volume actually declines before rolling out fully.

### 2. Investigate the post-October revenue-realization gap (Insight 1) — highest information value, low cost
**Finding it rests on:** realized revenue per unit has run 20–60% above what list price/discount/quantity explain since November, and the gap is trending upward independent of the Nov–Dec seasonal peak (1.11x in Oct → 1.35x in May).
**Action:** Have Finance/Product reconcile this against known pricing changes, promotions, or SKU-mix shifts in the underlying transaction system. If it reflects a real, deliberate pricing or mix improvement, formalize and extend it (it is currently adding well above list-implied revenue every month); if it's a reporting artifact, fix it before it's used in any 2026 H2 forecast.
**Expected impact:** Unquantified until the cause is confirmed, but the gap is currently worth roughly $15,000–$40,000/month above list-implied revenue — large enough that either explanation (real lever to scale, or reporting risk to correct) merits near-term attention.
**Confidence:** Low on cause, high on the existence of the pattern. This is flagged as a question to answer, not a lever to pull yet.

### 3. Rebalance West's category mix toward Electronics/Furniture — medium impact, medium effort
**Finding it rests on:** West's average order value ($954) trails North's ($1,186) by $232/order, driven by mix (West is 33.3% Apparel/28.3% Office Supplies vs. North's 24.4%/21.8%) rather than weaker per-order performance within a category (West's Electronics average order, $2,485, is on par with North's $2,218).
**Action:** Run a targeted push in West — bundling, cross-sell prompts, or rep incentives — aimed specifically at growing Electronics/Furniture attach on existing Apparel/Office Supplies orders, rather than a generic "sell more" directive.
**Expected impact:** Fully closing the mix gap to North's average would be worth ~$41,700 (180 West orders × $232 gap) — treat this as a ceiling, not a target. Closing even half the gap is a **~$20,800** opportunity over a comparable period.
**Confidence:** Medium. The mix explanation is well-supported by the data; the size of a realistic, achievable shift within a quarter is an estimate, not a guarantee.

---

## Assumptions and Method Notes

- **Data source:** `eval/fixtures/sales.csv`, 835 raw rows, one row = one order, no snapshot/refresh timestamp provided; treated as a static extract covering 2025-07-01 through 2026-05-31.
- **Revenue definition:** the `revenue` column is used as-is (assumed net, post-discount, in USD); it is treated as authoritative rather than re-derived from `quantity × unit_price × (1 − discount)`, because those three fields alone do not reconcile to `revenue` (see Insight 1) — recomputing revenue from them would silently overwrite a real, if unexplained, signal in the data.
- **Cleaning applied (see Section 1):** removed 1 exact duplicate order; normalized 1 region casing variant; imputed 1 missing quantity with the dataset median (flagged); excluded 1 clearly erroneous unit_price ($99,999) from price-based averages while keeping its order and revenue; kept 1 negative-revenue order as a flagged likely return.
- **No cost/margin data exists in this file.** All discount-impact figures are expressed as list-value given up, a revenue-side proxy, not true margin erosion — called out explicitly wherever used.
- **"Discount working" is evaluated via correlation and cross-bucket comparison, not a controlled experiment** — the data can show absence of an association but cannot prove discounts have zero causal effect on volume.
- Currency assumed USD; all figures rounded to the nearest dollar in prose, to the cent in source tables, per standard executive-reporting precision.

LOADED: composable/BUNDLE.md
