# Sales Performance Report — July 2025 to May 2026

**Bottom line:** Revenue over the 11-month window totals **$938.3K** across 834 orders and is growing (+116% from the first to the last month), but growth is concentrated in Electronics and Furniture and in two irregular spikes (Nov '25, Mar '26) rather than a broad, steady trend. Discounting is heavily used — nearly 3 in 4 orders carry one — but shows **no measurable relationship with order size or order count**, meaning ~$107K in list-price value was given away in discounts with no evidence it bought extra volume. Furniture is the biggest discount-margin risk: 82% of Furniture orders are discounted at an average depth of ~21%.

---

## 1. Data Quality Assessment

**Grain:** one row = one order (`order_id`). Source file has 835 rows.

| Issue | Finding | Action Taken |
|---|---|---|
| Duplicate order | `order_id 1201` appears twice, identical in every field (South, 2025-09-24, $4,450.78) | Dropped the second copy. Working dataset = **834 orders**. |
| Inconsistent category text | Region `"north"` (lowercase) appears once vs. 261 `"North"` rows | Recased to `North`. No new category created. |
| Missing quantity | `order_id 1038` (Electronics, 2025-07-20) has null `quantity` | Kept the row for revenue totals (revenue is populated); **excluded from quantity/unit-price-based averages**. |
| Negative revenue | `order_id 1082` (Office Supplies, 2025-08-08): qty 7, unit price $54.31, 20% discount, revenue **-$316.98** | Consistent with a return/credit rather than an error (fields are otherwise normal). Kept in totals as a real event; called out separately so it isn't mistaken for a sale. |
| Extreme unit price | `order_id 1251` (Office Supplies, 2025-10-13): `unit_price = $99,999` vs. a dataset median of $105.80 and a revenue of only $313.53 for that row | Treated as a **data-entry error** (fat-fingered price, e.g., a stray "9" fill). Revenue for the row looks normal and was kept; the unit price is flagged and **excluded from any unit-price averages/analyses** below. |
| Revenue doesn't fully reconcile to `qty × unit_price × (1 − discount)` | Recomputing the formula from the other three columns leaves a residual gap that grows through the year: ~2% in Jul–Aug '25, ~50% in Nov–Dec '25, settling near 20–30% from Jan '26 on (excluding the $99,999 row) | This means `unit_price`/`discount` alone don't fully explain `revenue` — likely an unlogged fee, tax, or price change. **`revenue` is treated as the source of truth for all revenue totals in this report** (it's the direct dollar figure, not a derived one). `quantity × unit_price` is used *only* as a "list price" proxy in the discounting section, and that use is flagged as approximate. |
| Row count vs. expected | 834 orders over 11 months (~76/month), no missing calendar months, no duplicate-load pattern beyond the one row above | No further action. |
| Nulls elsewhere | 0 nulls in `date`, `region`, `category`, `sales_rep`, `unit_price`, `discount`, `revenue`; 1 null in `quantity` | See above. |

**Net effect of cleaning:** headline revenue moves by less than 0.5% (one duplicate row worth $4,450.78 removed from a $942.7K raw sum). All figures below use the cleaned, 834-order dataset.

---

## 2. Revenue Overview

**Total revenue: $938,258** across 834 orders. Average order value $1,125; **median $582** — the mean is inflated by a right-skewed tail of large Electronics/Furniture orders, so use the median when thinking about a "typical" order.

### Trend over time

| Month | Revenue | Orders | Avg Order | MoM Growth |
|---|---:|---:|---:|---:|
| 2025-07 | $46.6K | 61 | $764 | — |
| 2025-08 | $69.4K | 81 | $857 | +49% |
| 2025-09 | $76.6K | 74 | $1,035 | +10% |
| 2025-10 | $77.5K | 83 | $933 | +1% |
| 2025-11 | $124.3K | 79 | $1,574 | **+61%** |
| 2025-12 | $95.6K | 78 | $1,226 | -23% |
| 2026-01 | $78.0K | 78 | $1,000 | -18% |
| 2026-02 | $66.8K | 65 | $1,027 | -14% |
| 2026-03 | $101.9K | 69 | $1,477 | **+53%** |
| 2026-04 | $100.8K | 84 | $1,199 | -1% |
| 2026-05 | $100.8K | 82 | $1,230 | 0% |

All 11 calendar months in the data are complete (first and last day of each month present), so no partial-period distortion. There is only one full year of data, so a true year-over-year seasonality check isn't possible yet — treat month-to-month swings below as *description*, not confirmed seasonality.

