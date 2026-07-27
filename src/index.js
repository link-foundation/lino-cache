/**
 * lino-cache - A cache-manager compatible file-based cache using Links Notation
 *
 * Supports two modes:
 * - Single-file mode: All cache entries stored in one .lino file
 * - Folder mode: Each cache entry stored in a separate .lino file
 */

import { encode, decode } from 'lino-objects-codec';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Default configuration for LinoCache
 */
const DEFAULT_OPTIONS = {
  ttl: 0, // 0 means no expiration
  mode: 'folder', // 'file' or 'folder'
  basePath: '.cache',
  fileName: 'cache.lino', // Only used in 'file' mode
};

const storageQueues = new Map();
let temporaryFileSequence = 0;

/**
 * Runs an operation after earlier operations for the same storage location.
 * The queue is shared by all cache instances in this JavaScript process.
 * @param {string} storageId - Absolute storage location
 * @param {Function} operation - Operation to serialize
 * @returns {Promise<*>} - The operation result
 */
const withStorageQueue = async (storageId, operation) => {
  const previous = storageQueues.get(storageId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  storageQueues.set(storageId, current);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (storageQueues.get(storageId) === current) {
      storageQueues.delete(storageId);
    }
  }
};

/**
 * Replaces a file atomically after writing its complete contents.
 * @param {string} filePath - Destination file
 * @param {string} content - Complete file contents
 * @returns {Promise<void>}
 */
const writeFileAtomically = async (filePath, content) => {
  temporaryFileSequence += 1;
  const temporaryPath = `${filePath}.${Date.now()}-${temporaryFileSequence}.tmp`;

  try {
    await fs.writeFile(temporaryPath, content, 'utf-8');
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch {
      // The temporary file may not have been created or may already be gone.
    }
    throw error;
  }
};

/**
 * Internal cache entry structure
 * @typedef {Object} CacheEntry
 * @property {*} value - The cached value
 * @property {number} expiresAt - Timestamp when entry expires (0 = never)
 */

/**
 * LinoCache options
 * @typedef {Object} LinoCacheOptions
 * @property {number} [ttl=0] - Default TTL in milliseconds (0 = no expiration)
 * @property {'file'|'folder'} [mode='folder'] - Cache storage mode
 * @property {string} [basePath='.cache'] - Base path for cache storage
 * @property {string} [fileName='cache.lino'] - File name for single-file mode
 */

/**
 * Sanitizes a cache key to be safe for use as a filename
 * @param {string} key - The cache key
 * @returns {string} - A sanitized filename-safe version
 */
