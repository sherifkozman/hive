# Task-Tracker MCP Server — Tool Layer

## `server.py`

```python
#!/usr/bin/env python3
"""
MCP Server for a Task Tracker.

Exposes three tools over an in-memory task store:
  - create_task:   create a new task
  - list_tasks:    list/filter existing tasks
  - complete_task: mark a task as completed

All tools return a structured dict with an "ok" boolean so an agent can
check success/failure without relying on exceptions or string-parsing.
Business-logic failures (unknown task_id, semantically invalid date, etc.)
are returned as data ("ok": false + "error"/"message"/"suggestion"), not
raised, so a single malformed argument doesn't abort a multi-step plan and
the agent gets concrete guidance on how to retry. Only genuinely malformed
input shapes (wrong type, out-of-range limit, unknown enum value) are
rejected at the schema level via Pydantic, which is also agent-actionable
because FastMCP surfaces the failing field and constraint directly.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from itertools import count
from typing import Annotated, Optional

from pydantic import Field
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("task_tracker_mcp")

# --------------------------------------------------------------------------
# Domain model
# --------------------------------------------------------------------------


class TaskPriority(str, Enum):
    """Priority of a task, low to urgent."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskStatus(str, Enum):
    """Lifecycle status of a task."""

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


# In-memory store. Keys are human-readable task IDs ("task_1", "task_2", ...)
# rather than opaque UUIDs so agents can read, compare, and quote them
# without extra decoding effort.
_TASKS: dict[str, dict] = {}
_id_counter = count(1)


def _next_task_id() -> str:
    return f"task_{next(_id_counter)}"


def _parse_due_date(raw: str) -> tuple[Optional[date], Optional[str]]:
    """Validate that `raw` (already regex-shaped as YYYY-MM-DD by the field
    constraint) is a real calendar date. Returns (date, None) on success or
    (None, error_message) on failure. This is a *semantic* check the schema
    can't express (e.g. "2026-02-30" matches the shape but isn't a date),
    so it is handled in the tool body and reported back as data, not raised.
    """
    try:
        return date.fromisoformat(raw), None
    except ValueError:
        return None, (
            f"'{raw}' is not a real calendar date. "
            "Use an actual date in YYYY-MM-DD format, e.g. '2026-08-01'."
        )


def _serialize_task(task: dict) -> dict:
    """Compact, agent-facing view of a task. Omits internal bookkeeping
    fields (e.g. nothing beyond what's needed to identify, prioritize, and
    act on the task) to keep list_tasks responses token-efficient."""
    return {
        "task_id": task["task_id"],
        "title": task["title"],
        "priority": task["priority"].value,
        "status": task["status"].value,
        "due_date": task["due_date"],  # string or None
        "assignee": task["assignee"],  # string or None
        "created_at": task["created_at"],
    }


# --------------------------------------------------------------------------
# Tools
# --------------------------------------------------------------------------


@mcp.tool(
    name="create_task",
    annotations={
        "title": "Create Task",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
)
async def create_task(
    title: Annotated[
        str,
        Field(
            description=(
                "Short, human-readable summary of the task, e.g. "
                "'Write Q3 board deck' or 'Fix login timeout bug'. "
                "Required; leading/trailing whitespace is trimmed."
            ),
            min_length=1,
            max_length=200,
        ),
    ],
    priority: Annotated[
        TaskPriority,
        Field(
            description=(
                "Task priority. Must be one of 'low', 'medium', 'high', "
                "'urgent'. Required — pick 'urgent' only for tasks that "
                "block other work or have an imminent deadline."
            )
        ),
    ],
    due_date: Annotated[
        Optional[str],
        Field(
            default=None,
            description=(
                "Optional due date in YYYY-MM-DD format, e.g. '2026-08-01'. "
                "Omit if the task has no deadline. Past dates are accepted "
                "(useful for backfilling overdue work) but must still be a "
                "real calendar date."
            ),
            pattern=r"^\d{4}-\d{2}-\d{2}$",
        ),
    ] = None,
    assignee: Annotated[
        Optional[str],
        Field(
            default=None,
            description=(
                "Optional name or handle of the person responsible for "
                "this task, e.g. 'alice' or 'Alice Chen'. Omit to leave the "
                "task unassigned. Set this if you want the task to be "
                "findable later via list_tasks(assignee=...)."
            ),
            max_length=100,
        ),
    ] = None,
) -> dict:
    """Create a new task in the tracker and return it.

    Use this when the user asks to add, log, file, or create a new task,
    ticket, or to-do item. Do NOT use this to update an existing task —
    there is no update tool; if a task already exists, use complete_task
    to close it or create a new task and note the relationship in its title.

    Returns:
        On success: {"ok": true, "task": {task_id, title, priority, status,
        due_date, assignee, created_at}}. "status" is always "open" for a
        newly created task.

        On failure (only when due_date is present but not a real calendar
        date): {"ok": false, "error": "invalid_due_date", "message": str,
        "suggestion": str}. Malformed types/enums (e.g. priority not one of
        the allowed values, title empty, due_date not shaped like
        YYYY-MM-DD) are rejected before this tool body runs, via the input
        schema, with a Pydantic-generated message naming the bad field.

    Examples:
        - "Add a high priority task to renew the SSL cert by Aug 1" ->
          create_task(title="Renew SSL certificate", priority="high",
          due_date="2026-08-01")
        - "Log a to-do for Alice to review the design doc" ->
          create_task(title="Review design doc", priority="medium",
          assignee="alice")
    """
    clean_title = title.strip()
    if not clean_title:
        return {
            "ok": False,
            "error": "invalid_title",
            "message": "Title cannot be empty or only whitespace.",
            "suggestion": "Provide a short, non-empty summary of the task.",
        }

    if due_date is not None:
        parsed, err = _parse_due_date(due_date)
        if err:
            return {
                "ok": False,
                "error": "invalid_due_date",
                "message": err,
                "suggestion": "Retry with a valid calendar date, e.g. '2026-08-01'.",
            }

    task_id = _next_task_id()
    task = {
        "task_id": task_id,
        "title": clean_title,
        "priority": priority,
        "status": TaskStatus.OPEN,
        "due_date": due_date,
        "assignee": assignee.strip() if assignee else None,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    _TASKS[task_id] = task

    return {"ok": True, "task": _serialize_task(task)}


@mcp.tool(
    name="list_tasks",
    annotations={
        "title": "List Tasks",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def list_tasks(
    status: Annotated[
        Optional[TaskStatus],
        Field(
            default=None,
            description=(
                "Filter to tasks with this status: 'open', 'in_progress', "
                "or 'completed'. Omit to include tasks of every status."
            ),
        ),
    ] = None,
    assignee: Annotated[
        Optional[str],
        Field(
            default=None,
            description=(
                "Filter to tasks assigned to this person (case-insensitive "
                "exact match on the name/handle passed to create_task). "
                "Omit to include tasks regardless of assignee. Note: tasks "
                "created without an assignee are never matched by this "
                "filter — use no filter to see unassigned tasks too."
            ),
        ),
    ] = None,
    limit: Annotated[
        int,
        Field(
            default=20,
            description=(
                "Maximum number of tasks to return, most-urgent/soonest-"
                "due first. Increase if you suspect relevant tasks are "
                "being cut off (check 'truncated' in the response)."
            ),
            ge=1,
            le=200,
        ),
    ] = 20,
) -> dict:
    """List tasks, optionally filtered by status and/or assignee.

    Use this to answer questions like "what's open?", "what does Alice
    have?", or "what's still in progress?". Read-only — never modifies
    tasks. Results are sorted by priority (urgent first) and then by due
    date (soonest first, undated tasks last) so the most actionable items
    appear even when 'limit' truncates the list.

    Returns:
        {"ok": true, "count": int, "total_matching": int, "limit": int,
        "truncated": bool, "tasks": [{task_id, title, priority, status,
        due_date, assignee, created_at}, ...]}

        "count" is the number of tasks in this response; "total_matching"
        is how many tasks matched the filters before "limit" was applied;
        "truncated" is true when total_matching > count. An empty
        "tasks" list with count=0 is a normal result, not an error — it
        means no tasks matched the given filters.

    Examples:
        - "What's still open?" -> list_tasks(status="open")
        - "Show Alice's tasks" -> list_tasks(assignee="alice")
        - "Any urgent open items?" -> list_tasks(status="open"), then
          inspect the "priority" field of each returned task (there is no
          separate priority filter).
    """
    matches = list(_TASKS.values())

    if status is not None:
        matches = [t for t in matches if t["status"] == status]
    if assignee is not None:
        needle = assignee.strip().lower()
        matches = [
            t for t in matches if (t["assignee"] or "").lower() == needle
        ]

    priority_rank = {
        TaskPriority.URGENT: 0,
        TaskPriority.HIGH: 1,
        TaskPriority.MEDIUM: 2,
        TaskPriority.LOW: 3,
    }

    def sort_key(t: dict):
        due = t["due_date"] or "9999-99-99"  # undated tasks sort last
        return (priority_rank[t["priority"]], due)

    matches.sort(key=sort_key)

    total_matching = len(matches)
    page = matches[:limit]

    return {
        "ok": True,
        "count": len(page),
        "total_matching": total_matching,
        "limit": limit,
        "truncated": total_matching > len(page),
        "tasks": [_serialize_task(t) for t in page],
    }


@mcp.tool(
    name="complete_task",
    annotations={
        "title": "Complete Task",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def complete_task(
    task_id: Annotated[
        str,
        Field(
            description=(
                "The task_id to mark complete, exactly as returned by "
                "create_task or list_tasks, e.g. 'task_3'."
            ),
            min_length=1,
        ),
    ],
) -> dict:
    """Mark a task as completed.

    Use this once the work described by a task is done. Safe to call more
    than once on the same task_id: completing an already-completed task
    is a no-op that returns the task's current state with
    "already_completed": true rather than an error, so an agent that
    isn't sure whether a previous call succeeded can safely retry.

    Returns:
        On success: {"ok": true, "task": {task_id, title, priority,
        status, due_date, assignee, created_at}, "already_completed": bool}
        ("status" will be "completed".)

        On failure (task_id does not exist): {"ok": false, "error":
        "not_found", "message": str, "suggestion": str}. This is returned
        as data, not raised, so a bad ID doesn't abort a batch of
        completions — call list_tasks to find the correct task_id and
        retry.

    Examples:
        - "Mark task_3 as done" -> complete_task(task_id="task_3")
    """
    task = _TASKS.get(task_id)
    if task is None:
        return {
            "ok": False,
            "error": "not_found",
            "message": f"No task with id '{task_id}' exists.",
            "suggestion": (
                "Call list_tasks to see valid task_id values and their "
                "current status, then retry with a correct task_id."
            ),
        }

    already_completed = task["status"] == TaskStatus.COMPLETED
    if not already_completed:
        task["status"] = TaskStatus.COMPLETED

    return {
        "ok": True,
        "task": _serialize_task(task),
        "already_completed": already_completed,
    }


if __name__ == "__main__":
    mcp.run()
```

