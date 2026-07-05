# Sales Performance Report — July 2025 to May 2026

**Bottom line:** Revenue over the 11-month period totals **$938,258** across 834 orders. Reported revenue climbed from ~$46.6K in the first month to a peak of ~$124.3K in November 2025, but roughly half of that swing cannot be explained by the price, quantity, or discount data on file (see Data Quality, item 4) — the "growth" needs to be verified against source billing before it's presented as a business result. What we *can* confirm: Electronics and Furniture are the profit engine (48.6% of orders, 85.0% of revenue), discounting is applied on 3 out of 4 orders but shows no measurable relationship to order size, and discount practice varies widely by sales rep — all three are addressable now, independent of the reconciliation question.

---

## 1. Data quality assessment

The raw file has 835 rows, one row per order (`order_id`). Profiling surfaced five issues; all cleaning decisions below are applied to the 834-row dataset used for every number in this report.

| # | Issue | Scope | Decision | Rationale |
|---|---|---|---|---|
| 1 | Exact duplicate row | `order_id 1201` appears twice, byte-for-byte identical (South/Electronics/rep_10, 2025-09-24, $4,450.78) | Dropped the second copy → 835 → **834 rows** | A true duplicate would double-count $4,450.78 in every downstream total. |
| 2 | Missing `quantity` | 1 row (`order_id 1038`, 0.12% of rows), revenue present ($252.21) | Kept row for revenue totals; **excluded from quantity/volume-based averages** | Too small to bias revenue; dropping the row would also silently lose $252 of real revenue. Flagged, not imputed, to avoid inventing a number. |
| 3 | Corrupted `unit_price` | 1 row (`order_id 1251`): `unit_price = 99,999` vs. a dataset median of $106 — a 1,000x outlier and a classic sentinel/typo value. Quantity(7) × 99,999 would imply $700K of revenue, but recorded revenue is only $313.53 | Kept the row's **revenue** (looks plausible, in line with typical order sizes); **excluded this row from all unit-price and discount-cost calculations** | Revenue is independently recorded and internally consistent; unit_price is clearly bad and would distort any per-unit or list-price metric. |
| 4 | **Revenue does not reconcile with quantity × unit price × (1 − discount)** | Pervasive — computing "list revenue" from the other three fields and comparing to recorded revenue shows real revenue running **26% above** the formula on average across the whole file, and the gap is not stable over time: ~2% in Jul 2025, rising to a **~56–60% gap in Nov–Dec 2025**, then easing back to ~30% by Apr–May 2026 | **Used the `revenue` column as the authoritative, recorded figure for all revenue totals/trends** (it is the field a finance system would report from); flagged the reconciliation gap explicitly and did **not** attempt to re-derive revenue from price × quantity | This is the single most important caveat in the report. Something not captured in these four columns — a fee, tax, price change at time of sale, or currency effect — is adding a growing wedge to revenue, especially through Nov–Dec 2025. Until reconciled against a source system (e.g., billing/GL), **treat month-to-month revenue movement as directionally indicative, not confirmed**, since price/quantity/discount data cannot explain it. |
| 5 | Inconsistent `region` casing | 1 row: `"north"` (lowercase) vs. 261 rows `"North"` | Standardized to Title Case | Otherwise "North" would silently split into two segments in any regional rollup. |
| 6 | One negative revenue row | `order_id 1082`: revenue = **−$316.98** (East, Office Supplies) — quantity, unit price, and discount all look like ordinary values | Kept in totals (a negative reduces revenue exactly as a return should); flagged as a likely **return/credit** miscoded as a regular order row (no order-type field exists to confirm) | Immaterial to the $938K total (0.03%), but worth a source-system check — if there are more uncaptured returns elsewhere, they wouldn't be visible without an order-type flag. |

**Not an issue:** no future-dated rows, no unparseable dates, and quantity/discount value ranges (1–8 units; 0%, 5%, 10%…30% discount steps) look like clean, intentional business rules rather than noise. Category and sales-rep fields had no spelling variants.

**Grain:** one row = one order. Row counts per month (60–84) are stable with no anomalous spike, so no evidence of a duplicated file-load beyond the single row noted above.

---

## 2. Revenue overview

### Total
**$938,258** across **834 orders** (Jul 1, 2025 – May 31, 2026, both months complete — no partial-period distortion at either end). Median order revenue is **$582**; mean is **$1,125** — the mean is pulled up by a right-skewed tail of large Electronics/Furniture orders, so median is the more representative "typical order" figure.

