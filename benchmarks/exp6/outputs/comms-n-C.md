:warning: **Incident Update: Payments API — Recovering**

**What happened:** Starting at 09:12 PT, the Payments API saw degraded performance (error rate peaked at 18%). Root cause was connection pool exhaustion following this morning's deploy (build 2214).

**Status now:** Error rate is down to 4% and continuing to fall. A rollback was completed at 10:05 PT, and we expect full recovery in ~30 minutes.

**Customer impact:** About 6% of checkout attempts failed between 09:12–10:05 PT. Most customers who retried were able to complete their purchase successfully.

**If customers ask (Support/Sales):**
- Yes, some checkouts failed between 09:12–10:05 PT; retrying usually worked.
- No refunds needed — we've verified there are no double charges.
- We're actively monitoring and recovery is underway.
- Support currently has 47 related tickets open and is working through them.

**Next steps:**
- Next update by 11:00 PT, or sooner if anything material changes.
- Postmortem owned by the platform team, due Friday.

Incident commander: Dana K. Thanks for your patience while we get this fully resolved. :pray:

LOADED: skills/internal-comms/composable/INDEX.md, skills/internal-comms/composable/mini/00-core.md, skills/internal-comms/composable/mini/04-general-comms.md
