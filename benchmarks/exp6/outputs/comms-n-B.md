:rotating_light: *Payments API — Incident Update*

Checkout errors are resolving. Error rates peaked at *18%* around 09:12 PT and are now down to *4% and falling*, with full recovery expected in about *30 minutes*.

*What happened*
This morning's deploy (build 2214) exhausted a connection pool, causing elevated errors on the Payments API. We rolled back the deploy at *10:05 PT*, which resolved the root cause.

*Customer impact*
Between 09:12–10:05 PT, roughly *6% of checkout attempts failed*; most customers who retried succeeded. Support currently has 47 related tickets open.

*For Support & Sales — what to tell customers*
- Checkout issues from this morning are resolved; retrying now should work.
- We've verified there were *no double charges* — no refunds are needed.
- If a customer reports a failed checkout during 09:12–10:05 PT that still hasn't gone through, please escalate to Support.

*What's next*
- Next update: *11:00 PT*, or sooner if anything material changes.
- Incident commander: Dana K.
- Postmortem: owned by the platform team, due Friday.

LOADED: SKILL.md, examples/general-comms.md