- July'25 → May'26 revenue is up **+116%**, but the path is lumpy, not a smooth ramp: two spikes (Nov, Mar) each followed by pullback to a $95–100K plateau.
- **Nov '25 spike (+61%, $124K)**: order *count* was flat (79 vs. 83 in Oct) — the spike is entirely an average-order-value effect ($933 → $1,574), broad-based across Electronics (+$21K) and Furniture (+$22K). Consistent with a holiday/Black Friday buying pattern, but unconfirmed without a second year of data.
- **Mar '26 spike (+53%, $102K)**: driven almost entirely by Electronics ($37K → $63K, +$26K of the +$35K total increase); Furniture and Apparel also rose but contributed far less. This looks like a single-category event (e.g., a product launch or bulk order), not a company-wide trend.

### By region

| Region | Revenue | Share | Orders | Avg Order |
|---|---:|---:|---:|---:|
| North | $310.7K | 33.1% | 262 | $1,186 |
| East | $267.8K | 28.5% | 230 | $1,164 |
| South | $188.0K | 20.0% | 162 | $1,160 |
| West | $171.8K | 18.3% | 180 | $954 |

North and East together are 61.6% of revenue. West has both the fewest orders and the lowest average order value — a candidate for a growth review (see Recommendations).

### By category

| Category | Revenue | Share | Orders | Avg Order | Median Order |
|---|---:|---:|---:|---:|---:|
| Electronics | $467.8K | 49.9% | 209 | $2,238 | $2,036 |
| Furniture | $329.6K | 35.1% | 196 | $1,682 | $1,577 |
| Apparel | $93.6K | 10.0% | 219 | $428 | $400 |
| Office Supplies | $47.2K | 5.0% | 210 | $225 | $203 |

Electronics and Furniture combined are **85% of revenue from only 49% of orders** — a small share of order volume carries most of the dollars, driven by high per-order value rather than high order counts.

---

## 3. Three Non-Obvious Insights

**1. Revenue growth is not broad-based — it is two category-specific spikes riding on a flat base.**
Strip out November and March, and the remaining 9 months sit in a narrow $47K–$102K band with no clear upward trend (in fact Jul '25 and Feb '26, both non-spike months, are the two lowest). The "+116%" headline growth is real but almost entirely attributable to two step-changes concentrated in Electronics, not steady month-over-month improvement. **So what:** don't extrapolate the full-year growth rate into a forecast — the underlying run-rate outside spike months is closer to flat, and Electronics' event-driven pattern should be investigated (is it a recurring campaign, or a one-off that won't repeat?).

**2. Discounting shows essentially zero relationship with order quantity — the correlation is +0.02 to +0.08 across every category.**
The classic "discounts drive volume" story doesn't hold up here: within Electronics, Apparel, Furniture, and Office Supplies alike, average quantity per order is flat (4.4–5.0 units) regardless of discount depth, and correlating discount % with quantity gives near-zero coefficients in every category. **So what:** the ~$107K in list-price value given up to discounts (see Section 4) is not buying incremental volume — it looks like a pure revenue giveaway rather than a volume-growth lever, which changes how the discount question should be framed (see Section 4/5).

**3. Furniture is a concentrated discount-margin risk hiding inside decent-looking category revenue.**
Furniture is the #2 revenue category ($329.6K, 35% share) and looks healthy on the surface. But it has both the highest discount **penetration** (82% of orders discounted, vs. 68–75% for other categories) and the highest average discount **depth** (~21% on discounted orders, vs. 10–17% elsewhere). Furniture buyers gave up **$54.5K of list-price value to discounts — more than half of the $107K company-wide total** — despite being only 37% of gross list-price sales. **So what:** if Furniture margins are thin, this category is quietly the most expensive one to sell, and it deserves the first look in any discount-policy change.

---

## 4. Discounting Analysis: Is It Working?

*Caveat: the data has no cost/margin column, so true profit impact (per the "evaluate on margin, not revenue" principle) cannot be computed directly. The analysis below uses list price (`quantity × unit_price`, excluding the one corrupted $99,999 unit-price row) as the basis for revenue given up, and should be read as a revenue-impact — not confirmed margin-impact — estimate.*

**Depth and penetration (both matter, and they differ by category):**

| Category | Penetration (any discount) | Depth (avg % | discounted orders) | Discount $ given (list-price basis) | Discount as % of category's list value |
|---|---:|---:|---:|---:|
| Furniture | 82% | ~21% | $54.5K | **17.5%** |
| Office Supplies | 75% | ~15% | $4.8K | 11.1% |
| Apparel | 70% | ~15% | $8.8K | 10.7% |
| Electronics | 68% | ~14% | $38.6K | 9.4% |
| **Company-wide** | **74%** | **16%** | **$106.6K** | **12.6%** |

**Volume relationship:** Correlation between discount % and order quantity is essentially zero company-wide (r ≈ +0.07) and within every category (r ranges +0.02 to +0.08). Average quantity per order barely moves across discount buckets (0% discount: 4.4 units/order; 25–30% discount: 5.0 units/order — a difference too small, and too uncorrelated within-category, to credit to the discount itself).

**Revenue relationship:** Correlation between discount % and order revenue is also near zero (r ≈ -0.03), and average order value is actually *lower* in discounted buckets than in the 0%-discount bucket ($1,287 avg at 0% vs. $945–$1,154 in discounted buckets) — consistent with discounts being applied more to lower-ticket categories (Apparel, Office Supplies, Furniture) rather than discounts causing smaller orders.

**Conclusion:** This dataset does not support "discounting drives volume" or "discounting drives revenue" — the correlations are indistinguishable from noise. What the data *does* show is that **$106.6K in list-price value (12.6% of gross)** was given away, concentrated in Furniture. Absent a controlled test (e.g., matched regions with/without discounts), the most defensible read is that discounting here functions as a **price giveaway with no demonstrated volume payoff**, not a proven growth lever. This is an observation the data supports, not a causal claim the data proves — a controlled pilot (Section 5) is how to actually test causality.

---

## 5. Recommendations

**1. Cap Furniture discount depth and audit penetration first — highest impact, traceable directly to Section 3/4.**
Furniture gives up $54.5K in list value (over half of all discounting) with no measured volume benefit. Pilot capping Furniture discounts at 15% (from a ~21% average) in two regions for one quarter, holding two regions as a control. If margin structure resembles other categories, a 6-point reduction in average depth on 82%-penetration volume could recover a meaningful share of that $54.5K — quantify against actual Furniture cost data once available. **Confidence: medium** — the revenue-give-away math is solid; margin recovery depends on cost data this dataset doesn't contain, and on Furniture demand not being genuinely price-elastic (untested here).

**2. Investigate whether the Mar '26 Electronics spike (+$26K, 70% of that month's total increase) is a repeatable driver or a one-off, before building it into a forecast.**
If it's a recurring campaign or seasonal pattern, it's worth deliberately re-running; if it was a one-off (e.g., a single bulk order or promo), the flat $95–100K non-spike run-rate is the more honest baseline for planning next quarter. Low effort — a look at the specific orders/sales reps behind the March jump — with potentially high payoff (either a repeatable playbook or a corrected forecast). **Confidence: medium-high** on the finding that it's category- and month-concentrated; low confidence, without more data, on *why*.

