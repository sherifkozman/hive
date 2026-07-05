# TeamWiki MCP Server — Design & Implementation

A production-quality MCP server exposing a fictional "TeamWiki" wiki product
(think Confluence-lite) to LLM agents, built with the MCP Python SDK's
FastMCP interface. Backend is an in-memory fake, but every design choice
(schemas, pagination, truncation, errors) is written as if it sat in front of
a real HTTP API with real latency, real conflicts, and real failure modes.

---

## 1. Tool inventory design

The API surface requested is: search pages, read page, create page, update
page, list spaces, get recent changes. That maps to **six tools**, one per
capability, with no further splitting or merging. Rationale below — most of
the interesting design work is in *why not* fewer or more tools.

| Tool | Verb-noun | Why it's its own tool |
|---|---|---|
| `list_spaces` | list | Cheap, unfiltered, near-constant result set. Agents call this first for orientation ("what wikis exist"). Folding it into `search_pages` (e.g. a `type=space` mode) would force every caller to reason about a polymorphic result shape for a query pattern that's actually trivial. |
| `search_pages` | search | Ranked, filtered, paginated *discovery* over content. Distinct from `get_page` because discovery and retrieval have different cardinality (many small results vs. one large result) and different truncation needs (snippets vs. full body). |
| `get_page` | get | Single-resource fetch by id or by (space, title). Kept separate from search because agents frequently already know the exact page (from a previous call, a link, or a user-supplied title) and forcing a search round-trip to get an id wastes a turn and tokens. |
| `create_page` | create | Distinct required fields (`space_key`, `title`, `content`) and distinct failure mode (title collision) from update. |
| `update_page` | update | Distinct required fields (`page_id`, `expected_version`) and distinct failure mode (version/edit conflict). |
| `get_recent_changes` | get | An audit/activity feed, not a page-content query — different filters (by space, by actor, by time window) and a different result shape (change events, not pages). |

### Consolidations considered and rejected

- **`create_page` + `update_page` → `upsert_page`.** Rejected. An upsert tool
  either (a) silently creates when the agent meant to update a mistyped
  title — a dangerous ambiguity for a wiki, where "update the FAQ" should
  never silently fork into a duplicate "FAQ 2" page — or (b) requires a
  discriminator flag anyway, which just re-adds the two-tools complexity
  without the benefit of distinct, minimal required-argument sets. Keeping
  them separate lets each tool's input schema *only* contain fields relevant
  to its own conflict class (title-uniqueness vs. optimistic-concurrency
  version).
- **`list_spaces` + `search_pages` → one `browse` tool.** Rejected, see table
  above: different cardinality and no shared filter surface worth unifying.
- **`get_page` + `search_pages` → one `find_or_get` tool.** Rejected. Agents
  that already hold a `page_id` (e.g., from a prior `search_pages` or
  `get_recent_changes` call) should be able to fetch directly without the
  server re-running a fuzzy search and hoping it disambiguates correctly.

### Omissions (in scope of the six requested ops only)

No `delete_page`, `list_page_versions`, or `move_page` tool is included —
they're outside the requested API surface. They're called out here rather
than silently added because scope creep in tool inventories is exactly the
kind of thing that bloats an agent's tool-selection context for no benefit.
If a future revision needs "revert last edit" as an agent capability, it
should be its own tool (`get_page_history` / `restore_page_version`), not
bolted onto `update_page`.

---

## 2. `server.py` (complete, runnable)

