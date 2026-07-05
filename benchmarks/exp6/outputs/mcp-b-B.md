# TeamWiki MCP Server

A production-quality Model Context Protocol server for the fictional
**TeamWiki** product, built with the Python MCP SDK (FastMCP). It exposes
search, read, create, and update operations over wiki pages, plus space
listing and a recent-changes activity feed, backed by an in-memory fake data
store designed to behave like a real paginated, versioned wiki API.

---

## 1. Tool Inventory Design

Six operations were requested: search pages, read page, create page, update
page, list spaces, get recent changes. This server maps them **1:1 to six
tools** — no consolidation, no further splitting. The reasoning for each
decision:

| Tool | Maps to | Why not merged/split |
|---|---|---|
| `teamwiki_list_spaces` | list spaces | Distinct discovery step; spaces are a different resource type from pages (containers vs. content), and agents need this before they can validly scope a search or create. |
| `teamwiki_search_pages` | search pages | Kept separate from `get_page` because it serves a fundamentally different token budget: many small, ranked, snippet-only results vs. one full document. Merging them (e.g. a single `find_or_get` tool) would force every search response to either omit useful ranking/snippet behavior or bloat every result with full bodies. |
| `teamwiki_get_page` | read page | Supports two identifier styles (`page_id`, or `space_key`+`slug`) in one tool rather than two separate tools, because they are the *same* operation with two equally common entry points (an agent may have an ID from search, or only know a human-readable space/slug pair from context). This is a consolidation that reduces the tool count without conflating unrelated actions. |
| `teamwiki_create_page` | create page | Kept separate from update. See below. |
| `teamwiki_update_page` | update page | **Explicitly not merged into an `upsert_page` tool.** Create and update have different failure modes (create fails on title collision; update fails on stale version) and different blast radii (create can only add; update can silently destroy content if misused). Collapsing them into one tool would force one input schema to carry two incompatible validation stories (`expected_version` is meaningless for create; "does this title already exist" is meaningless for update) and would make the destructive/idempotent annotations ambiguous for clients that rely on them. Two focused tools are safer and clearer for an agent to reason about, at the cost of one extra tool in the list — a good trade at this API's size. |
| `teamwiki_get_recent_changes` | get recent changes | Kept as an activity/audit feed distinct from search. Search answers "what pages are about X"; recent changes answers "what happened recently, and who did it" — different query shapes (keyword relevance vs. time-ordered feed) that would make a merged tool's parameters confusing (e.g. is `query` a keyword filter or empty for a pure activity feed?). |

**Omitted on purpose:** no `delete_page` or `delete_space` tool. The task's
API surface doesn't call for deletion, and adding a destructive tool not
asked for would only increase risk. Also omitted: a separate
`get_space` (fetch one space by key) tool — `teamwiki_list_spaces` covers the
full space list cheaply (spaces are few), and space existence errors are
already surfaced inline by every tool that accepts a `space_key`.

All six tools share the `teamwiki_` prefix (per MCP naming conventions) to
avoid collisions if this server runs alongside other MCP servers in the same
agent session.

---

## 2. Input Schemas and Tool Descriptions

Every tool takes a single Pydantic model (`extra="forbid"`, whitespace
stripped, validated on assignment) so invalid input is rejected before any
business logic runs, with field-level `Field(..., description=...)` strings
written for an agent audience (concrete examples, units, defaults) rather
than a human API reference. Highlights:

- **`SearchPagesInput`**: `query`, optional `space_key` (regex-validated,
  case-normalized), `detail` (`snippet` | `metadata`), `limit`/`offset`,
  `response_format`.
- **`GetPageInput`**: `page_id` OR (`space_key` + `slug`) — a model-level
  validator (`@model_validator(mode="after")`) enforces that at least one
  identifying combination is present, producing a single clear Pydantic
  error rather than a confusing runtime `KeyError`.
- **`CreatePageInput`**: `space_key`, `title`, `body`, `author`, optional
  `tags`/`parent_id`. `author` is modeled as an explicit field with a
  docstring note that a real deployment would derive it from the
  authenticated caller instead — see Design Decisions.
- **`UpdatePageInput`**: `page_id`, `expected_version` (optimistic
  concurrency — see §4), `author`, and optional `title`/`body`/`tags`. A
  model validator requires at least one actual field to change.
- **`RecentChangesInput`**: optional `since` (ISO-8601, validated with a
  real `datetime.fromisoformat` parse and an actionable error on failure),
  optional `space_key`, `limit`/`offset`.

