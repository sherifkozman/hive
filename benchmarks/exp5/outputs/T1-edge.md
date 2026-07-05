# T1 — Data Analysis: Sales Aggregation

Source: `eval/fixtures/sales.csv`. Grain: one row = one order (`order_id`).

## Data quality profiling and cleaning decisions

Raw file: 835 rows, 834 distinct `order_id` values.

1. **Exact duplicate row.** `order_id` 1201 (2025-09-24, South, Electronics, rep_10,
   qty 8, unit_price 564.82, discount 0.1, revenue 4450.78) appears twice with
   identical values in every column — a duplicated row, not a genuine repeat
   order. **Decision: drop the second copy.** Working row count = 834.
2. **Region casing.** One row (`order_id` 1121) has `region = "north"` (lowercase)
   vs. the standard `"North"`. **Decision: normalize casing** (`.title()`) so it
   is not counted as a separate region. Clean region set: East, North, South, West.
3. **One negative revenue row.** `order_id` 1082 (East, Office Supplies) has
   revenue = −316.98 — inconsistent with `unit_price × quantity × (1−discount)`
   (~304.14), which indicates it represents a return/credit rather than a
   formula error. **Decision: keep it and treat the `revenue` column as net
   revenue** (it is the field the task's three questions are computed from);
   it is not a duplicate or an obvious data-entry artifact, so it is not
   dropped or imputed.
4. **One null `quantity`** (`order_id` 1038, revenue present = 252.21).
   **Decision: keep the row** — none of the three questions require quantity.
5. **One extreme `unit_price` outlier** (`order_id` 1251: unit_price = 99999,
   but revenue = 313.53, consistent with the other columns if unit_price were
   ~44.8 instead — almost certainly a fat-finger entry). **Decision: keep the
   row and flag the `unit_price` value as unreliable; it does not affect the
   three questions below**, all of which use `revenue` directly, not
   `unit_price`.
6. **Date coverage / quarters.** Data runs 2025-07-01 through 2026-05-31.
   Complete quarters (full start-to-end date range present): 2025 Q3 (Jul 1–Sep 30),
   2025 Q4 (Oct 1–Dec 31), 2026 Q1 (Jan 1–Mar 31). **2026 Q2 covers only
   Apr 1–May 31 (missing June) and is excluded as a partial period.**

All figures below use the 834-row cleaned dataset (deduped, region-normalized).

## 1. Revenue share by product category

| Category        | Revenue ($) | Share of total |
|------------------|------------:|---------------:|
| Electronics      |  467,810.86 |         49.86% |
| Furniture        |  329,629.69 |         35.13% |
| Apparel          |   93,638.56 |          9.98% |
| Office Supplies  |   47,178.94 |          5.03% |
| **Total**        | **938,258.05** |    **100.00%** |

Electronics is the largest category at just under half of total revenue;
Electronics + Furniture together account for ~85%.

## 2. Region with the highest average order value

| Region | Mean revenue/order | Median revenue/order | Orders (n) |
|--------|--------------------:|----------------------:|-----------:|
| North  |            1,185.81 |                 714.80 |        262 |
| East   |            1,164.33 |                 559.64 |        230 |
| South  |            1,160.43 |                 650.54 |        162 |
| West   |              954.39 |                 451.10 |        180 |

**North has the highest average order value ($1,185.81)**, ahead of the
second-highest region, East ($1,164.33), by **$21.48 (≈1.8%)** — a narrow
margin given sample sizes of 262 and 230 orders respectively. Note the mean
is well above the median in every region (right-skewed order values, driven
by a mix of high-ticket Electronics/Furniture orders and small Apparel/Office
Supplies orders); the ranking and the margin are reported on the mean because
the question asks for average order value, but the gap is small enough that
it should not be read as a large regional difference.

## 3. Quarter-over-quarter revenue growth (complete quarters only)

| Quarter | Revenue ($) | QoQ growth |
|---------|------------:|-----------:|
| 2025 Q3 |  192,567.45 |          — (first complete quarter) |
| 2025 Q4 |  297,374.20 |     **+54.43%** |
| 2026 Q1 |  246,733.94 |     **−17.03%** |

2026 Q2 ($201,582.46 over Apr–May only) is excluded as an incomplete quarter
and is not comparable to the full-quarter totals above.

- Q3 2025 → Q4 2025: revenue rose from $192,567.45 to $297,374.20, **+$104,806.75 (+54.43%)**.
- Q4 2025 → Q1 2026: revenue fell from $297,374.20 to $246,733.94, **−$50,640.26 (−17.03%)**.

LOADED: skills/data-analysis/composable/INDEX-E.md, skills/data-analysis/composable/mini/01-data-quality-profiling.md, skills/data-analysis/composable/mini/02-aggregation-pitfalls.md, skills/data-analysis/composable/mini/03-time-series.md, skills/data-analysis/composable/mini/04-segmentation.md, skills/data-analysis/composable/mini/09-reproducibility-assumptions.md