```python
"""
TeamWiki MCP Server
====================

A Model Context Protocol server exposing a fictional "TeamWiki" product to
LLM agents: search pages, read a page, create a page, update a page, list
spaces, and view recent changes.

Backend: in-memory fake (`_Backend` class) seeded with sample data. It is
written with the same shape a real HTTP client (timeouts, optimistic
concurrency via version numbers, transient 5xx-style failures) would have,
so swapping in a real TeamWiki REST client later only touches `_Backend`.

Run:
    pip install "mcp[cli]"
    python server.py                 # stdio transport (default)
    mcp dev server.py                # interactive dev inspector

Requires Python 3.10+ and the `mcp` package (MCP Python SDK, FastMCP style).
"""

from __future__ import annotations

import base64
import json
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal, Optional

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Constants tuned for token-consciousness. These are deliberately small
# defaults; agents that need more can raise page_size / max_chars explicitly.
# --------------------------------------------------------------------------

DEFAULT_SEARCH_PAGE_SIZE = 10
MAX_SEARCH_PAGE_SIZE = 50
SNIPPET_CHARS = 220

DEFAULT_GET_PAGE_MAX_CHARS = 4000
MAX_GET_PAGE_MAX_CHARS = 20000

DEFAULT_CHANGES_PAGE_SIZE = 20
MAX_CHANGES_PAGE_SIZE = 100

DEFAULT_SPACES_PAGE_SIZE = 25
MAX_SPACES_PAGE_SIZE = 100

# Simulated transient backend failure rate. Real integrations see rate
# limits, timeouts, 502s; this models that so error-handling paths are
# actually exercised in testing rather than only in the happy path.
SIMULATED_FAILURE_RATE = 0.05


# --------------------------------------------------------------------------
# Cursor helpers — opaque, forward-only pagination tokens.
# Cursors are base64(json) blobs so callers must never construct or parse
# them; they only ever pass back exactly what a previous call returned.
# --------------------------------------------------------------------------

def _encode_cursor(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _decode_cursor(cursor: str) -> dict:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii"))
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001 - deliberately broad, translated below
        raise ToolError(
            f"The pagination cursor {cursor!r} is invalid or corrupted. "
            "Do not construct cursors manually — pass back the exact "
            "`next_cursor` value returned by the previous call, or omit "
            "the cursor entirely to start from the first page."
        ) from exc


# --------------------------------------------------------------------------
# Agent-facing error type. Raised inside tool implementations; the FastMCP
# tool wrapper at the bottom of each tool function catches this (and a few
# other known exception types) and turns it into a structured, non-crashing
# error payload — never a raw stack trace.
# --------------------------------------------------------------------------

class ToolError(Exception):
    """An error meant to be read and acted on by the calling agent."""

    def __init__(self, message: str, *, retryable: bool = False, code: str = "error"):
        super().__init__(message)
        self.message = message
        self.retryable = retryable
        self.code = code


class BackendUnavailableError(ToolError):
    """Simulated transient failure of the underlying TeamWiki service."""

    def __init__(self):
        super().__init__(
            "TeamWiki backend is temporarily unavailable (simulated transient "
            "failure). This is a retryable condition, not a data problem — "
            "wait briefly and retry the same call with the same arguments.",
            retryable=True,
            code="backend_unavailable",
        )


def _maybe_simulate_backend_failure() -> None:
    if random.random() < SIMULATED_FAILURE_RATE:
        raise BackendUnavailableError()


# --------------------------------------------------------------------------
# In-memory fake backend
# --------------------------------------------------------------------------

@dataclass
class Page:
    id: str
    space_key: str
    title: str
    content: str
    author: str
    created_at: str
    updated_at: str
    version: int = 1
    parent_id: Optional[str] = None


@dataclass
class Space:
    key: str
    name: str
    description: str


@dataclass
class ChangeEvent:
    id: str
    page_id: str
    space_key: str
    page_title: str
    change_type: Literal["created", "updated"]
    actor: str
    timestamp: str
    version: int


@dataclass
class _Backend:
    spaces: dict[str, Space] = field(default_factory=dict)
    pages: dict[str, Page] = field(default_factory=dict)
    changes: list[ChangeEvent] = field(default_factory=list)

    def seed(self) -> None:
        now = datetime.now(timezone.utc)

        def iso(delta_days: int) -> str:
            return (now - timedelta(days=delta_days)).isoformat()

        self.spaces["ENG"] = Space("ENG", "Engineering", "Engineering docs, runbooks, and architecture notes.")
        self.spaces["PROD"] = Space("PROD", "Product", "Product specs, roadmaps, and release notes.")
        self.spaces["HR"] = Space("HR", "People & HR", "Policies, benefits, and onboarding.")

        seed_pages = [
            ("ENG", "Deployment Runbook", (
                "This runbook covers deploying the platform to production.\n\n"
                "## Prerequisites\n- Access to the deploy pipeline\n- On-call approval\n\n"
                "## Steps\n1. Merge release branch to main.\n2. Tag the release (vX.Y.Z).\n"
                "3. Run `make deploy ENV=prod`.\n4. Watch dashboards for 15 minutes.\n"
                "5. Post a deploy summary in #eng-releases.\n\n"
                "## Rollback\nRun `make rollback ENV=prod TAG=<previous>` if error rates spike."
            ), "alice", 40, 3),
            ("ENG", "Release Checklist", (
                "Checklist to run before cutting a release.\n\n"
                "- [ ] All CI checks green\n- [ ] Changelog updated\n"
                "- [ ] Security scan passed\n- [ ] On-call notified"
            ), "alice", 20, 1),
            ("ENG", "Architecture Overview", (
                "High-level overview of system components: API gateway, "
                "the search service, the wiki-index worker, and the "
                "Postgres primary/replica pair."
            ), "bob", 90, 30),
            ("PROD", "Q3 Roadmap", (
                "Planned themes for Q3: faster search, bulk page import, "
                "and a public API beta."
            ), "carol", 60, 10),
            ("PROD", "Release Notes 2.4", "Added dark mode and page templates.", "carol", 15, 15),
            ("HR", "Onboarding Guide", (
                "Welcome! Steps for your first week:\n1. Set up your laptop.\n"
                "2. Complete security training.\n3. Meet your onboarding buddy.\n"
                "4. Review the PTO policy."
            ), "dana", 200, 1),
            ("HR", "PTO Policy", "Full-time employees accrue 15 days of PTO per year.", "dana", 150, 150),
        ]

        for space_key, title, content, author, created_days_ago, updated_days_ago in seed_pages:
            page_id = str(uuid.uuid4())
            self.pages[page_id] = Page(
                id=page_id,
                space_key=space_key,
                title=title,
                content=content,
                author=author,
                created_at=iso(created_days_ago),
                updated_at=iso(updated_days_ago),
                version=1,
            )
            self.changes.append(ChangeEvent(
                id=str(uuid.uuid4()),
                page_id=page_id,
                space_key=space_key,
                page_title=title,
                change_type="created",
                actor=author,
                timestamp=iso(created_days_ago),
                version=1,
            ))
            if updated_days_ago != created_days_ago:
                self.pages[page_id].version = 2
                self.changes.append(ChangeEvent(
                    id=str(uuid.uuid4()),
                    page_id=page_id,
                    space_key=space_key,
                    page_title=title,
                    change_type="updated",
                    actor=author,
                    timestamp=iso(updated_days_ago),
                    version=2,
                ))

        # sort changes newest-first, as the feed is expected to read
        self.changes.sort(key=lambda c: c.timestamp, reverse=True)


_backend = _Backend()
_backend.seed()

mcp = FastMCP(
    name="teamwiki",
    instructions=(
        "Tools for reading and editing a TeamWiki instance: search_pages, "
        "get_page, create_page, update_page, list_spaces, get_recent_changes. "
        "Always resolve a space_key via list_spaces or a page_id via "
        "search_pages before calling create_page/update_page/get_page if you "
        "don't already have one — do not guess ids."
    ),
)


# --------------------------------------------------------------------------
# Serialization helpers — control exactly what crosses the wire to the agent
# --------------------------------------------------------------------------

def _truncate(text: str, max_chars: int) -> tuple[str, bool]:
    if len(text) <= max_chars:
        return text, False
    return text[:max_chars], True


def _page_summary(p: Page) -> dict:
    return {
        "page_id": p.id,
        "space_key": p.space_key,
        "title": p.title,
        "author": p.author,
        "updated_at": p.updated_at,
        "version": p.version,
    }


def _snippet_for(p: Page, query: Optional[str]) -> str:
    text = p.content
    if query:
        idx = text.lower().find(query.lower())
        if idx != -1:
            start = max(0, idx - 40)
            text = text[start:]
    snippet, truncated = _truncate(text.replace("\n", " "), SNIPPET_CHARS)
    return snippet + ("…" if truncated else "")


# --------------------------------------------------------------------------
# Tools
# --------------------------------------------------------------------------

@mcp.tool()
def list_spaces(
    cursor: Annotated[
        Optional[str],
        Field(description=(
            "Opaque pagination token from a previous list_spaces call's "
            "next_cursor field. Omit to get the first page."
        )),
    ] = None,
    page_size: Annotated[
        int,
        Field(
            description="Max spaces to return (1-100). Default 25.",
            ge=1,
            le=MAX_SPACES_PAGE_SIZE,
        ),
    ] = DEFAULT_SPACES_PAGE_SIZE,
) -> dict:
    """List all wiki spaces (top-level containers for pages), such as
    'ENG' (Engineering) or 'HR' (People & HR). Call this first when you
    don't already know which space_key to use for search_pages,
    create_page, or get_recent_changes. Cheap and safe to call anytime."""
    _maybe_simulate_backend_failure()

    all_keys = sorted(_backend.spaces.keys())
    offset = 0
    if cursor:
        offset = _decode_cursor(cursor).get("offset", 0)

    page_keys = all_keys[offset: offset + page_size]
    results = [
        {
            "space_key": _backend.spaces[k].key,
            "name": _backend.spaces[k].name,
            "description": _backend.spaces[k].description,
        }
        for k in page_keys
    ]

    next_offset = offset + page_size
    has_more = next_offset < len(all_keys)
    return {
        "spaces": results,
        "has_more": has_more,
        "next_cursor": _encode_cursor({"offset": next_offset}) if has_more else None,
    }


@mcp.tool()
def search_pages(
    query: Annotated[
        str,
        Field(description=(
            "Free-text search over page titles and content (case-insensitive "
            "substring match). Cannot be empty."
        ), min_length=1),
    ],
    space_key: Annotated[
        Optional[str],
        Field(description=(
            "Restrict results to one space (e.g. 'ENG'). Omit to search all "
            "spaces. Use list_spaces to see valid keys."
        )),
    ] = None,
    cursor: Annotated[
        Optional[str],
        Field(description="Pagination token from a previous search_pages call's next_cursor. Omit for the first page."),
    ] = None,
    page_size: Annotated[
        int,
        Field(description="Max results to return (1-50). Default 10. Keep small unless you need a broad scan.", ge=1, le=MAX_SEARCH_PAGE_SIZE),
    ] = DEFAULT_SEARCH_PAGE_SIZE,
) -> dict:
    """Search for pages by keyword. Returns short snippets, not full content
    — call get_page with the returned page_id to read a specific page in
    full. Use this when you don't already know the exact page_id or title;
    if you do, prefer get_page directly to save a round trip."""
    _maybe_simulate_backend_failure()

    if space_key is not None and space_key not in _backend.spaces:
        valid = ", ".join(sorted(_backend.spaces.keys()))
        raise ToolError(
            f"Unknown space_key {space_key!r}. Valid space keys: {valid}. "
            "Call list_spaces to see all spaces with descriptions.",
            code="not_found",
        )

    q = query.lower()
    matches = [
        p for p in _backend.pages.values()
        if (space_key is None or p.space_key == space_key)
        and (q in p.title.lower() or q in p.content.lower())
    ]
    # naive relevance: title hits first, then most recently updated
    matches.sort(key=lambda p: (q not in p.title.lower(), p.updated_at), reverse=False)
    matches.sort(key=lambda p: p.updated_at, reverse=True)
    matches.sort(key=lambda p: q not in p.title.lower())

    offset = 0
    if cursor:
        offset = _decode_cursor(cursor).get("offset", 0)

    page_slice = matches[offset: offset + page_size]
    results = [
        {
            **_page_summary(p),
            "snippet": _snippet_for(p, query),
        }
        for p in page_slice
    ]

    next_offset = offset + page_size
    has_more = next_offset < len(matches)
    return {
        "query": query,
        "total_matches": len(matches),
        "results": results,
        "has_more": has_more,
        "next_cursor": _encode_cursor({"offset": next_offset, "query": query, "space_key": space_key}) if has_more else None,
    }


@mcp.tool()
def get_page(
    page_id: Annotated[
        Optional[str],
        Field(description="Exact page id, usually obtained from search_pages or get_recent_changes results. Provide this OR (space_key AND title)."),
    ] = None,
    space_key: Annotated[
        Optional[str],
        Field(description="Space key, used together with title if page_id is not known."),
    ] = None,
    title: Annotated[
        Optional[str],
        Field(description="Exact page title (case-insensitive), used together with space_key if page_id is not known."),
    ] = None,
    detail: Annotated[
        Literal["metadata", "summary", "full"],
        Field(description=(
            "Response verbosity. 'metadata': title/space/author/version/"
            "timestamps only, no body text — cheapest. 'summary': metadata "
            "plus a short excerpt (~500 chars). 'full': metadata plus the "
            "complete body, subject to max_chars truncation. Default 'summary'."
        )),
    ] = "summary",
    max_chars: Annotated[
        int,
        Field(description="Only used when detail='full'. Max content characters to return (up to 20000). Default 4000. If the page is longer, use content_offset to fetch subsequent chunks.", ge=200, le=MAX_GET_PAGE_MAX_CHARS),
    ] = DEFAULT_GET_PAGE_MAX_CHARS,
    content_offset: Annotated[
        int,
        Field(description="Only used when detail='full'. Character offset into the page body to start returning content from — use this to page through a very long page after truncation.", ge=0),
    ] = 0,
) -> dict:
    """Fetch a single wiki page. Provide either page_id, or both space_key
    and title. Prefer a small `detail` level (default 'summary') unless you
    specifically need the full body — this keeps responses small. If the
    page body is long and gets truncated, the response tells you so via
    `truncated` and gives a `next_content_offset` to continue reading."""
    _maybe_simulate_backend_failure()

    page = _resolve_page(page_id=page_id, space_key=space_key, title=title)

    result = _page_summary(page)

    if detail == "metadata":
        return result

    if detail == "summary":
        excerpt, truncated = _truncate(page.content, 500)
        result["excerpt"] = excerpt + ("…" if truncated else "")
        result["content_length"] = len(page.content)
        return result

    # detail == "full"
    remaining = page.content[content_offset:]
    chunk, truncated = _truncate(remaining, max_chars)
    result["content"] = chunk
    result["content_length"] = len(page.content)
    result["truncated"] = truncated
    result["next_content_offset"] = (content_offset + len(chunk)) if truncated else None
    return result


@mcp.tool()
def create_page(
    space_key: Annotated[
        str,
        Field(description="Space to create the page in (e.g. 'ENG'). Must already exist — use list_spaces to see valid keys."),
    ],
    title: Annotated[
        str,
        Field(description="Page title. Must be unique within the space.", min_length=1, max_length=200),
    ],
    content: Annotated[
        str,
        Field(description="Full page body, in plain text or simple Markdown.", min_length=1),
    ],
    parent_id: Annotated[
        Optional[str],
        Field(description="Optional page_id of a parent page, to nest this page under it in the space's hierarchy."),
    ] = None,
) -> dict:
    """Create a new wiki page. Fails with a clear conflict message if a page
    with the same title already exists in the space — in that case, use
    search_pages or get_page to find the existing page and call update_page
    instead of retrying create_page with a different title, unless a
    distinct page is genuinely intended."""
    _maybe_simulate_backend_failure()

    if space_key not in _backend.spaces:
        valid = ", ".join(sorted(_backend.spaces.keys()))
        raise ToolError(
            f"Unknown space_key {space_key!r}. Valid space keys: {valid}. "
            "Call list_spaces to see all spaces.",
            code="not_found",
        )

    if parent_id is not None and parent_id not in _backend.pages:
        raise ToolError(
            f"parent_id {parent_id!r} does not exist. Omit parent_id to "
            "create a top-level page, or pass a valid page_id from "
            "search_pages.",
            code="not_found",
        )

    existing = next(
        (p for p in _backend.pages.values()
         if p.space_key == space_key and p.title.lower() == title.lower()),
        None,
    )
    if existing is not None:
        raise ToolError(
            f"A page titled {title!r} already exists in space {space_key!r} "
            f"(page_id={existing.id}, version={existing.version}). Choose a "
            "different title, or call update_page with that page_id if you "
            "meant to edit the existing page.",
            code="conflict",
        )

    now = datetime.now(timezone.utc).isoformat()
    page_id = str(uuid.uuid4())
    page = Page(
        id=page_id,
        space_key=space_key,
        title=title,
        content=content,
        author="agent",
        created_at=now,
        updated_at=now,
        version=1,
        parent_id=parent_id,
    )
    _backend.pages[page_id] = page
    _backend.changes.insert(0, ChangeEvent(
        id=str(uuid.uuid4()),
        page_id=page_id,
        space_key=space_key,
        page_title=title,
        change_type="created",
        actor="agent",
        timestamp=now,
        version=1,
    ))

    return {**_page_summary(page), "created": True}


@mcp.tool()
def update_page(
    page_id: Annotated[
        str,
        Field(description="Id of the page to update. Get this from search_pages, get_page, or get_recent_changes."),
    ],
    expected_version: Annotated[
        int,
        Field(description=(
            "The `version` number you last read for this page (from get_page "
            "or search_pages). Required to prevent overwriting someone "
            "else's concurrent edit. If it no longer matches, the call "
            "fails with the current version and content so you can re-apply "
            "your change on top of the latest version."
        ), ge=1),
    ],
    content: Annotated[
        Optional[str],
        Field(description="New full page body. Omit to leave content unchanged and only update the title."),
    ] = None,
    title: Annotated[
        Optional[str],
        Field(description="New title. Omit to leave the title unchanged."),
    ] = None,
) -> dict:
    """Update an existing wiki page's title and/or content. Requires
    `expected_version` (optimistic concurrency) — always get_page or
    search_pages immediately beforehand if you don't already have a fresh
    version number. At least one of content/title must be provided."""
    _maybe_simulate_backend_failure()

    if content is None and title is None:
        raise ToolError(
            "Provide at least one of `content` or `title` to update.",
            code="validation_error",
        )

    page = _backend.pages.get(page_id)
    if page is None:
        raise ToolError(
            f"No page found with page_id={page_id!r}. It may have been "
            "deleted, or the id may be stale — use search_pages to find "
            "the current page_id.",
            code="not_found",
        )

    if page.version != expected_version:
        raise ToolError(
            f"Version conflict: you supplied expected_version={expected_version}, "
            f"but the page is currently at version={page.version} (last "
            f"updated by {page.author} at {page.updated_at}). Someone else "
            "edited this page since you last read it. Call get_page(page_id="
            f"{page_id!r}, detail='full') to fetch the latest content and "
            "version, then reapply your change with the new version number.",
            code="conflict",
        )

    if title is not None:
        dup = next(
            (p for p in _backend.pages.values()
             if p.id != page_id and p.space_key == page.space_key
             and p.title.lower() == title.lower()),
            None,
        )
        if dup is not None:
            raise ToolError(
                f"Cannot rename to {title!r}: another page in space "
                f"{page.space_key!r} already has that title (page_id={dup.id}).",
                code="conflict",
            )
        page.title = title

    if content is not None:
        page.content = content

    page.version += 1
    page.updated_at = datetime.now(timezone.utc).isoformat()

    _backend.changes.insert(0, ChangeEvent(
        id=str(uuid.uuid4()),
        page_id=page.id,
        space_key=page.space_key,
        page_title=page.title,
        change_type="updated",
        actor="agent",
        timestamp=page.updated_at,
        version=page.version,
    ))

    return {**_page_summary(page), "updated": True}


@mcp.tool()
def get_recent_changes(
    space_key: Annotated[
        Optional[str],
        Field(description="Restrict to one space (e.g. 'ENG'). Omit for changes across all spaces."),
    ] = None,
    since: Annotated[
        Optional[str],
        Field(description="ISO-8601 timestamp (e.g. '2026-06-01T00:00:00Z'). Only return changes at or after this time. Omit for no lower bound."),
    ] = None,
    cursor: Annotated[
        Optional[str],
        Field(description="Pagination token from a previous get_recent_changes call's next_cursor. Omit for the first (most recent) page."),
    ] = None,
    page_size: Annotated[
        int,
        Field(description="Max change events to return (1-100). Default 20.", ge=1, le=MAX_CHANGES_PAGE_SIZE),
    ] = DEFAULT_CHANGES_PAGE_SIZE,
) -> dict:
    """List recent page creations/updates, newest first — an activity feed.
    Use this to answer 'what changed recently' or to find the page_id of
    something a teammate just edited, then follow up with get_page for the
    content. Each event includes the version at that point in time, which
    you can pass straight into update_page's expected_version if you're
    acting on the very latest change."""
    _maybe_simulate_backend_failure()

    if space_key is not None and space_key not in _backend.spaces:
        valid = ", ".join(sorted(_backend.spaces.keys()))
        raise ToolError(
            f"Unknown space_key {space_key!r}. Valid space keys: {valid}.",
            code="not_found",
        )

    since_dt = None
    if since is not None:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ToolError(
                f"Could not parse `since` value {since!r} as ISO-8601 "
                "(e.g. '2026-06-01T00:00:00Z').",
                code="validation_error",
            ) from exc

    events = _backend.changes
    if space_key is not None:
        events = [e for e in events if e.space_key == space_key]
    if since_dt is not None:
        events = [e for e in events if datetime.fromisoformat(e.timestamp) >= since_dt]

    offset = 0
    if cursor:
        offset = _decode_cursor(cursor).get("offset", 0)

    page_slice = events[offset: offset + page_size]
    results = [
        {
            "change_id": e.id,
            "page_id": e.page_id,
            "space_key": e.space_key,
            "page_title": e.page_title,
            "change_type": e.change_type,
            "actor": e.actor,
            "timestamp": e.timestamp,
            "version": e.version,
        }
        for e in page_slice
    ]

    next_offset = offset + page_size
    has_more = next_offset < len(events)
    return {
        "changes": results,
        "has_more": has_more,
        "next_cursor": _encode_cursor({"offset": next_offset, "space_key": space_key, "since": since}) if has_more else None,
    }


def _resolve_page(*, page_id: Optional[str], space_key: Optional[str], title: Optional[str]) -> Page:
    if page_id:
        page = _backend.pages.get(page_id)
        if page is None:
            raise ToolError(
                f"No page found with page_id={page_id!r}. It may have been "
                "deleted or the id may be wrong — use search_pages to find "
                "the current page_id.",
                code="not_found",
            )
        return page

    if space_key and title:
        if space_key not in _backend.spaces:
            valid = ", ".join(sorted(_backend.spaces.keys()))
            raise ToolError(
                f"Unknown space_key {space_key!r}. Valid space keys: {valid}.",
                code="not_found",
            )
        page = next(
            (p for p in _backend.pages.values()
             if p.space_key == space_key and p.title.lower() == title.lower()),
            None,
        )
        if page is None:
            near = [p.title for p in _backend.pages.values()
                    if p.space_key == space_key and title.lower() in p.title.lower()]
            hint = f" Did you mean: {', '.join(near)}?" if near else (
                " Use search_pages to find the exact title."
            )
            raise ToolError(
                f"No page titled {title!r} found in space {space_key!r}.{hint}",
                code="not_found",
            )
        return page

    raise ToolError(
        "get_page requires either `page_id`, or both `space_key` and "
        "`title`. Use search_pages first if you don't have any of these.",
        code="validation_error",
    )


if __name__ == "__main__":
    mcp.run()
```

