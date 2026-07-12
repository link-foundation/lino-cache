# Competitor compatibility

This document tracks `lino-cache` against Redis, Memcached, and Dragonfly. It
is both a compatibility statement and an implementation roadmap.

## What compatibility means here

`lino-cache` is an embedded, persistent JavaScript cache. Redis, Memcached,
and Dragonfly are network services. Therefore compatibility has three separate
levels:

1. **Semantic compatibility** — an equivalent cache operation exists.
2. **Client API compatibility** — an existing Redis or Memcached client can use
   the package without application changes.
3. **Wire compatibility** — the package implements RESP or the Memcached text,
   meta, or binary protocol.

The current package provides semantic compatibility for common cache-manager
operations. It does **not** currently claim Redis/Memcached client or wire
compatibility. Dragonfly exposes Redis and Memcached APIs, so its compatibility
surface is represented by those two columns rather than duplicated.

Status legend: ✅ supported, 🟡 partial, ❌ not implemented, N/A not applicable
to an embedded store.

## Cache operations

| Capability              | Redis equivalent    | Memcached equivalent        | `lino-cache`        | Notes                                                        |
| ----------------------- | ------------------- | --------------------------- | ------------------- | ------------------------------------------------------------ |
| Read and write          | `GET`, `SET`        | `get`, `set`                | ✅ `get`, `set`     | Values may be arbitrary objects, not only byte strings.      |
| Delete                  | `DEL`               | `delete`                    | ✅ `del`, `mdel`    | Multi-key deletion is exposed directly.                      |
| Multi-read/write        | `MGET`, `MSET`      | multi-get, pipelined stores | ✅ `mget`, `mset`   | Operations are sequential and not atomic.                    |
| Existence test          | `EXISTS`            | retrieval result            | ✅ `has`            | Expired entries are treated as absent.                       |
| Enumerate keys          | `SCAN`, `KEYS`      | not supported               | 🟡 `keys`           | Full scan; no cursor or pattern filtering.                   |
| Clear database          | `FLUSHDB`           | `flush_all`                 | ✅ `clear`, `reset` | Scoped to one cache path.                                    |
| Relative expiration     | `PEXPIRE`, `SET PX` | expiration field, `touch`   | 🟡 TTL on `set`     | Expiry can be set during writes; `touch` is not implemented. |
| Inspect TTL             | `PTTL`              | meta-get flags              | ✅ `ttl`            | Uses Redis-style `-1` and `-2` sentinel values.              |
| Add only if absent      | `SET NX`            | `add`                       | ❌                  | Planned in phase 1.                                          |
| Replace only if present | `SET XX`            | `replace`                   | ❌                  | Planned in phase 1.                                          |
| Compare-and-swap        | transactions/Lua    | `cas`                       | ❌                  | Requires atomic storage primitives.                          |
| Increment/decrement     | `INCRBY`, `DECRBY`  | `incr`, `decr`              | ❌                  | Planned in phase 1.                                          |
| Append/prepend          | `APPEND`            | `append`, `prepend`         | ❌                  | Planned in phase 1.                                          |
| Get and mutate          | `GETDEL`, `GETEX`   | meta-get modes              | ❌                  | Planned in phase 1.                                          |
| Function-result caching | client-side pattern | client-side pattern         | ✅ `wrap`           | Package-level convenience API.                               |

## Data structures and programmable features

| Capability                      | Redis/Dragonfly | Memcached | `lino-cache`                                      |
| ------------------------------- | --------------- | --------- | ------------------------------------------------- |
| Strings/counters                | ✅              | ✅        | 🟡 values supported; counter operations absent    |
| Hashes                          | ✅              | ❌        | 🟡 objects can be stored; field operations absent |
| Lists                           | ✅              | ❌        | 🟡 arrays can be stored; list operations absent   |
| Sets and sorted sets            | ✅              | ❌        | 🟡 values can be stored; set operations absent    |
| Streams and consumer groups     | ✅              | ❌        | ❌                                                |
| Geospatial, bitmap, HyperLogLog | ✅              | ❌        | ❌                                                |
| JSON/search/time-series modules | Redis-dependent | ❌        | ❌                                                |
| Pub/Sub                         | ✅              | ❌        | ❌                                                |
| Transactions and scripting      | ✅              | ❌        | ❌                                                |

Storing a JavaScript collection is not considered full support for the
corresponding server-side data structure. Full support requires atomic,
documented operations with concurrency tests.

## Persistence, scale, and operations

| Capability                    | Redis/Dragonfly  | Memcached            | `lino-cache`                      |
| ----------------------------- | ---------------- | -------------------- | --------------------------------- |
| Persistence                   | snapshots/logs   | no                   | ✅ `.lino` files                  |
| TTL eviction                  | ✅               | ✅                   | ✅ lazy expiration                |
| Memory-policy eviction/LRU    | ✅               | ✅                   | ❌                                |
| Maximum-size limits           | ✅               | ✅                   | ❌                                |
| Replication/failover          | ✅               | ❌                   | ❌                                |
| Sharding/cluster mode         | ✅               | client-side          | ❌                                |
| Concurrent process safety     | ✅               | ✅                   | ❌                                |
| Authentication/ACL/TLS        | ✅               | deployment-dependent | N/A until a server exists         |
| Metrics, statistics, slow log | ✅               | ✅                   | ❌                                |
| Backup/restore tooling        | ✅               | N/A                  | 🟡 files can be copied while idle |
| Node.js, Bun, and Deno        | client-dependent | client-dependent     | ✅                                |

## Protocol and ecosystem compatibility

| Surface                        | Status                                  |
| ------------------------------ | --------------------------------------- |
| cache-manager store API        | ✅                                      |
| Redis RESP2/RESP3 protocol     | ❌                                      |
| Memcached text protocol        | ❌                                      |
| Memcached meta protocol        | ❌                                      |
| Memcached binary protocol      | ❌; deprecated upstream and not planned |
| Redis client compatibility     | ❌                                      |
| Memcached client compatibility | ❌                                      |

## Roadmap

Work should be delivered in independently testable phases:

1. **Atomic cache primitives:** add/replace, touch, numeric mutation,
   append/prepend, get-and-delete/get-and-touch, plus per-operation tests in
   both storage modes.
2. **Storage correctness:** collision-free key filenames, atomic file replace,
   locking for concurrent instances/processes, eager expiry cleanup, size
   accounting, limits, and eviction policies.
3. **Collection primitives:** hashes, lists, sets, and sorted sets. Define a
   small associative-stack abstraction first so operations share atomicity and
   persistence behavior.
4. **Observability and operations:** statistics, health checks, export/import,
   corruption reporting, backups, and configurable logging that is off by
   default.
5. **Optional server package:** RESP and Memcached text/meta adapters. Protocol
   conformance suites must gate compatibility claims.
6. **Distributed operation:** only after local atomicity and protocol behavior
   are stable; define replication, partitioning, consistency, and failure
   semantics before implementation.

Each new feature must update this matrix from ❌ to 🟡 or ✅ and include tests
for folder and single-file modes. Protocol claims additionally require tests
against unmodified ecosystem clients.

## Reference scope

The matrix follows the upstream command/protocol categories rather than a
single product version:

- [Redis command reference](https://redis.io/docs/latest/commands/)
- [Memcached protocols](https://docs.memcached.org/protocols/)
- [Dragonfly documentation](https://www.dragonflydb.io/docs)

Review this document when a tracked competitor adds or removes a command
category or protocol.
