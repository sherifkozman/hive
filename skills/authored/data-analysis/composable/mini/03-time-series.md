---
pairs-with:
  - 02-aggregation-pitfalls.md
---

# Time-Series Analysis

- **Growth rates.** Period-over-period growth = (current − prior) / prior. Always state the base and pair a percentage with absolute numbers. A "200% increase" from 1 to 3 is trivially small in absolute terms.
- **Partial periods are the number-one time-series trap.** If the current month is only 40% elapsed, its total is not comparable to full prior months and will look like a crash. Either exclude the partial period, run-rate it with a clear caveat, or compare like-for-like (month-to-date vs. same-day-of-month prior). Always label partial periods.
- **Seasonality.** Compare year-over-year, not just month-over-month, when the business is seasonal. December vs. November tells you little if December always spikes; December vs. last December does.
- **Choose the right growth summary.** For multi-period growth use CAGR, defined as (end/start)^(1/periods) − 1, not the average of per-period growth rates, which overstates. Averaging +50% then −50% gives 0%, but the true result is −25%.
- **Smoothing.** Use trailing moving averages (e.g., 7-day) to reveal trend through noise, but note that smoothing lags turning points.
- **Watch the denominator over time.** A rising total can come from more customers, not more per customer: decompose growth into volume × rate whenever possible.

**Worked example.** Revenue "dropped 60% this month." The month is 12 days in. Run-rate: $400k in 12 days → ~$1.0M projected vs. $950k last month (actually up). Report the run-rate *with* the caveat that it's a projection; never present the raw partial total as if it were final. Reporting the −60% would trigger a false alarm.

**Second example.** A dashboard shows month-over-month revenue down every December-to-January. That is seasonality, not decline: the correct comparison is January vs. prior January. Presenting the MoM drop as a trend would be misleading.

The discipline: for any time comparison, verify the two periods are truly comparable (same length, same completeness, same season) before computing or reporting a change.
