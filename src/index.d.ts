/**
 * lino-cache - A cache-manager compatible file-based cache using Links Notation
 *
 * Type definitions for lino-cache
 */

/**
 * Cache storage mode
 * - 'file': All cache entries stored in a single .lino file
 * - 'folder': Each cache entry stored in a separate .lino file
 */
export type CacheMode = 'file' | 'folder';

/**
 * Configuration options for LinoCache
 */
export interface LinoCacheOptions {
  /**
   * Default TTL (time-to-live) in milliseconds
   * Set to 0 for no expiration
   * @default 0
   */
  ttl?: number;

  /**
   * Cache storage mode
   * @default 'folder'
   */
  mode?: CacheMode;

  /**
   * Base path for cache storage directory
   * @default '.cache'
   */
  basePath?: string;

  /**
   * File name for single-file mode cache
   * Only used when mode is 'file'
   * @default 'cache.lino'
   */
  fileName?: string;
}

/**
 * Cache entry for mset operation
 */
export interface MsetEntry<T = unknown> {
  /**
   * Cache key
   */
  key: string;

  /**
   * Value to cache
   */
  value: T;

  /**
   * Optional TTL for this specific entry (in milliseconds)
   */
  ttl?: number;
}

/**
 * LinoCache - A cache-manager compatible store using Links Notation
 *
 * This class provides a file-based caching solution that stores data
 * in Links Notation (.lino) format instead of JSON. It supports both
 * single-file mode (all cache in one file) and folder mode (each key
 * in a separate file).
 *
 * The class implements the cache-manager store interface, making it
 * compatible with the cache-manager library.
 *
 * @example
 * ```typescript
 * import { LinoCache } from 'lino-cache';
 *
 * // Folder mode (default)
 * const folderCache = new LinoCache({
 *   basePath: '.cache/folder'
 * });
 *
 * // Single-file mode
 * const fileCache = new LinoCache({
 *   mode: 'file',
 *   basePath: '.cache',
 *   fileName: 'my-cache.lino'
 * });
 *
 * await folderCache.set('user:1', { name: 'Alice', age: 30 });
 * const user = await folderCache.get('user:1');
 * ```
 */
export declare class LinoCache {
  /**
   * Creates a new LinoCache instance
   * @param options - Cache configuration options
   */
  constructor(options?: LinoCacheOptions);

  /**
   * Sets a value in the cache
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttl - Optional TTL in milliseconds (overrides default)
   * @returns The cached value
   */
  set<T>(key: string, value: T, ttl?: number): Promise<T>;

  /**
   * Gets a value from the cache
   * @param key - The cache key
   * @returns The cached value or undefined if not found/expired
   */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * Deletes a value from the cache
   * @param key - The cache key
   * @returns True if the key was deleted, false if it didn't exist
   */
  del(key: string): Promise<boolean>;

  /**
   * Sets multiple values in the cache
   * @param entries - Array of key-value-ttl entries
   * @returns Always returns true
   */
  mset<T = unknown>(entries: MsetEntry<T>[]): Promise<true>;

  /**
   * Gets multiple values from the cache
   * @param keys - Array of cache keys
   * @returns Array of values (undefined for missing/expired keys)
   */
  mget<T>(keys: string[]): Promise<(T | undefined)[]>;

  /**
   * Deletes multiple values from the cache
   * @param keys - Array of cache keys
   * @returns True if any keys were deleted
   */
  mdel(keys: string[]): Promise<boolean>;

  /**
   * Clears all values from the cache
   */
  clear(): Promise<void>;

  /**
   * Wraps a function with caching
   *
   * If the key exists in cache and is not expired, returns the cached value.
   * Otherwise, executes the function, caches the result, and returns it.
   *
   * @param key - The cache key
   * @param fn - The function to wrap
   * @param ttl - Optional TTL in milliseconds
   * @returns The cached or computed value
   */
  wrap<T>(key: string, fn: () => Promise<T> | T, ttl?: number): Promise<T>;

  /**
   * Gets the remaining TTL for a key in milliseconds
   * @param key - The cache key
   * @returns Remaining TTL in ms, -1 if no TTL set, -2 if key not found
   */
  ttl(key: string): Promise<number>;

  /**
   * Checks if a key exists in the cache and is not expired
   * @param key - The cache key
   * @returns True if the key exists and is not expired
   */
  has(key: string): Promise<boolean>;

  /**
   * Returns all keys in the cache (excluding expired entries)
   * @returns Array of cache keys
   */
  keys(): Promise<string[]>;

  /**
   * Closes the cache and releases resources
   */
  disconnect(): Promise<void>;

  /**
   * Alias for clear() - for cache-manager compatibility
   */
  reset(): Promise<void>;
}

/**
 * Creates a new LinoCache store
 * @param options - Cache configuration options
 * @returns A new LinoCache instance
 *
 * @example
 * ```typescript
 * import { createLinoCache } from 'lino-cache';
 *
 * const cache = createLinoCache({
 *   mode: 'folder',
 *   basePath: '.cache',
 *   ttl: 60000 // 1 minute default TTL
 * });
 * ```
 */
export declare function createLinoCache(options?: LinoCacheOptions): LinoCache;

/**
 * Creates a cache-manager compatible store
 *
 * This function creates a LinoCache instance that is compatible with
 * the cache-manager library's store interface.
 *
 * @param options - Cache configuration options
 * @returns A new LinoCache instance compatible with cache-manager
 *
 * @example
 * ```typescript
 * import { caching } from 'cache-manager';
 * import { linoStore } from 'lino-cache';
 *
 * const cache = await caching(linoStore({
 *   mode: 'folder',
 *   basePath: '.cache'
 * }));
 * ```
 */
export declare function linoStore(options?: LinoCacheOptions): LinoCache;

/**
 * Default export - LinoCache class
 */
export default LinoCache;
