---
'lino-cache': minor
---

Implement cache-manager compatible interface with Links Notation storage

- Add `LinoCache` class with full cache-manager store interface
- Support two storage modes: folder mode (separate files) and single-file mode
- Implement all cache-manager methods: `get`, `set`, `del`, `mget`, `mset`, `mdel`, `wrap`, `clear`, `reset`, `ttl`, `has`, `keys`, `disconnect`
- Add TTL (time-to-live) support for automatic entry expiration
- Use lino-objects-codec for serialization to Links Notation format
- Include comprehensive TypeScript type definitions
- Add factory functions: `createLinoCache` and `linoStore`
- Add local atomic cache primitives: `add`, `replace`, `touch`, `getdel`,
  `getex`, `incr`, `decr`, `append`, and `prepend`
- Serialize read-modify-write operations across cache instances in one
  JavaScript process and use atomic file replacement
- Document the Redis, Memcached, and Dragonfly compatibility boundary and
  staged implementation roadmap
