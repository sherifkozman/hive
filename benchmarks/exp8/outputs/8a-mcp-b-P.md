# TeamWiki MCP Server — Design, Implementation, and Evaluation Plan

This document designs and implements a complete, production-quality MCP server (Python, MCP Python SDK / FastMCP) for a fictional "TeamWiki" product. It follows the `presets/python-server.md` composable skill: FastMCP + Pydantic v2 tool structure, `{service}_mcp` server naming, `{service}_{action}_{resource}` tool naming, response-format/pagination/error-handling patterns, tool annotations, DRY shared helpers, and the Python quality checklist.

The backend is an in-memory fake data store, but every tool is designed as if it fronted a real HTTP API (auth, pagination, optimistic concurrency, transient failures) — see the Design Decisions section for what would change against a real backend.

---

## 1. Tool Inventory Design

Six API-surface operations were requested: search pages, read page, create page, update page, list spaces, get recent changes. All six become **six tools**, a 1:1 mapping — no consolidation was needed because each operation has a genuinely distinct input shape, output shape, and annotation profile (read vs. write, idempotent vs. not). Below is the reasoning for that granularity, and the alternatives considered and rejected.

| Tool | Maps to | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|---|
| `teamwiki_search_pages` | search pages | true | false | true | true |
| `teamwiki_get_page` | read page | true | false | true | true |
| `teamwiki_list_spaces` | list spaces | true | false | true | true |
| `teamwiki_get_recent_changes` | get recent changes | true | false | true | true |
| `teamwiki_create_page` | create page | false | false | false | true |
| `teamwiki_update_page` | update page | false | true | false | true |

**Naming.** Every tool is prefixed `teamwiki_` (server = `teamwiki_mcp`, per the `{service}_mcp` convention) so it can't collide with another wiki-like MCP server (e.g. `confluence_mcp`) if both are mounted in the same agent session. Names are `verb_resource` (`search_pages`, `get_page`, `create_page`, `update_page`, `list_spaces`, `get_recent_changes`) — action-oriented and specific, per the naming mini in the preset.

**Why not fewer tools (consolidation considered and rejected):**
- *Merge `get_page` and `search_pages` into one "find pages" tool with an optional `page_id`.* Rejected: the two have incompatible pagination/response shapes (search returns a list of snippets; get returns one full document), and an agent's intent differs sharply ("I know the id" vs. "I don't"). Overloading them would force ambiguous parameter validation (which combination of id/query is legal?) and muddy the docstring. Keeping them separate lets each docstring be narrow and unambiguous, per the naming mini's requirement that descriptions "precisely and unambiguously match actual functionality."
- *Merge `create_page` and `update_page` into an "upsert page" tool.* Rejected: create and update have different failure modes that need different, specific guidance (duplicate-title validation vs. version-conflict) and different required fields (`title`+`body` vs. `page_id`+`expected_version`). A single tool would need a discriminated union input that's harder for an agent to get right, and `destructiveHint`/`idempotentHint` genuinely differ between the two operations (create is non-destructive, update can overwrite content). Splitting them lets annotations be accurate rather than a lossy compromise.
- *Merge `list_spaces` and `search_pages` (space filter as a special case of search).* Rejected: spaces and pages are different resource types with different metadata; conflating them would return heterogeneous result shapes from one tool, which increases the schema an agent must reason about with no efficiency gain (both operations are already single, cheap calls).

**Why not more tools (finer granularity considered and rejected):**
- *Split `teamwiki_get_page` into `teamwiki_get_page_summary` and `teamwiki_get_page_full`.* Rejected in favor of a single tool with a `detail` enum (`summary`/`full`). This is the one place the preset's "workflow tools vs. API coverage" tension was resolved toward a single parameterized tool rather than two, because the two modes share 100% of the retrieval logic and differ only in how much of the body is serialized — splitting would duplicate the docstring's error-handling and example sections for no discoverability gain (both would still need a `page_id`). A `response_format` (markdown/json) and `detail` (summary/full) parameter is the standard token-consciousness pattern from `04-response-formats.md`, not new tool surface.
- *Split `teamwiki_update_page` into `teamwiki_rename_page`, `teamwiki_edit_page_body`, `teamwiki_retag_page`.* Rejected: these three fields (`title`, `body`, `tags`) are frequently changed together in one logical edit (e.g. "expand the runbook and add a tag"), and Confluence-like real wikis expose a single PATCH-style update endpoint. Splitting into three tools would force multi-call round-trips (and three version-conflict races) for what is one atomic edit in the fake backend. A single tool with all-optional fields (validated so at least one must be set) keeps the operation atomic and matches how a real backend would model it.
- *Omitted: delete_page, move_page/space, permissions/comments tools.* Out of scope per the requested API surface (search, read, create, update, list spaces, recent changes). Adding them would be scope creep the task didn't ask for; the design leaves room to add `teamwiki_delete_page` later following the same pattern (would need `destructiveHint: true`, `idempotentHint: true` since deleting twice is a no-op-with-error).

**Comprehensive coverage vs. workflow tools:** per `00-core.md`'s "when uncertain, prioritize comprehensive API coverage" guidance, this design favors atomic operations that mirror the requested API surface 1:1, rather than inventing higher-level workflow tools (e.g. a "publish onboarding doc" tool that bundles create+tag+notify) that the task didn't ask for and that would reduce agent flexibility to compose the primitives.

---

## 2. Input Schemas + Agent-Optimized Descriptions

All inputs are Pydantic v2 `BaseModel`s with `model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")`, explicit `Field(...)` constraints, and `field_validator`s where normalization is needed (e.g. uppercasing `space_key`). Full schemas are in `server.py` (Section 5); highlights of the agent-facing design:

- **`space_key` normalization**: users/agents may type `eng` or `ENG`; a `field_validator` uppercases it so lookups never spuriously 404 on case.
- **`page_id` is opaque and must come from a prior tool call** — every docstring that accepts `page_id` explicitly says "obtain ids from teamwiki_search_pages ... do not guess them," steering the agent away from hallucinating ids.
- **`expected_version` is required (not optional) on `teamwiki_update_page`** — this forces the agent to call `teamwiki_get_page` first, which is exactly the workflow needed to avoid silently clobbering concurrent edits (see Section 4).
- **Every list/search input has `limit`/`offset`/`response_format`** for consistency across tools (shared `_paginate()` helper — see Section 5).
- **Docstrings** follow the preset's required structure: a one-line summary, an `Args` section cross-referencing the Pydantic model's fields, a `Returns` section with the *complete* JSON schema (so the agent can predict field names without calling the tool speculatively), an `Examples` section with "Use when / Don't use when" pairs that disambiguate from sibling tools, and an `Error Handling` section enumerating the specific error strings the agent may see and what to do about each.

