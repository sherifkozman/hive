---
pairs-with:
  - 06-insight-generation.md
---

# Recommendations & Framing

A recommendation is where analysis becomes value, and where analysts most often overreach or under-deliver.

- **Recommendations must follow from the data shown**, not appear from nowhere. Each should trace to a specific finding in the report. If a reader can't point to the number behind a recommendation, it's an opinion, not analysis.
- **Be specific and actionable.** "Cap SMB discounts at 15%, projected to recover ~$120k in annual margin," not "improve discounting." A good recommendation names the action, the target, and the expected impact.
- **Acknowledge uncertainty and tradeoffs.** State your confidence and what could change the conclusion. Overclaiming from correlation destroys credibility faster than admitting a limit. "This assumes discount elasticity is low, which we haven't tested" is a strength, not a weakness.
- **Prioritize by impact and effort.** Rank recommendations; don't hand over a flat list of ten. Lead with high-impact, low-effort moves.
- **Separate what the data says from what you infer.** "Discounted orders are 2x larger (observed)" is a fact; "so discounts likely drive larger orders (hypothesis, needs a controlled test)" is an inference. Label each. Conflating them is how correlation gets sold as causation.

**Worked example.** Finding: SMB discount penetration is 80% at 20% average depth, and SMB margin is ~30%, so discounting roughly halves SMB unit profit. Recommendation: "Pilot a 15% discount cap on SMB for one quarter in two regions; projected to recover ~$120k annualized margin if volume holds. Risk: if SMB volume is discount-elastic, we may lose orders; the pilot's control regions will measure this. Confidence: medium; we have the margin math but not the elasticity." Notice it traces to the finding, quantifies impact, names the risk, states confidence, and proposes a test rather than a blanket rollout.

**Counter-example to avoid:** "Discounts are hurting us, so stop discounting." No target, no quantified impact, ignores that discounts may drive volume, and overclaims causation. It would likely be wrong and would erode trust in the whole report.

The discipline: for every recommendation, be able to say which finding it rests on, what it's worth, how confident you are, and what would prove it wrong.
