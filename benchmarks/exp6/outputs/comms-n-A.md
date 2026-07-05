:warning: **Payments API — Incident Update**

**What happened:** Starting at 09:12 PT, the Payments API had elevated errors (peaked at 18%) due to connection pool exhaustion following this morning's deploy (build 2214).

**Current status:** Fixed. We rolled back the deploy at 10:05 PT. Error rate has dropped to ~4% and is continuing to fall. Full recovery expected in ~30 minutes.

**Customer impact:** About 6% of checkout attempts failed between 09:12–10:05 PT. Most customers who retried were able to complete their purchase successfully.

**For Support/Sales — what to tell customers:** If asked, confirm the issue is resolved and checkout is working normally. No refunds are needed — we've verified there were no double charges. If a customer says a payment still isn't going through, have them retry or escalate to Support.

**Tickets:** Support currently has 47 tickets open related to this incident; expect that number to come down as the fix fully propagates.

**Next update:** 11:00 PT, or sooner if anything changes.

**Owners:** Dana K. is incident commander. Platform team owns the postmortem, due Friday.

Thanks for your patience — no action needed from other teams at this time.

LOADED: none
