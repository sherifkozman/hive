# Six-Month Revenue Forecast — June–November 2026

Prepared for: CFO
Source data: `eval/fixtures/sales.csv` (835 rows, 2025-07-01 through 2026-05-31, order grain: one row = one order)

## 0. Data validation (done before computing anything)

Profiling the file before trusting any total surfaced five issues; decisions on each are recorded so the numbers below are reproducible:

| Issue | Finding | Decision |
|---|---|---|
| Duplicate order | `order_id 1201` (2025-09-24, South) appears twice, byte-for-byte identical | Dropped the second copy (dedupe key: `order_id`). Removes a $4,450.78 double-count. |
| Null quantity | `order_id 1038` has `quantity = NaN` but a valid `revenue` of $252.21 | Kept the row — revenue (the metric being forecast) is present and unaffected; quantity left null and flagged, not imputed. |
| Negative revenue | `order_id 1082` shows `revenue = -$316.98` | Kept as-is and treated as a return/credit already netted into revenue — consistent with "revenue" being the net, recognized figure. Immaterial to the total (<0.04% of period revenue). |
| Extreme unit price | `order_id 1251` has `unit_price = $99,999` (vs. a $31–$700 range elsewhere) but a normal `revenue` of $313.53 | Flagged as a probable data-entry error in `unit_price`; not corrected because `unit_price` is not an input to this forecast (built directly on `revenue`). |
| Categorical inconsistency | Region has both `North` (261 rows) and `north` (1 row, $100.94) | Case is cosmetic and immaterial here (regional cut isn't the forecast basis); noted, not remapped. |

**Metric definition:** "Revenue" = the `revenue` column as recorded (net of the row-level discount, includes the one negative/return row). No currency, tax, or timezone conversions were needed — single currency, date-only granularity. All months in the file run full calendar-month to calendar-month (last row is 2026-05-31), so no partial-month adjustment is required for the historical base.

## 1. Historical pattern (post-cleaning, 834 orders)

| Month | Revenue | Orders | Avg Order Value | MoM growth |
|---|---:|---:|---:|---:|
| 2025-07 | $46,579 | 61 | $764 | — |
| 2025-08 | $69,433 | 81 | $857 | +49.1% |
| 2025-09 | $76,556 | 74 | $1,035 | +10.3% |
| 2025-10 | $77,457 | 83 | $933 | +1.2% |
| 2025-11 | $124,320 | 79 | $1,574 | +60.5% |
| 2025-12 | $95,598 | 78 | $1,226 | -23.1% |
| 2026-01 | $78,020 | 78 | $1,000 | -18.4% |
| 2026-02 | $66,783 | 65 | $1,027 | -14.4% |
| 2026-03 | $101,931 | 69 | $1,477 | +52.6% |
| 2026-04 | $100,753 | 84 | $1,199 | -1.2% |
| 2026-05 | $100,830 | 82 | $1,230 | +0.1% |

Two things stand out and drive the method below:
- **Order count is stable (~65–84/month, no trend); revenue swings are driven almost entirely by average order value (AOV)**, i.e., deal-size/mix, not by transaction volume. Revenue = Orders × AOV is therefore the right driver split, but only one driver (AOV) is actually moving.
- **The last three months (Mar–May 2026) have converged to a flat, low-noise plateau** — $101,931 / $100,753 / $100,830, a 3-month average of **$101,171** with <1.2% spread between months. This is a much more reliable "current run-rate" anchor than the noisier Jul–Feb ramp-and-dip period, and than any single latest month.
- **November 2025 was a sharp, one-time-observed spike** (+60% MoM, AOV jumped to $1,574 from ~$930–$1,035 the two months prior) with no volume increase — consistent with holiday/seasonal deal-size effects, but it is a **single occurrence** (only 11 months of history, so this seasonal pattern cannot be confirmed against a second year). It is treated as a real but uncertain seasonal signal, not a proven annual pattern.
- Category mix (Electronics ~40–60%, Furniture ~24–43%, Apparel 6–15%, Office Supplies 2.5–8%) and average discount rate (9–14%, no trend) are both noisy month-to-month with no secular drift — they are treated as stable and are not separately projected.

## 2. Method

**Driver-based trend + seasonal-overlay forecast**, anchored on the smoothed recent run-rate rather than raw history extrapolation:

1. **Base level** = 3-month moving average of Mar–May 2026 revenue = **$101,171/month**. Using a 3-month MA rather than the single latest month or a full 11-month regression avoids over-weighting the Jul–Nov 2025 ramp (not repeating) or the Dec–Feb dip (already reversed), and avoids one month's noise driving the whole forecast.
2. **Growth drift** applied monthly to that base, one assumption per scenario (below), representing changes in AOV/deal-mix and discounting since order volume shows no trend to extrapolate.
3. **November seasonal overlay**: a one-time multiplier applied only to the November 2026 base-and-drift value, sized off the one observed prior-year Nov spike, with the size of the multiplier itself the main base/upside/downside lever for that month (since it's the least-certain part of the forecast).
4. No YoY seasonal index was built for June–October because June 2025 isn't in the data and the other four months (Jul–Oct 2025) show no consistent seasonal shape beyond noise — so those months are forecast on trend/drift alone.

## 3. Forecast — base / upside / downside

| Month | Downside | Base | Upside |
|---|---:|---:|---:|
| Jun 2026 | $99,653 | $102,183 | $104,206 |
| Jul 2026 | $98,159 | $103,205 | $107,332 |
| Aug 2026 | $96,686 | $104,237 | $110,552 |
| Sep 2026 | $95,236 | $105,279 | $113,869 |
| Oct 2026 | $93,807 | $106,332 | $117,285 |
| Nov 2026 | $97,020 | $128,874 | $175,165 |
| **6-mo total** | **$580,561** | **$650,110** | **$728,409** |

### Driver assumptions behind each band

- **Base case** — monthly drift **+1.0%**, applied compounding from the $101,171 anchor; November multiplier **+20%** (partial recurrence of last year's spike). Assumes: order volume holds at the ~75–80/month range seen since July; AOV/mix continues its recent mild upward drift (discount rate stays in the 10–14% band, no meaningful pricing or mix shift); a moderate share of last year's holiday-season deal-size effect repeats, but not the full magnitude, given it's a single data point.
- **Upside case** — monthly drift **+3.0%**; November multiplier **+45%**. Assumes: the Jul–Nov 2025 growth ramp partially reasserts itself — larger average deals in Electronics/Furniture, effective discount rate trends toward the low end of its historical range (~9–10%), and the November effect repeats close to its full historical strength (implying a genuine, recurring holiday pattern rather than a one-off).
- **Downside case** — monthly drift **-1.5%**; November multiplier **+5%** (i.e., holiday effect largely fails to repeat). Assumes: order volume drifts slightly below the recent range, average discount depth rises toward the ~14–15% high end observed in Apr–May (margin/price pressure), deal mix shifts toward smaller Apparel/Office Supplies orders, and last November's spike is treated as a one-off (e.g., a small number of large deals that don't recur) rather than a seasonal pattern.

**Range interpretation:** the bands widen sharply in November (from ~$97k to ~$175k) precisely because that month's forecast hinges on an assumption — recurrence of a seasonal spike — that only one year of data can't confirm or rule out; June–October bands are comparatively narrow because they rest only on the drift assumption applied to an already-stable 3-month base.

## 4. Tracking forecast accuracy as actuals arrive

As each month closes, compare that month's actual revenue against the base-case figure above and compute the absolute percentage error (and roll a MAPE across the elapsed months of the window); a monthly error under ~5% is on-track, 5–10% is acceptable but worth a driver review, and anything over ~10-20% should trigger an immediate re-forecast rather than waiting for the next cycle. Track the *signed* error too, not just the absolute one — a persistent one-directional miss (e.g., every month landing above base) is a bias in the growth-drift assumption, not noise, and should prompt recentering the base level and drift rate on the newest 3-month actuals rather than carrying the same assumption forward. Because June–October each rest on a single drift assumption, an early miss in June or July should immediately flow through to reset the August–October base rather than being treated as a one-off. November is the highest-risk month for a miss: as soon as October actuals are in, revisit whether AOV is trending toward the base, upside, or downside case and narrow the November band accordingly instead of waiting until November itself to find out which scenario played out. Finally, reconcile whichever scenario ends up closest to actuals back to its stated driver assumptions (order volume, AOV/discount level, and whether the seasonal repeat occurred) so the post-mortem produces a specific correction to next quarter's assumptions rather than a generic "we were off."

---

LOADED: eval3/skills-flat/data-analysis/composable/INDEX.md, eval3/skills-flat/data-analysis/composable/mini/01-data-quality-profiling.md, eval3/skills-flat/data-analysis/composable/mini/03-time-series.md, eval3/skills-flat/data-analysis/composable/mini/09-reproducibility-assumptions.md, eval3/skills-flat/financial-analysis/composable/INDEX.md, eval3/skills-flat/financial-analysis/composable/mini/00-core.md, eval3/skills-flat/financial-analysis/composable/mini/08-driver-based-forecasting-scenarios.md, eval3/skills-flat/financial-analysis/composable/mini/09-rolling-forecasts-accuracy.md