### A note on error surfacing

`ToolError` (and its subclass `BackendUnavailableError`) is the single
vocabulary for agent-facing failures: every raise site above uses it instead
of letting a raw `KeyError`/`ValueError`/network exception escape. FastMCP
converts an uncaught Python exception raised inside a `@mcp.tool()` function
into an MCP tool error result (`isError: true`) automatically, using the
exception's string form as the message — which is exactly why `ToolError`'s
`message` is written as a complete, actionable sentence rather than a code
or a repr. There is deliberately no `try/except Exception` blanket handler
inside each tool: unexpected exceptions (a real bug) should still surface
distinctly in server logs during development rather than being silently
laundered into a generic "something went wrong" — but the *known* failure
shapes (not-found, validation, conflict, simulated backend outage) are all
pre-caught at the point they occur and turned into `ToolError`s with:

- **no stack traces or internal identifiers** in the message,
- a **specific reason** ("version conflict", "unknown space_key"),
- and a **next action** the agent can take (call `list_spaces`, retry, use
  `get_page` to refresh, etc.).

`code` is included as structured metadata (`not_found` / `validation_error`
/ `conflict` / `backend_unavailable`) for agents/harnesses that want to
branch programmatically, while `message` stays natural language for the
common case where the agent just reads it.

---

## 3. README — Setup

