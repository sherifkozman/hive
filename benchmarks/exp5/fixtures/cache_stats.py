"""Site-wide event statistics, read on every request."""
import datetime

_events = []  # append-only list of (timestamp, event_type, value)


def record_event(event_type, value=1.0):
    _events.append((datetime.datetime.utcnow(), event_type, value))


def get_stats():
    """Called by every request handler to render the stats header."""
    by_type = {}
    for ts, etype, value in _events:
        if etype not in by_type:
            by_type[etype] = {"count": 0, "total": 0.0, "first": ts, "last": ts}
        rec = by_type[etype]
        rec["count"] += 1
        rec["total"] += value
        if ts < rec["first"]:
            rec["first"] = ts
        if ts > rec["last"]:
            rec["last"] = ts
    result = {}
    for etype, rec in by_type.items():
        result[etype] = {
            "count": rec["count"],
            "avg": rec["total"] / rec["count"],
            "first_seen": rec["first"].isoformat(),
            "last_seen": rec["last"].isoformat(),
        }
    return result


def top_events(n=10):
    stats = get_stats()
    return sorted(stats.items(), key=lambda kv: kv[1]["count"], reverse=True)[:n]
