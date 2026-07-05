---
pairs-with:
  - 01-data-quality-profiling.md
---

# Reproducibility & Stating Assumptions

An analysis nobody can reproduce or trust is worthless, however clever the method.

- **State every assumption**: date range, filters applied, how nulls/outliers/duplicates were handled, currency, timezone, and the definition of each metric ("active" = ?). Assumptions left unstated silently make numbers non-comparable across reports and people.
- **Define metrics precisely.** "Revenue": gross or net of refunds? Booked or recognized? Including tax or not? Two analysts with different definitions produce different totals and both look correct. Pin the definition down and write it near the number.
- **Make it re-runnable.** Deterministic steps, a fixed seed for any sampling, and the data source plus snapshot date recorded. Someone else running your steps on the same data must get the same numbers. If a rerun tomorrow gives a different answer, say why (live data) and pin a snapshot.
- **Show denominators and sample sizes** so a reader can judge reliability. "12% conversion" means little without knowing it's 12 of 100 vs. 12,000 of 100,000.
- **Sanity-check before publishing.** Do totals reconcile to a known source (e.g., does your revenue sum match finance's)? Do the parts sum to the whole? Does the number pass a smell test against prior periods? Reconciliation catches the duplicated-join and wrong-filter errors that pass silently otherwise.

**Worked example.** A report states "Q3 revenue: $2.0M." Reproducible version: "Q3 revenue (net of refunds, recognized, USD): $2.03M. Source: `transactions` snapshot 2026-10-02, deduplicated on order_id (1,200 dupes removed), refunds excluded (−$140k), 12% of rows had null region and are grouped as 'Unknown'. Reconciles to finance's GL within 0.5%." A reader can now trust it, reproduce it, and compare it to next quarter on the same basis.

**Why it matters.** The difference between trustworthy reporting and a plausible-looking guess is not cleverness: it's that the trustworthy one states its assumptions, defines its metrics, reconciles to a known truth, and can be re-run to the same result. When two reports disagree, the one that documented its basis wins the argument.

The discipline: before publishing, write down the date range, filters, null/outlier/duplicate handling, and metric definitions, then reconcile the headline number against an independent source.
