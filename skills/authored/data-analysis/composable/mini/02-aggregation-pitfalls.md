---
requires:
  - 01-data-quality-profiling.md
pairs-with:
  - 04-segmentation.md
---

# Aggregation Correctness Pitfalls

Most analytical errors are not math errors: they are aggregation errors on messy data.

- **Duplicates inflate sums and counts.** Before `SUM(revenue)`, confirm the grain and deduplicate on the true key. A joined table that fans out (one order joined to many line items) multiplies the order's revenue by its line count. Check: does `SUM` at this grain match `SUM` at the source grain?
- **Averages hide distributions and are wrecked by outliers.** The mean is the wrong summary for skewed data: revenue, session length, and deal size are almost always right-skewed. Report the **median** alongside the mean; if mean ≫ median, say so and lead with median. "Average order value $850" can be one whale plus a hundred $40 orders.
- **Beware averaging averages.** The average of per-customer average order values is *not* the overall average order value. Aggregate from the base rows, or use a properly weighted average.
- **Missing values distort denominators.** `AVG` skips nulls; `COUNT(*)` includes them; `COUNT(col)` does not. Decide whether a null means zero (impute 0) or unknown (exclude); they give different results. "Signups / visits" is wrong if some visits are null.
- **Simpson's paradox.** A trend in the aggregate can reverse within every segment. If overall conversion rose but fell in each channel, a mix shift is responsible: always sanity-check aggregate movements against segment movements.
- **Count distinct vs. count.** "1,000 orders" and "1,000 customers" differ when customers repeat. Use `COUNT(DISTINCT customer_id)` for customers.

**Worked example.** A table joins `orders` to `payments`; some orders have 2 payment rows. `SUM(order_total)` now double-counts those orders. Fix: aggregate `order_total` at the order grain first, then join to payments. Note that `SUM(DISTINCT order_total)` is *not* a fix: two genuinely equal order totals would be wrongly collapsed. Deduplicate rows on the real key, don't dedupe values.

The habit that prevents most of these: before every aggregate, state the grain out loud, confirm the key is unique at that grain, and check whether the metric is skewed enough that the mean will mislead.