const sanitizeKeyForFilename = (key) => {
  // Replace unsafe characters with safe alternatives
  // Control characters intentionally matched to filter unsafe filename characters
  const regex = /[<>:"/\\|?*\x00-\x1f]/g; // eslint-disable-line no-control-regex
  const sanitized = key
    .replace(regex, '_')
    .replace(/\s+/g, '_')
    .replace(/\.+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  // If the sanitized result is empty, use a hash
  if (!sanitized) {
    return `key_${Buffer.from(key).toString('base64url')}`;
  }

  // Limit filename length (leaving room for .lino extension)
  if (sanitized.length > 200) {
    const hash = Buffer.from(key).toString('base64url').slice(0, 32);
    return `${sanitized.slice(0, 160)}_${hash}`;
  }

  return sanitized;
};

/**
 * LinoCache - A cache-manager compatible store using Links Notation
 */
export class LinoCache {
  /**
   * @param {LinoCacheOptions} options - Cache configuration options
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.initialized = false;
    this.singleFileCache = null; // Used in 'file' mode
  }

  /**
   * Ensures the cache directory exists
   * @private
   */
  async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    await fs.mkdir(this.options.basePath, { recursive: true });

    if (this.options.mode === 'file') {
      await this.loadSingleFileCache();
    }

    this.initialized = true;
  }

  /**
   * Gets the file path for a cache key in folder mode
   * @private
   * @param {string} key - The cache key
   * @returns {string} - The file path
   */
  getKeyFilePath(key) {
    const safeKey = sanitizeKeyForFilename(key);
    return path.join(this.options.basePath, `${safeKey}.lino`);
  }

  /**
   * Gets the file path for single-file mode
   * @private
   * @returns {string} - The file path
   */
  getSingleFilePath() {
    return path.join(this.options.basePath, this.options.fileName);
  }

  /**
   * Gets the queue identifier shared by instances using this storage.
   * @private
   * @returns {string} - Absolute storage location
   */
  getStorageId() {
    const storagePath =
      this.options.mode === 'file'
        ? this.getSingleFilePath()
        : this.options.basePath;
    return path.resolve(storagePath);
  }

  /**
   * Serializes a storage operation with operations from other local instances.
   * @private
   * @param {Function} operation - Operation to serialize
   * @returns {Promise<*>} - The operation result
   */
  withStorageLock(operation) {
    return withStorageQueue(this.getStorageId(), operation);
  }

  /**
   * Loads the cache from single file
   * @private
   */
  async loadSingleFileCache() {
    const filePath = this.getSingleFilePath();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const decoded = decode({ notation: content });
      this.singleFileCache = decoded || {};
    } catch {
      // File doesn't exist or is corrupted, start fresh
      this.singleFileCache = {};
    }
  }

  /**
   * Saves the cache to single file
   * @private
   */
  async saveSingleFileCache() {
    const filePath = this.getSingleFilePath();
    const encoded = encode({ obj: this.singleFileCache });
    await writeFileAtomically(filePath, encoded);
  }

  /**
   * Reads a cache entry without acquiring the storage lock.
   * @private
   * @param {string} key - The cache key
   * @returns {Promise<CacheEntry|undefined>} - Stored entry, if present
   */
  async readEntryUnlocked(key) {
    if (this.options.mode === 'file') {
      await this.loadSingleFileCache();
      return this.singleFileCache[key];
    }

    const filePath = this.getKeyFilePath(key);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const entry = decode({ notation: content });
      return entry?.key === key ? entry : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Writes a cache entry without acquiring the storage lock.
   * @private
   * @param {string} key - The cache key
   * @param {CacheEntry} entry - Entry to persist
   * @returns {Promise<void>}
   */
  async writeEntryUnlocked(key, entry) {
    if (this.options.mode === 'file') {
      this.singleFileCache[key] = entry;
      await this.saveSingleFileCache();
      return;
    }

    const filePath = this.getKeyFilePath(key);
    const data = { key, value: entry.value, expiresAt: entry.expiresAt };
    const encoded = encode({ obj: data });
    await writeFileAtomically(filePath, encoded);
  }

  /**
   * Deletes a cache entry without acquiring the storage lock.
   * @private
   * @param {string} key - The cache key
   * @returns {Promise<boolean>} - Whether a stored entry was removed
   */
  async deleteEntryUnlocked(key) {
    if (this.options.mode === 'file') {
      if (this.singleFileCache[key] === undefined) {
        return false;
      }
      delete this.singleFileCache[key];
      await this.saveSingleFileCache();
      return true;
    }

    try {
      await fs.unlink(this.getKeyFilePath(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads a live entry and lazily removes it if expired.
   * @private
   * @param {string} key - The cache key
   * @returns {Promise<CacheEntry|undefined>} - Live entry, if present
   */
  readEntry(key) {
    return this.withStorageLock(async () => {
      await this.ensureInitialized();
      const entry = await this.readEntryUnlocked(key);
      if (entry && this.isExpired(entry)) {
        await this.deleteEntryUnlocked(key);
        return undefined;
      }
      return entry;
    });
  }

  /**
   * Applies a read-modify-write operation atomically within this process.
   * @private
   * @param {string} key - The cache key
   * @param {Function} mutation - Returns { entry, result } for the new state
   * @returns {Promise<*>} - Mutation result
   */
  mutateEntry(key, mutation) {
    return this.withStorageLock(async () => {
      await this.ensureInitialized();
      let entry = await this.readEntryUnlocked(key);
      if (entry && this.isExpired(entry)) {
        await this.deleteEntryUnlocked(key);
        entry = undefined;
      }

      const outcome = mutation(entry);
      if (outcome.changed) {
        if (outcome.entry === undefined) {
          await this.deleteEntryUnlocked(key);
        } else {
          await this.writeEntryUnlocked(key, outcome.entry);
        }
      }
      return outcome.result;
    });
  }

  /**
   * Checks if an entry is expired
   * @private
   * @param {CacheEntry} entry - The cache entry
   * @returns {boolean} - True if expired
   */
  isExpired(entry) {
    if (!entry || !entry.expiresAt) {
      return false;
    }
    return entry.expiresAt > 0 && Date.now() > entry.expiresAt;
  }

  /**
   * Calculates expiration timestamp
   * @private
   * @param {number} [ttl] - TTL in milliseconds
   * @returns {number} - Expiration timestamp (0 = never)
   */
  calculateExpiresAt(ttl) {
    const effectiveTtl = ttl !== undefined ? ttl : this.options.ttl;
    if (!effectiveTtl || effectiveTtl <= 0) {
      return 0;
    }
    return Date.now() + effectiveTtl;
  }

  /**
   * Sets a value in the cache
   * @param {string} key - The cache key
   * @param {*} value - The value to cache
   * @param {number} [ttl] - Optional TTL in milliseconds
   * @returns {Promise<*>} - The cached value
   */
  set(key, value, ttl) {
    const entry = {
      value,
      expiresAt: this.calculateExpiresAt(ttl),
    };

    return this.mutateEntry(key, () => ({
      changed: true,
      entry,
      result: value,
    }));
  }

  /**
   * Gets a value from the cache
   * @param {string} key - The cache key
   * @returns {Promise<*>} - The cached value or undefined if not found/expired
   */
  async get(key) {
    const entry = await this.readEntry(key);
    return entry?.value;
  }

  /**
   * Deletes a value from the cache
   * @param {string} key - The cache key
   * @returns {Promise<boolean>} - True if deleted
   */
  del(key) {
    return this.mutateEntry(key, (entry) => ({
      changed: entry !== undefined,
      entry: undefined,
      result: entry !== undefined,
    }));
  }

  /**
   * Adds a value only when the key does not contain a live entry.
   * @param {string} key - The cache key
   * @param {*} value - The value to cache
   * @param {number} [ttl] - Optional TTL in milliseconds
   * @returns {Promise<boolean>} - True if the value was added
   */
  add(key, value, ttl) {
    const newEntry = {
      value,
      expiresAt: this.calculateExpiresAt(ttl),
    };

    return this.mutateEntry(key, (entry) => ({
      changed: entry === undefined,
      entry: entry === undefined ? newEntry : entry,
      result: entry === undefined,
    }));
  }

  /**
   * Replaces a value only when the key contains a live entry.
   * @param {string} key - The cache key
   * @param {*} value - The replacement value
   * @param {number} [ttl] - Optional TTL in milliseconds
   * @returns {Promise<boolean>} - True if the value was replaced
   */
  replace(key, value, ttl) {
    const newEntry = {
      value,
      expiresAt: this.calculateExpiresAt(ttl),
    };

    return this.mutateEntry(key, (entry) => ({
      changed: entry !== undefined,
      entry: entry === undefined ? undefined : newEntry,
      result: entry !== undefined,
    }));
  }

  /**
   * Updates the expiration of a live entry without changing its value.
   * @param {string} key - The cache key
   * @param {number} [ttl] - TTL in milliseconds
   * @returns {Promise<boolean>} - True if the expiration was updated
   */
  touch(key, ttl) {
    return this.mutateEntry(key, (entry) => ({
      changed: entry !== undefined,
      entry:
        entry === undefined
          ? undefined
          : { ...entry, expiresAt: this.calculateExpiresAt(ttl) },
      result: entry !== undefined,
    }));
  }

  /**
   * Gets and deletes a live entry as one local atomic operation.
   * @param {string} key - The cache key
   * @returns {Promise<*>} - The previous value, or undefined
   */
  getdel(key) {
    return this.mutateEntry(key, (entry) => ({
      changed: entry !== undefined,
      entry: undefined,
      result: entry?.value,
    }));
  }

  /**
   * Descriptive alias for getdel().
   * @param {string} key - The cache key
   * @returns {Promise<*>} - The previous value, or undefined
   */
  getAndDelete(key) {
    return this.getdel(key);
  }

  /**
   * Gets a live entry and updates its expiration as one local atomic operation.
   * @param {string} key - The cache key
   * @param {number} [ttl] - TTL in milliseconds
   * @returns {Promise<*>} - The value, or undefined
   */
  getex(key, ttl) {
    return this.mutateEntry(key, (entry) => ({
      changed: entry !== undefined,
      entry:
        entry === undefined
          ? undefined
          : { ...entry, expiresAt: this.calculateExpiresAt(ttl) },
      result: entry?.value,
    }));
  }

  /**
   * Descriptive alias for getex().
   * @param {string} key - The cache key
   * @param {number} [ttl] - TTL in milliseconds
   * @returns {Promise<*>} - The value, or undefined
   */
  getAndTouch(key, ttl) {
    return this.getex(key, ttl);
  }

  /**
   * Adds an amount to a numeric entry, creating it from zero when absent.
   * The TTL of an existing entry is preserved.
   * @param {string} key - The cache key
   * @param {number} [amount=1] - Amount to add
   * @returns {Promise<number>} - The updated number
   */
  increment(key, amount = 1) {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return Promise.reject(
        new TypeError('increment amount must be a finite number')
      );
    }

    return this.mutateEntry(key, (entry) => {
      if (
        entry !== undefined &&
        (typeof entry.value !== 'number' || !Number.isFinite(entry.value))
      ) {
        throw new TypeError('cached value must be a finite number');
      }

      const value = (entry?.value || 0) + amount;
      return {
        changed: true,
        entry: {
          value,
          expiresAt:
            entry === undefined ? this.calculateExpiresAt() : entry.expiresAt,
        },
        result: value,
      };
    });
  }

  /**
   * Redis-style alias for increment().
   * @param {string} key - The cache key
   * @param {number} [amount=1] - Amount to add
   * @returns {Promise<number>} - The updated number
   */
  incr(key, amount = 1) {
    return this.increment(key, amount);
  }

  /**
   * Subtracts an amount from a numeric entry, creating it from zero when absent.
   * The result may be negative and the TTL of an existing entry is preserved.
   * @param {string} key - The cache key
   * @param {number} [amount=1] - Amount to subtract
   * @returns {Promise<number>} - The updated number
   */
  decrement(key, amount = 1) {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return Promise.reject(
        new TypeError('decrement amount must be a finite number')
      );
    }
    return this.increment(key, -amount);
  }

  /**
   * Redis-style alias for decrement().
   * @param {string} key - The cache key
   * @param {number} [amount=1] - Amount to subtract
   * @returns {Promise<number>} - The updated number
   */
  decr(key, amount = 1) {
    return this.decrement(key, amount);
  }

  /**
   * Appends text to a string entry, creating it when absent.
   * The TTL of an existing entry is preserved.
   * @param {string} key - The cache key
   * @param {string} suffix - Text to append
   * @returns {Promise<string>} - The updated string
   */
  append(key, suffix) {
    if (typeof suffix !== 'string') {
      return Promise.reject(new TypeError('append suffix must be a string'));
    }

    return this.mutateEntry(key, (entry) => {
      if (entry !== undefined && typeof entry.value !== 'string') {
        throw new TypeError('cached value must be a string');
      }
      const value = `${entry?.value || ''}${suffix}`;
      return {
        changed: true,
        entry: {
          value,
          expiresAt:
            entry === undefined ? this.calculateExpiresAt() : entry.expiresAt,
        },
        result: value,
      };
    });
  }

  /**
   * Prepends text to a string entry, creating it when absent.
   * The TTL of an existing entry is preserved.
   * @param {string} key - The cache key
   * @param {string} prefix - Text to prepend
   * @returns {Promise<string>} - The updated string
   */
  prepend(key, prefix) {
    if (typeof prefix !== 'string') {
      return Promise.reject(new TypeError('prepend prefix must be a string'));
    }

    return this.mutateEntry(key, (entry) => {
      if (entry !== undefined && typeof entry.value !== 'string') {
        throw new TypeError('cached value must be a string');
      }
      const value = `${prefix}${entry?.value || ''}`;
      return {
        changed: true,
        entry: {
          value,
          expiresAt:
            entry === undefined ? this.calculateExpiresAt() : entry.expiresAt,
        },
        result: value,
      };
    });
  }

  /**
   * Sets multiple values in the cache
   * @param {Array<{key: string, value: *, ttl?: number}>} entries - Array of entries
   * @returns {Promise<true>} - Always returns true
   */
  async mset(entries) {
    await this.ensureInitialized();

    for (const { key, value, ttl } of entries) {
      await this.set(key, value, ttl);
    }

    return true;
  }

  /**
   * Gets multiple values from the cache
   * @param {string[]} keys - Array of cache keys
   * @returns {Promise<Array<*>>} - Array of values (undefined for missing/expired)
   */
  async mget(keys) {
    await this.ensureInitialized();

    const results = [];
    for (const key of keys) {
      const value = await this.get(key);
      results.push(value);
    }
    return results;
  }

  /**
   * Deletes multiple values from the cache
   * @param {string[]} keys - Array of cache keys
   * @returns {Promise<boolean>} - True if any were deleted
   */
  async mdel(keys) {
    await this.ensureInitialized();

    let anyDeleted = false;
    for (const key of keys) {
      const deleted = await this.del(key);
      if (deleted) {
        anyDeleted = true;
      }
    }
    return anyDeleted;
  }

  /**
   * Clears all values from the cache
   * @returns {Promise<void>}
   */
  clear() {
    return this.withStorageLock(async () => {
      await this.ensureInitialized();

      if (this.options.mode === 'file') {
        this.singleFileCache = {};
        await this.saveSingleFileCache();
      } else {
        // In folder mode, remove all .lino files
        try {
          const files = await fs.readdir(this.options.basePath);
          for (const file of files) {
            if (file.endsWith('.lino')) {
              await fs.unlink(path.join(this.options.basePath, file));
            }
          }
        } catch {
          // Directory might not exist, ignore
        }
      }
    });
  }

  /**
   * Wraps a function with caching
   * @param {string} key - The cache key
   * @param {Function} fn - The function to wrap
   * @param {number} [ttl] - Optional TTL in milliseconds
   * @returns {Promise<*>} - The cached or computed value
   */
  async wrap(key, fn, ttl) {
    const cached = await this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Gets the remaining TTL for a key in milliseconds
   * @param {string} key - The cache key
   * @returns {Promise<number>} - Remaining TTL in ms, -1 if no TTL, -2 if not found
   */
  async ttl(key) {
    const entry = await this.readEntry(key);
    if (!entry) {
      return -2;
    }

    if (!entry.expiresAt || entry.expiresAt === 0) {
      return -1;
    }

    return Math.max(0, entry.expiresAt - Date.now());
  }

  /**
   * Checks if a key exists in the cache
   * @param {string} key - The cache key
   * @returns {Promise<boolean>} - True if exists and not expired
   */
  async has(key) {
    const value = await this.get(key);
    return value !== undefined;
  }

  /**
   * Returns all keys in the cache
   * @returns {Promise<string[]>} - Array of cache keys
   */
  keys() {
    return this.withStorageLock(async () => {
      await this.ensureInitialized();

      if (this.options.mode === 'file') {
        await this.loadSingleFileCache();
        const keys = [];
        let removedExpired = false;
        for (const key of Object.keys(this.singleFileCache)) {
          const entry = this.singleFileCache[key];
          if (this.isExpired(entry)) {
            delete this.singleFileCache[key];
            removedExpired = true;
          } else {
            keys.push(key);
          }
        }
        if (removedExpired) {
          await this.saveSingleFileCache();
        }
        return keys;
      }

      // In folder mode, read all .lino files
      const keys = [];
      try {
        const files = await fs.readdir(this.options.basePath);
        for (const file of files) {
          if (file.endsWith('.lino')) {
            const filePath = path.join(this.options.basePath, file);
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              const entry = decode({ notation: content });
              if (entry && this.isExpired(entry)) {
                await fs.unlink(filePath);
              } else if (entry && typeof entry.key === 'string') {
                keys.push(entry.key);
              }
            } catch {
              // Skip corrupted files
            }
          }
        }
      } catch {
        // Directory might not exist
      }
      return keys;
    });
  }

  /**
   * Closes the cache (cleanup)
   * @returns {Promise<void>}
   */
  disconnect() {
    this.initialized = false;
    this.singleFileCache = null;
    return Promise.resolve();
  }

  /**
   * Alias for clear() for cache-manager compatibility
   * @returns {Promise<void>}
   */
  reset() {
    return this.clear();
  }
}

/**
 * Creates a new LinoCache store
 * @param {LinoCacheOptions} [options] - Cache configuration options
 * @returns {LinoCache} - A new LinoCache instance
 */
export const createLinoCache = (options = {}) => new LinoCache(options);

/**
 * Creates a cache-manager compatible store
 * This is for integration with the cache-manager library
 * @param {LinoCacheOptions} [options] - Cache configuration options
 * @returns {LinoCache} - A new LinoCache instance compatible with cache-manager
 */
export const linoStore = (options = {}) => new LinoCache(options);

// Default export
export default LinoCache;
