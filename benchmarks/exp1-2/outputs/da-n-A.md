# Data Analysis: sales.csv — Narrow Answers

Dataset: 835 orders, dated 2025-07-01 through 2026-05-31. Total company revenue: $942,708.83.
(Note: one region value appears as lowercase "north" for a single row; it was normalized into "North" for these totals — it does not change any conclusion.)

## 1. Region with highest total revenue

**North** has the highest total revenue: **$310,682.55**, which is **32.96%** of total company revenue ($942,708.83).

Other regions for reference: East $267,796.15 (28.41%), South $192,440.60 (20.41%), West $171,789.53 (18.22%).

Interpretation: North is the company's largest revenue region, generating roughly a third of all revenue — meaningfully more than any other single region.

## 2. Month-over-month revenue growth, last 3 complete months

The last 3 complete months in the data are 2026-03, 2026-04, and 2026-05 (2026-05 is the final complete month; there is no partial/current month in the dataset).

- **2026-03**: $101,930.65 vs. Feb ($66,783.32) → **+52.63%** MoM
- **2026-04**: $100,752.83 vs. Mar ($101,930.65) → **-1.16%** MoM
- **2026-05**: $100,829.63 vs. Apr ($100,752.83) → **+0.08%** MoM

Interpretation: After a large jump into March, revenue has essentially plateaued (within ~1%) over April and May, indicating the recent strong growth has stalled rather than continued.

## 3. Category with highest average discount vs. average order value

**Furniture** has the highest average discount at **17.04%** (vs. Electronics 9.52%, Office Supplies 10.81%, Apparel 10.23%).

Furniture's average order value is **$1,681.78**, which is **above** the company-wide average order value of **$1,128.99**.

Interpretation: Despite carrying the deepest discounts, Furniture orders are still worth more on average than the typical order, suggesting the discounting is applied to a high-ticket category rather than being a sign of weak per-order value.

LOADED: none