Every tool carries full MCP annotations (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`) — see the code for exact values; notably
`teamwiki_update_page` is the only tool marked `destructiveHint: true`,
because it is the only one that can irrecoverably overwrite existing content
(there is no version-history/restore tool in this surface).

---

## 3. Pagination and Response-Size Control

- **Pagination**: `teamwiki_list_spaces`, `teamwiki_search_pages`, and
  `teamwiki_get_recent_changes` all take `limit`/`offset` and return
  `{total, count, offset, has_more, next_offset}` alongside their payload —
  the same shape for all three tools, produced by one shared `_paginate()`
  helper, so an agent only has to learn the convention once. Markdown
  responses also render a human-readable "_More results available. Call
  again with offset=N._" hint so a plain-text-reading agent doesn't need to
  parse JSON to discover it can page further.
- **Detail levels**: `teamwiki_search_pages` has a `detail` parameter
  (`snippet` default / `metadata`) so an agent scanning many candidate pages
  can drop the excerpt entirely; `teamwiki_get_page` has `detail` (`full`
  default / `summary`) so an agent can cheaply confirm a page's existence,
  title, and **current version** (needed before calling
  `teamwiki_update_page`) without paying for the body at all.
- **Truncation**: `teamwiki_get_page`'s `max_body_length` (default 4000,
  max 20000 characters) caps how much of a page body is returned. If the
  real body is longer, the response includes `body_truncated: true`,
  `total_body_length`, and a `truncation_note` telling the agent exactly how
  to get more (raise `max_body_length`) rather than silently clipping
  content.
- **No tool ever returns full bodies for more than one page at a time** —
  `teamwiki_search_pages` returns only short snippets (a ~240-character
  window around the first match, computed by `_make_snippet`), by design, so
  a 50-result search never floods context with 50 full documents.

---

## 4. Error Handling for Agents

All backend failures are modeled as typed Python exceptions
(`NotFoundError`, `ValidationError`, `ConflictError`, `BackendError`) raised
deep in the fake backend, and translated at the tool boundary by one shared
`_run_tool()` wrapper into a **consistent JSON error envelope** —
`{"error": true, "error_type": "...", "message": "..."}` — so agents can
branch on `error_type` programmatically instead of parsing prose. No
exception's Python traceback or internal message ever reaches the client; an
unhandled exception is always caught by a final generic handler and turned
into a bounded, non-leaking `internal_error`.

Concretely:

- **Not-found** (`error_type: "not_found"`): missing space, page, or
  `parent_id`. Every not-found message names the valid alternative (e.g. for
  a bad `space_key`, it lists all known space keys and points at
  `teamwiki_list_spaces`).
- **Validation** (`error_type: "validation_error"`): duplicate title within
  a space on create, title-rename collision on update, `parent_id` pointing
  at a different space. Each message states *why* it failed and what to do
  instead (e.g. "use `teamwiki_update_page`").
- **Version conflict** (`error_type: "version_conflict"`, only from
  `teamwiki_update_page`): optimistic-concurrency check — if the caller's
  `expected_version` doesn't match the page's current version, the update is
  rejected (never silently merged/overwritten) and the response includes the
  real `current_version`, `updated_by`, and `updated_at` so the agent can
  decide whether to re-fetch and retry or back off.
- **Simulated backend failure** (`error_type: "backend_unavailable"`,
  `retryable: true`): the fake backend recognizes a magic trigger string,
  `TRIGGER_BACKEND_ERROR`, in any free-text input (`query`, `title`, `body`,
  `page_id`, `slug`). If present, the tool raises a simulated 503 with a
  message telling the agent this is transient and worth retrying a bounded
  number of times. This mirrors how real APIs sometimes ship deterministic
  "test mode" trigger values (e.g. Stripe's test card numbers) — it lets this
  server's failure-handling path be exercised deterministically in tests and
  evaluations without needing a real, flaky dependency.
- Pydantic input errors (missing required fields, bad `space_key` pattern,
  out-of-range `limit`, missing both `title`/`body`/`tags` on update, etc.)
  are rejected before any tool body runs, with Pydantic's own descriptive
  messages — no manual re-validation duplicated in tool code.

---

## 5. `server.py`

Verified to compile (`python -m py_compile`), register all six tools under
`mcp.list_tools()`, and exercise correctly end-to-end (search, get by
slug/id, create, duplicate-title validation error, unknown-space error,
`TRIGGER_BACKEND_ERROR` simulated outage, stale-version conflict, successful
update, and both pages of a paginated `list_spaces` call) via the MCP
Python SDK's in-process `call_tool` path before being included here.

```python
#!/usr/bin/env python3
"""
MCP Server for TeamWiki.

Exposes TeamWiki's core wiki operations (search, read, create, update pages;
list spaces; view recent changes) as MCP tools for use by LLM agents. Backed
by an in-memory fake data store, but structured as if talking to a real
paginated, versioned wiki API.
"""

import json
import re
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Initialize the MCP server
mcp = FastMCP("teamwiki_mcp")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_SEARCH_LIMIT = 20
MAX_SEARCH_LIMIT = 100
DEFAULT_LIST_LIMIT = 50
MAX_LIST_LIMIT = 200
DEFAULT_CHANGES_LIMIT = 20
MAX_CHANGES_LIMIT = 100
DEFAULT_MAX_BODY_LENGTH = 4000
MIN_MAX_BODY_LENGTH = 200
MAX_MAX_BODY_LENGTH = 20000
SNIPPET_RADIUS = 120  # characters of context shown on each side of a search match

# Magic string that deterministically triggers a simulated backend outage.
# Real integrations sometimes ship equivalent "test mode" trigger values
# (e.g. Stripe's test card numbers) so client code and evals can exercise
# failure-handling paths without needing to fabricate a genuine outage.
BACKEND_ERROR_TRIGGER = "TRIGGER_BACKEND_ERROR"

SPACE_KEY_PATTERN = r"^[A-Za-z0-9_-]{1,20}$"


# ---------------------------------------------------------------------------
# Fake backend exceptions
# ---------------------------------------------------------------------------


class NotFoundError(Exception):
    """Raised when a requested space/page does not exist."""


class ValidationError(Exception):
    """Raised for semantic validation failures the schema can't catch alone."""


class ConflictError(Exception):
    """Raised on optimistic-concurrency version mismatch during update."""

    def __init__(self, message: str, current_version: int, updated_by: str, updated_at: str):
        super().__init__(message)
        self.current_version = current_version
        self.updated_by = updated_by
        self.updated_at = updated_at


class BackendError(Exception):
    """Raised to simulate a transient upstream/backend failure."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug or "page"


def _paginate(items: List[Any], limit: int, offset: int):
    total = len(items)
    page_items = items[offset : offset + limit]
    has_more = offset + len(page_items) < total
    next_offset = offset + len(page_items) if has_more else None
    return page_items, total, has_more, next_offset


def _make_snippet(body: str, terms: List[str], radius: int = SNIPPET_RADIUS) -> str:
    lower = body.lower()
    idx = -1
    for t in terms:
        i = lower.find(t)
        if i != -1 and (idx == -1 or i < idx):
            idx = i
    if idx == -1:
        snippet = body[: radius * 2].strip()
        return snippet + ("…" if len(body) > radius * 2 else "")
    start = max(0, idx - radius)
    end = min(len(body), idx + radius)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(body) else ""
    return prefix + body[start:end].strip().replace("\n", " ") + suffix


# ---------------------------------------------------------------------------
# Fake in-memory backend
# ---------------------------------------------------------------------------


class _Backend:
    """In-memory fake TeamWiki data store, seeded with sample content."""

    def __init__(self) -> None:
        self.spaces: Dict[str, Dict[str, Any]] = {}
        self.pages: Dict[str, Dict[str, Any]] = {}
        self.changes: List[Dict[str, Any]] = []
        self._seed()

    # -- seeding ---------------------------------------------------------

    def _seed(self) -> None:
        seed_spaces = [
            ("ENG", "Engineering", "Engineering design docs, runbooks, and architecture notes."),
            ("PROD", "Product", "Product specs, roadmaps, and launch retros."),
            ("HR", "People & Culture", "Onboarding guides, policies, and team processes."),
        ]
        for key, name, desc in seed_spaces:
            self.spaces[key] = {
                "key": key,
                "name": name,
                "description": desc,
                "created_at": "2023-01-10T09:00:00Z",
                "page_count": 0,
            }

        seed_pages = [
            ("ENG", "Deployment Runbook", "alice",
             "# Deployment Runbook\n\nThis document describes how to deploy the payments "
             "service to production.\n\n## Steps\n1. Merge to main\n2. Run `make release`\n"
             "3. Watch the canary dashboard for 15 minutes\n4. Promote to 100%\n\n"
             "## Rollback\nIf error rates spike, run `make rollback VERSION=<prev>`.",
             ["deployment", "runbook"], "2023-05-02T10:00:00Z"),
            ("ENG", "Architecture Overview", "bob",
             "# Architecture Overview\n\nThe platform is split into three services: "
             "gateway, ledger, and notifier. All services communicate over gRPC and "
             "publish events to a shared Kafka topic named `wiki-events`.",
             ["architecture"], "2023-05-10T14:30:00Z"),
            ("ENG", "On-Call Guide", "alice",
             "# On-Call Guide\n\nThe on-call engineer carries the pager for one week. "
             "Escalation path: on-call engineer -> team lead -> eng director. See the "
             "Deployment Runbook for rollback steps.",
             ["oncall", "runbook"], "2023-06-01T09:15:00Z"),
            ("PROD", "Q1 Roadmap", "carol",
             "# Q1 Roadmap\n\nFocus areas: faster search, mobile offline mode, and "
             "billing self-serve. Search launched in February; offline mode slipped to Q2.",
             ["roadmap"], "2023-01-20T11:00:00Z"),
            ("PROD", "Search Launch Retro", "carol",
             "# Search Launch Retro\n\nWe shipped full-text search on Feb 20. Adoption hit "
             "40% of weekly actives within a month. Main learning: invest in query "
             "analytics earlier next time.",
             ["retro", "search"], "2023-03-01T16:45:00Z"),
            ("HR", "New Hire Onboarding", "dave",
             "# New Hire Onboarding\n\nWelcome! Day one checklist: laptop setup, Slack "
             "channels, and a 30-minute chat with your onboarding buddy. Review the "
             "On-Call Guide if you are joining engineering.",
             ["onboarding"], "2023-02-14T08:00:00Z"),
            ("HR", "Time Off Policy", "dave",
             "# Time Off Policy\n\nFull-time employees accrue 15 days of PTO per year, "
             "front-loaded on January 1. Unused PTO does not roll over.",
             ["policy"], "2023-01-15T09:30:00Z"),
        ]
        for space_key, title, author, body, tags, ts in seed_pages:
            self._create_page_internal(space_key, title, body, author, tags, None, timestamp=ts)

    # -- internal mutators -------------------------------------------------

    def _create_page_internal(
        self,
        space_key: str,
        title: str,
        body: str,
        author: str,
        tags: Optional[List[str]],
        parent_id: Optional[str],
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        page_id = f"pg_{uuid.uuid4().hex[:10]}"
        ts = timestamp or _now()
        page = {
            "id": page_id,
            "space_key": space_key,
            "title": title,
            "slug": _slugify(title),
            "body": body,
            "tags": tags or [],
            "parent_id": parent_id,
            "version": 1,
            "created_by": author,
            "created_at": ts,
            "updated_by": author,
            "updated_at": ts,
        }
        self.pages[page_id] = page
        self.spaces[space_key]["page_count"] += 1
        self.changes.append(
            {
                "change_type": "created",
                "page_id": page_id,
                "title": title,
                "space_key": space_key,
                "actor": author,
                "timestamp": ts,
                "version": 1,
            }
        )
        return page

    @staticmethod
    def _maybe_trigger_simulated_failure(*texts: Optional[str]) -> None:
        for t in texts:
            if t and BACKEND_ERROR_TRIGGER in t:
                raise BackendError(
                    "Simulated backend outage: the TeamWiki storage service returned "
                    "HTTP 503 Service Unavailable. This is a transient failure - wait "
                    "briefly and retry the same request. If it fails 3 times in a row, "
                    "report the operation as unavailable rather than retrying further."
                )

    # -- reads ---------------------------------------------------------------

    def list_spaces(self) -> List[Dict[str, Any]]:
        return sorted(self.spaces.values(), key=lambda s: s["key"])

    def get_space(self, space_key: str) -> Dict[str, Any]:
        space = self.spaces.get(space_key.upper())
        if not space:
            raise NotFoundError(
                f"Space '{space_key}' does not exist. Known spaces: "
                f"{', '.join(sorted(self.spaces.keys()))}. Call teamwiki_list_spaces to "
                f"confirm the exact space_key."
            )
        return space

    def get_page(self, page_id: str) -> Dict[str, Any]:
        self._maybe_trigger_simulated_failure(page_id)
        page = self.pages.get(page_id)
        if not page:
            raise NotFoundError(
                f"Page '{page_id}' was not found. It may have been deleted, or the ID "
                f"may be malformed (expected format 'pg_xxxxxxxxxx'). Call "
                f"teamwiki_search_pages to find the correct page_id."
            )
        return page

    def find_page_by_slug(self, space_key: str, slug: str) -> Dict[str, Any]:
        self._maybe_trigger_simulated_failure(space_key, slug)
        space = self.get_space(space_key)
        for page in self.pages.values():
            if page["space_key"] == space["key"] and page["slug"] == slug:
                return page
        raise NotFoundError(
            f"No page with slug '{slug}' exists in space '{space['key']}'. Call "
            f"teamwiki_search_pages with space_key='{space['key']}' to browse its pages."
        )

    def search(self, query: str, space_key: Optional[str]) -> List[Dict[str, Any]]:
        self._maybe_trigger_simulated_failure(query)
        if space_key:
            space_key = self.get_space(space_key)["key"]  # validates + normalizes case
        terms = [t.lower() for t in query.split() if t.strip()]
        scored: List[tuple] = []
        for page in self.pages.values():
            if space_key and page["space_key"] != space_key:
                continue
            haystack = f"{page['title']}\n{page['body']}\n{' '.join(page['tags'])}".lower()
            score = sum(haystack.count(t) for t in terms)
            if any(t in page["title"].lower() for t in terms):
                score += 5
            if score > 0:
                scored.append((score, page))
        scored.sort(key=lambda pair: (-pair[0], pair[1]["title"]))
        return [page for _, page in scored]

    def recent_changes(self, since: Optional[str], space_key: Optional[str]) -> List[Dict[str, Any]]:
        if space_key:
            space_key = self.get_space(space_key)["key"]
        items = self.changes
        if space_key:
            items = [c for c in items if c["space_key"] == space_key]
        if since:
            items = [c for c in items if c["timestamp"] >= since]
        return sorted(items, key=lambda c: c["timestamp"], reverse=True)

    # -- writes --------------------------------------------------------------

    def create_page(
        self,
        space_key: str,
        title: str,
        body: str,
        author: str,
        tags: Optional[List[str]],
        parent_id: Optional[str],
    ) -> Dict[str, Any]:
        self._maybe_trigger_simulated_failure(title, body)
        space = self.get_space(space_key)
        space_key = space["key"]
        slug = _slugify(title)
        for page in self.pages.values():
            if page["space_key"] == space_key and page["slug"] == slug:
                raise ValidationError(
                    f"A page titled '{title}' already exists in space '{space_key}' "
                    f"(page_id={page['id']}). Call teamwiki_update_page to modify it "
                    f"instead, or choose a different title."
                )
        if parent_id:
            parent = self.pages.get(parent_id)
            if not parent:
                raise NotFoundError(
                    f"parent_id '{parent_id}' does not refer to an existing page. Omit "
                    f"parent_id, or supply the id of an existing page in '{space_key}'."
                )
            if parent["space_key"] != space_key:
                raise ValidationError(
                    f"parent_id '{parent_id}' belongs to space '{parent['space_key']}', "
                    f"not '{space_key}'. A page's parent must live in the same space."
                )
        return self._create_page_internal(space_key, title, body, author, tags, parent_id)

    def update_page(
        self,
        page_id: str,
        expected_version: int,
        author: str,
        title: Optional[str],
        body: Optional[str],
        tags: Optional[List[str]],
    ) -> Dict[str, Any]:
        self._maybe_trigger_simulated_failure(page_id, title, body)
        page = self.get_page(page_id)
        if page["version"] != expected_version:
            raise ConflictError(
                f"Version conflict updating '{page_id}': expected_version="
                f"{expected_version} was supplied, but the current version is "
                f"{page['version']} (last updated by {page['updated_by']} at "
                f"{page['updated_at']}). Call teamwiki_get_page to fetch the latest "
                f"content and version, then retry the update with that version number.",
                current_version=page["version"],
                updated_by=page["updated_by"],
                updated_at=page["updated_at"],
            )
        if title is not None:
            new_slug = _slugify(title)
            for other in self.pages.values():
                if (
                    other["id"] != page_id
                    and other["space_key"] == page["space_key"]
                    and other["slug"] == new_slug
                ):
                    raise ValidationError(
                        f"Cannot rename to '{title}': another page in space "
                        f"'{page['space_key']}' already uses that title "
                        f"(page_id={other['id']})."
                    )
            page["title"] = title
            page["slug"] = new_slug
        if body is not None:
            page["body"] = body
        if tags is not None:
            page["tags"] = tags
        page["version"] += 1
        page["updated_by"] = author
        page["updated_at"] = _now()
        self.changes.append(
            {
                "change_type": "updated",
                "page_id": page["id"],
                "title": page["title"],
                "space_key": page["space_key"],
                "actor": author,
                "timestamp": page["updated_at"],
                "version": page["version"],
            }
        )
        return page


_backend = _Backend()


# ---------------------------------------------------------------------------
# Shared response formatting
# ---------------------------------------------------------------------------


class ResponseFormat(str, Enum):
    """Output format for tool responses."""

    MARKDOWN = "markdown"
    JSON = "json"


class PageDetail(str, Enum):
    """How much page content to return."""

    SUMMARY = "summary"  # metadata only, no body
    FULL = "full"  # metadata + body (subject to max_body_length truncation)


class SearchDetail(str, Enum):
    """How much detail to include per search result."""

    METADATA = "metadata"  # id, title, space, tags, timestamps only
    SNIPPET = "snippet"  # metadata + a short matched-text snippet


def _error_json(message: str, error_type: str, **extra: Any) -> str:
    payload = {"error": True, "error_type": error_type, "message": message}
    payload.update(extra)
    return json.dumps(payload, indent=2)


def _run_tool(fn):
    """Wrap a tool body, translating backend exceptions into agent-safe errors."""
    try:
        return fn()
    except NotFoundError as e:
        return _error_json(str(e), "not_found")
    except ValidationError as e:
        return _error_json(str(e), "validation_error")
    except ConflictError as e:
        return _error_json(
            str(e),
            "version_conflict",
            current_version=e.current_version,
            updated_by=e.updated_by,
            updated_at=e.updated_at,
        )
    except BackendError as e:
        return _error_json(str(e), "backend_unavailable", retryable=True)
    except Exception as e:  # noqa: BLE001 - last-resort guard, never leak internals
        return _error_json(
            f"An unexpected internal error occurred ({type(e).__name__}). This is "
            f"likely a transient issue - retry once, and if it persists, treat the "
            f"operation as failed rather than continuing.",
            "internal_error",
        )


def _space_view(space: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "space_key": space["key"],
        "name": space["name"],
        "description": space["description"],
        "page_count": space["page_count"],
        "created_at": space["created_at"],
    }


def _page_view(page: Dict[str, Any], detail: PageDetail, max_body_length: int) -> Dict[str, Any]:
    view = {
        "page_id": page["id"],
        "space_key": page["space_key"],
        "title": page["title"],
        "slug": page["slug"],
        "tags": page["tags"],
        "parent_id": page["parent_id"],
        "version": page["version"],
        "created_by": page["created_by"],
        "created_at": page["created_at"],
        "updated_by": page["updated_by"],
        "updated_at": page["updated_at"],
    }
    if detail == PageDetail.FULL:
        body = page["body"]
        if len(body) > max_body_length:
            view["body"] = body[:max_body_length]
            view["body_truncated"] = True
            view["total_body_length"] = len(body)
            view["truncation_note"] = (
                f"Body truncated to {max_body_length} of {len(body)} characters. "
                f"Increase max_body_length (up to {MAX_MAX_BODY_LENGTH}) to see more."
            )
        else:
            view["body"] = body
            view["body_truncated"] = False
    return view


def _search_hit_view(page: Dict[str, Any], terms: List[str], detail: SearchDetail) -> Dict[str, Any]:
    hit = {
        "page_id": page["id"],
        "space_key": page["space_key"],
        "title": page["title"],
        "tags": page["tags"],
        "updated_at": page["updated_at"],
    }
    if detail == SearchDetail.SNIPPET:
        hit["snippet"] = _make_snippet(page["body"], terms)
    return hit


def _change_view(change: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "change_type": change["change_type"],
        "page_id": change["page_id"],
        "title": change["title"],
        "space_key": change["space_key"],
        "actor": change["actor"],
        "timestamp": change["timestamp"],
        "version": change["version"],
    }


def _render(
    response_format: ResponseFormat,
    json_payload: Dict[str, Any],
    markdown_lines: List[str],
) -> str:
    if response_format == ResponseFormat.JSON:
        return json.dumps(json_payload, indent=2)
    return "\n".join(markdown_lines)


# ---------------------------------------------------------------------------
# Pydantic input models
# ---------------------------------------------------------------------------


class ListSpacesInput(BaseModel):
    """Input for listing all TeamWiki spaces."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    limit: int = Field(
        default=DEFAULT_LIST_LIMIT,
        description="Maximum number of spaces to return.",
        ge=1,
        le=MAX_LIST_LIMIT,
    )
    offset: int = Field(
        default=0, description="Number of spaces to skip, for pagination.", ge=0
    )
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="'markdown' for a human-readable list, 'json' for structured data.",
    )


