# Task: internal-comms / NARROW

From these raw facts, write the incident status update to be posted in the
company-wide #announcements Slack channel (this is an internal communication
to employees, not a public statement):

- Payments API degraded since 09:12 PT, error rate peaked 18%, now 4% and falling
- Root cause: connection pool exhaustion after this morning's deploy (build 2214)
- Fix: rollback completed 10:05 PT; full recovery ETA ~30 min
- Customer impact: ~6% of checkout attempts failed 09:12-10:05; retries mostly succeeded
- Support has 47 open tickets; refunds are NOT needed (no double charges, verified)
- Next update: 11:00 PT or on material change
- Incident commander: Dana K.; postmortem owner: platform team, due Friday

Audience: all employees, including non-technical. Requirements: right length
and tone for the channel, scannable, no blame, precise about customer impact
and what support/sales should tell customers, clear on what happens next.
Output only the Slack message.
