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
    await fs.writeFile(filePath, encoded, 'utf-8');
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
  async set(key, value, ttl) {
    await this.ensureInitialized();

    const entry = {
      value,
      expiresAt: this.calculateExpiresAt(ttl),
    };

    if (this.options.mode === 'file') {
      this.singleFileCache[key] = entry;
      await this.saveSingleFileCache();
    } else {
      const filePath = this.getKeyFilePath(key);
      // Store original key for reverse lookup
      const data = { key, ...entry };
      const encoded = encode({ obj: data });
      await fs.writeFile(filePath, encoded, 'utf-8');
    }

    return value;
  }

  /**
   * Gets a value from the cache
   * @param {string} key - The cache key
   * @returns {Promise<*>} - The cached value or undefined if not found/expired
   */
  async get(key) {
    await this.ensureInitialized();

    let entry;

    if (this.options.mode === 'file') {
      entry = this.singleFileCache[key];
    } else {
      const filePath = this.getKeyFilePath(key);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        entry = decode({ notation: content });
      } catch {
        return undefined;
      }
    }

    if (!entry) {
      return undefined;
    }

    if (this.isExpired(entry)) {
      await this.del(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Deletes a value from the cache
   * @param {string} key - The cache key
   * @returns {Promise<boolean>} - True if deleted
   */
  async del(key) {
    await this.ensureInitialized();

    if (this.options.mode === 'file') {
      if (this.singleFileCache[key] !== undefined) {
        delete this.singleFileCache[key];
        await this.saveSingleFileCache();
        return true;
      }
      return false;
    }

    const filePath = this.getKeyFilePath(key);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
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
  async clear() {
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
    await this.ensureInitialized();

    let entry;

    if (this.options.mode === 'file') {
      entry = this.singleFileCache[key];
    } else {
      const filePath = this.getKeyFilePath(key);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        entry = decode({ notation: content });
      } catch {
        return -2;
      }
    }

    if (!entry) {
      return -2;
    }

    if (this.isExpired(entry)) {
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
  async keys() {
    await this.ensureInitialized();

    if (this.options.mode === 'file') {
      const keys = [];
      for (const key of Object.keys(this.singleFileCache)) {
        const entry = this.singleFileCache[key];
        if (!this.isExpired(entry)) {
          keys.push(key);
        }
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
            if (entry && entry.key && !this.isExpired(entry)) {
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
