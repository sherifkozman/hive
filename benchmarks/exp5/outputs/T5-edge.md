# Six-Month Revenue Forecast: June–November 2026

**Prepared for:** CFO
**Source data:** `eval/fixtures/sales.csv` — 835 order-line rows, one row = one order, 2025-07-01 through 2026-05-31 (11 full months of history). No partial months in the history, so no run-rate adjustment was needed on the historical side.

## 1. Data cleaning decisions (stated up front, per reproducibility discipline)

Profiling the file before computing anything surfaced five issues. Decisions made and why:

| Issue | Finding | Decision |
|---|---|---|
| Duplicate row | Order `1201` (2025-09-24, South/Electronics, $4,450.78) appears twice, byte-for-byte identical | **Dropped one copy.** Keeping both would double-count $4,450.78 into September revenue. 834 unique rows remain. |
| Missing `quantity` | Order `1038` has a blank quantity but a valid `revenue` value | **Kept, no impact.** The forecast uses booked `revenue` directly, not a recomputed qty×price figure, so this gap doesn't touch the numbers below. |
| Negative revenue | Order `1082` (2025-08-08) shows revenue of **-$316.98** | **Kept as-is.** Single row, 0.4% of that month's revenue — consistent with a return/credit memo, not an error. Investigated rather than deleted or silently included. |
| `unit_price` outlier | Order `1251` has `unit_price = 99999.0`, but its `revenue` ($313.53) is normal for the category/quantity | **Flagged, not used.** This confirms the forecast should run off the `revenue` column rather than recomputing revenue from price × quantity × (1-discount), since `unit_price` is corrupted for at least this row. |
| Categorical inconsistency | Region has `north` (lowercase, 1 row) alongside `North` (261 rows) | **Normalized** to `North` for any regional cut; does not affect the total-revenue forecast below since no region split was required. |

**Metric definition:** "Revenue" = the booked `revenue` field as recorded per order line, gross of the above single credit memo, net of discount (the field already reflects post-discount, post-return amounts). All months below are complete calendar months.

## 2. Historical monthly revenue (post-cleaning)

| Month | Revenue | Orders | Avg Order Value (AOV) | Hi-ticket mix (Electronics+Furniture) |
|---|---:|---:|---:|---:|
| 2025-07 | $46,579 | 61 | $764 | 83.8% |
| 2025-08 | $69,433 | 81 | $857 | 81.5% |
| 2025-09 | $76,556 | 74 | $1,035 | 84.4% |
| 2025-10 | $77,457 | 83 | $933 | 82.2% |
| 2025-11 | $124,320 | 79 | $1,574 | 86.0% |
| 2025-12 | $95,598 | 78 | $1,226 | 80.7% |
| 2026-01 | $78,020 | 78 | $1,000 | 83.8% |
| 2026-02 | $66,783 | 65 | $1,027 | 81.6% |
| 2026-03 | $101,931 | 69 | $1,477 | 89.9% |
| 2026-04 | $100,753 | 84 | $1,199 | 88.1% |
| 2026-05 | $100,830 | 82 | $1,230 | 88.5% |

## 3. Method: driver-based forecast, not naive trend extrapolation

Two candidate trends give very different answers, so the method matters:

- A straight-line fit across all 11 months implies **~5.9%/month** compounding growth (first-3-month avg $64,189 → last-3-month avg $101,171). Extrapolating that forward would nearly double revenue again by November — implausible, since it's dominated by an early ramp-up phase (Jul–Oct 2025 orders were still scaling).
- The **most recent three months (Mar–May 2026) are essentially flat**: $101,930 → $100,753 → $100,830, i.e. −1.2% then +0.1%. This is the more reliable signal of the *current* run rate and was used as the anchor instead of the whole-history slope.

Decomposing revenue into **Orders × AOV** (the standard volume-vs-rate driver split) shows *why* revenue grew even though the business isn't selling more orders:

- **Order count is flat**, oscillating 61–84/month with no trend (mean 76, slope ≈ +0.6 orders/month — noise, not growth).
- **Average discount rate is flat**, 9–14% every month, so discounting isn't driving AOV.
- **AOV has risen** from ~$760–860 (Jul–Aug 2025) to ~$1,200–1,480 (Mar–May 2026).
- The reason: **category mix has shifted toward Electronics and Furniture** (higher unit prices), from ~82% of revenue in mid-2025 to ~88–90% in the most recent three months. This mix-shift, not more orders or less discounting, is the real growth driver.

**Forecast model:** Revenue = Orders (flat, ~78/month, trailing-3-month average) × AOV (anchored at the trailing-3-month average of ~$1,300, drifted forward under scenario-specific mix/pricing assumptions), with a separate seasonal adjustment applied only to November.