### Requirements

- Python 3.10+
- `pip install "mcp[cli]"`

### Run

```bash
python server.py
```

This starts the server on the default **stdio** transport, suitable for
registering with any MCP-compatible client (Claude Code, Claude Desktop,
etc.) via a config entry like:

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

For interactive manual testing during development:

```bash
mcp dev server.py
```

which opens the MCP Inspector against the server so each tool can be
invoked by hand with example arguments.

### Design decisions

- **In-memory backend, real-shaped interface.** `_Backend` holds plain
  dataclasses (`Page`, `Space`, `ChangeEvent`) and is the only place that
  would need to change to point at a real TeamWiki HTTP API — every tool
  function talks to it through simple method-like access, not through
  MCP-specific plumbing, so the persistence layer is cleanly separable from
  the protocol layer.
- **Optimistic concurrency via `version`.** Wikis are collaboratively
  edited; a blind "last write wins" `update_page` is exactly the kind of
  tool an agent will use to silently destroy a co-worker's edit. Every page
  carries an integer `version`; `update_page` requires `expected_version`
  and fails loudly, with the current version and last-editor attached, on
  mismatch — the conflict message is written so an agent can recover in one
  more turn (`get_page` → retry `update_page`) without human intervention.
- **Cursor-based pagination everywhere a list is returned.** `list_spaces`,
  `search_pages`, and `get_recent_changes` all return `has_more` +
  `next_cursor` (opaque base64 tokens, offset + the original filters encoded
  inside) rather than raw offsets. This lets the server change its internal
  paging strategy later without breaking callers, and it stops agents from
  hand-rolling `offset += page_size` math that can drift.