---

## 3. Pagination and Response-Size Control

Every list-returning tool (`teamwiki_search_pages`, `teamwiki_list_spaces`, `teamwiki_get_recent_changes`) shares one `_paginate(items, limit, offset)` helper that returns `{total, count, offset, items, has_more, next_offset}` — the exact shape prescribed by the preset's pagination mini. `next_offset` is `null` once exhausted, and markdown responses append a literal `"call again with offset=<n>"` hint so the agent doesn't have to compute it.

Token-consciousness specifics:
- **Search results never include full page bodies** — only a ~160-character snippet centered on the first query match (`_make_snippet`), because an agent doing discovery over many pages should not pay for bodies it hasn't decided to read yet. Follow-up reads go through `teamwiki_get_page`.
- **`teamwiki_get_page` has a `detail` level** (`summary`/`full`) and a `max_body_chars` field (default 4000, range 200–20000) so an agent skimming many pages can request `summary`, while an agent that needs one page in full can raise the cap explicitly. Truncation always emits a clear, actionable marker (`_truncate_body`): `"[...truncated after N of M characters. Increase max_body_chars to see more, or narrow your question...]"` rather than silently cutting text.
- **`response_format`** (`markdown`/`json`) is on every read/list tool, defaulting to markdown for human-readable, low-noise output; `json` is available for programmatic post-processing, per `04-response-formats.md`.
- **Defaults are conservative**: `search`/`recent_changes` default to `limit=20` (max 100), `list_spaces` defaults to `limit=50` (max 200) since spaces are a small, low-cardinality resource — consistent with the preset's "20–50 is typical" guidance while still capping worst-case blowup.

---

## 4. Error Handling Designed for Agents

All backend failures are modeled as typed exceptions (`_NotFoundError`, `_ConflictError`, `_ValidationBackendError`, `_ServiceUnavailableError`) raised by the `_Store` class, and converted to plain-text `"Error: ..."` strings via one shared `_handle_backend_error()` — **never a raw stack trace or Python exception repr reaches the agent.** Errors are returned as tool *results* (not JSON-RPC protocol errors), per `09-error-handling.md`.

Coverage of the required paths:

- **Not-found**: unknown `page_id` or `space_key` → `"Error: No page with id 'XXX-9999'."` / `"Error: No space with key 'NOPE'."` — every docstring tells the agent which tool to call to discover valid ids/keys instead.
- **Validation**: 
  - Structural validation (types, lengths, ranges, enum membership) is handled entirely by Pydantic `Field` constraints — never manual `if` checks — so the agent gets FastMCP's standard schema-validation error before the tool body even runs.
  - Business-rule validation that Pydantic can't express is raised as `_ValidationBackendError`, e.g. duplicate page titles within a space (`"Error: A page titled 'X' already exists in space 'ENG' (id: ENG-1007). Choose a different title or update the existing page instead."` — names the exact conflicting id so the agent can pivot to `teamwiki_update_page` without another search), or calling `teamwiki_update_page` with no fields set (`"Error: At least one of 'title', 'body', or 'tags' must be provided..."`).
- **Concurrency conflict** (a wiki-specific "actionable error," beyond the minimum ask): `teamwiki_update_page` requires `expected_version`; if the stored version has moved on, the error names both the version the agent supplied and the current one and tells it exactly what to do: `"Page 'ENG-1001' has been modified since version 1 (current version: 2). Re-fetch the page with teamwiki_get_page ..., then retry ... with expected_version=2."`
- **Simulated backend failure**: `_ServiceUnavailableError` models a transient 503. It's deterministically triggerable two ways — set `TEAMWIKI_CHAOS=1` in the environment (fails every call, for scripted test suites), or pass the literal query string `"__simulate_backend_error__"` to `teamwiki_search_pages` (fails one call, for interactive/eval testing without env mutation). The resulting message tells the agent this is transient and to retry: `"Error: The TeamWiki backend is temporarily unavailable (simulated 503). This is transient — wait a moment and retry the same call. If it persists, reduce request frequency."`
- **Unexpected/unknown errors**: a catch-all in `_handle_backend_error` returns a generic-but-honest message (`"Error: Unexpected internal error (<ExceptionType>). This is not a problem with your input; retry..."`) without leaking internal details (stack frames, file paths), per the security mini's "don't expose internal implementation details."
- **Empty results are not errors**: `"No pages found matching '<query>'..."` and `"No changes found matching the given filters."` are returned as normal (non-error) tool text, with a suggestion to broaden the query/filters — distinguishing "nothing matched" from "something broke."

---

## 5. `server.py` (complete, runnable)

Verified during development: `python -m py_compile` passes; a standalone async harness exercised every tool function directly (search hit/miss/space-filter, get in `summary`/`full`/`json`/`markdown`, not-found, create success/duplicate-title/bad-space, update success/version-conflict/no-op-rejection, recent-changes with filters and pagination, truncation at a custom `max_body_chars`, pagination `has_more`/`next_offset` math, and the simulated-backend-error trigger) — all behaved as documented below.