**3. Review West region's growth stall — lowest average order value ($954 vs. $1,160–$1,186 elsewhere) and fewest orders (180) despite four broadly comparable regions.**
This is a smaller, lower-effort fix: compare West's category mix and rep coverage against North/East to see if it's a mix effect (more Apparel/Office Supplies, less Electronics/Furniture) or a genuine regional underperformance, and consider reallocating sales coverage or a targeted Electronics/Furniture push in West. **Confidence: medium** — the gap is clear in the data; the cause (mix vs. execution) needs a follow-up cut by region × category that this report's aggregate view doesn't fully resolve.

---

## Assumptions & Reproducibility

- **Data source:** `eval/fixtures/sales.csv`, 835 raw rows, one row per order.
- **Revenue definition:** the `revenue` column as provided, treated as the authoritative, already-net figure (post-discount); not recomputed from `quantity × unit_price × (1 − discount)`, since that formula does not reconcile against the given revenue (see Data Quality, item 6).
- **Cleaning applied:** removed 1 exact duplicate order (`1201`); recased 1 mislabeled region value (`north` → `North`); excluded 1 row with null `quantity` from quantity/unit-price-based stats only (still included in revenue totals); excluded 1 row with a clearly erroneous `unit_price` ($99,999) from unit-price/list-price-based stats only.
- **All 834 cleaned orders are included in every revenue and category/region total** in this report; the negative-revenue return ($-316.98) is included in totals as a real event, not removed.
- **Discount revenue-given-up figures** use `quantity × unit_price × discount` as a list-price proxy; this is explicitly a revenue (not margin) estimate, since no cost/margin field exists in the source data.
- **Currency/timezone:** not specified in the source; assumed a single consistent currency and no timezone adjustment needed (dates have no time component).
- **Time window:** 2025-07-01 through 2026-05-31, 11 complete calendar months; no partial-period adjustment was needed.
- Figures can be reproduced by loading the CSV, applying the three cleaning steps above, and recomputing sums/means/correlations as described per section; no random sampling or seeds are involved.

LOADED: INDEX.md, 01-data-quality-profiling.md, 02-aggregation-pitfalls.md, 03-time-series.md, 04-segmentation.md, 05-discount-pricing.md, 06-insight-generation.md, 07-executive-writing.md, 08-recommendations.md, 09-reproducibility-assumptions.md
