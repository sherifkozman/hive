# T2 — `GET /fetch-preview`

Implements a FastAPI endpoint that fetches a caller-supplied URL server-side
and returns `{"status": ..., "title": ..., "content_type": ...}`.

Design notes / edge cases handled:

- **SSRF.** This endpoint's entire job is "server, fetch a URL a stranger
  gave you" — the canonical SSRF shape. Before any request is made: (1)
  structural validation restricts the scheme to `http`/`https` and requires
  a hostname, (2) the hostname is resolved (via non-blocking
  `loop.getaddrinfo`, awaited so a slow resolver can't stall the event
  loop) and every resolved address is rejected if it's
  private/loopback/link-local/reserved/multicast/unspecified (blocks
  `127.0.0.1`, `10.0.0.0/8`, `169.254.169.254` cloud-metadata, etc.), and
  `localhost`/`*.local` hostnames are blocked outright before DNS is even
  consulted.
- **Unreachable host / timeouts.** Connect timeout (3s) and read timeout
  (5s) are set on every outbound call (a hung dependency must never tie up
  a worker indefinitely). `httpx.ConnectError` → `502`, any
  `httpx.TimeoutException` → `504`, other transport errors → `502`. These
  are distinguished from validation failures (`400`) and from the *target*
  page's own status (which is relayed as-is inside the `200` JSON body,
  since the preview endpoint itself succeeded even if it discovers the
  target 404s).
- **Non-HTML.** Title parsing is skipped entirely (no body read at all) for
  any response whose `Content-Type` isn't `text/html` or
  `application/xhtml+xml`; `title` is `null` and `content_type` is passed
  through as-is, including when the header is absent.
- **Bounded reads.** Body reading for HTML pages is capped at 1MB via
  streaming (`client.stream` + `aiter_bytes`) so a malicious/huge page can't
  exhaust memory; malformed HTML never raises (best-effort `<title>`
  extraction via `html.parser`).
- **Testability without real network access.** The httpx client is created
  once in the app's `lifespan` and injected via `Depends(get_http_client)`;
  tests override that dependency with an `httpx.AsyncClient` bound to an
  `httpx.MockTransport`, so no real HTTP call ever happens. DNS resolution
  is isolated the same way — an autouse fixture monkeypatches
  `socket.getaddrinfo` (which `loop.getaddrinfo` delegates to) so tests
  never depend on real DNS, and individual SSRF tests point it at private
  addresses to prove the guard fires.

## `app.py`