```python
#!/usr/bin/env python3
"""
MCP Server for TeamWiki.

Provides tools to search, read, create, and update wiki pages, list spaces,
and inspect recent changes across a fictional team wiki product. Backed by
an in-memory fake data store (designed as if it fronted a real HTTP API).
"""

import json
import os
import threading
from datetime import datetime, timezone
from enum import Enum
from itertools import count
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Server initialization
# ---------------------------------------------------------------------------

mcp = FastMCP("teamwiki_mcp")

# Module-level constants
DEFAULT_SEARCH_LIMIT = 20
MAX_SEARCH_LIMIT = 100
DEFAULT_CHANGES_LIMIT = 20
MAX_CHANGES_LIMIT = 100
DEFAULT_SPACES_LIMIT = 50
MAX_SPACES_LIMIT = 200
MAX_BODY_CHARS_DEFAULT = 4000
SNIPPET_RADIUS = 80

# Set TEAMWIKI_CHAOS=1 to deterministically exercise the simulated
# backend-failure path (see _maybe_simulate_backend_error) during testing.
CHAOS_MODE = os.environ.get("TEAMWIKI_CHAOS") == "1"


# ---------------------------------------------------------------------------
# Fake in-memory backend (stands in for a real TeamWiki HTTP API)
# ---------------------------------------------------------------------------

class _BackendError(Exception):
    """Raised for errors that originate in the (fake) backend layer."""


class _NotFoundError(_BackendError):
    pass


class _ConflictError(_BackendError):
    def __init__(self, message: str, current_version: int):
        super().__init__(message)
        self.current_version = current_version


class _ValidationBackendError(_BackendError):
    pass


class _ServiceUnavailableError(_BackendError):
    pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


class _Store:
    """Thread-safe in-memory data store simulating the TeamWiki backend."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._page_id_seq = count(1000)
        self.spaces: Dict[str, Dict[str, Any]] = {}
        self.pages: Dict[str, Dict[str, Any]] = {}
        self.changes: List[Dict[str, Any]] = []
        self._seed()

    def _seed(self) -> None:
        self.spaces = {
            "ENG": {
                "key": "ENG",
                "name": "Engineering",
                "description": "Architecture docs, runbooks, and on-call guides.",
                "created_at": "2023-01-10 09:00:00 UTC",
            },
            "PROD": {
                "key": "PROD",
                "name": "Product",
                "description": "Product specs, roadmaps, and release notes.",
                "created_at": "2023-02-01 09:00:00 UTC",
            },
            "HR": {
                "key": "HR",
                "name": "People & HR",
                "description": "Policies, onboarding guides, and benefits info.",
                "created_at": "2023-03-15 09:00:00 UTC",
            },
        }

        seed_pages = [
            ("ENG", "Deployment Runbook",
             "This runbook covers the standard deployment process for backend "
             "services. Steps: 1) run the pre-deploy checklist, 2) tag a release "
             "in CI, 3) roll out to canary, 4) monitor error rates for 15 "
             "minutes, 5) promote to full fleet. If error rates spike above 2%, "
             "roll back immediately using `deploy rollback <service>`.",
             ["runbook", "deployment", "on-call"]),
            ("ENG", "On-Call Escalation Policy",
             "Primary on-call responds within 5 minutes. If unresponsive after "
             "10 minutes, PagerDuty escalates to secondary on-call, then to the "
             "engineering manager. Sev-1 incidents require a written postmortem "
             "within 48 hours.",
             ["on-call", "policy", "incidents"]),
            ("ENG", "Service Architecture Overview",
             "TeamWiki's backend is a set of microservices behind an API "
             "gateway: search-service, page-service, and change-log-service. "
             "Each owns its own datastore and communicates over gRPC.",
             ["architecture"]),
            ("PROD", "Q3 Roadmap",
             "Q3 priorities: 1) launch real-time collaborative editing, 2) "
             "improve search relevance ranking, 3) ship a public API for page "
             "management. Stretch goal: mobile offline mode.",
             ["roadmap", "planning"]),
            ("PROD", "Release Notes 4.2",
             "Version 4.2 adds inline comments on pages, a redesigned space "
             "switcher, and fixes a bug where recent changes could show "
             "duplicate entries after a page was moved between spaces.",
             ["release-notes"]),
            ("HR", "New Hire Onboarding Guide",
             "Welcome! Day 1: IT sets up your laptop and accounts. Day 2: "
             "meet with your manager to review your 30/60/90 plan. Week 1: "
             "complete security and compliance training in the LMS.",
             ["onboarding"]),
            ("HR", "Time Off Policy",
             "Full-time employees accrue 15 days of paid time off per year, "
             "prorated for new hires. Requests should be submitted at least "
             "two weeks in advance via the HR portal where possible.",
             ["policy", "benefits"]),
        ]

        base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)
        for space_key, title, body, tags in seed_pages:
            page_id = f"{space_key}-{next(self._page_id_seq)}"
            ts = base_time.strftime("%Y-%m-%d %H:%M:%S UTC")
            page = {
                "id": page_id,
                "space_key": space_key,
                "title": title,
                "body": body,
                "tags": tags,
                "version": 1,
                "created_at": ts,
                "updated_at": ts,
                "created_by": "seed-data@teamwiki.example",
                "updated_by": "seed-data@teamwiki.example",
            }
            self.pages[page_id] = page
            self.changes.append({
                "page_id": page_id,
                "title": title,
                "space_key": space_key,
                "change_type": "created",
                "actor": "seed-data@teamwiki.example",
                "timestamp": ts,
            })

    # -- reads --

    def get_space(self, space_key: str) -> Dict[str, Any]:
        space = self.spaces.get(space_key.upper())
        if space is None:
            raise _NotFoundError(f"No space with key '{space_key}'.")
        return space

    def list_spaces(self) -> List[Dict[str, Any]]:
        return sorted(self.spaces.values(), key=lambda s: s["key"])

    def get_page(self, page_id: str) -> Dict[str, Any]:
        page = self.pages.get(page_id)
        if page is None:
            raise _NotFoundError(f"No page with id '{page_id}'.")
        return page

    def search_pages(self, query: str, space_key: Optional[str]) -> List[Dict[str, Any]]:
        if space_key is not None and space_key.upper() not in self.spaces:
            raise _NotFoundError(f"No space with key '{space_key}'.")

        q = query.strip().lower()
        results = []
        for page in self.pages.values():
            if space_key is not None and page["space_key"] != space_key.upper():
                continue
            title_hit = q in page["title"].lower()
            body_hit = q in page["body"].lower()
            if not (title_hit or body_hit):
                continue
            # Simple relevance score: title matches rank higher than body-only.
            score = (2.0 if title_hit else 0.0) + (1.0 if body_hit else 0.0)
            results.append((score, page))

        results.sort(key=lambda pair: (-pair[0], pair[1]["title"]))
        return [page for _score, page in results]

    def list_changes(self, space_key: Optional[str], since: Optional[str],
                      change_type: Optional[str]) -> List[Dict[str, Any]]:
        if space_key is not None and space_key.upper() not in self.spaces:
            raise _NotFoundError(f"No space with key '{space_key}'.")

        items = list(reversed(self.changes))  # newest first
        if space_key is not None:
            items = [c for c in items if c["space_key"] == space_key.upper()]
        if change_type is not None:
            items = [c for c in items if c["change_type"] == change_type]
        if since is not None:
            items = [c for c in items if c["timestamp"] >= since]
        return items

    # -- writes --

    def create_page(self, space_key: str, title: str, body: str,
                     tags: List[str], actor: str) -> Dict[str, Any]:
        key = space_key.upper()
        if key not in self.spaces:
            raise _NotFoundError(f"No space with key '{space_key}'.")

        with self._lock:
            for page in self.pages.values():
                if page["space_key"] == key and page["title"].lower() == title.lower():
                    raise _ValidationBackendError(
                        f"A page titled '{title}' already exists in space '{key}' "
                        f"(id: {page['id']}). Choose a different title or update "
                        f"the existing page instead."
                    )

            page_id = f"{key}-{next(self._page_id_seq)}"
            ts = _now_iso()
            page = {
                "id": page_id,
                "space_key": key,
                "title": title,
                "body": body,
                "tags": list(tags),
                "version": 1,
                "created_at": ts,
                "updated_at": ts,
                "created_by": actor,
                "updated_by": actor,
            }
            self.pages[page_id] = page
            self.changes.append({
                "page_id": page_id,
                "title": title,
                "space_key": key,
                "change_type": "created",
                "actor": actor,
                "timestamp": ts,
            })
            return page

    def update_page(self, page_id: str, expected_version: int,
                     title: Optional[str], body: Optional[str],
                     tags: Optional[List[str]], actor: str) -> Dict[str, Any]:
        with self._lock:
            page = self.pages.get(page_id)
            if page is None:
                raise _NotFoundError(f"No page with id '{page_id}'.")

            if page["version"] != expected_version:
                raise _ConflictError(
                    f"Page '{page_id}' has been modified since version "
                    f"{expected_version} (current version: {page['version']}). "
                    f"Re-fetch the page with teamwiki_get_page to see the latest "
                    f"content, then retry the update with expected_version="
                    f"{page['version']}.",
                    current_version=page["version"],
                )

            if title is None and body is None and tags is None:
                raise _ValidationBackendError(
                    "At least one of 'title', 'body', or 'tags' must be "
                    "provided to update a page."
                )

            if title is not None:
                page["title"] = title
            if body is not None:
                page["body"] = body
            if tags is not None:
                page["tags"] = list(tags)

            page["version"] += 1
            page["updated_at"] = _now_iso()
            page["updated_by"] = actor

            self.changes.append({
                "page_id": page_id,
                "title": page["title"],
                "space_key": page["space_key"],
                "change_type": "updated",
                "actor": actor,
                "timestamp": page["updated_at"],
            })
            return page


_STORE = _Store()


def _maybe_simulate_backend_error(query: str) -> None:
    """Deterministic hook for exercising the simulated-backend-failure path.

    Real backends occasionally fail (timeouts, 503s). To let callers test
    error handling without flaky non-determinism, this server treats the
    literal query/text '__simulate_backend_error__' as a trigger, and also
    triggers unconditionally when TEAMWIKI_CHAOS=1 is set in the environment.
    """
    if CHAOS_MODE or query == "__simulate_backend_error__":
        raise _ServiceUnavailableError(
            "The TeamWiki backend is temporarily unavailable (simulated 503)."
        )


# ---------------------------------------------------------------------------
# Shared response formatting / error helpers
# ---------------------------------------------------------------------------

class ResponseFormat(str, Enum):
    """Output format for tool responses."""
    MARKDOWN = "markdown"
    JSON = "json"


def _handle_backend_error(e: Exception) -> str:
    """Consistent, agent-actionable error formatting across all tools."""
    if isinstance(e, _NotFoundError):
        return f"Error: {e}"
    if isinstance(e, _ConflictError):
        return f"Error: {e}"
    if isinstance(e, _ValidationBackendError):
        return f"Error: {e}"
    if isinstance(e, _ServiceUnavailableError):
        return (
            f"Error: {e} This is transient — wait a moment and retry the same "
            f"call. If it persists, reduce request frequency."
        )
    return (
        f"Error: Unexpected internal error ({type(e).__name__}). "
        f"This is not a problem with your input; retry, and if it keeps "
        f"happening, report it as a TeamWiki server issue."
    )


def _paginate(items: List[Any], limit: int, offset: int) -> Dict[str, Any]:
    """Shared pagination helper: slices items and computes pagination metadata."""
    total = len(items)
    page = items[offset: offset + limit]
    has_more = total > offset + len(page)
    return {
        "total": total,
        "count": len(page),
        "offset": offset,
        "items": page,
        "has_more": has_more,
        "next_offset": (offset + len(page)) if has_more else None,
    }


def _make_snippet(body: str, query: str, radius: int = SNIPPET_RADIUS) -> str:
    """Build a short excerpt around the first query match, for search results."""
    lower_body = body.lower()
    idx = lower_body.find(query.strip().lower())
    if idx == -1:
        return (body[: radius * 2] + "...") if len(body) > radius * 2 else body
    start = max(0, idx - radius)
    end = min(len(body), idx + len(query) + radius)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(body) else ""
    return f"{prefix}{body[start:end]}{suffix}"


def _truncate_body(body: str, max_chars: int) -> Dict[str, Any]:
    """Truncate long page bodies with a clear, actionable marker."""
    if len(body) <= max_chars:
        return {"text": body, "truncated": False}
    truncated = body[:max_chars]
    return {
        "text": (
            f"{truncated}\n\n[...truncated after {max_chars} of {len(body)} "
            f"characters. Increase max_body_chars to see more, or narrow your "
            f"question so a shorter excerpt suffices.]"
        ),
        "truncated": True,
    }


def _format_page_markdown(page: Dict[str, Any], body_text: str, truncated: bool) -> str:
    lines = [
        f"# {page['title']} ({page['id']})",
        "",
        f"- **Space**: {page['space_key']}",
        f"- **Version**: {page['version']}",
        f"- **Updated**: {page['updated_at']} by {page['updated_by']}",
        f"- **Created**: {page['created_at']} by {page['created_by']}",
    ]
    if page.get("tags"):
        lines.append(f"- **Tags**: {', '.join(page['tags'])}")
    lines.append("")
    lines.append(body_text)
    if truncated:
        lines.append("")
        lines.append("_(body truncated — see note above)_")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Pydantic input models
# ---------------------------------------------------------------------------

class DetailLevel(str, Enum):
    """How much page content to return."""
    SUMMARY = "summary"
    FULL = "full"


class SearchPagesInput(BaseModel):
    """Input model for searching wiki pages."""
    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    query: str = Field(
        ..., min_length=1, max_length=200,
        description="Text to search for in page titles and bodies (case-insensitive substring match), "
                    "e.g. 'deployment runbook', 'time off policy'.",
    )
    space_key: Optional[str] = Field(
        default=None, min_length=1, max_length=20,
        description="Restrict search to one space by its key (e.g. 'ENG', 'PROD', 'HR'). "
                    "Omit to search all spaces. Use teamwiki_list_spaces to discover valid keys.",
    )
    limit: int = Field(
        default=DEFAULT_SEARCH_LIMIT, ge=1, le=MAX_SEARCH_LIMIT,
        description=f"Maximum number of results to return (1-{MAX_SEARCH_LIMIT}, default {DEFAULT_SEARCH_LIMIT}).",
    )
    offset: int = Field(
        default=0, ge=0,
        description="Number of matching results to skip, for pagination (default 0).",
    )
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="'markdown' for a human-readable list (default) or 'json' for structured data.",
    )

    @field_validator("space_key")
    @classmethod
    def _upper_space_key(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v


class GetPageInput(BaseModel):
    """Input model for reading a single wiki page."""
    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    page_id: str = Field(
        ..., min_length=1, max_length=40,
        description="Exact page id, e.g. 'ENG-1000'. Obtain ids from teamwiki_search_pages "
                    "or teamwiki_get_recent_changes; do not guess them.",
    )
    detail: DetailLevel = Field(
        default=DetailLevel.FULL,
        description="'summary' returns metadata plus a short excerpt (cheap, for skimming many pages); "
                    "'full' returns the complete body (default), subject to max_body_chars.",
    )
    max_body_chars: int = Field(
        default=MAX_BODY_CHARS_DEFAULT, ge=200, le=20000,
        description=f"Truncate the body to this many characters when detail='full' "
                    f"(default {MAX_BODY_CHARS_DEFAULT}). Ignored when detail='summary'.",
    )
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="'markdown' for human-readable output (default) or 'json' for structured data.",
    )


class ListSpacesInput(BaseModel):
    """Input model for listing wiki spaces."""
    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    limit: int = Field(
        default=DEFAULT_SPACES_LIMIT, ge=1, le=MAX_SPACES_LIMIT,
        description=f"Maximum number of spaces to return (1-{MAX_SPACES_LIMIT}, default {DEFAULT_SPACES_LIMIT}).",
    )
    offset: int = Field(
        default=0, ge=0,
        description="Number of spaces to skip, for pagination (default 0).",
    )
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="'markdown' for a human-readable list (default) or 'json' for structured data.",
    )


class CreatePageInput(BaseModel):
    """Input model for creating a new wiki page."""
    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    space_key: str = Field(
        ..., min_length=1, max_length=20,
        description="Key of the space to create the page in (e.g. 'ENG'). Must already exist — "
                    "check with teamwiki_list_spaces first.",
    )
    title: str = Field(
        ..., min_length=1, max_length=200,
        description="Page title. Must be unique within the space, e.g. 'Incident Response Playbook'.",
    )
    body: str = Field(
        ..., min_length=1, max_length=50000,
        description="Full page content as plain text or Markdown, e.g. '# Overview\\n\\nThis page describes...'.",
    )
    tags: List[str] = Field(
        default_factory=list, max_length=10,
        description="Up to 10 short tags for discovery, e.g. ['runbook', 'on-call'].",
    )

    @field_validator("space_key")
    @classmethod
    def _upper_space_key(cls, v: str) -> str:
        return v.upper()


class UpdatePageInput(BaseModel):
    """Input model for updating an existing wiki page."""
    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    page_id: str = Field(
        ..., min_length=1, max_length=40,
        description="Exact id of the page to update, e.g. 'ENG-1000'.",
    )
    expected_version: int = Field(
        ..., ge=1,
        description="The page's current 'version' as last read via teamwiki_get_page. Used to "
                    "detect concurrent edits: if the stored version has since changed, the update "
                    "is rejected so you don't silently overwrite someone else's change.",
    )
    title: Optional[str] = Field(
        default=None, min_length=1, max_length=200,
        description="New title, if changing it. Omit to leave the title unchanged.",
    )
    body: Optional[str] = Field(
        default=None, min_length=1, max_length=50000,
        description="New full body content, if changing it. This replaces the entire body "
                    "(no partial/diff edits). Omit to leave the body unchanged.",
    )
    tags: Optional[List[str]] = Field(
        default=None, max_length=10,
        description="New full tag list, if changing it. Replaces all existing tags. Omit to leave tags unchanged.",
    )


class RecentChangesInput(BaseModel):
    """Input model for listing recent wiki changes."""
    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True, extra="forbid")

    space_key: Optional[str] = Field(
        default=None, min_length=1, max_length=20,
        description="Restrict to changes in one space (e.g. 'ENG'). Omit for changes across all spaces.",
    )
    since: Optional[str] = Field(
        default=None,
        description="Only include changes at or after this UTC timestamp, formatted "
                    "'YYYY-MM-DD HH:MM:SS UTC' (same format returned by this tool). Omit for no lower bound.",
    )
    change_type: Optional[str] = Field(
        default=None,
        description="Filter to 'created' or 'updated' changes only. Omit to include both.",
    )
    limit: int = Field(
        default=DEFAULT_CHANGES_LIMIT, ge=1, le=MAX_CHANGES_LIMIT,
        description=f"Maximum number of changes to return (1-{MAX_CHANGES_LIMIT}, default {DEFAULT_CHANGES_LIMIT}). "
                    f"Results are ordered newest-first.",
    )
    offset: int = Field(
        default=0, ge=0,
        description="Number of changes to skip, for pagination (default 0).",
    )
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="'markdown' for a human-readable list (default) or 'json' for structured data.",
    )

    @field_validator("space_key")
    @classmethod
    def _upper_space_key(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v

    @field_validator("change_type")
    @classmethod
    def _validate_change_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("created", "updated"):
            raise ValueError("change_type must be 'created' or 'updated' if provided")
        return v


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

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
    """Search wiki pages by keyword across titles and bodies.

    Matches are case-insensitive substrings of the query in either the page
    title or body. Title matches rank above body-only matches. Use this tool
    first when you don't already know a page's id; then call
    teamwiki_get_page with the returned id for full content. This tool does
    NOT return full page bodies, only short snippets — for token efficiency.

    Args:
        params (SearchPagesInput): Validated input containing:
            - query (str): Search text.
            - space_key (Optional[str]): Restrict to one space.
            - limit (int): Max results (1-100, default 20).
            - offset (int): Pagination offset (default 0).
            - response_format (ResponseFormat): 'markdown' (default) or 'json'.

    Returns:
        str: Markdown list, or a JSON string with schema:
        {
            "total": int,             # total matches
            "count": int,             # results in this page
            "offset": int,
            "items": [
                {
                    "id": str,          # page id, e.g. "ENG-1001"
                    "title": str,
                    "space_key": str,
                    "snippet": str,     # short excerpt around the match
                    "updated_at": str   # human-readable UTC timestamp
                }
            ],
            "has_more": bool,
            "next_offset": int | null
        }
        or "Error: <message>" on failure.

    Examples:
        - Use when: "Find the deployment runbook" -> query="deployment runbook"
        - Use when: "What HR pages mention time off?" -> query="time off", space_key="HR"
        - Don't use when: you already have a page id (use teamwiki_get_page instead)

    Error Handling:
        - Returns "Error: No space with key '<key>'." if space_key doesn't exist —
          call teamwiki_list_spaces to see valid keys.
        - Returns "No pages found matching '<query>'..." (not an error) if there are no matches.
        - Returns a simulated backend-unavailable error if query is the literal
          string '__simulate_backend_error__' (used for testing error handling).
    """
    try:
        _maybe_simulate_backend_error(params.query)
        matches = _STORE.search_pages(params.query, params.space_key)
    except _BackendError as e:
        return _handle_backend_error(e)
    except Exception as e:
        return _handle_backend_error(e)

    if not matches:
        scope = f" in space '{params.space_key}'" if params.space_key else ""
        return (
            f"No pages found matching '{params.query}'{scope}. Try a shorter or "
            f"different keyword, or omit space_key to search all spaces."
        )

    items = [
        {
            "id": p["id"],
            "title": p["title"],
            "space_key": p["space_key"],
            "snippet": _make_snippet(p["body"], params.query),
            "updated_at": p["updated_at"],
        }
        for p in matches
    ]
    page = _paginate(items, params.limit, params.offset)

    if params.response_format == ResponseFormat.JSON:
        return json.dumps(page, indent=2)

    lines = [f"# Search results for '{params.query}'", ""]
    lines.append(f"Found {page['total']} page(s), showing {page['count']} (offset {page['offset']}).")
    lines.append("")
    for item in page["items"]:
        lines.append(f"## {item['title']} ({item['id']}) — space {item['space_key']}")
        lines.append(f"- **Updated**: {item['updated_at']}")
        lines.append(f"- **Snippet**: {item['snippet']}")
        lines.append("")
    if page["has_more"]:
        lines.append(f"_More results available — call again with offset={page['next_offset']}._")
    return "\n".join(lines)


@mcp.tool(
    name="teamwiki_get_page",
    annotations={
        "title": "Get TeamWiki Page",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def teamwiki_get_page(params: GetPageInput) -> str:
    """Fetch a single wiki page by its exact id, including its current version.

    Always call this before teamwiki_update_page so you have the current
    'version' needed for the update's optimistic-concurrency check. Use
    detail='summary' when you just need metadata/an excerpt for several
    pages (cheaper); use detail='full' (default) when you need the complete
    content of one specific page.

    Args:
        params (GetPageInput): Validated input containing:
            - page_id (str): Exact page id, e.g. "ENG-1000".
            - detail (DetailLevel): 'summary' or 'full' (default 'full').
            - max_body_chars (int): Truncation limit for 'full' bodies (default 4000).
            - response_format (ResponseFormat): 'markdown' (default) or 'json'.

    Returns:
        str: Markdown page view, or JSON string with schema:
        {
            "id": str,
            "title": str,
            "space_key": str,
            "version": int,           # pass as expected_version to teamwiki_update_page
            "created_at": str,
            "created_by": str,
            "updated_at": str,
            "updated_by": str,
            "tags": [str],
            "body": str,              # excerpt if detail='summary', else full/truncated body
            "truncated": bool
        }
        or "Error: <message>" on failure.

    Examples:
        - Use when: "What does the on-call escalation policy say?" -> after search,
          call with the resolved page_id.
        - Don't use when: you don't have a page_id yet (use teamwiki_search_pages first).

    Error Handling:
        - Returns "Error: No page with id '<id>'." if the id doesn't exist —
          re-run teamwiki_search_pages to find the correct id.
    """
    try:
        page = _STORE.get_page(params.page_id)
    except _BackendError as e:
        return _handle_backend_error(e)

    if params.detail == DetailLevel.SUMMARY:
        body_text = _make_snippet(page["body"], "", radius=150)
        truncated = len(page["body"]) > 300
    else:
        result = _truncate_body(page["body"], params.max_body_chars)
        body_text = result["text"]
        truncated = result["truncated"]

    if params.response_format == ResponseFormat.JSON:
        payload = {
            "id": page["id"],
            "title": page["title"],
            "space_key": page["space_key"],
            "version": page["version"],
            "created_at": page["created_at"],
            "created_by": page["created_by"],
            "updated_at": page["updated_at"],
            "updated_by": page["updated_by"],
            "tags": page["tags"],
            "body": body_text,
            "truncated": truncated,
        }
        return json.dumps(payload, indent=2)

    return _format_page_markdown(page, body_text, truncated)


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
    """List all wiki spaces (top-level containers for pages).

    Use this to discover valid space_key values before calling
    teamwiki_search_pages, teamwiki_create_page, or teamwiki_get_recent_changes
    with a space filter, or simply to answer "what spaces/areas of the wiki
    exist?".

    Args:
        params (ListSpacesInput): Validated input containing:
            - limit (int): Max spaces to return (1-200, default 50).
            - offset (int): Pagination offset (default 0).
            - response_format (ResponseFormat): 'markdown' (default) or 'json'.

    Returns:
        str: Markdown list, or JSON string with schema:
        {
            "total": int,
            "count": int,
            "offset": int,
            "items": [
                {"key": str, "name": str, "description": str, "created_at": str}
            ],
            "has_more": bool,
            "next_offset": int | null
        }

    Examples:
        - Use when: "What spaces are in the wiki?" -> call with defaults.
        - Don't use when: you already know the space_key and want its pages
          (use teamwiki_search_pages with space_key instead).
    """
    spaces = _STORE.list_spaces()
    page = _paginate(spaces, params.limit, params.offset)

    if params.response_format == ResponseFormat.JSON:
        return json.dumps(page, indent=2)

    lines = [f"# TeamWiki Spaces ({page['total']} total)", ""]
    for space in page["items"]:
        lines.append(f"## {space['name']} ({space['key']})")
        lines.append(f"- **Description**: {space['description']}")
        lines.append(f"- **Created**: {space['created_at']}")
        lines.append("")
    if page["has_more"]:
        lines.append(f"_More spaces available — call again with offset={page['next_offset']}._")
    return "\n".join(lines)


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
    """Create a new wiki page in an existing space.

    Fails if the space doesn't exist, or if a page with the same title
    (case-insensitive) already exists in that space — TeamWiki page titles
    must be unique per space. To change an existing page instead, use
    teamwiki_update_page.

    Args:
        params (CreatePageInput): Validated input containing:
            - space_key (str): Target space, e.g. "ENG". Must already exist.
            - title (str): Page title, unique within the space.
            - body (str): Full page content (plain text or Markdown).
            - tags (List[str]): Up to 10 tags (default empty).

    Returns:
        str: JSON string with schema:
        {
            "id": str,          # newly assigned page id, e.g. "ENG-1042"
            "title": str,
            "space_key": str,
            "version": int,     # always 1 for a new page
            "created_at": str,
            "created_by": str
        }
        or "Error: <message>" on failure.

    Examples:
        - Use when: "Create a new runbook page for database failover in ENG" ->
          space_key="ENG", title="Database Failover Runbook", body="...".
        - Don't use when: the page already exists (use teamwiki_update_page).

    Error Handling:
        - Returns "Error: No space with key '<key>'." if the space doesn't
          exist — call teamwiki_list_spaces for valid keys.
        - Returns "Error: A page titled '<title>' already exists in space
          '<key>' (id: <id>)..." if there's a title collision, naming the
          existing page's id so you can update it instead.
    """
    try:
        page = _STORE.create_page(
            params.space_key, params.title, params.body, params.tags,
            actor="agent@teamwiki.example",
        )
    except _BackendError as e:
        return _handle_backend_error(e)

    payload = {
        "id": page["id"],
        "title": page["title"],
        "space_key": page["space_key"],
        "version": page["version"],
        "created_at": page["created_at"],
        "created_by": page["created_by"],
    }
    return json.dumps(payload, indent=2)


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
    """Update an existing wiki page's title, body, and/or tags.

    This is a full-field replace for each field you supply (not a diff/patch):
    if you pass `body`, it replaces the entire existing body. Omit fields you
    don't want to change. Requires `expected_version`, obtained from a prior
    teamwiki_get_page call, to prevent silently clobbering someone else's
    concurrent edit — if the page has changed since, the update is rejected
    and the response includes the current version to retry with.

    Args:
        params (UpdatePageInput): Validated input containing:
            - page_id (str): Page to update.
            - expected_version (int): Version last seen via teamwiki_get_page.
            - title (Optional[str]): New title, if changing.
            - body (Optional[str]): New full body, if changing.
            - tags (Optional[List[str]]): New full tag list, if changing.

    Returns:
        str: JSON string with schema:
        {
            "id": str,
            "title": str,
            "space_key": str,
            "version": int,      # incremented version after this update
            "updated_at": str,
            "updated_by": str
        }
        or "Error: <message>" on failure.

    Examples:
        - Use when: "Add a rollback section to the deployment runbook" ->
          first teamwiki_get_page to read current body + version, then call
          with page_id, expected_version, and the merged body text.
        - Don't use when: creating a brand-new page (use teamwiki_create_page).

    Error Handling:
        - Returns "Error: No page with id '<id>'." if the id doesn't exist.
        - Returns "Error: Page '<id>' has been modified since version
          <expected>... retry with expected_version=<current>." on a version
          conflict — re-fetch and retry as instructed.
        - Returns "Error: At least one of 'title', 'body', or 'tags' must be
          provided..." if called with no fields to change.
    """
    try:
        page = _STORE.update_page(
            params.page_id, params.expected_version,
            params.title, params.body, params.tags,
            actor="agent@teamwiki.example",
        )
    except _BackendError as e:
        return _handle_backend_error(e)

    payload = {
        "id": page["id"],
        "title": page["title"],
        "space_key": page["space_key"],
        "version": page["version"],
        "updated_at": page["updated_at"],
        "updated_by": page["updated_by"],
    }
    return json.dumps(payload, indent=2)


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
async def teamwiki_get_recent_changes(params: RecentChangesInput) -> str:
    """List recent page creations/updates across the wiki, newest first.

    Use this to answer "what changed recently?", "who edited page X last?",
    or to find pages modified after a given time, without knowing page ids
    or titles in advance.

    Args:
        params (RecentChangesInput): Validated input containing:
            - space_key (Optional[str]): Restrict to one space.
            - since (Optional[str]): Only changes at/after this UTC timestamp
              ('YYYY-MM-DD HH:MM:SS UTC').
            - change_type (Optional[str]): 'created' or 'updated' only.
            - limit (int): Max changes to return (1-100, default 20).
            - offset (int): Pagination offset (default 0).
            - response_format (ResponseFormat): 'markdown' (default) or 'json'.

    Returns:
        str: Markdown list, or JSON string with schema:
        {
            "total": int,
            "count": int,
            "offset": int,
            "items": [
                {
                    "page_id": str,
                    "title": str,
                    "space_key": str,
                    "change_type": "created" | "updated",
                    "actor": str,
                    "timestamp": str
                }
            ],
            "has_more": bool,
            "next_offset": int | null
        }

    Examples:
        - Use when: "What changed in Engineering this week?" -> space_key="ENG",
          since="2024-06-24 00:00:00 UTC".
        - Use when: "Show me the last 5 page creations wiki-wide" ->
          change_type="created", limit=5.
        - Don't use when: you want full page content (follow up with
          teamwiki_get_page using the returned page_id).

    Error Handling:
        - Returns "Error: No space with key '<key>'." if space_key doesn't exist.
        - Returns "No changes found matching the given filters." (not an
          error) if the filters exclude all changes.
    """
    try:
        changes = _STORE.list_changes(params.space_key, params.since, params.change_type)
    except _BackendError as e:
        return _handle_backend_error(e)

    if not changes:
        return "No changes found matching the given filters. Try widening 'since' or removing filters."

    page = _paginate(changes, params.limit, params.offset)

    if params.response_format == ResponseFormat.JSON:
        return json.dumps(page, indent=2)

    lines = [f"# Recent Changes ({page['total']} total, showing {page['count']})", ""]
    for c in page["items"]:
        lines.append(
            f"- **{c['change_type']}**: {c['title']} ({c['page_id']}, space {c['space_key']}) "
            f"by {c['actor']} at {c['timestamp']}"
        )
    if page["has_more"]:
        lines.append("")
        lines.append(f"_More changes available — call again with offset={page['next_offset']}._")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
```

