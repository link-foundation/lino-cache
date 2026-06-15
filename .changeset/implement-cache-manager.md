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
