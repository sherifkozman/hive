# Performance

Focus on algorithmic and I/O issues that scale badly with data or load. Ignore micro-optimizations that don't move the needle.

- **N+1 queries.** A database (or network) call inside a loop over rows is the most common real-world performance bug: 1 query to list, then N to fetch each item's detail. Batch it into one query, or eager-load the relationship. Spotting a `.get`/`.query`/`fetch` inside a `for` loop is a red flag.
- **Accidental O(n²).** Membership tests against a list inside a loop (`if x in big_list`) turn linear work quadratic. Use a `set`/`dict` for O(1) lookup. Watch nested loops over the same large collection, and invariant work recomputed each iteration that could be hoisted out.
- **Unbounded memory.** Loading an entire large file or result set into memory (`f.read()`, `.all()` on a huge table) risks OOM. Stream, chunk, or paginate instead.
- **Missing indexes / full scans.** Query patterns filtering or joining on unindexed columns imply table scans. Repeated identical queries that should be cached also count.
- **Chatty I/O.** Many small network or disk calls that could be batched; a new connection per call instead of a reused pooled client.

Discipline: **distinguish hot paths from cold.** A slow one-time startup step rarely matters; a slow per-request or per-row path does. Estimate the input size: O(n²) on n=10 is fine, on n=10⁶ it's fatal. When you claim something is slow, point to the scaling factor (data size or request rate) that makes it bite, and prefer measuring over asserting.
