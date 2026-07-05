# Task-tracker MCP server (tool layer)

```python
"""
server.py - Minimal MCP server exposing a task-tracker API.

Tools: create_task, list_tasks, complete_task.
Storage: process-local in-memory dict (no persistence, no auth, no transport
config - this file only defines the tool layer plus the minimum scaffolding
needed to run it).
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal, Optional

from mcp.server.fastmcp import FastMCP
from pydantic import Field

mcp = FastMCP("task-tracker")

# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------

Priority = Literal["low", "medium", "high", "urgent"]
Status = Literal["pending", "in_progress", "completed"]

_TASKS: dict[str, dict] = {}
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_due_date(due_date: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Returns (normalized_date_or_None, error_message_or_None)."""
    if due_date is None:
        return None, None
    if not _DATE_RE.match(due_date):
        return None, (
            f"due_date must be an ISO-8601 date string 'YYYY-MM-DD', got {due_date!r}. "
            "Resolve relative phrases like 'tomorrow' or 'next Friday' to a calendar "
            "date before calling this tool."
        )
    try:
        date.fromisoformat(due_date)
    except ValueError:
        return None, f"due_date {due_date!r} is not a real calendar date."
    return due_date, None


def _task_summary(task: dict) -> dict:
    """Compact, token-conscious view of a task used in every response.

    Omits created_at always (rarely useful to an agent) and includes
    due_date / assignee / completed_at only when set, so empty tasks stay
    tiny and payloads don't grow with unused fields.
    """
    summary = {
        "task_id": task["task_id"],
        "title": task["title"],
        "priority": task["priority"],
        "status": task["status"],
    }
    if task.get("due_date"):
        summary["due_date"] = task["due_date"]
    if task.get("assignee"):
        summary["assignee"] = task["assignee"]
    if task.get("completed_at"):
        summary["completed_at"] = task["completed_at"]
    return summary


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def create_task(
    title: Annotated[
        str,
        Field(
            description=(
                "Short, human-readable summary of the task, e.g. 'Write Q3 "
                "report'. 1-200 characters, will be trimmed of surrounding "
                "whitespace."
            ),
            min_length=1,
            max_length=200,
        ),
    ],
    priority: Annotated[
        Priority,
        Field(
            description=(
                "Urgency bucket, required. One of: 'low', 'medium', 'high', "
                "'urgent'. Use 'urgent' only for work that blocks other people "
                "or has an imminent deadline; default to 'medium' if the user "
                "gives no signal, rather than guessing 'high'."
            )
        ),
    ],
    due_date: Annotated[
        Optional[str],
        Field(
            description=(
                "Optional deadline as an ISO-8601 calendar date, 'YYYY-MM-DD' "
                "(e.g. '2026-08-01'). Omit entirely if the task has no "
                "deadline - do not invent one. Convert relative dates "
                "('tomorrow', 'in 2 weeks') to an absolute date yourself "
                "before calling."
            ),
        ),
    ] = None,
) -> dict:
    """Create a new task in the tracker and return it.

    Use this when the user wants to add / create / log / track a new to-do
    item. This is the only way to add work to the tracker - there is no
    update tool, so if the user describes something that should change an
    existing task, prefer looking it up with list_tasks and telling the user
    only creation and completion are supported rather than silently making a
    duplicate.

    On invalid input this returns ok=False with a structured, actionable
    error instead of raising - fix the flagged field and call again.
    """
    clean_title = title.strip()
    if not clean_title:
        return {
            "ok": False,
            "error": {
                "code": "invalid_title",
                "message": "title must not be empty or whitespace-only.",
                "retryable": True,
            },
        }
    if len(clean_title) > 200:
        return {
            "ok": False,
            "error": {
                "code": "title_too_long",
                "message": (
                    f"title is {len(clean_title)} characters; the limit is "
                    "200. Shorten it and call create_task again."
                ),
                "retryable": True,
            },
        }

    normalized_due, err = _validate_due_date(due_date)
    if err:
        return {
            "ok": False,
            "error": {"code": "invalid_due_date", "message": err, "retryable": True},
        }

    task_id = uuid.uuid4().hex[:8]
    task = {
        "task_id": task_id,
        "title": clean_title,
        "priority": priority,
        "status": "pending",
        "due_date": normalized_due,
        "assignee": None,
        "created_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "completed_at": None,
    }
    _TASKS[task_id] = task

    return {"ok": True, "data": _task_summary(task)}


@mcp.tool()
def list_tasks(
    status: Annotated[
        Optional[Status],
        Field(
            description=(
                "Filter to tasks in exactly this status: 'pending', "
                "'in_progress', or 'completed'. Omit to include all statuses. "
                "Use status='pending' (not a text search) to answer "
                "'what's left to do'."
            )
        ),
    ] = None,
    assignee: Annotated[
        Optional[str],
        Field(
            description=(
                "Filter to tasks assigned to this exact person/handle, "
                "case-insensitive. Omit to include tasks for every assignee, "
                "including unassigned ones."
            )
        ),
    ] = None,
    limit: Annotated[
        int,
        Field(
            description=(
                "Maximum number of tasks to return, newest-created first. "
                "Keep this small (the default) for a quick check; raise it "
                "only if you specifically need a longer listing."
            ),
            ge=1,
            le=100,
        ),
    ] = 20,
) -> dict:
    """List tasks, optionally filtered by status and/or assignee.

    Use this to answer questions like "what's pending" or "what does Alex
    have", and to look up a task's task_id before calling complete_task
    (task_id is not guessable from the title). Results are capped at
    `limit`; check the returned `truncated` flag rather than assuming the
    list is exhaustive.
    """
    matches = list(_TASKS.values())
    if status is not None:
        matches = [t for t in matches if t["status"] == status]
    if assignee is not None:
        needle = assignee.strip().lower()
        matches = [t for t in matches if (t.get("assignee") or "").lower() == needle]

    matches.sort(key=lambda t: t["created_at"], reverse=True)
    total_matching = len(matches)
    page = matches[:limit]

    return {
        "ok": True,
        "data": {
            "tasks": [_task_summary(t) for t in page],
            "returned": len(page),
            "total_matching": total_matching,
            "truncated": total_matching > len(page),
        },
    }


@mcp.tool()
def complete_task(
    task_id: Annotated[
        str,
        Field(
            description=(
                "The task_id string returned by create_task or list_tasks "
                "(e.g. 'a1b2c3d4'). This is an opaque id, not the task's "
                "title - if you only have a title, call list_tasks first to "
                "resolve it to a task_id."
            )
        ),
    ],
) -> dict:
    """Mark a task as completed.

    If task_id doesn't exist, this returns a structured error telling you to
    look it up via list_tasks rather than guessing again with a similar id.
    Calling this on a task that is already completed is treated as a no-op
    success (ok=True with a note), not an error, since the desired end state
    already holds and an agent retrying after a transient failure shouldn't
    be punished for it.
    """
    task = _TASKS.get(task_id)
    if task is None:
        return {
            "ok": False,
            "error": {
                "code": "task_not_found",
                "message": (
                    f"No task with task_id {task_id!r}. Call list_tasks to "
                    "find the correct id - retrying complete_task with the "
                    "same id will not succeed."
                ),
                "retryable": False,
            },
        }

    if task["status"] == "completed":
        return {
            "ok": True,
            "data": _task_summary(task),
            "note": "Task was already completed; no change made.",
        }

    task["status"] = "completed"
    task["completed_at"] = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    return {"ok": True, "data": _task_summary(task)}


if __name__ == "__main__":
    mcp.run()
```