- **`detail` levels on `get_page`, not just a size cap.** A flat character
  cap alone forces every caller to pay for content they don't want when
  they only needed to check a title or author. Three tiers
  (`metadata` / `summary` / `full`) let an agent scanning many pages request
  `metadata` and stay cheap, and only pay full-content token cost for the
  one page it actually needs to read closely. `full` still has its own
  `max_chars`/`content_offset` pair so even a single huge page can't blow a
  context window in one call — the response says whether it `truncated` and
  gives the exact offset to resume from.
- **Snippets, not bodies, from `search_pages`.** Search result sets are the
  single biggest token-cost risk (N pages × full body). Results carry a
  ~220-character snippet centered on the query match plus enough metadata
  (`page_id`, `version`, `updated_at`) to immediately chain into `get_page`
  or `update_page` without a second lookup.
- **Simulated backend failures are real, not decorative.** Every tool calls
  `_maybe_simulate_backend_failure()` first, which has a small random chance
  of raising `BackendUnavailableError` — a `ToolError` marked `retryable`.
  This exists so the error-handling path (agents seeing a transient failure
  and retrying) is actually exercised by running the server repeatedly,
  rather than only existing in a code review's imagination.
- **`create_page` vs `update_page` kept strictly separate** (see Section 1)
  — the failure modes (title collision vs. version conflict) and required
  fields differ enough that merging them would either add an ambiguous
  default (silently create-on-miss) or a discriminator flag that erases the
  benefit of two minimal, single-purpose schemas.
