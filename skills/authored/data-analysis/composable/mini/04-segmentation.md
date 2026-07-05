---
pairs-with:
  - 06-insight-generation.md
---

# Segmentation

Segmentation turns a flat number into an insight by asking "for whom / where / which?"

- Segment by the dimensions that drive decisions: customer type, region, product, channel, cohort, plan tier.
- **Always show segment size alongside segment metric.** A segment with 300% growth on 4 customers is noise; the same growth on 4,000 customers is a strategy. Report both the rate and the base count/volume.
- **Beware small segments.** Percentages on small n are volatile: set a minimum sample threshold and flag or suppress segments below it.
- Look for **concentration**: often a small fraction of customers or products drives most revenue (Pareto). Compute the share of the top decile; concentration risk is itself a finding.
- **Cohorts** (grouping by join/acquisition period) separate "are new users better?" from "is the whole base aging?", which is critical for retention and LTV questions.
- **Contribution to change.** When a total moves, decompose *which segments* caused it. "Revenue up $200k" is far more useful as "Enterprise +$260k, SMB −$60k."

**Worked example.** Overall revenue is flat month-over-month, seemingly a non-event. Segmenting reveals Enterprise +$260k and SMB −$260k. The flat aggregate hid a major mix shift and an SMB problem worth acting on. The segmentation *is* the insight; the aggregate concealed it.

**Second example.** A "region with 300% growth" turns out to have 3 customers, up from 1. Flag it as too small to act on rather than headline it. Meanwhile a mature region growing 8% on 5,000 customers is the real story. Size context flips which finding matters.

**Concentration example.** If the top 10% of customers drive 70% of revenue, that concentration is a finding in itself: it signals both an upsell base and a churn risk if a few accounts leave. Report the concentration ratio explicitly.

The discipline: never report a segment percentage without its denominator, and always test whether a flat or moving aggregate is masking offsetting segment movements.