class SearchPagesInput(BaseModel):
    """Input for full-text search across TeamWiki pages."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    query: str = Field(
        ...,
        description=(
            "Search terms to match against page titles, body text, and tags "
            "(e.g. 'rollback deployment', 'onboarding buddy'). Space-separated "
            "terms are ANDed by relevance, not required to all match."
        ),
        min_length=1,
        max_length=200,
    )
    space_key: Optional[str] = Field(
        default=None,
        description="Restrict the search to one space (e.g. 'ENG'). Omit to search all spaces.",
        pattern=SPACE_KEY_PATTERN,
    )
    detail: SearchDetail = Field(
        default=SearchDetail.SNIPPET,
        description=(
            "'snippet' includes a short excerpt of matched text per result (default). "
            "'metadata' omits excerpts and returns only IDs/titles/tags - use this for "
            "quickly scanning many results without spending extra tokens."
        ),
    )
    limit: int = Field(
        default=DEFAULT_SEARCH_LIMIT,
        description="Maximum number of results to return.",
        ge=1,
        le=MAX_SEARCH_LIMIT,
    )
    offset: int = Field(default=0, description="Number of results to skip, for pagination.", ge=0)
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN, description="'markdown' or 'json'."
    )

    @field_validator("space_key")
    @classmethod
    def _upper(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v


class GetPageInput(BaseModel):
    """Input for reading a single TeamWiki page, by ID or by space+slug."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    page_id: Optional[str] = Field(
        default=None,
        description="The page's unique ID (e.g. 'pg_3f9a1c02de'), as returned by search or create.",
    )
    space_key: Optional[str] = Field(
        default=None,
        description="Space key to look up a page by slug (used together with 'slug').",
        pattern=SPACE_KEY_PATTERN,
    )
    slug: Optional[str] = Field(
        default=None,
        description="URL-friendly page slug within space_key (e.g. 'deployment-runbook').",
        max_length=200,
    )
    detail: PageDetail = Field(
        default=PageDetail.FULL,
        description=(
            "'full' returns the page body along with metadata (default). 'summary' "
            "returns only metadata (title, tags, version, timestamps) with no body - "
            "use this to confirm a page exists or check its version before an update, "
            "without spending tokens on content."
        ),
    )
    max_body_length: int = Field(
        default=DEFAULT_MAX_BODY_LENGTH,
        description="Maximum characters of body to return when detail='full'. Larger bodies are truncated.",
        ge=MIN_MAX_BODY_LENGTH,
        le=MAX_MAX_BODY_LENGTH,
    )
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN, description="'markdown' or 'json'."
    )

    @field_validator("space_key")
    @classmethod
    def _upper(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v

    @model_validator(mode="after")
    def _require_identifier(self) -> "GetPageInput":
        if not self.page_id and not (self.space_key and self.slug):
            raise ValueError(
                "Provide either 'page_id', or both 'space_key' and 'slug' to identify the page."
            )
        return self


class CreatePageInput(BaseModel):
    """Input for creating a new TeamWiki page."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    space_key: str = Field(
        ..., description="Key of the space to create the page in (e.g. 'ENG').", pattern=SPACE_KEY_PATTERN
    )
    title: str = Field(
        ...,
        description="Page title. Must be unique within the space (e.g. 'Q3 Security Review').",
        min_length=1,
        max_length=200,
    )
    body: str = Field(
        ..., description="Page content in Markdown.", min_length=1, max_length=100_000
    )
    author: str = Field(
        ...,
        description=(
            "Username or display name of the person creating the page (e.g. 'jane.doe'). "
            "In a production deployment this would be derived from the caller's "
            "authenticated identity rather than passed explicitly."
        ),
        min_length=1,
        max_length=100,
    )
    tags: Optional[List[str]] = Field(
        default_factory=list, description="Optional labels for categorization (e.g. ['runbook', 'oncall']).", max_length=20
    )
    parent_id: Optional[str] = Field(
        default=None, description="Optional page_id of a parent page, to nest this page under it."
    )

    @field_validator("space_key")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    @field_validator("title")
    @classmethod
    def _no_blank_title(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be blank.")
        return v.strip()


class UpdatePageInput(BaseModel):
    """Input for updating an existing TeamWiki page. Uses optimistic concurrency."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    page_id: str = Field(..., description="ID of the page to update (e.g. 'pg_3f9a1c02de').")
    expected_version: int = Field(
        ...,
        description=(
            "The version number you last read via teamwiki_get_page. The update is "
            "rejected with a version_conflict error if the page has changed since then, "
            "preventing accidental overwrites of someone else's edit."
        ),
        ge=1,
    )
    author: str = Field(
        ..., description="Username or display name of the person making this edit.", min_length=1, max_length=100
    )
    title: Optional[str] = Field(
        default=None, description="New title, if renaming the page. Omit to leave unchanged.", max_length=200
    )
    body: Optional[str] = Field(
        default=None, description="New Markdown content, if changing the body. Omit to leave unchanged.", max_length=100_000
    )
    tags: Optional[List[str]] = Field(
        default=None, description="Replacement tag list, if changing tags. Omit to leave unchanged.", max_length=20
    )

    @model_validator(mode="after")
    def _require_a_change(self) -> "UpdatePageInput":
        if self.title is None and self.body is None and self.tags is None:
            raise ValueError("Provide at least one of 'title', 'body', or 'tags' to update.")
        return self


class RecentChangesInput(BaseModel):
    """Input for listing recent create/update activity across TeamWiki."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    since: Optional[str] = Field(
        default=None,
        description="Only return changes at/after this ISO-8601 UTC timestamp (e.g. '2024-01-01T00:00:00Z'). Omit for no lower bound.",
    )
    space_key: Optional[str] = Field(
        default=None, description="Restrict to one space (e.g. 'PROD'). Omit for all spaces.", pattern=SPACE_KEY_PATTERN
    )
    limit: int = Field(default=DEFAULT_CHANGES_LIMIT, description="Maximum number of changes to return.", ge=1, le=MAX_CHANGES_LIMIT)
    offset: int = Field(default=0, description="Number of changes to skip, for pagination.", ge=0)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN, description="'markdown' or 'json'.")

    @field_validator("space_key")
    @classmethod
    def _upper(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v

    @field_validator("since")
    @classmethod
    def _valid_timestamp(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        try:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(
                f"'{v}' is not a valid ISO-8601 timestamp. Use a format like '2024-01-01T00:00:00Z'."
            ) from exc
        return v


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool(
    name="teamwiki_list_spaces",
    annotations={
        "title": "List TeamWiki Spaces",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def teamwiki_list_spaces(params: ListSpacesInput) -> str:
    """List all spaces (top-level wiki containers) in TeamWiki.

    Use this first when you don't already know a space_key, or to confirm one
    exists before searching or creating pages in it. This tool does NOT modify
    anything and does NOT return page contents - use teamwiki_search_pages or
    teamwiki_get_page for that.

    Args:
        params (ListSpacesInput): Validated input containing:
            - limit (int): Maximum spaces to return (default 50, max 200)
            - offset (int): Number of spaces to skip for pagination (default 0)
            - response_format (ResponseFormat): 'markdown' (default) or 'json'

    Returns:
        str: In JSON mode, an object:
        {
            "total": int,             # total number of spaces
            "count": int,             # number returned in this page
            "offset": int,
            "has_more": bool,
            "next_offset": int|null,
            "spaces": [
                {
                    "space_key": str,     # e.g. "ENG"
                    "name": str,          # e.g. "Engineering"
                    "description": str,
                    "page_count": int,
                    "created_at": str     # ISO-8601 UTC
                }
            ]
        }
        In markdown mode, a formatted list of spaces with the same fields.

    Examples:
        - Use when: "What wiki spaces exist?" or "What's the space_key for HR docs?"
        - Don't use when: You already know the space_key and want its pages
          (use teamwiki_search_pages instead).

    Error Handling:
        - Input validation errors are handled by Pydantic before this runs.
        - This tool has no not-found path; an empty result means no spaces exist.
    """

    def _do() -> str:
        spaces = _backend.list_spaces()
        page_items, total, has_more, next_offset = _paginate(spaces, params.limit, params.offset)
        views = [_space_view(s) for s in page_items]
        lines = [f"# TeamWiki Spaces ({total} total, showing {len(views)})", ""]
        for v in views:
            lines.append(f"## {v['name']} ({v['space_key']})")
            lines.append(f"- {v['description']}")
            lines.append(f"- Pages: {v['page_count']} | Created: {v['created_at']}")
            lines.append("")
        if has_more:
            lines.append(f"_More spaces available. Call again with offset={next_offset}._")
        payload = {
            "total": total,
            "count": len(views),
            "offset": params.offset,
            "has_more": has_more,
            "next_offset": next_offset,
            "spaces": views,
        }
        return _render(params.response_format, payload, lines)

    return _run_tool(_do)


@mcp.tool(
    name="teamwiki_search_pages",
    annotations={
        "title": "Search TeamWiki Pages",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def teamwiki_search_pages(params: SearchPagesInput) -> str:
    """Search TeamWiki page titles, body text, and tags for matching terms.

    This is the primary discovery tool: use it to find candidate page_ids
    before calling teamwiki_get_page. Results are ranked by relevance (title
    matches score highest). This tool never returns full page bodies - only
    short snippets - to keep responses small; fetch a specific page with
    teamwiki_get_page to read its full content.

    Args:
        params (SearchPagesInput): Validated input containing:
            - query (str): Search terms (e.g. "rollback deployment")
            - space_key (Optional[str]): Restrict to one space, e.g. "ENG"
            - detail (SearchDetail): "snippet" (default, includes excerpt) or
              "metadata" (IDs/titles/tags only, no excerpt - cheaper)
            - limit (int): Max results (default 20, max 100)
            - offset (int): Pagination offset (default 0)
            - response_format (ResponseFormat): 'markdown' (default) or 'json'

    Returns:
        str: In JSON mode:
        {
            "total": int,
            "count": int,
            "offset": int,
            "has_more": bool,
            "next_offset": int|null,
            "results": [
                {
                    "page_id": str,        # e.g. "pg_3f9a1c02de"
                    "space_key": str,
                    "title": str,
                    "tags": [str],
                    "updated_at": str,      # ISO-8601 UTC
                    "snippet": str          # only when detail="snippet"
                }
            ]
        }
        If no results match: {"total": 0, "count": 0, ..., "results": []}
        (JSON mode) or "No pages found matching '<query>'" (markdown mode).

    Examples:
        - Use when: "Find docs about rollback procedures" -> query="rollback"
        - Use when: "What pages exist about onboarding?" -> query="onboarding"
        - Don't use when: You already have a page_id (use teamwiki_get_page).
        - Don't use when: You want a full activity feed, not a keyword match
          (use teamwiki_get_recent_changes).

    Error Handling:
        - Returns a validation_error if space_key doesn't match any known space.
        - Returns a backend_unavailable error (retryable) if the simulated
          backend is unavailable.
    """

    def _do() -> str:
        results = _backend.search(params.query, params.space_key)
        page_items, total, has_more, next_offset = _paginate(results, params.limit, params.offset)
        terms = [t.lower() for t in params.query.split() if t.strip()]
        views = [_search_hit_view(p, terms, params.detail) for p in page_items]
        if not views:
            payload = {
                "total": 0,
                "count": 0,
                "offset": params.offset,
                "has_more": False,
                "next_offset": None,
                "results": [],
            }
            return _render(
                params.response_format, payload, [f"No pages found matching '{params.query}'."]
            )
        lines = [f"# Search Results: '{params.query}' ({total} total, showing {len(views)})", ""]
        for v in views:
            lines.append(f"## {v['title']} ({v['page_id']}, space={v['space_key']})")
            if "snippet" in v:
                lines.append(f"> {v['snippet']}")
            if v["tags"]:
                lines.append(f"Tags: {', '.join(v['tags'])}")
            lines.append(f"Updated: {v['updated_at']}")
            lines.append("")
        if has_more:
            lines.append(f"_More results available. Call again with offset={next_offset}._")
        payload = {
            "total": total,
            "count": len(views),
            "offset": params.offset,
            "has_more": has_more,
            "next_offset": next_offset,
            "results": views,
        }
        return _render(params.response_format, payload, lines)

    return _run_tool(_do)


@mcp.tool(
    name="teamwiki_get_page",
    annotations={
        "title": "Get TeamWiki Page",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def teamwiki_get_page(params: GetPageInput) -> str:
    """Read a single TeamWiki page by ID, or by space_key + slug.

    Use this once you have a page_id (from teamwiki_search_pages or
    teamwiki_create_page) or a known space+slug pair. Supports a 'summary'
    detail level to cheaply check a page's current version/metadata (e.g.
    before calling teamwiki_update_page) without fetching its body.

    Args:
        params (GetPageInput): Validated input containing:
            - page_id (Optional[str]): e.g. "pg_3f9a1c02de"
            - space_key (Optional[str]) + slug (Optional[str]): alternate lookup
            - detail (PageDetail): "full" (default, includes body) or "summary"
            - max_body_length (int): Truncate body beyond this (default 4000)
            - response_format (ResponseFormat): 'markdown' (default) or 'json'

    Returns:
        str: In JSON mode:
        {
            "page_id": str,
            "space_key": str,
            "title": str,
            "slug": str,
            "tags": [str],
            "parent_id": str|null,
            "version": int,
            "created_by": str,
            "created_at": str,
            "updated_by": str,
            "updated_at": str,
            "body": str,                 # only when detail="full"
            "body_truncated": bool,      # only when detail="full"
            "total_body_length": int,    # only present if body_truncated is true
            "truncation_note": str       # only present if body_truncated is true
        }
        Error response: {"error": true, "error_type": "not_found", "message": str}

    Examples:
        - Use when: "Show me the Deployment Runbook" -> page_id from a prior search
        - Use when: "What version is page pg_abc123 on?" -> detail="summary"
        - Don't use when: You only know a keyword, not an ID (use
          teamwiki_search_pages first).

    Error Handling:
        - "not_found" if page_id (or space_key+slug) doesn't resolve to a page.
        - "backend_unavailable" (retryable) if the simulated backend is down.
    """

    def _do() -> str:
        if params.page_id:
            page = _backend.get_page(params.page_id)
        else:
            page = _backend.find_page_by_slug(params.space_key, params.slug)  # type: ignore[arg-type]
        view = _page_view(page, params.detail, params.max_body_length)
        lines = [f"# {view['title']} ({view['page_id']})", ""]
        lines.append(f"- Space: {view['space_key']} | Version: {view['version']}")
        lines.append(f"- Created by {view['created_by']} at {view['created_at']}")
        lines.append(f"- Last updated by {view['updated_by']} at {view['updated_at']}")
        if view["tags"]:
            lines.append(f"- Tags: {', '.join(view['tags'])}")
        lines.append("")
        if params.detail == PageDetail.FULL:
            lines.append(view["body"])
            if view.get("body_truncated"):
                lines.append("")
                lines.append(f"_{view['truncation_note']}_")
        return _render(params.response_format, view, lines)

    return _run_tool(_do)


@mcp.tool(
    name="teamwiki_create_page",
    annotations={
        "title": "Create TeamWiki Page",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
)
async def teamwiki_create_page(params: CreatePageInput) -> str:
    """Create a new TeamWiki page in an existing space.

    Fails with a validation_error if a page with the same title already
    exists in the space (use teamwiki_update_page to modify it instead).
    Always returns JSON (a small confirmation payload) since there is no
    additional structure to gain from a markdown rendering here.

    Args:
        params (CreatePageInput): Validated input containing:
            - space_key (str): Target space, e.g. "ENG"
            - title (str): Unique page title within the space
            - body (str): Markdown content
            - author (str): Username/display name of the creator
            - tags (Optional[List[str]]): Labels for categorization
            - parent_id (Optional[str]): Page to nest this one under

    Returns:
        str: JSON-formatted result:
        Success:
        {
            "page_id": str,       # newly assigned ID, e.g. "pg_3f9a1c02de"
            "space_key": str,
            "title": str,
            "slug": str,
            "version": 1,
            "created_by": str,
            "created_at": str
        }
        Error: {"error": true, "error_type": str, "message": str}

    Examples:
        - Use when: "Create a new page called 'Incident Postmortem' in ENG"
        - Don't use when: A page with that title already exists (fetch it with
          teamwiki_search_pages or teamwiki_get_page, then use
          teamwiki_update_page).

    Error Handling:
        - "not_found" if space_key doesn't exist.
        - "validation_error" if title collides with an existing page in the
          space, or parent_id is invalid/in a different space.
        - "backend_unavailable" (retryable) if the simulated backend is down.
    """

    def _do() -> str:
        page = _backend.create_page(
            params.space_key, params.title, params.body, params.author, params.tags, params.parent_id
        )
        return json.dumps(
            {
                "page_id": page["id"],
                "space_key": page["space_key"],
                "title": page["title"],
                "slug": page["slug"],
                "version": page["version"],
                "created_by": page["created_by"],
                "created_at": page["created_at"],
            },
            indent=2,
        )

    return _run_tool(_do)


@mcp.tool(
    name="teamwiki_update_page",
    annotations={
        "title": "Update TeamWiki Page",
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
        "openWorldHint": False,
    },
)
async def teamwiki_update_page(params: UpdatePageInput) -> str:
    """Update the title, body, and/or tags of an existing TeamWiki page.

    Uses optimistic concurrency: you must pass the page's current
    expected_version (from a prior teamwiki_get_page call). If the page has
    changed since you last read it, the update is rejected with a
    version_conflict error rather than silently overwriting someone else's
    edit - re-fetch the page and retry with the new version if that happens.
    Only fields you provide are changed; omitted fields are left as-is.

    Args:
        params (UpdatePageInput): Validated input containing:
            - page_id (str): Page to update
            - expected_version (int): Version last seen by the caller
            - author (str): Username/display name of the editor
            - title (Optional[str]): New title, if renaming
            - body (Optional[str]): New Markdown content, if changing
            - tags (Optional[List[str]]): Replacement tags, if changing

    Returns:
        str: JSON-formatted result:
        Success:
        {
            "page_id": str,
            "title": str,
            "version": int,        # incremented version after this update
            "updated_by": str,
            "updated_at": str
        }
        Error: {"error": true, "error_type": str, "message": str, ...}
        For "version_conflict" errors, also includes:
            "current_version": int, "updated_by": str, "updated_at": str

    Examples:
        - Use when: "Add a note about the new rollback tool to the Deployment
          Runbook" -> fetch the page first for its version, then update body.
        - Don't use when: You want to create a brand-new page (use
          teamwiki_create_page).

    Error Handling:
        - "not_found" if page_id doesn't exist.
        - "version_conflict" if expected_version is stale.
        - "validation_error" if renaming collides with another page's title.
        - "backend_unavailable" (retryable) if the simulated backend is down.
    """

    def _do() -> str:
        page = _backend.update_page(
            params.page_id,
            params.expected_version,
            params.author,
            params.title,
            params.body,
            params.tags,
        )
        return json.dumps(
            {
                "page_id": page["id"],
                "title": page["title"],
                "version": page["version"],
                "updated_by": page["updated_by"],
                "updated_at": page["updated_at"],
            },
            indent=2,
        )

    return _run_tool(_do)


@mcp.tool(
    name="teamwiki_get_recent_changes",
    annotations={
        "title": "Get Recent TeamWiki Changes",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def teamwiki_get_recent_changes(params: RecentChangesInput) -> str:
    """List recent page-create and page-update activity across TeamWiki.

    Use this for "what changed lately" questions, or to find pages edited
    within a particular time window. This is an activity feed, not a search -
    use teamwiki_search_pages if you need to find pages by topic/keyword
    instead of by recency.

    Args:
        params (RecentChangesInput): Validated input containing:
            - since (Optional[str]): ISO-8601 UTC lower bound, e.g.
              "2024-01-01T00:00:00Z". Omit for no lower bound.
            - space_key (Optional[str]): Restrict to one space
            - limit (int): Max changes to return (default 20, max 100)
            - offset (int): Pagination offset (default 0)
            - response_format (ResponseFormat): 'markdown' (default) or 'json'

    Returns:
        str: In JSON mode:
        {
            "total": int,
            "count": int,
            "offset": int,
            "has_more": bool,
            "next_offset": int|null,
            "changes": [
                {
                    "change_type": "created"|"updated",
                    "page_id": str,
                    "title": str,
                    "space_key": str,
                    "actor": str,       # username who made the change
                    "timestamp": str,   # ISO-8601 UTC
                    "version": int      # page version resulting from this change
                }
            ]
        }
        Changes are ordered most-recent-first.

    Examples:
        - Use when: "What changed in the ENG space this month?"
        - Use when: "Who last touched the Time Off Policy page?" -> filter by
          space_key="HR", then look for title="Time Off Policy"
        - Don't use when: Searching by topic/keyword (use teamwiki_search_pages).

    Error Handling:
        - "not_found" if space_key doesn't match any known space.
        - "validation_error" if 'since' isn't a valid ISO-8601 timestamp
          (also caught earlier by Pydantic field validation).
    """

    def _do() -> str:
        changes = _backend.recent_changes(params.since, params.space_key)
        page_items, total, has_more, next_offset = _paginate(changes, params.limit, params.offset)
        views = [_change_view(c) for c in page_items]
        if not views:
            payload = {
                "total": 0,
                "count": 0,
                "offset": params.offset,
                "has_more": False,
                "next_offset": None,
                "changes": [],
            }
            return _render(params.response_format, payload, ["No matching changes found."])
        lines = [f"# Recent Changes ({total} total, showing {len(views)})", ""]
        for v in views:
            lines.append(
                f"- [{v['timestamp']}] {v['change_type']} **{v['title']}** "
                f"({v['page_id']}, {v['space_key']}) by {v['actor']} -> v{v['version']}"
            )
        if has_more:
            lines.append("")
            lines.append(f"_More changes available. Call again with offset={next_offset}._")
        payload = {
            "total": total,
            "count": len(views),
            "offset": params.offset,
            "has_more": has_more,
            "next_offset": next_offset,
            "changes": views,
        }
        return _render(params.response_format, payload, lines)

    return _run_tool(_do)


if __name__ == "__main__":
    mcp.run()
```

---

## 6. README: Setup and Design Decisions

### Setup

```bash
pip install "mcp[cli]" pydantic
python server.py          # runs over stdio, ready for an MCP client
```

To try it with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector python server.py
```

No environment variables or credentials are required — the backend is a
self-contained in-memory fake, pre-seeded with three spaces (`ENG`, `PROD`,
`HR`) and seven pages so a client has real content to explore immediately.
This server uses **stdio** transport (`mcp.run()` default) since it's
designed as a local, single-client integration; switching to
`mcp.run(transport="streamable_http", port=8000)` is a one-line change if it
ever needs to run as a remote/multi-client service.

### Design Decisions

- **Optimistic concurrency over locking.** `teamwiki_update_page` requires
  `expected_version` rather than supporting a "force overwrite" flag. This
  is the standard safe pattern for concurrent wiki edits (matches how real
  wiki APIs like Confluence version pages) and gives agents a clear signal
  — a `version_conflict` — instead of ever silently discarding someone
  else's edit.
- **`author` is an explicit parameter, not inferred.** Because this server
  has no real authentication layer, `create_page`/`update_page` take an
  `author` string directly. This is called out in both field descriptions
  and this README as a stand-in for what a production deployment would
  derive from the caller's authenticated session — kept explicit here so
  the fake backend's attribution data (`created_by`/`updated_by`) is
  meaningful for evaluation and testing.
- **Two-tier response shaping (`detail` + `response_format`) instead of a
  single "verbosity" knob.** `detail` controls *how much of the resource*
  comes back (snippet vs. full text, metadata vs. body); `response_format`
  controls *how it's serialized* (JSON for programmatic chaining, Markdown
  for direct human/agent readability). Keeping these orthogonal means an
  agent can, e.g., request `detail="summary"` + `response_format="json"` to
  cheaply probe a page's version before an update, without the server
  needing a combinatorial explosion of one-off parameters.
- **A single shared pagination/error/formatting layer.** `_paginate()`,
  `_run_tool()`, and `_render()` are used by every tool; none of the six
  tools re-implements offset math, exception translation, or format
  branching. This keeps the per-tool code focused on business logic and
  guarantees the response envelope (`total`/`count`/`has_more`/etc.) is
  identical everywhere an agent encounters it.
- **Deterministic simulated-failure hook rather than random flakiness.** A
  magic trigger string (`TRIGGER_BACKEND_ERROR`) reproducibly raises a
  `backend_unavailable` error instead of injecting e.g. a 5% random failure
  rate. Random flakiness would make this server's evaluation results
  non-reproducible; a deterministic trigger lets both automated evals and
  manual testing exercise the retry-handling path on demand.
- **No delete tool, no space-creation tool.** Scope was deliberately kept to
  the six requested read/write operations. Adding unrequested destructive or
  administrative capability would expand risk surface without serving the
  stated API surface.

---

## 7. Evaluation Plan

Five realistic agent questions, each independent, read-only-safe to verify
(question 4 requires one write, called out below), and each with the
expected tool-call sequence a well-behaved agent should follow.

**1. "What spaces exist in TeamWiki, and how many pages does the Engineering
space have?"**
- `teamwiki_list_spaces()` → agent scans the returned list, finds `ENG`
  ("Engineering") with `page_count: 3`.
- Expected sequence: 1 call.

**2. "Find the page that explains how to roll back a bad deployment, and
tell me what command to run."**
- `teamwiki_search_pages(query="rollback deployment procedure")` → returns
  "Deployment Runbook" (`ENG`) as the top hit with a snippet mentioning
  rollback.
- `teamwiki_get_page(page_id=<from search>)` → full body reveals the
  command: `make rollback VERSION=<prev>`.
- Expected sequence: 2 calls (search, then get).

**3. "Who wrote the New Hire Onboarding page, and does it reference any
other page an engineering new-hire should also read?"**
- `teamwiki_search_pages(query="new hire onboarding checklist")` → finds the
  page in `HR`, authored by `dave`.
- `teamwiki_get_page(page_id=<from search>)` → body references "the
  On-Call Guide" for engineering joiners.
- Expected sequence: 2 calls; answer: created_by = "dave", referenced page =
  "On-Call Guide".

**4. "Add a `postmortem` tag to the Architecture Overview page without
changing anything else about it — but first, tell me its current version
number so I don't overwrite someone else's edit unknowingly."**
- `teamwiki_get_page(space_key="ENG", slug="architecture-overview",
  detail="summary")` → reveals `version: 1` and confirms no body needed.
- `teamwiki_update_page(page_id=<id>, expected_version=1,
  author="<agent-or-user>", tags=["architecture", "postmortem"])` → returns
  `version: 2`.
- Expected sequence: 2 calls (get for version, then update). *This is the
  one write-requiring evaluation question — used to test the
  optimistic-concurrency flow, not to be included in a strictly read-only
  eval suite.*

**5. "Which Product-space page was most recently changed, and who changed
it?"**
- `teamwiki_get_recent_changes(space_key="PROD")` → returns the change feed
  sorted most-recent-first; agent reads off the first entry's `title` and
  `actor`.
- (Optional cross-check) `teamwiki_search_pages(space_key="PROD",
  detail="metadata")` to confirm the page still exists under that title.
- Expected sequence: 1-2 calls; answer identifies both the page title and
  the actor from the top change-feed entry.

---

LOADED: SKILL.md, mcp_best_practices.md, python_mcp_server.md, evaluation.md
