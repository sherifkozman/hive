# Task: claude-api / NARROW

Write a production-quality Python script `batch_summarize.py` that summarizes
a directory of text files using the Claude API, with these requirements:

1. Uses the current recommended Python SDK patterns and a sensible current
   model choice (justify the choice).
2. Uses prompt caching correctly to avoid re-paying for the shared system
   prompt and few-shot examples across files (explain where cache breakpoints
   go and why).
3. Counts tokens before each request and skips files that would exceed the
   context window, logging them.
4. Handles rate limits and transient API errors with correct retry behavior
   (respect retry-after; distinguish retryable from non-retryable errors).
5. Concurrency: process up to 4 files at a time safely.

Deliver the complete script in one fenced block plus a short design-notes
section covering the caching strategy, model choice, and error taxonomy.
Accuracy against the actual Claude API (parameter names, endpoints, SDK
usage, caching mechanics) is the primary grading criterion.
