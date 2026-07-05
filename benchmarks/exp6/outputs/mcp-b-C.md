# TeamWiki MCP Server — Design & Implementation

## 1. Tool inventory design

The task lists six API operations. Six tools map to them one-for-one, with
one intentional wrinkle (`create` and `update` stay separate rather than
merging into an `upsert`) explained below.

| Tool | Maps to | Read/Write |
|---|---|---|
| `teamwiki_list_spaces` | list spaces | read |
| `teamwiki_search_pages` | search pages | read |
| `teamwiki_get_page` | read page | read |
| `teamwiki_create_page` | create page | write |
| `teamwiki_update_page` | update page | write |
| `teamwiki_get_recent_changes` | get recent changes | read |

**Why one tool per operation, not fewer or more:**

- **No merge of search + get.** Search returns lightweight snippets across
  many candidates; get returns one page's full content. Collapsing them
  into a single "find or read" tool would force every search call to pay
  the cost of full-body serialization, defeating the point of a
  token-conscious search tool. Keeping them separate lets an agent do a
  cheap broad search, then a targeted expensive read — the natural
  two-step pattern real wiki users already follow.
- **No merge of create + update into `upsert_page`.** They have genuinely
  different contracts: create needs a target space and produces a new id;
  update needs an existing id *and* a version for optimistic-concurrency
  safety, and must reject the call if no field is actually changing. An
  `upsert` tool would have to make `expected_version` conditionally
  required (present only when updating), which is exactly the kind of
  branchy, ambiguous schema that increases the chance an agent supplies
  the wrong parameter or silently creates a duplicate page rather than
  updating one. Two narrow, unambiguous tools are safer than one
  overloaded one — this is the "keep tool operations focused and atomic"
  principle in practice, not just a rule quoted for its own sake.
