# T1 — Sales Data Aggregation

Source: `eval/fixtures/sales.csv`, 835 raw rows, 2025-07-01 through 2026-05-31, grain = one row per order (`order_id`). Revenue is treated as the net, already-discounted dollar amount in the `revenue` column.

## Data-quality decisions (applied before any aggregation)

- **Exact duplicate row.** `order_id` 1201 (2025-09-24, South, Electronics, $4,450.78) appears twice with identical values. Kept the first occurrence, dropped the second. Working set: **834 rows**.
- **Region casing.** One row has region `north` (lowercase) instead of `North`. Normalized to `North`. Region counts after fix: North 262, East 230, West 180, South 162.
- **`unit_price` outlier.** Order 1251 (2025-10-13) has `unit_price = 99999.0`, but its `revenue` ($313.53) is consistent with a normal ~$44.79 unit price at qty 7. `unit_price` is not used in any of the three questions below, so this bad field is flagged and left alone rather than corrected.
- **Missing `quantity`.** Order 1038 (2025-07-20) has a null quantity. Not required for revenue share, AOV, or QoQ growth, so left as-is (not imputed).
- **Negative revenue.** Order 1082 (2025-08-08, East, Office Supplies) has `revenue = -$316.98`; magnitude matches a plausible order at that unit_price/qty/discount, so it reads as a return/refund recorded as negative net revenue rather than a data error. Decision: **keep** it (net-revenue definition). Sensitivity check below confirms it does not change the Q2 ranking.

All figures below use the 834-row cleaned set unless noted.

## Q1. Revenue share by product category

| Category | Revenue | Share |
|---|---:|---:|
| Electronics | $467,810.86 | 49.86% |
| Furniture | $329,629.69 | 35.13% |
| Apparel | $93,638.56 | 9.98% |
| Office Supplies | $47,178.94 | 5.03% |
| **Total** | **$938,258.05** | **100.00%** |

Electronics is the largest category at just under half of total revenue, driven by high unit prices rather than order count (Electronics has 210 of 834 orders, 25% of order volume, but ~50% of revenue). Furniture is the second-largest by revenue despite similar order counts to Apparel/Office Supplies, for the same reason (higher average selling price).

## Q2. Region with the highest average order value

Average order value (AOV) = mean `revenue` per order, by region:

| Region | AOV (mean) | Median order value | Orders (n) |
|---|---:|---:|---:|
| North | $1,185.81 | $714.80 | 262 |
| East | $1,164.33 | $559.64 | 230 |
| South | $1,160.43 | $650.54 | 162 |
| West | $954.39 | $451.10 | 180 |

**North has the highest AOV, at $1,185.81**, ahead of the second-highest region, **East ($1,164.33)**, by **$21.48**, a margin of **1.84%**. That is a thin margin — North, East, and South are within about $25 of each other; West is the clear outlier, roughly 20% below the other three. Median values (all well below the means, and much closer together across regions) confirm revenue is right-skewed, so the ranking by mean should be read as narrow rather than decisive.

Sensitivity check: excluding the one negative-revenue order (East, -$316.98) raises East's AOV to $1,170.80 and narrows North's lead to $15.01 (1.28%) — North still wins, but the margin is fragile enough that it's worth flagging rather than treating as a robust gap.

## Q3. Quarter-over-quarter revenue growth

Quarterly totals (calendar quarters):

| Quarter | Revenue | Orders (n) | Complete? |
|---|---:|---:|---|
| 2025 Q3 (Jul–Sep) | $192,567.45 | 216 | Yes (data starts exactly 2025-07-01) |
| 2025 Q4 (Oct–Dec) | $297,374.20 | 240 | Yes |
| 2026 Q1 (Jan–Mar) | $246,733.94 | 212 | Yes |
| 2026 Q2 (Apr–Jun) | $201,582.46 | 166 | **No — data ends 2026-05-31, June is missing.** Excluded from growth calculations. |

QoQ growth across the three complete quarters:

- **Q3 2025 → Q4 2025: +54.43%** (+$104,806.75, from $192,567.45 to $297,374.20)
- **Q4 2025 → Q1 2026: -17.03%** (-$50,640.26, from $297,374.20 to $246,733.94)

2026 Q2 is a partial quarter (2 of 3 months) and is deliberately excluded from the growth figures above; including its partial total against a full prior quarter would understate growth and is not a like-for-like comparison.

## Assumptions / reproducibility

- Metric: `revenue` column taken as net (post-discount) revenue, USD, as provided — no currency or tax adjustment.
- Grain: one row = one order (`order_id`); the single exact duplicate `order_id` was removed before all sums/means.
- Date basis: order `date` column, calendar quarters (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun).
- The one negative-revenue row and the one `unit_price` outlier were kept, not deleted (see decisions above); their effect on each answer is small and noted where relevant.
- Snapshot: `eval/fixtures/sales.csv` as read in this session; re-running the same cleaning steps (dedupe on `order_id`, normalize region casing) on the same file reproduces all numbers above.

LOADED: eval3/skills-flat/data-analysis/composable/INDEX.md, eval3/skills-flat/data-analysis/composable/mini/01-data-quality-profiling.md, eval3/skills-flat/data-analysis/composable/mini/02-aggregation-pitfalls.md, eval3/skills-flat/data-analysis/composable/mini/03-time-series.md, eval3/skills-flat/data-analysis/composable/mini/04-segmentation.md, eval3/skills-flat/data-analysis/composable/mini/09-reproducibility-assumptions.md
