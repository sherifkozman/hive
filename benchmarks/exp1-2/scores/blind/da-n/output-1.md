# Sales Data Analysis — Answers

**Data cleaning applied (affects arithmetic below):** Deduplicated one exact duplicate row (order_id 1201 appeared twice identically; 835 → 834 rows). Normalized one mis-cased region label ("north" → "North", 1 row). One row has a null `quantity` and one has a negative `revenue` (-$316.98, likely a return) — both kept as-is since they don't distort the revenue/discount fields used here. All revenue figures use the `revenue` column as reported (not recomputed from quantity × unit_price, since the two do not reconcile on ~99% of rows in this file — an unexplained data-source discrepancy worth flagging but not resolved here).

## 1. Highest-revenue region

**North**, with **$310,682.55** in revenue out of **$938,258.05** total company revenue = **33.1%** of company revenue (next closest is East at 28.5%).
North is the clear leader but not dominant — it holds about a third of revenue, so no single region is a single point of failure/concentration risk.

## 2. Month-over-month revenue growth, last 3 complete months (March, April, May 2026)

- March 2026: $101,930.65 vs February's $66,783.32 → **+52.6%**
- April 2026: $100,752.83 vs March's $101,930.65 → **-1.2%**
- May 2026: $100,829.63 vs April's $100,752.83 → **+0.1%**

After a sharp rebound in March, revenue has essentially flattened (±1%) over April and May, suggesting the business has plateaued around the ~$100K/month level rather than continuing to grow.

## 3. Category with highest average discount vs. average order value

**Furniture** has the highest average discount at **17.0%** (vs. Apparel 10.2%, Office Supplies 10.8%, Electronics 9.5%).
Furniture's average order value is **$1,681.78**, which is **above** the company average order value of **$1,125.01** — so the most heavily discounted category is also the one with the largest orders.