**November seasonality — flagged as low-confidence.** Nov 2025 revenue ($124,320) ran 44% above the Oct/Dec 2025 average ($86,528), driven by AOV (not more orders — order count that month, 79, was near the 11-month average). This is consistent with a holiday/Black-Friday-style seasonal pattern, but **there is only one November in the data (n=1)** — it cannot be distinguished from a one-off large-deal month with 11 months of history. The base case applies a partial (half-strength) version of that seasonal factor; the upside case applies the full historical repeat; the downside case assumes no repeat at all.

## 4. Forecast: base / upside / downside, June–November 2026

### Driver assumptions by scenario

| Driver | Downside | Base | Upside |
|---|---|---|---|
| Monthly orders | 70 (current range low end; softer demand) | 78 (trailing-3-month average, flat) | 85 (current range high end; stronger rep productivity/demand) |
| Starting AOV (June) | $1,150 (mix reverts partway to mid-2025's ~82% hi-ticket share) | $1,300 (holds at the current ~88–90% hi-ticket mix) | $1,300 (holds current mix, then accelerates) |
| AOV monthly drift | −0.5%/month (mix erosion) | +1.0%/month (in line with the recent ~1.1%/month trend, Dec–May) | +2.5%/month (continued mix-shift + modest price increases) |
| November seasonal factor | 1.00× (no repeat of 2025's spike) | 1.15× (partial — half of the observed +44%, reflecting n=1 confidence) | 1.44× (full repeat of the 2025 Nov spike) |

### Monthly revenue ($)

| Month | Downside | Base | Upside |
|---|---:|---:|---:|
| Jun-2026 | 80,500 | 101,400 | 110,500 |
| Jul-2026 | 80,100 | 102,400 | 113,300 |
| Aug-2026 | 79,700 | 103,400 | 116,100 |
| Sep-2026 | 79,300 | 104,500 | 119,000 |
| Oct-2026 | 78,900 | 105,500 | 122,000 |
| Nov-2026 | 78,500 | 122,600 | 180,000 |
| **6-month total** | **$477,000** | **$639,800** | **$760,900** |

Base case sits close to a flat continuation of the current ~$101k/month plateau, drifting up modestly through October on the mix-shift assumption, then stepping up in November on a *partial* seasonal factor. Downside assumes the mix-shift partially unwinds and no seasonal bump. Upside assumes the mix-shift continues, order volume improves, and last year's November spike repeats in full — the widest source of divergence between scenarios is the November seasonal assumption ($78.5k downside vs. $180.0k upside for that single month), which is exactly the piece of the forecast built on the least evidence (one historical observation).

## 5. Tracking forecast accuracy as actuals arrive

As each month closes, compare actual revenue to the base-case forecast and compute **MAPE** = average of |Actual − Forecast| / Actual across the months reported so far (benchmark: <5% excellent, 5–10% good, 10–20% acceptable, >20% needs rework). Track the **signed** error too (Actual − Forecast, not just absolute), since a forecast that is consistently high or consistently low indicates a biased driver assumption rather than random noise — if June and July both land above the base case, that's evidence the +1.0%/month AOV drift is too conservative and should be revised upward for the remaining months, not treated as one-off good luck. Re-derive the two underlying drivers (order count and AOV) from actuals each month rather than only checking the top-line number, since the top line can hit its target while masking an offsetting order-count miss and AOV beat (or vice versa) — and specifically re-examine the mix-shift assumption (hi-ticket share of revenue), since that is the variable actually driving AOV growth in this model. Treat November as the highest-value accuracy checkpoint: because the seasonal factor is based on a single prior observation, November's actual-vs-forecast result should be used immediately to either confirm or retire the "partial seasonal repeat" assumption before the next forecast cycle, rather than waiting for a full year-end review.

---

LOADED: skills/data-analysis/composable/INDEX-E.md, skills/financial-analysis/composable/INDEX-E.md, skills/financial-analysis/composable/mini/00-core.md, skills/financial-analysis/composable/mini/08-driver-based-forecasting-scenarios.md, skills/financial-analysis/composable/mini/09-rolling-forecasts-accuracy.md, skills/data-analysis/composable/mini/03-time-series.md, skills/data-analysis/composable/mini/01-data-quality-profiling.md, skills/data-analysis/composable/mini/09-reproducibility-assumptions.md, skills/data-analysis/composable/mini/07-executive-writing.md, skills/data-analysis/composable/mini/02-aggregation-pitfalls.md, skills/financial-analysis/composable/mini/10-reporting-exec-summary.md
