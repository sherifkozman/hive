# Connection Pooling

## Why pool at all

Each Postgres connection is a full OS backend process with its own memory
overhead (roughly several MB baseline, more under `work_mem`-heavy queries)
and `max_connections` is a hard ceiling — the default is often 100. An
application that opens a connection per request (or per thread with no
pooling) hits that ceiling under load and fails with "too many connections"
long before CPU or I/O is saturated. Pool at the application layer
(driver/ORM pool) at minimum; add an external pooler (PgBouncer, or
alternatives like PgCat/Odyssey) when many application instances/processes
each need their own small pool, or you need pooling across languages/services
that isn't coordinated by one process.

## PgBouncer pooling modes

- **Session pooling** — a client keeps its server connection for the whole
  session (until disconnect). Safest (supports all session state:
  `SET`, prepared statements, advisory locks, temp tables) but gives the
  least connection reuse — no better than the app's own pool.
- **Transaction pooling** — the server connection is returned to the pool at
  the end of each transaction, not each session. This is the mode that
  actually lets a small pool of backend connections serve a much larger
  number of client connections, and is the common default choice for web
  apps. **Trade-off:** session-level state (`SET` outside a transaction,
  `LISTEN/NOTIFY`, session-scoped temp tables, and — critically — protocol-level
  prepared statements) does not survive across transactions, because the next
  transaction may land on a different server connection.
- **Statement pooling** — returns the connection after every statement, even
  within a transaction. Breaks multi-statement transactions; rarely what you
  want.

## The prepared-statement trap under transaction pooling

Most ORMs and drivers (e.g. asyncpg, some JDBC configurations) issue
`PREPARE`/protocol-level prepared statements per connection for
performance. Under transaction pooling, a prepared statement created on one
backend connection may not exist when the client is later routed to a
different one, causing intermittent `prepared statement "..." does not exist`
errors under load — often not reproducible in dev where the pool is small
enough that the same connection keeps getting reused. Fixes: disable
protocol-level prepare in the driver (e.g. asyncpg's `statement_cache_size=0`,
or the driver's "simple query protocol" / `prepareThreshold=0` setting) when
sitting behind a transaction-pooling PgBouncer, or use PgBouncer's newer
prepared-statement support if the version supports it, or move to session
pooling for that workload if statement-cache benefits matter more than pool
efficiency.

## Sizing the pool

The backend pool size should be sized to what the database can actually serve
concurrently, not to how many clients want a connection. A common starting
formula (per Postgres's own guidance, credited to the PgBouncer/Postgres
community): `connections ≈ ((core_count * 2) + effective_spindle_count)` as a
rough ceiling for CPU-bound OLTP concurrency — treat it as a starting point to
load-test from, not a fixed law; I/O-bound workloads on fast SSD/NVMe can
sustain more. Set PgBouncer's `default_pool_size` (per database/user pair) and
`max_client_conn` (total clients PgBouncer accepts) so the **backend** side
stays comfortably under Postgres's `max_connections`, leaving headroom for
superuser/admin connections and other poolers/services sharing the instance.

## Symptoms of pool misconfiguration

- Clients queueing/timing out waiting for a pool slot while Postgres itself
  is idle → pool too small or `default_pool_size` too low relative to actual
  demand.
- `FATAL: too many connections` at the Postgres level → pooling bypassed
  somewhere (a service connecting directly) or the pooler's backend pool
  itself sized too close to `max_connections` with no room for other
  consumers.
- Long-running or idle-in-transaction sessions holding a pooled connection
  indefinitely, starving the pool for everyone else — see
  `08-locking-and-contention.md` for why idle-in-transaction is doubly bad
  (locks *and* pool exhaustion).