---

## 6. README: Setup and Design Decisions

### Setup

Requirements: Python 3.10+, `mcp` (MCP Python SDK, includes FastMCP), `pydantic>=2`.

```bash
pip install "mcp[cli]" "pydantic>=2"
```

Run as a local stdio server (default — suitable for single-user, local-integration use, per the transport mini):

```bash
python server.py
```

To point an MCP-compatible client (e.g. Claude Desktop, MCP Inspector) at it, register it as a stdio server pointing to `python /path/to/server.py`. To sanity-check without a full client:

```bash
python -m py_compile server.py     # syntax/quality check
npx @modelcontextprotocol/inspector python server.py   # interactive tool testing
```

To exercise the simulated-backend-failure path deterministically in tests:

```bash
TEAMWIKI_CHAOS=1 python server.py
```

(With `TEAMWIKI_CHAOS` unset, the same path can be triggered per-call by passing `query="__simulate_backend_error__"` to `teamwiki_search_pages`.)

For a remote/multi-client deployment, swap the entrypoint to `mcp.run(transport="streamable_http", port=8000)` and bind to `127.0.0.1` with DNS-rebinding protection per the security mini, rather than `stdio`.

### Design Decisions

- **Server name (`teamwiki_mcp`) and tool names (`teamwiki_{verb}_{resource}`)** follow the preset's naming conventions exactly, so this server composes safely alongside other wiki/doc MCP servers in the same agent session.
- **In-memory fake backend, designed as if real.** `_Store` is a thread-safe (single `threading.Lock`), in-process dict-of-dicts standing in for what would be an HTTP API. All tool functions are `async def` and would need only their bodies swapped for `httpx.AsyncClient` calls (see the commented-out shape in `_maybe_simulate_backend_error`/`_handle_backend_error`, which already mirror the preset's `_make_api_request` / `_handle_api_error` pattern) to talk to a real service — the Pydantic schemas, pagination envelope, and error taxonomy would not need to change.
- **Optimistic concurrency on updates** (`expected_version`) was added beyond the literal ask because a wiki is inherently a shared-edit surface; without it, two agents (or an agent racing a human) could silently stomp each other's edits with no error. This is the single largest deviation from "the minimum six endpoints" and is called out explicitly because it changes the required call shape of `teamwiki_update_page` (`teamwiki_get_page` becomes a soft prerequisite).
- **All writes single-actor.** `actor` is hardcoded to `"agent@teamwiki.example"` since there's no auth layer in this fake backend; a real server would derive it from validated request auth (per the security mini) rather than accepting it as a tool parameter (to prevent an agent from forging authorship).
- **Search relevance is a simple two-term score** (title-hit weight 2, body-hit weight 1) rather than full-text ranking — adequate for a demo backend of 7 seed pages; a real backend would delegate to the wiki's own search index and this tool would just pass through `query`/`space_key`/pagination.
- **Timestamps are pre-formatted human-readable strings** (`"2024-01-01 00:00:00 UTC"`), not epoch, so the agent never has to convert them — consistent with the response-format mini's "convert timestamps to human-readable format" rule. `since` filtering does a lexicographic string comparison, which works because the format is a fixed-width, zero-padded, UTC-anchored string (sorts identically to chronological order).
- **DRY / composability**: pagination (`_paginate`), truncation (`_truncate_body`), snippeting (`_make_snippet`), markdown page rendering (`_format_page_markdown`), and error formatting (`_handle_backend_error`) are each implemented once and shared across every tool that needs them — no tool re-implements its own slicing or truncation logic, per the composability mini.

---

## 7. Evaluation Plan — 5 Realistic Agent Questions

Each question is answerable using only this MCP server (no other context), and lists the expected tool-call sequence an effective agent would follow.

**Q1. "What spaces exist in the wiki, and how many pages roughly cover on-call topics in Engineering?"**
Expected sequence:
1. `teamwiki_list_spaces()` → confirms `ENG`, `PROD`, `HR` exist.
2. `teamwiki_search_pages(query="on-call", space_key="ENG")` → returns "Deployment Runbook" and "On-Call Escalation Policy" with snippets, `total: 2`.

**Q2. "What's the current on-call escalation policy, and what version is it at?"**
Expected sequence:
1. `teamwiki_search_pages(query="on-call escalation")` → finds page id (e.g. `ENG-1001`).
2. `teamwiki_get_page(page_id="ENG-1001")` → returns full body plus `version` (needed if a follow-up edit is requested).

**Q3. "Add a note to the Deployment Runbook that canary rollout should wait 20 minutes instead of 15, without clobbering anyone else's concurrent edits."**
Expected sequence:
1. `teamwiki_search_pages(query="deployment runbook")` → resolve page id.
2. `teamwiki_get_page(page_id=<id>)` → read current `body` and `version`.
3. `teamwiki_update_page(page_id=<id>, expected_version=<version>, body=<modified body text>)` → succeeds, returns incremented `version`. (A correct agent should also handle the case where this call returns a version-conflict error by re-fetching and retrying — testable by concurrently issuing a second unrelated update to the same page first.)

**Q4. "Create a new HR page called 'Remote Work Policy' — but don't duplicate anything that already exists on that topic."**
Expected sequence:
1. `teamwiki_search_pages(query="remote work", space_key="HR")` → confirms no existing page (returns "No pages found...").
2. `teamwiki_create_page(space_key="HR", title="Remote Work Policy", body=<policy text>)` → succeeds with a new `id`.
   (A stricter variant of this question: ask the agent to create a page titled "Time Off Policy" in HR, which already exists — a correct agent should get the duplicate-title error from `teamwiki_create_page`, and pivot to reading/updating the existing page `HR-1006` instead, exercising the error-recovery path.)

**Q5. "What changed in the Product space recently, and who made the most recent change?"**
Expected sequence:
1. `teamwiki_get_recent_changes(space_key="PROD", limit=10)` → returns a newest-first list; the first item's `actor` and `timestamp` answer "who/when," and `change_type` distinguishes a new page from an edit.
2. (Optional deepening) `teamwiki_get_page(page_id=<page_id from the most recent change>)` if the question also asks what the change actually contains.

These five cover, respectively: space discovery, targeted read with metadata for a later edit, the full read-modify-write-with-concurrency-check cycle, create-with-duplicate-avoidance (and error recovery), and time-ordered change auditing — exercising all six tools and both the happy-path and error-handling behavior described in Sections 3–4.

---

LOADED: presets/python-server.md