### Trend over time
| Month | Revenue | Orders | Avg revenue/order |
|---|---:|---:|---:|
| 2025-07 | $46,579 | 61 | $764 |
| 2025-08 | $69,433 | 81 | $857 |
| 2025-09 | $76,556 | 74 | $1,035 |
| 2025-10 | $77,457 | 83 | $933 |
| 2025-11 | $124,320 | 79 | **$1,574** |
| 2025-12 | $95,598 | 78 | $1,226 |
| 2026-01 | $78,020 | 78 | $1,000 |
| 2026-02 | $66,783 | 65 | $1,027 |
| 2026-03 | $101,931 | 69 | $1,477 |
| 2026-04 | $100,753 | 84 | $1,199 |
| 2026-05 | $100,830 | 82 | $1,230 |

Comparing the first three months on file (Jul–Sep 2025: $192,567 / 216 orders) to the last three (Mar–May 2026: $303,513 / 235 orders): revenue is up **58%**, order count is up only **9%**, and average order value is up **45%**. Order volume growth is modest and credible; the average-order-value jump is exactly where the unexplained revenue wedge (Data Quality #4) shows up most — **do not present the 58% figure as confirmed organic growth** without reconciling it first. There isn't enough history (11 months, no repeat calendar year) to test for seasonality, so the Nov–Dec spike should not be assumed to be a holiday effect either.

### By region
| Region | Revenue | Orders | Avg/order |
|---|---:|---:|---:|
| North | $310,683 | 262 | $1,186 |
| East | $267,796 | 230 | $1,164 |
| South | $187,990 | 162 | $1,160 |
| West | $171,790 | 180 | $954 |

North and East together are 62% of revenue. West has both the fewest orders and the lowest average order value — worth a closer look at its product mix (see below).

### By category
| Category | Revenue | Orders | Avg/order | Share of revenue |
|---|---:|---:|---:|---:|
| Electronics | $467,811 | 209 | $2,238 | 49.9% |
| Furniture | $329,630 | 196 | $1,682 | 35.1% |
| Apparel | $93,639 | 219 | $428 | 10.0% |
| Office Supplies | $47,179 | 210 | $225 | 5.0% |

Order counts are almost even across the four categories (196–219 each), but revenue is not — Electronics and Furniture combined are **48.6% of orders and 85.0% of revenue**. Apparel and Office Supplies are the other half of the order volume for only 15% of the revenue.

Region × category (revenue, $000s): West is noticeably lighter in Furniture ($47K, its smallest category by far and less than half North's $126K), which is the main driver of West's lower regional average order value above.

---

## 3. Three non-obvious insights

**1. Roughly half of the reported revenue "growth" is unexplained by the underlying transaction data — it needs a source-system check before anyone acts on it.**
Quantity-per-order and unit prices are essentially flat across the 11 months (avg quantity 4.2–5.0 units; avg Electronics unit price a stable $411–$459), yet the gap between recorded revenue and quantity × unit price × (1 − discount) grows from **~2% in Jul 2025 to a peak of ~60% in Nov–Dec 2025**, before settling around ~30% by mid-2026. Since the inputs that should drive revenue barely moved, a large share of the November revenue peak and the overall upward trend is coming from something not captured in these columns — not from more units sold or higher prices. *So what:* before citing "revenue is up 58%" or building a forecast on the November spike, reconcile the `revenue` field against billing/GL for at least the Nov 2025–Feb 2026 window.

**2. A minority of orders carries the business: Electronics + Furniture are 48.6% of orders but 85.0% of revenue**, and the top 10% of orders by revenue alone account for 32.9% of total revenue. This is a moderate concentration, not extreme Pareto (80/20), but it means sales/account-management attention on the ~400 Electronics/Furniture orders matters far more to the topline than the ~430 Apparel/Office Supplies orders. *So what:* prioritize retention and upsell motion on Electronics/Furniture customers; a modest loss rate there has outsized revenue impact.

**3. Discount practice is a rep-level behavior, not just a category or product policy** — discount penetration ranges from **66.2% (rep_07)** to **85.7% (rep_10)**, and average discount depth ranges from **10.2% (rep_11)** to **14.0% (rep_10)**, among reps carrying comparable order volumes (56–84 orders each) across the same regional/category mix. This spread looks like individual discretion rather than a consistent policy. *So what:* this is a governance gap — see Recommendation 2.

---

## 4. Discounting analysis: is discounting working?

**Penetration and depth (must be reported separately — they answer different questions):**
- **73.7%** of orders carry a nonzero discount (penetration).
- Average discount depth is **11.8%** across all orders, or **16.0%** among the discounted orders only.
- Furniture stands out as the most heavily *and* most deeply discounted category: **81.6% penetration, 17.0% average depth** — both the highest of the four categories, on the second-highest-revenue category in the business.

**Relationship to order size and volume:**
- Correlation between discount rate and quantity ordered: **r = 0.07** (essentially none).
- Correlation between discount rate and order revenue: **r = −0.03** (essentially none, if anything slightly negative).
- Discounted orders actually average slightly **lower** revenue ($1,067 mean / $574 median) than full-price orders ($1,287 mean / $631 median).
- The one exception: the deepest discount tier (30%, 43 orders — just 5% of all orders) shows larger orders (avg 5.2 units, median revenue $1,411). This is too small a segment to generalize from, and the direction of causality is unclear — it may be that large deals *earn* a 30% discount (negotiated after the fact) rather than the discount *creating* the large order.

**Bottom line on discounting:** across the bulk of the order base, deeper discounts are **not associated with bigger orders or more volume** — the correlations are flat. The data cannot show discounting is "working" as a volume lever. It also cannot show discounting is destroying margin, because **this dataset has no cost or margin column** — only revenue, price, quantity, and discount rate. Any statement about margin impact from discounting (e.g., "20% off a 30%-margin item erases most of the profit") would be speculation here, not something these numbers support. What the data *can* support: Furniture is both the most discounted category and a top-2 revenue category, which is the combination most worth checking against actual product cost data next.

For reference, on the ~832 orders where unit price is usable, discounts removed an estimated **$106,623** in list-price value (12.6% of list-price value) — this is the size of the discount "spend," not a margin figure.

---

## 5. Recommendations (prioritized by expected impact)

1. **Reconcile the revenue field against source billing/finance data for Nov 2025–Feb 2026 before reporting the growth trend externally.** *Why:* the unit economics (quantity, price, discount) cannot explain up to 60% of the revenue recorded in that window (Insight 1); if the wedge is a data/ETL artifact rather than real revenue, the "58% quarter-over-quarter growth" headline is wrong and could misdirect planning. *Expected impact:* prevents an incorrect growth narrative from reaching the board; if confirmed real, it identifies a $50K+/month driver worth understanding and repeating deliberately. *Effort:* low (a data-team query against the source system). *Confidence:* high that a gap exists; low on its cause until checked.

2. **Set a discount approval threshold (e.g., anything above 15–20%, or above rep-level average + 1 tier, requires manager sign-off), starting with Furniture.** *Why:* discount depth/penetration varies by up to 4–9 points between reps with comparable order volumes (Insight 3), with no revenue or volume benefit showing in the data (Section 4) — this looks like unmanaged discretion, and Furniture combines the highest discount penetration (81.6%) with the second-highest revenue share (35.1%), the largest dollar exposure. *Expected impact:* tightening Furniture discount depth from 17.0% toward the company average of 11.8% would recover roughly $16K–$18K of list-price value per year at current volume (back-of-envelope: 5.2 points × ~$1.94M annualized Furniture list value), pending confirmation this doesn't cost margin-neutral volume. *Effort:* low-medium (policy + approval workflow). *Confidence:* medium — the discount-governance gap is clearly shown in the data; the dollar recovery estimate assumes volume holds, which is untested here (no cost/margin data to model elasticity).

3. **Invest sales/account-management attention specifically in the Electronics and Furniture order base, and investigate why West underperforms in Furniture specifically ($47K vs. $126K in North).** *Why:* these two categories are 48.6% of orders but 85.0% of revenue (Insight 2); West's revenue-per-order deficit ($954 vs. $1,186 in North) is concentrated in a single category gap, not a broad regional weakness. *Expected impact:* closing even half of West's Furniture gap to the regional average would add on the order of $35K–$40K in incremental annualized revenue from an existing customer base, without new customer acquisition cost. *Effort:* medium (requires sales-team investigation — is it product availability, rep specialization, or demand?). *Confidence:* medium — the gap is clearly shown; the root cause and fix require follow-up outside this dataset.

---

## Assumptions and methodology (for reproducibility)

- **Source:** `eval/fixtures/sales.csv`, 835 rows as delivered; analysis performed on the 834-row cleaned version (one exact duplicate order removed — see Data Quality #1).
- **Revenue definition:** the `revenue` column as recorded, used as-is for all totals/trends/segment splits. It is **not** re-derived from quantity × unit_price × (1 − discount) because that formula does not reconcile with recorded revenue (Data Quality #4) and re-deriving it would silently substitute a different, unverified number for the one the business presumably already reports from.
- **Currency/timezone:** not specified in the source file; assumed to be a single consistent currency and date basis (no conversion applied).
- **Exclusions:** the single row with a corrupted `unit_price` (99,999) is excluded only from unit-price/discount-cost calculations, not from revenue totals. The single row with a missing `quantity` is excluded only from quantity/volume calculations, not from revenue totals.
- **Region "Unknown":** not needed — the only region issue was a casing variant ("north"), standardized to "North," not a missing value.
- **Reconciliation:** category totals and region totals both sum exactly to the reported grand total of $938,258.05, confirming no rows were dropped or double-counted in the segment tables.
- **What this analysis cannot support:** margin/profitability conclusions about discounting (no cost data in the source file); confirmed causal claims about what discounts do to order size (only correlation, which is near zero); seasonality claims (only 11 months of data, no repeated calendar year).