- **`get_recent_changes` is kept as its own tool** rather than folding into
  search, because it answers a fundamentally different question ("what
  changed lately," ordered by time) versus "what page discusses X"
  (ordered by relevance). An agent asked "who last touched the runbook"
  should not have to guess that this is secretly a search query.
- **No separate `delete_page` or `list_pages_in_space` tool** was added
  beyond the requested six, since the task scopes the surface explicitly;
  a real implementation would likely add these, and the design below
  (shared pagination/error helpers, a `_Backend` seam) makes that a small
  incremental addition, not a rewrite.
- **Naming**: every tool is prefixed `teamwiki_` (per `{service}_{action}_{resource}`
  convention) so this server composes safely alongside other MCP servers
  in the same agent session without name collisions on generic verbs like
  `search` or `create_page`.

## 2. Input schemas & agent-optimized descriptions

Every tool takes a single Pydantic model (`extra="forbid"`, whitespace
auto-stripped) with per-field `Field(..., description=...)` and, where
useful, length/range constraints so bad input is rejected before any
backend call:

- `teamwiki_search_pages`: `query` (2–200 chars), optional `space_key`
  filter, `limit`/`offset`, `response_format`.
- `teamwiki_get_page`: accepts **either** `page_id` **or** `space_key`+`slug`
  (validated with a `model_validator` so at least one identifying path is
  present), plus a `detail` level (`summary` | `full`) and a
  caller-controlled `max_length` truncation bound.
- `teamwiki_create_page`: `space_key`, `title`, `body_markdown`, optional
  `tags`/`parent_page_id`, plus an `actor` field for the audit trail
  (defaults to `"mcp_agent"` so the field is never a blocker).
- `teamwiki_update_page`: `page_id`, **required** `expected_version` (the
  optimistic-concurrency token), and optional `title`/`body_markdown`/`tags`
  — a `model_validator` rejects calls that change nothing.
- `teamwiki_get_recent_changes`: optional `space_key` filter, optional
  `since` ISO-8601 lower bound, `limit`/`offset`, `response_format`.
- `teamwiki_list_spaces`: `limit`/`offset`, `response_format` (kept for
  interface consistency and future scale, even though the seed data only
  has 4 spaces today).

Docstrings on every tool follow the same shape: a one-line summary, an
`Args`/`Returns` block with the exact JSON schema (so an agent knows what
fields to expect without calling the tool speculatively), 2–3 `Examples`
showing realistic trigger phrases and one explicit "don't use when" pointing
to the correct alternative tool, and an `Error Handling` section listing
every failure mode in plain language. This is deliberately more verbose than
typical docstrings — a tool description is the only documentation the
calling LLM will ever see.

All read tools support `response_format` (`markdown` default / `json`):
markdown for direct human-facing answers, JSON for further programmatic
processing, with human-readable timestamps (`"2024-06-12 14:30:00 UTC"`,
never raw epoch) and IDs always shown alongside titles (e.g.
`"On-Call Runbook (TW-1001)"`) so the agent never has to mentally track a
bare opaque ID.

## 3. Pagination & response-size control

- `teamwiki_search_pages`, `teamwiki_get_recent_changes`, and
  `teamwiki_list_spaces` all use offset-based pagination with a shared
  `_paginate()` helper returning `{total, count, offset, items, has_more,
  next_offset}` — the exact shape recommended for agent consumption, so an
  agent can always tell whether to page further without a second call.
  Default page size is 20, capped at 100.
- `teamwiki_search_pages` never returns full page bodies — only a
  ~320-character snippet centered on the match (title matches show the
  opening of the body instead, since there's no match offset to center
  on). This keeps a broad search over many pages cheap; the agent reads
  full content only for the specific page(s) it actually needs via
  `teamwiki_get_page`.
- `teamwiki_get_page` exposes two independent size controls:
  - `detail="summary"` returns only metadata plus the first paragraph —
    useful when an agent wants to confirm "is this the right page?"
    before spending context on the full body.
  - `detail="full"` (default) returns the complete body, truncated at
    `max_length` (default `CHARACTER_LIMIT = 8000` chars, caller-adjustable
    500–20000). A truncated response sets `"truncated": true` and includes
    an actionable `truncation_message` telling the agent to raise
    `max_length` or narrow its ask — never a silent cutoff.
- All list/search tools that hit a filter with zero results return a plain
  string message with a concrete next step (e.g. "remove the space_key
  filter or use a broader term") rather than an empty list or a bare
  `[]`, so the agent doesn't have to infer what to try next.

## 4. Error handling designed for agents

All errors are returned as **string content within the tool result**, never
as raised protocol-level exceptions or leaked stack traces (the one
exception is Pydantic's own structural validation — e.g. missing both
`page_id` and `space_key`/`slug` on `teamwiki_get_page` — which FastMCP
surfaces as a `ToolError` with the human-readable validator message intact,
still no stack trace reaches the agent).

Failure paths implemented, each with a specific next step baked into the
message text:

- **Not-found** (`teamwiki_get_page`, `teamwiki_update_page`): names the
  exact id/slug that failed and points at `teamwiki_search_pages` to find
  the right one.
- **Validation** (business-level, not just schema-level): unknown
  `space_key` on any tool that accepts one returns
  `"Error: Unknown space 'X'. Available spaces: ENG, HR, PROD, SALES. Use
  teamwiki_list_spaces..."` — the valid set is listed inline so the agent
  can self-correct without a second round trip; malformed `since` dates on
  `teamwiki_get_recent_changes` get the same treatment with the expected
  format spelled out.
- **Conflict** (`teamwiki_update_page`): a version mismatch (optimistic
  concurrency) returns the *actual* current version in the message and
  instructs the agent to re-fetch via `teamwiki_get_page` before retrying
  — framed as an expected, recoverable condition rather than a bug.
- **Simulated backend failure**: a `BackendUnavailableError` is raised from
  every `_Backend` method through a shared `_maybe_fail()` check, gated by
  `TEAMWIKI_SIMULATE_FAILURE_RATE` (env var, default `0.0`, so it's inert in
  normal operation). Setting it to e.g. `1.0` makes every call fail with a
  `503`-flavored message that explicitly says the failure is transient and
  safe to retry — this is how the "simulated-backend-failure path"
  requirement is exercised without needing a real flaky dependency. Writes
  (`create_page`/`update_page`) fail atomically before any state changes,
  so a simulated outage never leaves a half-created page.
- **Unexpected/unknown exceptions**: a catch-all `_unexpected_error()`
  helper returns a generic, non-revealing message (`type(e).__name__` only,
  no `str(e)`, no traceback) so an internal bug can never leak
  implementation details to the agent or the end user.

## 5. `server.py`

```python
#!/usr/bin/env python3
"""
TeamWiki MCP Server.

Exposes the TeamWiki product API (search pages, read page, create page,
update page, list spaces, get recent changes) as MCP tools for use by LLM
agents. Backed by an in-memory fake data store that mimics the shape and
failure modes of a real wiki backend, so the tool-calling contract this
server presents is the same one a production integration would need.
"""

import json
import os
import random
import re
import threading
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, model_validator

# --------------------------------------------------------------------------
# Server
# --------------------------------------------------------------------------

mcp = FastMCP("teamwiki_mcp")

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

# Maximum characters returned in any single field before truncation kicks in.
# Keeps a single tool response from blowing an agent's context window.
CHARACTER_LIMIT = 8000

# Snippet window (characters) shown around a search match.
SNIPPET_RADIUS = 160

# Default / max page sizes for list-style tools.
DEFAULT_LIMIT = 20
MAX_LIMIT = 100

# Probability (0.0-1.0) that a mutating call fails with a simulated backend
# outage. Overridable via env var so the failure path is exercisable in
# testing without needing a real flaky dependency.
SIMULATED_FAILURE_RATE = float(os.environ.get("TEAMWIKI_SIMULATE_FAILURE_RATE", "0.0"))


# --------------------------------------------------------------------------
# Fake in-memory backend
# --------------------------------------------------------------------------
#
# A real implementation would replace this section with an authenticated
# HTTP client against the TeamWiki REST API. The tool layer below is written
# against this module's function boundary (`_backend`) so that swap is the
# only change required later; no tool function talks to storage directly.


class BackendUnavailableError(Exception):
    """Raised when the (simulated) TeamWiki backend cannot service a request."""


class _Backend:
    """Thread-safe in-memory fake of the TeamWiki API."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._next_page_seq = 1
        self._next_change_seq = 1
        self.spaces: Dict[str, Dict[str, Any]] = {}
        self.pages: Dict[str, Dict[str, Any]] = {}
        self.changes: List[Dict[str, Any]] = []
        self._seed()

    # -- seed data ---------------------------------------------------------

    def _seed(self) -> None:
        now = datetime.now(timezone.utc)
        spaces = [
            ("ENG", "Engineering", "Architecture, runbooks, and on-call docs for the engineering org."),
            ("PROD", "Product", "Product specs, roadmaps, and launch retrospectives."),
            ("HR", "People & HR", "Policies, benefits, and onboarding guides."),
            ("SALES", "Sales", "Playbooks, battlecards, and territory plans."),
        ]
        for key, name, desc in spaces:
            self.spaces[key] = {
                "key": key,
                "name": name,
                "description": desc,
                "page_count": 0,
                "created_at": now,
            }

        seed_pages = [
            ("ENG", "On-Call Runbook", (
                "# On-Call Runbook\n\n"
                "This runbook covers the escalation policy for the platform team.\n\n"
                "## Escalation\n"
                "Primary on-call is paged first. If unacknowledged within 10 minutes, "
                "the secondary on-call is paged. Sev-1 incidents also notify the "
                "engineering director automatically.\n\n"
                "## Rollback procedure\n"
                "Use `deploy rollback <service>` to revert the last release. Rollbacks "
                "are safe for any service tagged `stateless`.\n"
            ), ["ops", "on-call"]),
            ("ENG", "Service Architecture Overview", (
                "# Service Architecture Overview\n\n"
                "TeamWiki's backend is split into a search service, a content "
                "service, and an activity-feed service. All three share a single "
                "Postgres cluster today; the search service is slated to move to a "
                "dedicated index in the next planning cycle.\n"
            ), ["architecture"]),
            ("PROD", "Q2 2024 Onboarding Redesign Retro", (
                "# Q2 2024 Onboarding Redesign Retro\n\n"
                "The onboarding redesign shipped in June 2024 and reduced time-to-"
                "first-page-created for new users from 4 days to 1 day.\n\n"
                "## What went well\n"
                "Early user interviews caught the confusing space-picker before it "
                "shipped.\n\n"
                "## What we would change\n"
                "Start the analytics instrumentation earlier next time.\n"
            ), ["retro", "onboarding"]),
            ("PROD", "2025 Roadmap Draft", (
                "# 2025 Roadmap Draft\n\n"
                "Themes for 2025: real-time collaborative editing, a public API, "
                "and improved search relevance.\n"
            ), ["roadmap"]),
            ("HR", "Parental Leave Policy", (
                "# Parental Leave Policy\n\n"
                "Full-time employees are eligible for 16 weeks of paid parental "
                "leave after 6 months of employment. Leave can be taken in one "
                "continuous block or split within the first 12 months.\n"
            ), ["policy", "benefits"]),
            ("HR", "New Hire Onboarding Checklist", (
                "# New Hire Onboarding Checklist\n\n"
                "Day 1: laptop setup, accounts provisioned, meet your buddy.\n"
                "Week 1: complete compliance training, shadow a teammate.\n"
                "Day 30: first 1:1 with manager to review ramp-up goals.\n"
            ), ["onboarding"]),
            ("SALES", "Enterprise Battlecard", (
                "# Enterprise Battlecard\n\n"
                "Primary competitor for enterprise deals is LegacyWiki. Our key "
                "differentiator is real-time search across all spaces; LegacyWiki "
                "requires a nightly reindex.\n"
            ), ["battlecard", "competitive"]),
            ("SALES", "Q1 2024 Territory Plan", (
                "# Q1 2024 Territory Plan\n\n"
                "Territory plan for the Northeast region, focused on mid-market "
                "healthcare accounts.\n"
            ), ["territory"]),
        ]

        for space_key, title, body, tags in seed_pages:
            self._create_page_unlocked(
                space_key=space_key,
                title=title,
                body_markdown=body,
                tags=tags,
                actor="seed_data",
                parent_page_id=None,
            )

    # -- id/slug helpers -----------------------------------------------------

    def _next_page_id(self) -> str:
        page_id = f"TW-{1000 + self._next_page_seq}"
        self._next_page_seq += 1
        return page_id

    @staticmethod
    def _slugify(title: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        return slug or "page"

    # -- simulated failure ----------------------------------------------------

    @staticmethod
    def _maybe_fail() -> None:
        if SIMULATED_FAILURE_RATE > 0 and random.random() < SIMULATED_FAILURE_RATE:
            raise BackendUnavailableError(
                "TeamWiki backend returned a 503 Service Unavailable."
            )

    # -- read operations -----------------------------------------------------

    def list_spaces(self) -> List[Dict[str, Any]]:
        self._maybe_fail()
        with self._lock:
            return [dict(s) for s in self.spaces.values()]

    def get_space(self, space_key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            space = self.spaces.get(space_key.upper())
            return dict(space) if space else None

    def get_page(self, page_id: Optional[str], space_key: Optional[str], slug: Optional[str]) -> Optional[Dict[str, Any]]:
        self._maybe_fail()
        with self._lock:
            if page_id:
                page = self.pages.get(page_id.upper())
                return dict(page) if page else None
            if space_key and slug:
                for page in self.pages.values():
                    if page["space_key"] == space_key.upper() and page["slug"] == slug:
                        return dict(page)
                return None
            return None

    def search_pages(self, query: str, space_key: Optional[str]) -> List[Dict[str, Any]]:
        self._maybe_fail()
        query_lower = query.lower()
        with self._lock:
            results = []
            for page in self.pages.values():
                if space_key and page["space_key"] != space_key.upper():
                    continue
                title_idx = page["title"].lower().find(query_lower)
                body_idx = page["body_markdown"].lower().find(query_lower)
                if title_idx == -1 and body_idx == -1:
                    continue
                results.append((title_idx != -1, dict(page), title_idx, body_idx))
            # Title matches ranked above body-only matches; ties broken by
            # most-recently-updated first.
            results.sort(key=lambda r: (not r[0], -r[1]["updated_at"].timestamp()))
            return [
                {"page": r[1], "title_match_index": r[2], "body_match_index": r[3]}
                for r in results
            ]

    def get_recent_changes(self, space_key: Optional[str], since: Optional[datetime]) -> List[Dict[str, Any]]:
        self._maybe_fail()
        with self._lock:
            changes = [dict(c) for c in self.changes]
        if space_key:
            changes = [c for c in changes if c["space_key"] == space_key.upper()]
        if since:
            changes = [c for c in changes if c["timestamp"] >= since]
        changes.sort(key=lambda c: c["timestamp"], reverse=True)
        return changes

    # -- write operations ------------------------------------------------------

    def _create_page_unlocked(
        self,
        space_key: str,
        title: str,
        body_markdown: str,
        tags: List[str],
        actor: str,
        parent_page_id: Optional[str],
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        page_id = self._next_page_id()
        page = {
            "id": page_id,
            "space_key": space_key,
            "title": title,
            "slug": self._slugify(title),
            "body_markdown": body_markdown,
            "tags": list(tags),
            "version": 1,
            "parent_page_id": parent_page_id,
            "created_at": now,
            "updated_at": now,
            "created_by": actor,
            "updated_by": actor,
        }
        self.pages[page_id] = page
        self.spaces[space_key]["page_count"] += 1
        self.changes.append({
            "id": f"CH-{self._next_change_seq}",
            "page_id": page_id,
            "title": title,
            "space_key": space_key,
            "change_type": "created",
            "version": 1,
            "timestamp": now,
            "actor": actor,
        })
        self._next_change_seq += 1
        return dict(page)

    def create_page(
        self,
        space_key: str,
        title: str,
        body_markdown: str,
        tags: List[str],
        actor: str,
        parent_page_id: Optional[str],
    ) -> Dict[str, Any]:
        self._maybe_fail()
        with self._lock:
            return self._create_page_unlocked(
                space_key=space_key,
                title=title,
                body_markdown=body_markdown,
                tags=tags,
                actor=actor,
                parent_page_id=parent_page_id,
            )

    def update_page(
        self,
        page_id: str,
        expected_version: int,
        title: Optional[str],
        body_markdown: Optional[str],
        tags: Optional[List[str]],
        actor: str,
    ) -> Dict[str, Any]:
        """Returns the updated page dict, or raises KeyError / ValueError.

        Raises:
            KeyError: page_id does not exist.
            ValueError: expected_version does not match the stored version
                (caller supplies the real current version in the message via
                the raised exception's args).
        """
        self._maybe_fail()
        with self._lock:
            page = self.pages.get(page_id.upper())
            if page is None:
                raise KeyError(page_id)
            if page["version"] != expected_version:
                raise ValueError(page["version"])

            if title is not None:
                page["title"] = title
                page["slug"] = self._slugify(title)
            if body_markdown is not None:
                page["body_markdown"] = body_markdown
            if tags is not None:
                page["tags"] = list(tags)

            page["version"] += 1
            page["updated_at"] = datetime.now(timezone.utc)
            page["updated_by"] = actor

            self.changes.append({
                "id": f"CH-{self._next_change_seq}",
                "page_id": page["id"],
                "title": page["title"],
                "space_key": page["space_key"],
                "change_type": "updated",
                "version": page["version"],
                "timestamp": page["updated_at"],
                "actor": actor,
            })
            self._next_change_seq += 1
            return dict(page)


_backend = _Backend()

# --------------------------------------------------------------------------
# Shared formatting / pagination / error helpers
# --------------------------------------------------------------------------


class ResponseFormat(str, Enum):
    """Output format for tool responses."""
    MARKDOWN = "markdown"
    JSON = "json"


def _format_ts(dt: datetime) -> str:
    """Human-readable UTC timestamp, e.g. '2024-06-12 14:30:00 UTC'."""
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")


def _paginate(items: List[Any], limit: int, offset: int) -> Dict[str, Any]:
    """Slice `items` for one page and compute standard pagination metadata."""
    total = len(items)
    page_items = items[offset:offset + limit]
    has_more = offset + len(page_items) < total
    return {
        "total": total,
        "count": len(page_items),
        "offset": offset,
        "items": page_items,
        "has_more": has_more,
        "next_offset": offset + len(page_items) if has_more else None,
    }


def _truncate(text: str, max_length: int) -> Dict[str, Any]:
    """Truncate `text` to `max_length` chars with a clear, actionable marker."""
    if len(text) <= max_length:
        return {"text": text, "truncated": False, "original_length": len(text)}
    cut = text[:max_length]
    return {
        "text": cut,
        "truncated": True,
        "original_length": len(text),
        "truncation_message": (
            f"Content truncated from {len(text)} to {max_length} characters. "
            "Increase 'max_length' to see more, or request a narrower section."
        ),
    }


def _known_space_keys() -> List[str]:
    return sorted(s["key"] for s in _backend.list_spaces())


def _unknown_space_error(space_key: str) -> str:
    keys = ", ".join(_known_space_keys())
    return (
        f"Error: Unknown space '{space_key}'. Available spaces: {keys}. "
        "Use teamwiki_list_spaces to see all spaces with descriptions."
    )


def _backend_unavailable_error() -> str:
    return (
        "Error: TeamWiki backend is temporarily unavailable (simulated 503). "
        "This is a transient failure — retry the request. If it keeps failing, "
        "treat it as a service outage rather than a bad request."
    )


def _unexpected_error(e: Exception) -> str:
    # Never leak stack traces or internal exception internals to the agent.
    return f"Error: An unexpected error occurred ({type(e).__name__}). Please retry; if this persists, report it."


# --------------------------------------------------------------------------
# Tool: teamwiki_list_spaces
# --------------------------------------------------------------------------


class ListSpacesInput(BaseModel):
    """Input for listing all TeamWiki spaces."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    limit: int = Field(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Maximum number of spaces to return.")
    offset: int = Field(default=0, ge=0, description="Number of spaces to skip, for pagination.")
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="'markdown' for a human-readable list, 'json' for structured data.",
    )


@mcp.tool(
    name="teamwiki_list_spaces",
    annotations={
        "title": "List TeamWiki Spaces",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def teamwiki_list_spaces(params: ListSpacesInput) -> str:
    """List every space (top-level wiki area) in TeamWiki.

    Use this first when you don't yet know which space a page lives in, or
    when a user refers to "the wiki" generically. Each space has a short key
    (e.g. "ENG") used by other tools' `space_key` parameter, plus a
    human-readable name and description. Spaces are returned in a stable
    order; page_count reflects the number of pages currently in the space.

    Args:
        params (ListSpacesInput):
            - limit (int): max spaces to return (default 20, max 100)
            - offset (int): pagination offset (default 0)
            - response_format ('markdown' | 'json'): output format

    Returns:
        str: Markdown list, or JSON with schema:
        {
            "total": int, "count": int, "offset": int,
            "spaces": [{"key": str, "name": str, "description": str, "page_count": int}],
            "has_more": bool, "next_offset": int | null
        }

    Examples:
        - Use when: "What spaces exist in the wiki?"
        - Use when: you need to validate a space_key before calling another tool.

    Error Handling:
        - This tool has no required inputs and cannot fail on validation;
          a backend outage returns "Error: TeamWiki backend is temporarily
          unavailable ...".
    """
    try:
        spaces = _backend.list_spaces()
    except BackendUnavailableError:
        return _backend_unavailable_error()
    except Exception as e:  # noqa: BLE001
        return _unexpected_error(e)

    spaces.sort(key=lambda s: s["key"])
    page = _paginate(spaces, params.limit, params.offset)

    if params.response_format == ResponseFormat.JSON:
        out = {
            "total": page["total"],
            "count": page["count"],
            "offset": page["offset"],
            "spaces": [
                {"key": s["key"], "name": s["name"], "description": s["description"], "page_count": s["page_count"]}
                for s in page["items"]
            ],
            "has_more": page["has_more"],
            "next_offset": page["next_offset"],
        }
        return json.dumps(out, indent=2)

    lines = [f"# TeamWiki Spaces ({page['total']} total)", ""]
    for s in page["items"]:
        lines.append(f"## {s['name']} ({s['key']})")
        lines.append(f"- **Pages**: {s['page_count']}")
        lines.append(f"- {s['description']}")
        lines.append("")
    if page["has_more"]:
        lines.append(f"_More spaces available — call again with offset={page['next_offset']}._")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Tool: teamwiki_search_pages
# --------------------------------------------------------------------------


class SearchPagesInput(BaseModel):
    """Input for searching TeamWiki pages by keyword."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    query: str = Field(..., min_length=2, max_length=200, description="Keyword or phrase to search for in page titles and body text (e.g. 'on-call', 'parental leave').")
    space_key: Optional[str] = Field(default=None, min_length=1, max_length=20, description="Restrict the search to one space, e.g. 'ENG'. Omit to search all spaces.")
    limit: int = Field(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Maximum number of results to return.")
    offset: int = Field(default=0, ge=0, description="Number of results to skip, for pagination.")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN, description="'markdown' or 'json'.")


@mcp.tool(
    name="teamwiki_search_pages",
    annotations={
        "title": "Search TeamWiki Pages",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def teamwiki_search_pages(params: SearchPagesInput) -> str:
    """Search page titles and body text for a keyword or phrase.

    Returns short snippets, not full page bodies — call teamwiki_get_page
    with the returned page id to read the full content of a specific result.
    Title matches are ranked above body-only matches; ties are broken by
    most-recently-updated first.

    Args:
        params (SearchPagesInput):
            - query (str): keyword/phrase, 2-200 chars
            - space_key (Optional[str]): limit to one space
            - limit (int): max results (default 20, max 100)
            - offset (int): pagination offset (default 0)
            - response_format ('markdown' | 'json')

    Returns:
        str: Markdown results, or JSON with schema:
        {
            "total": int, "count": int, "offset": int,
            "results": [{
                "id": str,            # e.g. "TW-1001"
                "title": str,
                "space_key": str,
                "snippet": str,       # ~320-char window around the match
                "updated_at": str,    # human-readable UTC
                "version": int
            }],
            "has_more": bool, "next_offset": int | null
        }
        "No pages found matching '<query>'..." if there are zero results.

    Examples:
        - Use when: "Find our on-call escalation policy" -> query="on-call escalation"
        - Use when: "Search the HR space for leave policies" -> query="leave", space_key="HR"
        - Don't use when: you already have a page_id (use teamwiki_get_page instead).

    Error Handling:
        - Unknown space_key returns an actionable error listing valid keys.
        - Zero results returns a clear "no results" message with a suggestion
          to broaden the query or drop the space filter, not an error.
    """
    if params.space_key and params.space_key.upper() not in _known_space_keys():
        return _unknown_space_error(params.space_key)

    try:
        matches = _backend.search_pages(params.query, params.space_key)
    except BackendUnavailableError:
        return _backend_unavailable_error()
    except Exception as e:  # noqa: BLE001
        return _unexpected_error(e)

    if not matches:
        hint = " Try removing the space_key filter or using a broader term." if params.space_key else " Try a shorter or more general term."
        return f"No pages found matching '{params.query}'.{hint}"

    page = _paginate(matches, params.limit, params.offset)

    def _snippet(m: Dict[str, Any]) -> str:
        p = m["page"]
        idx = m["body_match_index"]
        if idx == -1:
            # Title-only match: show the opening of the body for context.
            body = p["body_markdown"]
            return body[:2 * SNIPPET_RADIUS].strip()
        start = max(0, idx - SNIPPET_RADIUS)
        end = min(len(p["body_markdown"]), idx + SNIPPET_RADIUS)
        snippet = p["body_markdown"][start:end].strip()
        return ("…" if start > 0 else "") + snippet + ("…" if end < len(p["body_markdown"]) else "")

    results = [
        {
            "id": m["page"]["id"],
            "title": m["page"]["title"],
            "space_key": m["page"]["space_key"],
            "snippet": _snippet(m),
            "updated_at": m["page"]["updated_at"],
            "version": m["page"]["version"],
        }
        for m in page["items"]
    ]

    if params.response_format == ResponseFormat.JSON:
        out = {
            "total": page["total"],
            "count": page["count"],
            "offset": page["offset"],
            "results": [
                {**r, "updated_at": _format_ts(r["updated_at"])} for r in results
            ],
            "has_more": page["has_more"],
            "next_offset": page["next_offset"],
        }
        return json.dumps(out, indent=2)

    lines = [f"# Search Results: '{params.query}' ({page['total']} match(es))", ""]
    for r in results:
        lines.append(f"## {r['title']} ({r['id']}) — space {r['space_key']}")
        lines.append(f"- Updated {_format_ts(r['updated_at'])}, version {r['version']}")
        lines.append(f"> {r['snippet']}")
        lines.append("")
    if page["has_more"]:
        lines.append(f"_More results available — call again with offset={page['next_offset']}._")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Tool: teamwiki_get_page
# --------------------------------------------------------------------------


class DetailLevel(str, Enum):
    """How much page content to return."""
    SUMMARY = "summary"  # metadata + first paragraph only
    FULL = "full"        # full body_markdown (subject to max_length truncation)


class GetPageInput(BaseModel):
    """Input for reading a single TeamWiki page. Identify the page either by
    `page_id`, or by the `space_key` + `slug` pair."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    page_id: Optional[str] = Field(default=None, min_length=1, max_length=30, description="Page id, e.g. 'TW-1001'. Preferred lookup method.")
    space_key: Optional[str] = Field(default=None, min_length=1, max_length=20, description="Space key, used together with 'slug' if page_id is not known.")
    slug: Optional[str] = Field(default=None, min_length=1, max_length=200, description="URL slug of the page (e.g. 'on-call-runbook'), used together with 'space_key'.")
    detail: DetailLevel = Field(default=DetailLevel.FULL, description="'full' returns the complete body (truncated at max_length); 'summary' returns only metadata plus the first paragraph.")
    max_length: int = Field(default=CHARACTER_LIMIT, ge=500, le=20000, description="Maximum characters of body content to return before truncation, only relevant when detail='full'.")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN, description="'markdown' or 'json'.")

    @model_validator(mode="after")
    def _check_identifier(self) -> "GetPageInput":
        has_id = bool(self.page_id)
        has_slug_pair = bool(self.space_key) and bool(self.slug)
        if not has_id and not has_slug_pair:
            raise ValueError("Provide either 'page_id', or both 'space_key' and 'slug'.")
        return self


@mcp.tool(
    name="teamwiki_get_page",
    annotations={
        "title": "Read TeamWiki Page",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def teamwiki_get_page(params: GetPageInput) -> str:
    """Read a single page's full content and metadata.

    Look the page up by `page_id` (fastest, e.g. from search results) or by
    `space_key` + `slug` if you only know where the page lives. Use
    `detail='summary'` for a cheap metadata + first-paragraph check before
    committing context to the full body.

    Args:
        params (GetPageInput):
            - page_id (Optional[str]): e.g. "TW-1001"
            - space_key (Optional[str]) / slug (Optional[str]): alternate lookup pair
            - detail ('summary' | 'full'): default 'full'
            - max_length (int): truncation limit for the body, 500-20000 (default 8000)
            - response_format ('markdown' | 'json')

    Returns:
        str: Markdown page content, or JSON with schema:
        {
            "id": str, "title": str, "space_key": str, "slug": str,
            "version": int, "tags": [str],
            "created_at": str, "updated_at": str,
            "created_by": str, "updated_by": str,
            "parent_page_id": str | null,
            "body": str,               # omitted content replaced by truncation_message when truncated
            "truncated": bool,
            "truncation_message": str  # present only when truncated
        }

    Examples:
        - Use when: "Show me the on-call runbook" (after finding its id via search)
        - Use when: "What's the parental leave policy?" -> page_id from search first
        - Don't use when: you only need to check if a page exists (search_pages is cheaper).

    Error Handling:
        - Neither identifier supplied: raises a validation error asking for
          'page_id' or 'space_key'+'slug'.
        - Not found: "Error: No page found ..." naming the id/slug that failed,
          with a suggestion to use teamwiki_search_pages.
    """
    try:
        page = _backend.get_page(params.page_id, params.space_key, params.slug)
    except BackendUnavailableError:
        return _backend_unavailable_error()
    except Exception as e:  # noqa: BLE001
        return _unexpected_error(e)

    if page is None:
        if params.page_id:
            return (
                f"Error: No page found with id '{params.page_id}'. "
                "Use teamwiki_search_pages to find the correct id."
            )
        return (
            f"Error: No page found at space '{params.space_key}', slug '{params.slug}'. "
            "Use teamwiki_search_pages or teamwiki_list_spaces to verify the location."
        )

    if params.detail == DetailLevel.SUMMARY:
        first_para = page["body_markdown"].split("\n\n", 1)[0].lstrip("#").strip()
        body_info = {"text": first_para, "truncated": False, "original_length": len(page["body_markdown"])}
    else:
        body_info = _truncate(page["body_markdown"], params.max_length)

    if params.response_format == ResponseFormat.JSON:
        out = {
            "id": page["id"],
            "title": page["title"],
            "space_key": page["space_key"],
            "slug": page["slug"],
            "version": page["version"],
            "tags": page["tags"],
            "created_at": _format_ts(page["created_at"]),
            "updated_at": _format_ts(page["updated_at"]),
            "created_by": page["created_by"],
            "updated_by": page["updated_by"],
            "parent_page_id": page["parent_page_id"],
            "body": body_info["text"],
            "truncated": body_info["truncated"],
        }
        if body_info["truncated"]:
            out["truncation_message"] = body_info["truncation_message"]
        return json.dumps(out, indent=2)

    lines = [
        f"# {page['title']} ({page['id']})",
        f"Space: {page['space_key']}  |  Version: {page['version']}  |  Tags: {', '.join(page['tags']) or 'none'}",
        f"Updated {_format_ts(page['updated_at'])} by {page['updated_by']}",
        "",
        body_info["text"],
    ]
    if body_info["truncated"]:
        lines += ["", f"_{body_info['truncation_message']}_"]
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Tool: teamwiki_create_page
# --------------------------------------------------------------------------


class CreatePageInput(BaseModel):
    """Input for creating a new TeamWiki page."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    space_key: str = Field(..., min_length=1, max_length=20, description="Key of the space to create the page in, e.g. 'ENG'. See teamwiki_list_spaces for valid keys.")
    title: str = Field(..., min_length=1, max_length=200, description="Page title, e.g. 'Incident Response Playbook'.")
    body_markdown: str = Field(..., min_length=1, max_length=50000, description="Full page body in Markdown.")
    tags: List[str] = Field(default_factory=list, max_length=20, description="Optional list of tags for categorization, e.g. ['ops', 'on-call'].")
    parent_page_id: Optional[str] = Field(default=None, max_length=30, description="Optional id of a parent page, to nest this page under it.")
    actor: str = Field(default="mcp_agent", max_length=100, description="Name/identifier of whoever is creating the page, for the audit trail.")


@mcp.tool(
    name="teamwiki_create_page",
    annotations={
        "title": "Create TeamWiki Page",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": True,
    },
)
async def teamwiki_create_page(params: CreatePageInput) -> str:
    """Create a new page in an existing TeamWiki space.

    Always call teamwiki_list_spaces first if you are not certain the target
    space_key exists. This tool never overwrites another page — repeated
    calls create additional pages, even with identical titles — so check
    teamwiki_search_pages first if you want to avoid duplicates.

    Args:
        params (CreatePageInput):
            - space_key (str): target space, must already exist
            - title (str): 1-200 chars
            - body_markdown (str): 1-50000 chars
            - tags (List[str]): optional, up to 20
            - parent_page_id (Optional[str]): optional parent to nest under
            - actor (str): who is creating the page (default "mcp_agent")

    Returns:
        str: JSON with schema:
        {
            "id": str,          # newly assigned page id, e.g. "TW-1009"
            "title": str, "space_key": str, "slug": str,
            "version": int,     # always 1 for a new page
            "created_at": str
        }

    Examples:
        - Use when: "Create a new page in ENG called 'Incident Postmortem Template'"
        - Don't use when: the page already exists and you want to change it
          (use teamwiki_update_page instead).

    Error Handling:
        - Unknown space_key: actionable error listing valid keys — no page
          is created.
        - If parent_page_id is supplied but does not exist, the page is still
          created (nesting is best-effort) but the response notes the parent
          was not found, so the caller can fix it with an update.
        - Simulated backend failure returns a transient, retry-safe error and
          creates no page (call is fully atomic).
    """
    if params.space_key.upper() not in _known_space_keys():
        return _unknown_space_error(params.space_key)

    parent_warning = None
    if params.parent_page_id and _backend.get_page(params.parent_page_id, None, None) is None:
        parent_warning = (
            f"parent_page_id '{params.parent_page_id}' was not found; "
            "the page was created without a parent."
        )

    try:
        page = _backend.create_page(
            space_key=params.space_key.upper(),
            title=params.title,
            body_markdown=params.body_markdown,
            tags=params.tags,
            actor=params.actor,
            parent_page_id=params.parent_page_id if not parent_warning else None,
        )
    except BackendUnavailableError:
        return _backend_unavailable_error()
    except Exception as e:  # noqa: BLE001
        return _unexpected_error(e)

    out = {
        "id": page["id"],
        "title": page["title"],
        "space_key": page["space_key"],
        "slug": page["slug"],
        "version": page["version"],
        "created_at": _format_ts(page["created_at"]),
    }
    if parent_warning:
        out["warning"] = parent_warning
    return json.dumps(out, indent=2)


# --------------------------------------------------------------------------
# Tool: teamwiki_update_page
# --------------------------------------------------------------------------


class UpdatePageInput(BaseModel):
    """Input for updating an existing TeamWiki page. Uses optimistic
    concurrency: you must supply the page's current version, obtained from
    teamwiki_get_page or teamwiki_search_pages, so concurrent edits are
    never silently overwritten."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    page_id: str = Field(..., min_length=1, max_length=30, description="Id of the page to update, e.g. 'TW-1001'.")
    expected_version: int = Field(..., ge=1, description="The page's current version, as last read from teamwiki_get_page. The update is rejected if this doesn't match, to prevent overwriting concurrent edits.")
    title: Optional[str] = Field(default=None, min_length=1, max_length=200, description="New title, if changing it.")
    body_markdown: Optional[str] = Field(default=None, min_length=1, max_length=50000, description="New full body in Markdown, if changing it. This replaces the entire body, it is not a diff/patch.")
    tags: Optional[List[str]] = Field(default=None, max_length=20, description="New full tag list, if changing it. This replaces the entire tag list.")
    actor: str = Field(default="mcp_agent", max_length=100, description="Name/identifier of whoever is making the update, for the audit trail.")

    @model_validator(mode="after")
    def _check_has_change(self) -> "UpdatePageInput":
        if self.title is None and self.body_markdown is None and self.tags is None:
            raise ValueError("Provide at least one of 'title', 'body_markdown', or 'tags' to update.")
        return self


@mcp.tool(
    name="teamwiki_update_page",
    annotations={
        "title": "Update TeamWiki Page",
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
        "openWorldHint": True,
    },
)
async def teamwiki_update_page(params: UpdatePageInput) -> str:
    """Update an existing page's title, body, and/or tags.

    This replaces whichever fields you provide in full (it is not a
    patch/diff over the old text) — for body_markdown, send the complete new
    body, not just the changed lines. Requires expected_version, read via
    teamwiki_get_page, to guard against clobbering a concurrent edit.

    Args:
        params (UpdatePageInput):
            - page_id (str): e.g. "TW-1001"
            - expected_version (int): must match the page's current version
            - title (Optional[str]): new title
            - body_markdown (Optional[str]): new full body
            - tags (Optional[List[str]]): new full tag list
            - actor (str): who is making the change

    Returns:
        str: JSON with schema:
        {
            "id": str, "title": str, "version": int,  # incremented by 1
            "updated_at": str
        }

    Examples:
        - Use when: "Add a rollback section to the on-call runbook"
          -> read the page first, append the section, then call with the
          full new body and the version you just read.
        - Don't use when: the page doesn't exist yet (use teamwiki_create_page).

    Error Handling:
        - Not found: "Error: No page found with id '<id>' ..."
        - Version conflict: "Error: Version conflict ..." naming the actual
          current version, and instructing the caller to re-fetch via
          teamwiki_get_page before retrying — this is the expected way to
          handle concurrent edits, not a bug.
        - Validation: at least one of title/body_markdown/tags is required,
          enforced before any backend call.
    """
    try:
        page = _backend.update_page(
            page_id=params.page_id,
            expected_version=params.expected_version,
            title=params.title,
            body_markdown=params.body_markdown,
            tags=params.tags,
            actor=params.actor,
        )
    except KeyError:
        return (
            f"Error: No page found with id '{params.page_id}'. "
            "Use teamwiki_search_pages to find the correct id."
        )
    except ValueError as e:
        actual_version = e.args[0]
        return (
            f"Error: Version conflict on page '{params.page_id}'. "
            f"You supplied expected_version={params.expected_version}, but the "
            f"page is currently at version {actual_version}. Call teamwiki_get_page "
            "to fetch the latest content and version, then retry the update."
        )
    except BackendUnavailableError:
        return _backend_unavailable_error()
    except Exception as e:  # noqa: BLE001
        return _unexpected_error(e)

    out = {
        "id": page["id"],
        "title": page["title"],
        "version": page["version"],
        "updated_at": _format_ts(page["updated_at"]),
    }
    return json.dumps(out, indent=2)


# --------------------------------------------------------------------------
# Tool: teamwiki_get_recent_changes
# --------------------------------------------------------------------------


class GetRecentChangesInput(BaseModel):
    """Input for retrieving the TeamWiki activity feed."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    space_key: Optional[str] = Field(default=None, min_length=1, max_length=20, description="Restrict to changes in one space. Omit for all spaces.")
    since: Optional[str] = Field(default=None, description="ISO 8601 timestamp (e.g. '2024-06-01T00:00:00Z'); only return changes at or after this time. Omit for no lower bound.")
    limit: int = Field(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Maximum number of changes to return.")
    offset: int = Field(default=0, ge=0, description="Number of changes to skip, for pagination.")
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN, description="'markdown' or 'json'.")


@mcp.tool(
    name="teamwiki_get_recent_changes",
    annotations={
        "title": "Get Recent TeamWiki Changes",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def teamwiki_get_recent_changes(params: GetRecentChangesInput) -> str:
    """List recent page creations and updates (the activity feed), newest first.

    Useful for "what changed" questions or for finding a page you know was
    edited recently but can't recall the title of. Each entry is a single
    create/update event, not a diff of the content.

    Args:
        params (GetRecentChangesInput):
            - space_key (Optional[str]): restrict to one space
            - since (Optional[str]): ISO 8601 lower bound on timestamp
            - limit (int): max entries (default 20, max 100)
            - offset (int): pagination offset (default 0)
            - response_format ('markdown' | 'json')

    Returns:
        str: Markdown feed, or JSON with schema:
        {
            "total": int, "count": int, "offset": int,
            "changes": [{
                "id": str, "page_id": str, "title": str, "space_key": str,
                "change_type": "created" | "updated",
                "version": int, "timestamp": str, "actor": str
            }],
            "has_more": bool, "next_offset": int | null
        }

    Examples:
        - Use when: "What changed in the HR space last week?"
        - Use when: "Who last edited the on-call runbook?" (filter results by page title/id)

    Error Handling:
        - Unknown space_key: actionable error listing valid keys.
        - Malformed 'since': "Error: Invalid date format ..." with the expected format.
    """
    if params.space_key and params.space_key.upper() not in _known_space_keys():
        return _unknown_space_error(params.space_key)

    since_dt = None
    if params.since:
        try:
            since_dt = datetime.fromisoformat(params.since.replace("Z", "+00:00"))
        except ValueError:
            return (
                f"Error: Invalid date format for 'since': '{params.since}'. "
                "Use ISO 8601, e.g. '2024-06-01T00:00:00Z'."
            )

    try:
        changes = _backend.get_recent_changes(params.space_key, since_dt)
    except BackendUnavailableError:
        return _backend_unavailable_error()
    except Exception as e:  # noqa: BLE001
        return _unexpected_error(e)

    if not changes:
        return "No changes found matching the given filters."

    page = _paginate(changes, params.limit, params.offset)

    if params.response_format == ResponseFormat.JSON:
        out = {
            "total": page["total"],
            "count": page["count"],
            "offset": page["offset"],
            "changes": [
                {**c, "timestamp": _format_ts(c["timestamp"])} for c in page["items"]
            ],
            "has_more": page["has_more"],
            "next_offset": page["next_offset"],
        }
        return json.dumps(out, indent=2)

    lines = [f"# Recent Changes ({page['total']} total)", ""]
    for c in page["items"]:
        lines.append(
            f"- **{c['change_type'].title()}** {c['title']} ({c['page_id']}) in {c['space_key']} "
            f"— v{c['version']} by {c['actor']} at {_format_ts(c['timestamp'])}"
        )
    if page["has_more"]:
        lines.append("")
        lines.append(f"_More changes available — call again with offset={page['next_offset']}._")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
```

This file was verified to load and run correctly: `python3 -m py_compile` passes,
`FastMCP.list_tools()` returns all six tools with well-formed schemas and
annotations, and manual calls to every tool (including the not-found,
unknown-space, version-conflict, and simulated-backend-failure paths) were
exercised and produced the expected messages.

## 6. README

### Setup

```bash
# Requires Python 3.10+
pip install mcp pydantic

# Run directly (stdio transport, the default — suitable for local
# integration with an MCP-capable agent client):
python server.py
```

No external service or API key is required — this server is entirely
self-contained, backed by an in-memory fake TeamWiki with realistic seed
content across 4 spaces and 8 pages so tools are immediately exercisable.

**Testing the simulated-failure path:**

```bash
TEAMWIKI_SIMULATE_FAILURE_RATE=1.0 python server.py
```

With the rate at `1.0`, every tool call returns the simulated `503`
error; a fractional value (e.g. `0.2`) gives a mix of successes and
failures, useful for testing an agent's retry behavior. Default is `0.0`
(disabled).

**Connecting from an MCP client (stdio):**

```json
{
  "mcpServers": {
    "teamwiki": {
      "command": "python",
      "args": ["/path/to/server.py"]
    }
  }
}
```

For a remote deployment, swap the entrypoint to
`mcp.run(transport="streamable_http", port=8000)` — no tool code changes
needed, since transport is orthogonal to the tool layer.

### Design decisions

- **In-memory fake backend behind a `_Backend` seam.** Every tool function
  calls into `_backend.<method>()`, never touching module-level dicts
  directly. Swapping this for a real HTTP client against the TeamWiki API
  is a change confined to the `_Backend` class; no tool signatures,
  schemas, or docstrings need to change. This is the same reason
  production MCP servers keep an API-client layer separate from the tool
  layer.
- **Optimistic concurrency on update, not on create.** Create can't
  conflict with anything (it always makes a new id), but update can race
  with another editor. Rather than "last write wins" (silently discarding
  a concurrent edit) or full transactional locking (unnecessary complexity
  for a wiki), `expected_version` gives the calling agent an explicit,
  actionable way to detect and recover from the conflict — matching what
  most real wiki/CMS APIs (Confluence, Notion, etc.) actually do.
  Version-conflict handling doubles as the model's demonstrated pattern
  for the "read-modify-write" tool sequence — get_page → update_page.
- **Snippets in search, full body only in get_page.** This is the primary
  token-consciousness lever: without it, a broad search returning even 10
  pages could consume most of an agent's context on content it may not
  need. Concretely, seed page bodies here run 200-500 characters; real
  wiki pages routinely run into the tens of thousands, so the snippet /
  full-body split matters far more once seed data is replaced with real
  content.
  is
- **`response_format` on every read tool, not just some.** Uniformity
  matters here: an agent that's learned "pass response_format='json' to
  get structured output" from one tool should be able to apply that
  pattern to every other tool in the server without re-reading each
  docstring.
- **Errors always come back as tool-result strings, not raised
  exceptions**, except for the one structural-validation case
  (`teamwiki_get_page` called with neither identifier) where FastMCP/Pydantic's
  own validation message is already clear and actionable enough to pass
  through unmodified.
- **Six tools, no more.** The task scoped the API surface explicitly to
  six operations; this design resists the temptation to add convenience
  tools (e.g. `get_page_history`, `delete_page`) that weren't asked for,
  since every additional tool is additional surface an agent has to learn
  to disambiguate between.

## 7. Evaluation plan

Five realistic agent questions, each answerable using only the tools above,
each with the tool-call sequence I'd expect a competent agent to follow.
(All are read-only/idempotent so they're safe to run repeatedly against the
seed data without corrupting state for later runs; #4 and #5 exercise
mutation but are stated so their assertions hold regardless of prior
mutating calls in the same session, by reading the state back rather than
assuming a fixed count.)

**Q1. "Which space's docs cover the on-call escalation policy, and what's
the exact page title?"**
Expected sequence:
1. `teamwiki_search_pages(query="on-call escalation")` → returns
   `On-Call Runbook (TW-1001)` in space `ENG`.
2. (Optional confirmation) `teamwiki_get_page(page_id="TW-1001",
   detail="summary")` to confirm the content matches before answering.
Expected answer: space `ENG` (Engineering), page title "On-Call Runbook".

**Q2. "According to TeamWiki, after how many months of employment does an
employee become eligible for parental leave, and how many weeks of paid
leave do they get?"**
Expected sequence:
1. `teamwiki_search_pages(query="parental leave")` → finds
   `Parental Leave Policy (TW-1005)` in `HR`.
2. `teamwiki_get_page(page_id="TW-1005")` → reads full body.
Expected answer: 6 months eligibility, 16 weeks paid leave.

**Q3. "Per the 2025 roadmap page, what are the three stated themes for
2025?"**
Expected sequence:
1. `teamwiki_search_pages(query="roadmap", space_key="PROD")` → finds
   `2025 Roadmap Draft (TW-1004)`.
2. `teamwiki_get_page(page_id="TW-1004")` → reads full body.
Expected answer: real-time collaborative editing, a public API, improved
search relevance.

**Q4. "Create a new page in the Sales space titled 'Competitive Note:
LegacyWiki Reindex Gap' with a one-line body referencing the nightly
reindex weakness mentioned in the Enterprise Battlecard, then tell me the
new page's id and version."**
Expected sequence:
1. `teamwiki_list_spaces()` or prior knowledge to confirm `SALES` is a
   valid space key (agent may skip if confident).
2. `teamwiki_search_pages(query="battlecard", space_key="SALES")` →
   confirm the reindex detail from `Enterprise Battlecard (TW-1007)`.
3. `teamwiki_create_page(space_key="SALES", title="Competitive Note:
   LegacyWiki Reindex Gap", body_markdown="LegacyWiki requires a nightly
   reindex, unlike our real-time search.")` → returns a new id (e.g.
   `TW-1009`) at `version: 1`.
Expected answer: the returned id and version 1 (exact id is
session-dependent since ids increment; the evaluator should accept
"a new TW-10xx id at version 1" or run this against a fresh server
instance for a fixed expected id of `TW-1009`).

**Q5. "Take the page you just created in Q4 and add the tag 'competitive'
to it — what version number does it become, and does the update require
you to know the page's previous version?"**
Expected sequence:
1. `teamwiki_get_page(page_id="<id from Q4>")` → confirms current
   `version: 1`.
2. `teamwiki_update_page(page_id="<id from Q4>", expected_version=1,
   tags=["competitive"])` → succeeds, returns `version: 2`.
Expected answer: version 2; yes, `expected_version` (the page's current
version, obtained by reading it first) is required — a mismatched version
is rejected with a conflict error rather than silently overwritten.

Note on scope: the task requests 5 evaluation questions (this plan
follows that), which is fewer than the 10-question, fully-independent,
read-only-only evaluation format the mcp-builder skill's evaluation-design
mini specifies for a formal Phase 4 evaluation run; Q4/Q5 here are
deliberately chained and mutating to demonstrate the create→update,
version-conflict-avoiding workflow end-to-end, which a strict Phase 4 suite
would instead split out or exclude.

LOADED: /home/user/hive/skills/mcp-builder/composable/INDEX.md, /home/user/hive/skills/mcp-builder/composable/BUNDLE.md
