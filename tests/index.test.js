/**
 * Tests for lino-cache
 * Works with Node.js, Bun, and Deno
 */

import { describe, it, expect, beforeEach, afterEach } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { LinoCache, createLinoCache, linoStore } from '../src/index.js';

// Test directory for cache files
const TEST_CACHE_DIR = '.test-cache';

// Helper to clean up test directories
const cleanup = async (dir) => {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore errors if directory doesn't exist
  }
};

// Helper to delay for TTL testing
const delay = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

describe('LinoCache - Folder Mode', () => {
  const cacheDir = path.join(TEST_CACHE_DIR, 'folder');

  beforeEach(async () => {
    await cleanup(cacheDir);
  });

  afterEach(async () => {
    await cleanup(cacheDir);
  });

  it('should set and get a value', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key1', 'value1');
    const result = await cache.get('key1');
    expect(result).toBe('value1');
  });

  it('should store complex objects', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    const obj = {
      name: 'Alice',
      age: 30,
      nested: { active: true, tags: ['a', 'b', 'c'] },
    };
    await cache.set('user', obj);
    const result = await cache.get('user');
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
    expect(result.nested.active).toBe(true);
    expect(result.nested.tags.length).toBe(3);
  });

  it('should return undefined for non-existent keys', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    const result = await cache.get('nonexistent');
    expect(result).toBe(undefined);
  });

  it('should delete a key', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key1', 'value1');
    const deleted = await cache.del('key1');
    expect(deleted).toBe(true);
    const result = await cache.get('key1');
    expect(result).toBe(undefined);
  });

  it('should return false when deleting non-existent key', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    const deleted = await cache.del('nonexistent');
    expect(deleted).toBe(false);
  });

  it('should check if key exists with has()', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key1', 'value1');
    expect(await cache.has('key1')).toBe(true);
    expect(await cache.has('nonexistent')).toBe(false);
  });

  it('should get all keys', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');
    const keys = await cache.keys();
    expect(keys.length).toBe(3);
    expect(keys.includes('key1')).toBe(true);
    expect(keys.includes('key2')).toBe(true);
    expect(keys.includes('key3')).toBe(true);
  });

  it('should clear all values', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();
    const keys = await cache.keys();
    expect(keys.length).toBe(0);
  });

  it('should create .lino files for each key', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('mykey', 'myvalue');
    const files = await fs.readdir(cacheDir);
    const linoFiles = files.filter((f) => f.endsWith('.lino'));
    expect(linoFiles.length).toBe(1);
  });
});

describe('LinoCache - Single File Mode', () => {
  const cacheDir = path.join(TEST_CACHE_DIR, 'single');
  const cacheFile = 'test-cache.lino';

  beforeEach(async () => {
    await cleanup(cacheDir);
  });

  afterEach(async () => {
    await cleanup(cacheDir);
  });

  it('should set and get a value', async () => {
    const cache = new LinoCache({
      basePath: cacheDir,
      mode: 'file',
      fileName: cacheFile,
    });
    await cache.set('key1', 'value1');
    const result = await cache.get('key1');
    expect(result).toBe('value1');
  });

  it('should store all entries in a single file', async () => {
    const cache = new LinoCache({
      basePath: cacheDir,
      mode: 'file',
      fileName: cacheFile,
    });
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');

    const files = await fs.readdir(cacheDir);
    const linoFiles = files.filter((f) => f.endsWith('.lino'));
    expect(linoFiles.length).toBe(1);
    expect(linoFiles[0]).toBe(cacheFile);
  });

  it('should delete a key from single file', async () => {
    const cache = new LinoCache({
      basePath: cacheDir,
      mode: 'file',
      fileName: cacheFile,
    });
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.del('key1');
    expect(await cache.get('key1')).toBe(undefined);
    expect(await cache.get('key2')).toBe('value2');
  });

  it('should persist data across instances', async () => {
    const cache1 = new LinoCache({
      basePath: cacheDir,
      mode: 'file',
      fileName: cacheFile,
    });
    await cache1.set('persistent', 'data');
    await cache1.disconnect();

    const cache2 = new LinoCache({
      basePath: cacheDir,
      mode: 'file',
      fileName: cacheFile,
    });
    const result = await cache2.get('persistent');
    expect(result).toBe('data');
  });
});

describe('LinoCache - TTL (Time To Live)', () => {
  const cacheDir = path.join(TEST_CACHE_DIR, 'ttl');

  beforeEach(async () => {
    await cleanup(cacheDir);
  });

  afterEach(async () => {
    await cleanup(cacheDir);
  });

  it('should expire entries after TTL', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('expiring', 'value', 100); // 100ms TTL
    expect(await cache.get('expiring')).toBe('value');
    await delay(150);
    expect(await cache.get('expiring')).toBe(undefined);
  });

  it('should use default TTL from options', async () => {
    const cache = new LinoCache({ basePath: cacheDir, ttl: 100 });
    await cache.set('expiring', 'value');
    expect(await cache.get('expiring')).toBe('value');
    await delay(150);
    expect(await cache.get('expiring')).toBe(undefined);
  });

  it('should override default TTL with set() parameter', async () => {
    const cache = new LinoCache({ basePath: cacheDir, ttl: 1000 });
    await cache.set('expiring', 'value', 100); // Override with 100ms
    await delay(150);
    expect(await cache.get('expiring')).toBe(undefined);
  });

  it('should return remaining TTL', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key', 'value', 5000); // 5 second TTL
    const remaining = await cache.ttl('key');
    expect(remaining > 4000).toBe(true);
    expect(remaining <= 5000).toBe(true);
  });

  it('should return -1 for keys with no TTL', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key', 'value'); // No TTL
    const remaining = await cache.ttl('key');
    expect(remaining).toBe(-1);
  });

  it('should return -2 for non-existent keys', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    const remaining = await cache.ttl('nonexistent');
    expect(remaining).toBe(-2);
  });
});

