# lino-cache

A cache-manager compatible file-based cache using [Links Notation](https://github.com/link-foundation/links-notation) (.lino) format instead of JSON.

[![Tests](https://github.com/link-foundation/lino-cache/actions/workflows/release.yml/badge.svg)](https://github.com/link-foundation/lino-cache/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/lino-cache.svg)](https://www.npmjs.com/package/lino-cache)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/)

## Features

- **cache-manager compatible** - Implements the full cache-manager store interface
- **Links Notation storage** - Uses [lino-objects-codec](https://github.com/link-foundation/lino-objects-codec) for serialization
- **Two storage modes**:
  - **Folder mode** - Each cache key stored in a separate `.lino` file
  - **Single-file mode** - All cache entries in one `.lino` file
- **TTL support** - Time-to-live for automatic expiration
- **Atomic cache primitives** - Conditional writes, TTL mutation, counters,
  string mutation, and get-and-mutate operations
- **Multi-runtime** - Works with Node.js, Bun, and Deno
- **TypeScript support** - Full type definitions included

See the [competitor compatibility matrix](docs/competitor-compatibility.md) for
an explicit comparison with Redis, Memcached, and Dragonfly and the staged
implementation roadmap. The package currently provides semantic compatibility
for common cache operations; it does not claim wire-protocol compatibility.

## Installation

```bash
npm install lino-cache
```

## Quick Start

```javascript
import { LinoCache, createLinoCache, linoStore } from 'lino-cache';

// Create a cache instance (folder mode by default)
const cache = new LinoCache({
  basePath: '.cache',
  ttl: 60000, // Default TTL: 1 minute
});

// Basic operations
await cache.set('user:1', { name: 'Alice', age: 30 });
const user = await cache.get('user:1');
console.log(user); // { name: 'Alice', age: 30 }

// Delete
await cache.del('user:1');

// Check existence
const exists = await cache.has('user:1'); // false
```

## Storage Modes

### Folder Mode (Default)

Each cache key is stored in a separate `.lino` file. Best for:

- Large number of cache entries
- Independent access to cache entries
- When you need to inspect individual cached values

```javascript
const cache = new LinoCache({
  mode: 'folder', // Default
  basePath: '.cache',
});

await cache.set('key1', 'value1'); // Creates .cache/key1.lino
await cache.set('key2', 'value2'); // Creates .cache/key2.lino
```

### Single-File Mode

All cache entries stored in one `.lino` file. Best for:

- Small number of cache entries
- When you want all cache data in one file
- Simpler file management

```javascript
const cache = new LinoCache({
  mode: 'file',
  basePath: '.cache',
  fileName: 'cache.lino',
});

await cache.set('key1', 'value1'); // Both stored in
await cache.set('key2', 'value2'); // .cache/cache.lino
```

## API Reference

### Constructor Options

```typescript
interface LinoCacheOptions {
  ttl?: number; // Default TTL in milliseconds (0 = no expiration)
  mode?: 'file' | 'folder'; // Storage mode (default: 'folder')
  basePath?: string; // Cache directory (default: '.cache')
  fileName?: string; // File name for single-file mode (default: 'cache.lino')
}
```

### Methods

#### `set(key, value, [ttl])`

Sets a value in the cache.

```javascript
await cache.set('key', 'value');
await cache.set('key', 'value', 5000); // With 5 second TTL
```

#### `get(key)`

Gets a value from the cache. Returns `undefined` if not found or expired.

```javascript
const value = await cache.get('key');
```

#### `del(key)`

Deletes a value from the cache.

```javascript
const deleted = await cache.del('key'); // true if deleted
```

#### `add(key, value, [ttl])` / `replace(key, value, [ttl])`

Conditionally writes a value. `add` writes only when no live entry exists;
`replace` writes only when one does. Both return whether the write occurred.

```javascript
await cache.add('job-lock', 'worker-1', 5000); // true
await cache.add('job-lock', 'worker-2', 5000); // false
await cache.replace('job-lock', 'worker-3', 5000); // true
```

#### `touch(key, [ttl])` / `getex(key, [ttl])`

Updates expiration without replacing the value. `touch` returns whether the
key existed; `getex` returns the value while updating its expiration.

```javascript
await cache.touch('session', 60000);
const session = await cache.getex('session', 120000);
```

#### `getdel(key)`

Returns and deletes a value as one local atomic operation.

```javascript
const job = await cache.getdel('next-job');
```

Descriptive aliases `getAndDelete` and `getAndTouch` are also available.

#### `incr(key, [amount])` / `decr(key, [amount])`

Atomically mutates finite numeric values. Missing counters start at zero,
results may be negative, and an existing TTL is preserved. The longer aliases
`increment` and `decrement` are also available.

```javascript
await cache.incr('requests'); // 1
await cache.incr('requests', 4); // 5
await cache.decr('requests', 2); // 3
```

#### `append(key, suffix)` / `prepend(key, prefix)`

Atomically mutates string values, creates a missing key from an empty string,
and preserves an existing TTL.

```javascript
await cache.append('message', 'world');
await cache.prepend('message', 'hello '); // 'hello world'
```

Atomic mutation methods are serialized across cache instances in the same
JavaScript process. Concurrent-process locking and network protocol
compatibility are separate roadmap items.

#### `has(key)`

Checks if a key exists and is not expired.

```javascript
const exists = await cache.has('key'); // boolean
```

#### `keys()`

Returns all non-expired keys.

```javascript
const allKeys = await cache.keys(); // ['key1', 'key2', ...]
```

#### `clear()` / `reset()`

Clears all values from the cache.

```javascript
await cache.clear();
```

#### `mset(entries)`

Sets multiple values at once.

```javascript
await cache.mset([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', ttl: 5000 },
]);
```

#### `mget(keys)`

Gets multiple values at once.

```javascript
const values = await cache.mget(['key1', 'key2', 'key3']);
// [value1, value2, undefined]
```

#### `mdel(keys)`

Deletes multiple values at once.

```javascript
const deleted = await cache.mdel(['key1', 'key2']);
```

#### `wrap(key, fn, [ttl])`

Wraps a function with caching. Returns cached value if available, otherwise executes the function and caches the result.

```javascript
const data = await cache.wrap(
  'expensive-operation',
  async () => {
    // This only runs if not cached
    return await fetchExpensiveData();
  },
  60000
);
```

#### `ttl(key)`

Gets the remaining TTL for a key in milliseconds.

```javascript
const remaining = await cache.ttl('key');
// > 0: remaining time
// -1: no TTL set
// -2: key not found
```

#### `disconnect()`

Closes the cache and releases resources.

```javascript
await cache.disconnect();
```

## Factory Functions

### `createLinoCache(options)`

Creates a new LinoCache instance.

```javascript
const cache = createLinoCache({ basePath: '.cache' });
```

### `linoStore(options)`

Creates a cache-manager compatible store.

```javascript
import { caching } from 'cache-manager';
import { linoStore } from 'lino-cache';

const cache = await caching(
  linoStore({
    basePath: '.cache',
    ttl: 60000,
  })
);
```

## Why Links Notation?

Links Notation (.lino) is a human-readable serialization format that:

- Supports circular references natively
- Preserves object identity
- Is more compact for certain data structures
- Provides better debugging experience

Learn more: [Links Notation](https://github.com/link-foundation/links-notation)

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Run all checks
npm run check
```

## License

[Unlicense](LICENSE) - Public Domain

## Links

- [GitHub Repository](https://github.com/link-foundation/lino-cache)
- [npm Package](https://www.npmjs.com/package/lino-cache)
- [lino-objects-codec](https://github.com/link-foundation/lino-objects-codec)
- [Links Notation](https://github.com/link-foundation/links-notation)
- [cache-manager](https://www.npmjs.com/package/cache-manager)