```python
"""FastAPI service exposing ``GET /fetch-preview?url=...``.

The endpoint fetches a caller-supplied URL server-side and reports back the
HTTP status, the HTML ``<title>`` (if any), and the response's content type.

Because this handler makes the *server* issue an outbound request to a URL
chosen by the caller, it is a textbook SSRF vector: without safeguards a
caller could make the server probe its own internal network
(``http://169.254.169.254/latest/meta-data/``, ``http://localhost:6379``,
etc.). Accordingly the URL is validated in two stages before any request is
made:

1. Structural validation - only ``http``/``https`` URLs with a hostname are
   accepted.
2. SSRF validation - the hostname is resolved and every resolved address is
   checked against private/loopback/link-local/reserved ranges.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from contextlib import asynccontextmanager
from html.parser import HTMLParser
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from pydantic import BaseModel

ALLOWED_SCHEMES = {"http", "https"}
CONNECT_TIMEOUT = 3.0
READ_TIMEOUT = 5.0
FETCH_TIMEOUT = httpx.Timeout(READ_TIMEOUT, connect=CONNECT_TIMEOUT)
MAX_BODY_BYTES = 1_000_000  # cap how much of the body we read to find <title>
HTML_CONTENT_TYPES = ("text/html", "application/xhtml+xml")
BLOCKED_HOSTNAMES = {"localhost"}


class FetchPreviewResponse(BaseModel):
    status: int
    title: Optional[str] = None
    content_type: Optional[str] = None


class SSRFError(ValueError):
    """Raised when a URL targets a disallowed internal/private network."""


# --------------------------------------------------------------------------
# HTML title extraction
# --------------------------------------------------------------------------


class _TitleExtractor(HTMLParser):
    """Pulls the text of the first ``<title>`` element out of an HTML doc."""

    def __init__(self) -> None:
        super().__init__()
        self._in_title = False
        self._found = False
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() == "title" and not self._found:
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title" and self._in_title:
            self._in_title = False
            self._found = True

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._chunks.append(data)

    @property
    def title(self) -> Optional[str]:
        text = " ".join("".join(self._chunks).split())
        return text or None


def extract_title(html: str) -> Optional[str]:
    """Best-effort ``<title>`` extraction. Never raises on malformed HTML."""
    parser = _TitleExtractor()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        return parser.title
    return parser.title


# --------------------------------------------------------------------------
# Validation / SSRF guard
# --------------------------------------------------------------------------


def validate_url(raw_url: str) -> str:
    """Structural validation of ``raw_url``. Raises ``ValueError`` if invalid."""
    if not raw_url or not raw_url.strip():
        raise ValueError("url must not be empty")

    parsed = urlparse(raw_url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError(
            f"unsupported URL scheme {parsed.scheme!r}; only http/https are allowed"
        )
    if not parsed.hostname:
        raise ValueError("url must include a hostname")
    return raw_url


def _is_disallowed_address(ip_str: str) -> bool:
    addr = ipaddress.ip_address(ip_str)
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


async def check_ssrf(raw_url: str) -> None:
    """Resolve ``raw_url``'s host and reject it if it targets an internal
    network. DNS resolution is awaited (``loop.getaddrinfo``) rather than
    called synchronously, so a slow/unreachable resolver cannot stall the
    event loop for other requests. Raises ``SSRFError`` if disallowed.
    """
    hostname = urlparse(raw_url).hostname
    assert hostname is not None  # validate_url() already enforced this

    lowered = hostname.lower()
    if lowered in BLOCKED_HOSTNAMES or lowered.endswith(".local"):
        raise SSRFError(f"host {hostname!r} is not allowed")

    loop = asyncio.get_running_loop()
    try:
        addr_infos = await loop.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise SSRFError(f"could not resolve host {hostname!r}") from exc

    for info in addr_infos:
        ip = info[4][0]
        if _is_disallowed_address(ip):
            raise SSRFError(
                f"host {hostname!r} resolves to a disallowed internal address"
            )


# --------------------------------------------------------------------------
# App wiring
# --------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One pooled client for the process lifetime rather than one per request.
    async with httpx.AsyncClient(
        timeout=FETCH_TIMEOUT, follow_redirects=True
    ) as client:
        app.state.http_client = client
        yield


async def get_http_client(request: Request) -> httpx.AsyncClient:
    """FastAPI dependency; tests override this with an ``httpx.MockTransport``
    client so no real network call is ever made."""
    return request.app.state.http_client


def create_app() -> FastAPI:
    app = FastAPI(title="Fetch Preview Service", version="1.0.0", lifespan=lifespan)

    @app.get("/fetch-preview", response_model=FetchPreviewResponse)
    async def fetch_preview(
        url: str = Query(..., description="http(s) URL to fetch and preview"),
        client: httpx.AsyncClient = Depends(get_http_client),
    ) -> FetchPreviewResponse:
        try:
            validate_url(url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            await check_ssrf(url)
        except SSRFError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            async with client.stream("GET", url) as response:
                status_code = response.status_code
                content_type = response.headers.get("content-type")
                is_html = bool(content_type) and any(
                    content_type.split(";")[0].strip().lower() == ct
                    for ct in HTML_CONTENT_TYPES
                )

                title = None
                if is_html:
                    body = b""
                    async for chunk in response.aiter_bytes():
                        body += chunk
                        if len(body) >= MAX_BODY_BYTES:
                            break
                    html_text = body.decode(
                        response.encoding or "utf-8", errors="replace"
                    )
                    title = extract_title(html_text)
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=504, detail=f"timed out fetching url: {exc}"
            ) from exc
        except httpx.ConnectError as exc:
            raise HTTPException(
                status_code=502, detail=f"could not connect to host: {exc}"
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502, detail=f"error fetching url: {exc}"
            ) from exc

        return FetchPreviewResponse(
            status=status_code, title=title, content_type=content_type
        )

    return app


app = create_app()
```

## `test_app.py`