describe('LinoCache - Multi-key Operations', () => {
  const cacheDir = path.join(TEST_CACHE_DIR, 'multi');

  beforeEach(async () => {
    await cleanup(cacheDir);
  });

  afterEach(async () => {
    await cleanup(cacheDir);
  });

  it('should set multiple values with mset', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.mset([
      { key: 'key1', value: 'value1' },
      { key: 'key2', value: 'value2' },
      { key: 'key3', value: 'value3' },
    ]);
    expect(await cache.get('key1')).toBe('value1');
    expect(await cache.get('key2')).toBe('value2');
    expect(await cache.get('key3')).toBe('value3');
  });

  it('should get multiple values with mget', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    const results = await cache.mget(['key1', 'key2', 'nonexistent']);
    expect(results[0]).toBe('value1');
    expect(results[1]).toBe('value2');
    expect(results[2]).toBe(undefined);
  });

  it('should delete multiple values with mdel', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');
    const deleted = await cache.mdel(['key1', 'key2', 'nonexistent']);
    expect(deleted).toBe(true);
    expect(await cache.get('key1')).toBe(undefined);
    expect(await cache.get('key2')).toBe(undefined);
    expect(await cache.get('key3')).toBe('value3');
  });
});

describe('LinoCache - wrap()', () => {
  const cacheDir = path.join(TEST_CACHE_DIR, 'wrap');

  beforeEach(async () => {
    await cleanup(cacheDir);
  });

  afterEach(async () => {
    await cleanup(cacheDir);
  });

  it('should cache function result', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    let callCount = 0;
    const getValue = async () => {
      callCount++;
      return 'expensive-result';
    };

    const result1 = await cache.wrap('key', getValue);
    const result2 = await cache.wrap('key', getValue);

    expect(result1).toBe('expensive-result');
    expect(result2).toBe('expensive-result');
    expect(callCount).toBe(1); // Function only called once
  });

  it('should work with sync functions', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    let callCount = 0;
    const getValue = () => {
      callCount++;
      return 'sync-result';
    };

    const result1 = await cache.wrap('key', getValue);
    const result2 = await cache.wrap('key', getValue);

    expect(result1).toBe('sync-result');
    expect(result2).toBe('sync-result');
    expect(callCount).toBe(1);
  });

  it('should respect TTL in wrap', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    let callCount = 0;
    const getValue = () => {
      callCount++;
      return `result-${callCount}`;
    };

    const result1 = await cache.wrap('key', getValue, 100);
    expect(result1).toBe('result-1');

    await delay(150);

    const result2 = await cache.wrap('key', getValue, 100);
    expect(result2).toBe('result-2'); // Function called again after expiry
    expect(callCount).toBe(2);
  });
});

describe('LinoCache - Special Key Names', () => {
  const cacheDir = path.join(TEST_CACHE_DIR, 'special');

  beforeEach(async () => {
    await cleanup(cacheDir);
  });

  afterEach(async () => {
    await cleanup(cacheDir);
  });

  it('should handle keys with special characters', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('user:123', 'value1');
    await cache.set('item/abc', 'value2');
    await cache.set('key with spaces', 'value3');
    await cache.set('key.with.dots', 'value4');

    expect(await cache.get('user:123')).toBe('value1');
    expect(await cache.get('item/abc')).toBe('value2');
    expect(await cache.get('key with spaces')).toBe('value3');
    expect(await cache.get('key.with.dots')).toBe('value4');
  });

  it('should handle empty-like keys', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('...', 'dots');
    await cache.set('   ', 'spaces');

    expect(await cache.get('...')).toBe('dots');
    expect(await cache.get('   ')).toBe('spaces');
  });
});

describe('LinoCache - Factory Functions', () => {
  const cacheDir = path.join(TEST_CACHE_DIR, 'factory');

  beforeEach(async () => {
    await cleanup(cacheDir);
  });

  afterEach(async () => {
    await cleanup(cacheDir);
  });

  it('createLinoCache should create a LinoCache instance', async () => {
    const cache = createLinoCache({ basePath: cacheDir });
    expect(cache instanceof LinoCache).toBe(true);
    await cache.set('key', 'value');
    expect(await cache.get('key')).toBe('value');
  });

  it('linoStore should create a cache-manager compatible store', async () => {
    const store = linoStore({ basePath: cacheDir });
    expect(store instanceof LinoCache).toBe(true);
    // Verify it has cache-manager interface methods
    expect(typeof store.get).toBe('function');
    expect(typeof store.set).toBe('function');
    expect(typeof store.del).toBe('function');
    expect(typeof store.clear).toBe('function');
    expect(typeof store.reset).toBe('function');
    expect(typeof store.wrap).toBe('function');
    expect(typeof store.mget).toBe('function');
    expect(typeof store.mset).toBe('function');
    expect(typeof store.mdel).toBe('function');
    expect(typeof store.ttl).toBe('function');
  });
});

describe('LinoCache - reset() alias', () => {
  const cacheDir = path.join(TEST_CACHE_DIR, 'reset');

  beforeEach(async () => {
    await cleanup(cacheDir);
  });

  afterEach(async () => {
    await cleanup(cacheDir);
  });

  it('reset should work as alias for clear', async () => {
    const cache = new LinoCache({ basePath: cacheDir });
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.reset();
    expect(await cache.get('key1')).toBe(undefined);
    expect(await cache.get('key2')).toBe(undefined);
  });
});

// Cleanup test directory after all tests
afterEach(async () => {
  try {
    await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore
  }
});
