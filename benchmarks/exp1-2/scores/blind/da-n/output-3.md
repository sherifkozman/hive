# Data Analysis — Narrow Task Answers

**Data notes (affecting the arithmetic below):** `eval/fixtures/sales.csv` contains one exact duplicate row (order_id 1201, South, 2025-09-24) that was dropped before aggregating, and one region label inconsistency (`north` lowercase for a single $100.94 order) that was normalized to `North` before grouping. All figures below use the deduplicated, case-normalized dataset (835 → 834 unique orders, total revenue $938,258.05).

## 1. Region with highest total revenue

**North** has the highest total revenue: **$310,682.55**, which is **33.1%** of total company revenue ($938,258.05).

Runner-up context: East is second at $267,796.15 (28.5%), then South at $187,989.82 (20.0%) and West at $171,789.53 (18.3%). North leads, but not overwhelmingly — it's about 4.6 points of share ahead of East, so no single region dominates the business.

## 2. Month-over-month revenue growth, last 3 complete months

Every month in the dataset (2025-07 through 2026-05) is a full calendar month, so the last 3 complete months are **March, April, and May 2026**. Growth is measured against the prior month:

| Month | Revenue | MoM change ($) | MoM growth (%) |
|---|---|---|---|
| Feb 2026 (base) | $66,783.32 | — | — |
| Mar 2026 | $101,930.65 | +$35,147.33 | **+52.6%** |
| Apr 2026 | $100,752.83 | −$1,177.82 | **−1.2%** |
| May 2026 | $100,829.63 | +$76.80 | **+0.1%** |

Interpretation: revenue jumped sharply into March (+52.6%, off a comparatively weak February) and then plateaued — April and May are essentially flat versus each other (within ~1%), so the March pop looks like a step-change to a new, stable revenue level rather than a continuing growth trend.

## 3. Product category with highest average discount, and its AOV vs. company average

**Furniture** has the highest average discount at **17.0%** (also the highest discount penetration — 81.6% of Furniture orders carry some discount, vs. 68–75% for the other categories).

Furniture's average order value is **$1,681.78**, which is **above** the company-wide average order value of **$1,125.01** (by about $557, or ~49% higher). So the category being discounted most heavily is also the category with the largest average order size — consistent with either discounting being used to close large-ticket Furniture deals, or Furniture's naturally higher unit prices driving both bigger orders and (potentially negotiated) bigger discounts; the data alone doesn't distinguish which direction causes which.

---
