# T4 — code-review

`eval3/fixtures/cache_stats.py` is a stats module used by a multi-threaded
web application (every request handler calls `get_stats()`; `record_event()`
is called concurrently from many threads). Its performance is unacceptable
under load. Review it, identify the performance problem(s), and deliver a
corrected version of the module (complete file in a fenced block) with a
short explanation of each change and why it is safe in this deployment
context. Skill domains available: `skills/code-review/composable/`.