```python
import socket

import httpx
import pytest
from fastapi.testclient import TestClient

from app import app, get_http_client


@pytest.fixture(autouse=True)
def _fake_dns(monkeypatch):
    """Never let the test suite perform a real DNS lookup. By default every
    hostname resolves to a public-looking address so ordinary fetch tests
    pass the SSRF guard; individual SSRF tests override this again to point
    at a private/loopback address instead."""

    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _mock_fetch(handler):
    """Override the outbound-fetch dependency with an httpx.MockTransport so
    no real network call is ever made."""
    app.dependency_overrides[get_http_client] = lambda: httpx.AsyncClient(
        transport=httpx.MockTransport(handler)
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_returns_title_for_html_page(client):
    def handler(request):
        html = b"<html><head><title>Example Domain</title></head><body/></html>"
        return httpx.Response(
            200, headers={"content-type": "text/html; charset=utf-8"}, content=html
        )

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com"})
    assert r.status_code == 200
    assert r.json() == {
        "status": 200,
        "title": "Example Domain",
        "content_type": "text/html; charset=utf-8",
    }


def test_collapses_whitespace_in_title(client):
    def handler(request):
        html = b"<html><head><title>  Hello\n   World  </title></head></html>"
        return httpx.Response(200, headers={"content-type": "text/html"}, content=html)

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com"})
    assert r.json()["title"] == "Hello World"


def test_relays_non_200_upstream_status(client):
    def handler(request):
        return httpx.Response(
            404,
            headers={"content-type": "text/html"},
            content=b"<title>Not Found</title>",
        )

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com/missing"})
    assert r.status_code == 200  # our endpoint succeeded even though target 404s
    body = r.json()
    assert body["status"] == 404
    assert body["title"] == "Not Found"


def test_missing_title_tag_is_null(client):
    def handler(request):
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            content=b"<html><body>no title here</body></html>",
        )

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com"})
    assert r.json()["title"] is None


# ---------------------------------------------------------------------------
# Non-HTML content
# ---------------------------------------------------------------------------


def test_non_html_content_type_has_null_title(client):
    def handler(request):
        return httpx.Response(
            200, headers={"content-type": "application/json"}, content=b'{"a": 1}'
        )

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com/data.json"})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] is None
    assert body["content_type"] == "application/json"


def test_missing_content_type_header_is_handled(client):
    def handler(request):
        return httpx.Response(200, content=b"binary-ish content")

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com/blob"})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] is None
    assert body["content_type"] is None


# ---------------------------------------------------------------------------
# Outbound-fetch error handling
# ---------------------------------------------------------------------------


def test_unreachable_host_returns_502(client):
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com"})
    assert r.status_code == 502


def test_timeout_returns_504(client):
    def handler(request):
        raise httpx.ReadTimeout("timed out", request=request)

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com"})
    assert r.status_code == 504


def test_other_transport_error_returns_502(client):
    def handler(request):
        raise httpx.RemoteProtocolError("server closed connection", request=request)

    _mock_fetch(handler)
    r = client.get("/fetch-preview", params={"url": "http://example.com"})
    assert r.status_code == 502


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


def test_missing_url_param_is_422(client):
    r = client.get("/fetch-preview")
    assert r.status_code == 422


def test_rejects_non_http_scheme(client):
    r = client.get("/fetch-preview", params={"url": "ftp://example.com/file"})
    assert r.status_code == 400


def test_rejects_file_scheme(client):
    r = client.get("/fetch-preview", params={"url": "file:///etc/passwd"})
    assert r.status_code == 400


def test_rejects_missing_hostname(client):
    r = client.get("/fetch-preview", params={"url": "http:///no-host"})
    assert r.status_code == 400


def test_rejects_empty_url(client):
    r = client.get("/fetch-preview", params={"url": ""})
    assert r.status_code == 400


def test_rejects_garbage_url(client):
    r = client.get("/fetch-preview", params={"url": "not a url at all"})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# SSRF guard
# ---------------------------------------------------------------------------


def test_blocks_localhost_hostname(client):
    r = client.get("/fetch-preview", params={"url": "http://localhost/admin"})
    assert r.status_code == 400


def test_blocks_dot_local_hostname(client):
    r = client.get("/fetch-preview", params={"url": "http://printer.local/"})
    assert r.status_code == 400


def test_blocks_loopback_literal_ip(client, monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    r = client.get("/fetch-preview", params={"url": "http://127.0.0.1/"})
    assert r.status_code == 400


def test_blocks_hostname_resolving_to_private_ip(client, monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    r = client.get("/fetch-preview", params={"url": "http://internal.example.com/"})
    assert r.status_code == 400


def test_blocks_link_local_metadata_ip(client, monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    r = client.get(
        "/fetch-preview", params={"url": "http://169.254.169.254/latest/meta-data/"}
    )
    assert r.status_code == 400


def test_dns_resolution_failure_returns_400(client, monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        raise socket.gaierror("name or service not known")

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    r = client.get("/fetch-preview", params={"url": "http://does-not-exist.invalid/"})
    assert r.status_code == 400
```

Verified locally: `python3 -m pytest test_app.py -v` → 21 passed, 0 failed (run in
`/tmp`, no outbound network access used — both the httpx client and DNS
resolution are mocked/monkeypatched).

LOADED: skills/python-api/composable/INDEX-E.md, skills/python-api/composable/mini/02-routing-and-app.md, skills/python-api/composable/mini/04-validation-and-errors.md, skills/python-api/composable/mini/07-async-performance.md, skills/python-api/composable/mini/08-testing.md, skills/python-api/composable/mini/09-middleware-observability.md, skills/code-review/composable/INDEX-E.md, skills/code-review/composable/mini/02-security-review.md, skills/code-review/composable/mini/05-error-handling.md, skills/code-review/composable/mini/08-missing-tests.md
