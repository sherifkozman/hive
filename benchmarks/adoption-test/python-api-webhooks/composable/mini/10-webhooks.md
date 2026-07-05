---
requires:
  - code-review/02-security-review.md
pairs-with:
  - 04-validation-and-errors.md
  - 05-dependencies-and-auth.md
---

# Webhooks: Receiving, Verifying, and Sending

Webhooks are HTTP calls made by someone else's system into yours (inbound) or
by your system into someone else's (outbound). Both directions are
"at-least-once, unordered, untrusted" by default — design for retries,
duplicates, and out-of-order arrival, not a single clean POST.

## Inbound: verify before you parse

Never trust an inbound webhook's payload until its signature is verified.
Verify against the **raw request bytes**, not a re-serialized/re-parsed JSON
object — re-encoding can change whitespace or key order and break an HMAC
computed over the original bytes. This means the signature check must happen
before (or independent of) Pydantic model parsing:

```python
from fastapi import Request, HTTPException, APIRouter
import hmac, hashlib

router = APIRouter()

def verify_signature(raw_body: bytes, signature_header: str, secret: str) -> None:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # constant-time compare — never `==` on secrets/signatures
    if not hmac.compare_digest(expected, signature_header):
        raise HTTPException(401, "invalid signature")

@router.post("/webhooks/provider")
async def receive_webhook(request: Request):
    raw = await request.body()
    verify_signature(raw, request.headers.get("X-Signature", ""), settings.webhook_secret)
    event = WebhookEvent.model_validate_json(raw)  # parse only after verification
    ...
```

**Replay protection.** A valid old signature is still a valid signature —
signing doesn't prevent replay by itself. If the provider signs a timestamp
alongside the payload (common pattern: `signature = HMAC(secret, f"{timestamp}.{body}")`),
reject requests whose timestamp is more than a few minutes old *before*
checking the signature's validity in detail, closing the window for a
captured request to be replayed later.

**Secret rotation.** Support verifying against two secrets (current + previous)
during a rotation window so in-flight webhooks signed with the old secret
aren't rejected mid-rollover; drop the old secret only after the provider's
retry window has fully elapsed.

## Idempotency: the same event will arrive more than once

Providers redeliver on any ambiguous outcome (timeout, 5xx, connection
reset) — assume every event can and will arrive 2+ times. Idempotency must
be enforced by an ID the *sender* assigns (an event ID field in the payload),
never by a timestamp or by "this looks like a duplicate" heuristics. Record
processed event IDs and short-circuit repeats before running side effects:

```python
@router.post("/webhooks/provider")
async def receive_webhook(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()
    verify_signature(raw, request.headers.get("X-Signature", ""), settings.webhook_secret)
    event = WebhookEvent.model_validate_json(raw)

    existing = db.get(ProcessedWebhookEvent, event.id)
    if existing is not None:
        return {"status": "already processed"}  # 2xx — do NOT reprocess or error

    db.add(ProcessedWebhookEvent(id=event.id, received_at=datetime.utcnow()))
    db.commit()  # commit the dedupe record in the same transaction as the effect,
                 # or use a unique constraint on event.id and catch the conflict —
                 # otherwise a race between two redeliveries can double-process
    handle_event(event, db)
    return {"status": "ok"}
```

The dedupe-record-insert and the side effect must be atomic (same
transaction, or a unique constraint that makes the second insert fail fast)
— checking "does it exist" then acting in two separate steps has a race
window under concurrent redelivery.

## Respond fast; do the work async

Providers apply a response timeout (often just a few seconds) and treat a
timeout as failure → redelivery. Never do slow work (calling other APIs,
heavy processing) inline before responding. Acknowledge receipt once
verified and durably queued, then process out-of-band:

```python
    ...
    db.commit()
    background_tasks.add_task(handle_event, event.id)  # or push to a real queue
    return {"status": "accepted"}
```

`BackgroundTasks` runs after the response but still inside the same process —
fine for light work, but it's lost if the process crashes before running. For
anything that must survive a restart or needs its own retry/backoff, hand off
to a durable queue (Celery, SQS, etc.) instead of `BackgroundTasks`, and keep
the HTTP handler limited to verify → dedupe-record → enqueue → respond.

## Status codes: only 2xx means "don't retry"

Return 2xx **only** once the event is durably recorded (already processed, or
successfully enqueued) — a 2xx followed by silently dropping the event on a
crash means the provider will never retry it. Return 4xx for permanently
invalid payloads (bad signature, malformed body) so the provider stops
retrying something that will never succeed. Avoid returning 5xx for
recoverable-but-you're-not-ready conditions if you'd rather retry yourself
than rely on the provider's retry schedule — but do return 5xx (not 2xx) for
genuine transient failures (DB unreachable) so the provider's retry becomes
your retry mechanism.

## Outbound webhooks: you're now the unreliable network

Sending webhooks flips the roles: apply the same discipline to yourself.
Sign outbound payloads (HMAC over the raw body you send, with a timestamp)
so receivers can verify authenticity. Assign each outbound event a stable
unique ID up front and include it in the payload, so a receiver-side retry
or your own retry after an ambiguous response is recognizably the same
event. Retry on timeout/5xx/connection failure with exponential backoff and
a capped number of attempts, then move to a dead-letter queue and alert
rather than retrying forever. Never retry synchronously in the request path
that triggered the event — enqueue and let a worker handle backoff, or an
unrelated slow downstream receiver will back up your own application.