## Rationale

**Schemas.** Each tool takes flat, named parameters (matching the requested
call shape) rather than a single wrapper object, with every constraint
pushed into the Pydantic `Field` where possible: `title` has `min_length`/
`max_length`, `priority` and `status` are closed `Enum`s (so an agent gets
the exact allowed values in the schema instead of guessing strings),
`due_date` is shape-constrained with a regex (`YYYY-MM-DD`) at the schema
level and then checked for calendar validity in code, and `limit` has
`ge=1, le=200` with a default of 20 so a forgetful agent still gets a
bounded, useful page. `priority` is required (no default) and `due_date`/
`assignee` are optional with `None` defaults, matching "priority" being
mandatory and "due_date?" optional in the spec.

One deliberate deviation: the spec lists `create_task(title, priority,
due_date?)` with no `assignee`, yet `list_tasks(..., assignee?, ...)`
filters by assignee. Without a way to set an assignee, that filter could
never match anything. I added an optional `assignee` field to
`create_task` and documented in `list_tasks`'s description that tasks
created without one are simply never matched — this keeps both tools
internally consistent without inventing a fourth tool (which the task
prohibits).

**Descriptions for tool selection.** Each docstring states what the tool
is *for* in task-oriented language ("Use this when..."), what it explicitly
is *not* for (e.g. `create_task` clarifies there's no update tool),
and gives 1-2 concrete example invocations mapping a natural-language
request to the exact call. `list_tasks`'s description calls out that there
is no priority filter, heading off an agent trying to pass one. Parameter
`description`s give example values (`'task_3'`, `'2026-08-01'`) rather than
abstract type names, since concrete examples reduce malformed calls more
than type names alone.

**Errors, designed for agent consumption.** Every tool returns a dict with
an `"ok"` boolean so an agent can branch on success/failure without
string-sniffing. Two tiers of error handling are used deliberately:
(1) malformed *shape* (wrong type, unknown enum value, out-of-range limit,
badly-shaped due_date string) is rejected by the Pydantic schema before the
tool body runs — FastMCP's resulting message names the offending field and
constraint, which is itself actionable; (2) *business-logic* failures that
the schema can't express — a due_date that matches `YYYY-MM-DD` but isn't
a real date (e.g. `2026-02-30`), an unknown `task_id`, an empty-after-strip
title — are caught in code and returned as structured data (`"ok": false,
"error": <code>, "message": <human explanation>, "suggestion": <concrete
next step>`) rather than raised, so one bad argument in a multi-call plan
doesn't blow up the agent's turn. `complete_task` goes further and treats
"already completed" as success (`"already_completed": true`) rather than
an error, since re-completing a task is a natural retry pattern (e.g. the
agent is unsure whether an earlier call went through) and shouldn't be
penalized.

**Response payloads.** Task objects are serialized through one shared
`_serialize_task` helper (avoiding drift between the three tools) that
returns only the fields an agent is likely to act on — `task_id`, `title`,
`priority`, `status`, `due_date`, `assignee`, `created_at` — with no
internal bookkeeping. `list_tasks` adds `count`, `total_matching`, and
`truncated` alongside the page of `tasks`, so an agent can tell the
difference between "there are only 3 open tasks" and "there are 200 open
tasks but I only sent you 20" without an extra round trip, and knows to
raise `limit` if `truncated` is true. Results are pre-sorted by priority
then due date so the most actionable items survive truncation. IDs are
short and human-readable (`task_1`, `task_2`, ...) instead of UUIDs so an
agent can read, quote, and reason about them directly.

**Annotations.** `list_tasks` is `readOnlyHint: true` and `idempotentHint:
true` (repeated identical calls return the same data, modulo store
changes from other calls). `create_task` is not idempotent (each call
mints a new task) and not destructive (it only adds data). `complete_task`
is not read-only (it mutates state) but is marked `idempotentHint: true`
because, by design, calling it twice with the same `task_id` converges on
the same end state and is explicitly safe to retry; it's not destructive
since no data is deleted. All three are `openWorldHint: false` since the
store is purely in-memory/local, not an external system.


</content>