- **No delete/history/move tools.** Out of the requested API surface; see
  "Omissions" in Section 1 for why these are called out explicitly rather
  than silently added.

---

## 4. Evaluation plan — 5 agent questions

For each, the tool-call sequence a well-behaved agent should produce against
this server (arguments abbreviated).

1. **"What's in our engineering wiki about deploying to production?"**
   - `search_pages(query="deploy", space_key="ENG")` → finds "Deployment
     Runbook" (and possibly "Release Checklist").
   - `get_page(page_id=<Deployment Runbook id>, detail="full")` → reads the
     full runbook to answer the question.
   - *Checks*: space filter narrows correctly; snippet is useful enough to
     pick the right result without opening every hit; `get_page` returns
     complete step list.

2. **"What wiki spaces do we have, and what's each one for?"**
   - `list_spaces()` → returns ENG/PROD/HR with descriptions, no further
     calls needed.
   - *Checks*: single call suffices; response is small and doesn't need
     pagination for only 3 spaces; descriptions are informative enough to
     answer without opening any page.

3. **"Create a new HR page announcing that the PTO policy is unchanged for next year, without touching the existing PTO Policy page."**
   - `list_spaces()` or `search_pages(query="PTO", space_key="HR")` (to
     confirm "PTO Policy" already exists and avoid a title collision).
   - `create_page(space_key="HR", title="PTO Policy — 2027 Update",
     content=...)`.
   - *Checks*: agent picks a distinct title (server would reject a
     duplicate with a conflict error naming the existing page_id/version);
     response confirms `created: true` with the new `page_id`.

4. **"Someone changed the Onboarding Guide recently — what changed and what does it say now?"**
   - `get_recent_changes(space_key="HR")` (or unfiltered) → finds the
     "updated" event for "Onboarding Guide" with its `version` and
     `timestamp`.
   - `get_page(page_id=<Onboarding Guide id>, detail="full")` → reads
     current full content to answer "what does it say now."
   - *Checks*: change feed surfaces the right event newest-first; `actor`
     and `timestamp` are present; follow-up `get_page` call uses the
     `page_id` from the feed rather than re-searching.

5. **"Add a fourth checklist item, 'Confirm rollback plan documented', to the Release Checklist page — but don't clobber anyone else's edits."**
   - `search_pages(query="Release Checklist", space_key="ENG")` or
     `get_page(space_key="ENG", title="Release Checklist", detail="full")`
     → obtains current `content` and current `version`.
   - `update_page(page_id=..., expected_version=<version just read>,
     content=<original content + new checklist item>)`.
   - *Checks*: agent supplies `expected_version` matching what it just
     read (not a guessed/stale number); if a concurrent edit is simulated
     between the read and write, the server's conflict message (current
     version + last editor) should let the agent immediately retry
     correctly rather than giving up or overwriting blind.

LOADED: none