## Rationale

**Input schemas.** `priority` and `status` are `Literal` types, not free-form
strings, so the JSON Schema exports a closed `enum` — the agent cannot pass
`"High"`, `"P1"`, or invent a value, and the client-side validator rejects
typos before a round-trip is even needed. `title` carries `min_length=1` /
`max_length=200` and is additionally `.strip()`-ed server-side, so
whitespace-only titles are caught even though JSON Schema's `minLength`
counts raw characters. `limit` is bounded `ge=1, le=100` with a sane default
(20) so an agent can't accidentally request an unbounded dump or a
zero/negative page. `due_date` stays an optional plain string rather than a
native date type because MCP arguments are JSON — encoding it as ISO-8601 and
validating with both a regex (catches malformed shapes) and
`date.fromisoformat` (catches "shape is fine, calendar isn't", e.g.
`2026-13-40`) gives the agent one unambiguous format and two independent
reasons to fail loudly rather than silently accepting garbage. `task_id` has
no format constraint because it's an opaque server-generated token — the
important discipline is entirely in the description (see below), not in a
regex the agent could satisfy by chance.

**Tool descriptions for reliable selection.** Each docstring leads with the
single most common phrasing an agent will map to it ("add/create/log a new
to-do", "what's pending", "what does X have") so intent-matching is a lookup,
not an inference. Descriptions also proactively rule out plausible
misuse: `create_task` states there is no update tool, so an agent asked to
"change" a task doesn't quietly duplicate it; `complete_task`'s parameter
description says `task_id` is "not guessable from the title," heading off
the common failure mode where a model tries to pass a title where an id is
expected. `due_date` and `priority` descriptions push interpretation work
(resolving "tomorrow", picking a default urgency) onto the agent *before* the
call, since that reasoning is cheap for an LLM and expensive to recover from
inside a rejected tool call.

**Error handling.** Every tool returns an envelope (`ok`, then `data` or
`error`) instead of raising, because thrown exceptions in MCP typically
surface as a single opaque error string and can be presented as content the
agent must re-parse or, worse, treated as a fatal turn. A structured
`{code, message, retryable}` lets the agent branch programmatically: `code`
for exact-match handling, `message` written as the corrective instruction
itself (not a description of the failure) so no extra reasoning step is
needed, and `retryable` distinguishing "fix this argument and call again"
(`invalid_title`, `title_too_long`, `invalid_due_date`) from "the same
arguments will never work, take a different action" (`task_not_found`, where
the fix is calling `list_tasks`, not retrying `complete_task`). Completing an
already-completed task is deliberately *not* an error — it's the desired end
state, so treating it as a success with an explanatory `note` avoids
punishing an agent that retries after an ambiguous prior result (e.g. a
timed-out first call that actually succeeded).

**Response payloads.** All three tools funnel non-list responses through
`_task_summary`, which always includes the four fields needed to identify and
act on a task (`task_id`, `title`, `priority`, `status`) and omits
`due_date`/`assignee`/`completed_at` when unset rather than sending
`null`-heavy objects — keeps per-task tokens low and avoids the agent having
to distinguish "empty" from "not applicable." `created_at` is dropped
entirely since no tool needs it to make a decision. `list_tasks` adds
`returned` / `total_matching` / `truncated` instead of just an array, so
capping at `limit` never silently looks like "here are all the tasks" — an
agent can tell from the envelope alone whether it needs to raise `limit` or
add a filter to see more.

**Scope.** No `assignee`-setting tool exists per the spec's fixed three-tool
surface, so `list_tasks(assignee=...)` is implemented and documented
faithfully but will currently only ever match tasks assigned through some
means outside this file — a known, explicit limitation of the requested
surface rather than a silently-hidden gap. No auth, transport selection, or
tools beyond the three requested were added; `mcp.run()` uses FastMCP's
default stdio transport, which is the minimum needed to make the file
runnable.
