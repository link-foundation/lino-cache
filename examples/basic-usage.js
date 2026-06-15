/**
 * Basic usage examples for lino-cache
 *
 * Run with: node examples/basic-usage.js
 */

import { LinoCache, createLinoCache } from '../src/index.js';
import { promises as fs } from 'node:fs';

// Helper to delay execution
const delay = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

// Cleanup helper
const cleanup = async (dir) => {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
};

// Example 1: Folder Mode (default)
async function exampleFolderMode() {
  console.log('1. Folder Mode (each key in separate file)');
  console.log('-'.repeat(50));

  const folderCache = new LinoCache({
    basePath: '.cache-examples/folder',
  });

  await folderCache.set('user:1', { name: 'Alice', age: 30 });
  await folderCache.set('user:2', { name: 'Bob', age: 25 });

  const user1 = await folderCache.get('user:1');
  console.log('user:1 =', user1);

  const keys = await folderCache.keys();
  console.log('All keys:', keys);

  const files = await fs.readdir('.cache-examples/folder');
  console.log('Files created:', files);
  console.log();
}

// Example 2: Single-File Mode
async function exampleSingleFileMode() {
  console.log('2. Single-File Mode (all keys in one file)');
  console.log('-'.repeat(50));

  const fileCache = new LinoCache({
    mode: 'file',
    basePath: '.cache-examples/single',
    fileName: 'app-cache.lino',
  });

  await fileCache.set('config', { theme: 'dark', lang: 'en' });
  await fileCache.set('session', { token: 'abc123', userId: 1 });

  const config = await fileCache.get('config');
  console.log('config =', config);

  const singleFiles = await fs.readdir('.cache-examples/single');
  console.log('Files created:', singleFiles);
  console.log();
}

// Example 3: TTL (Time To Live)
async function exampleTTL() {
  console.log('3. TTL (Time To Live)');
  console.log('-'.repeat(50));

  const ttlCache = new LinoCache({
    basePath: '.cache-examples/ttl',
  });

  await ttlCache.set('temporary', 'this will expire', 500);
  console.log('Set "temporary" with 500ms TTL');

  let value = await ttlCache.get('temporary');
  console.log('Immediately after set:', value);

  const remaining = await ttlCache.ttl('temporary');
  console.log('Remaining TTL:', remaining, 'ms');

  console.log('Waiting 600ms...');
  await delay(600);

  value = await ttlCache.get('temporary');
  console.log('After 600ms:', value);
  console.log();
}

// Example 4: wrap() function
async function exampleWrap() {
  console.log('4. wrap() - Cache function results');
  console.log('-'.repeat(50));

  const wrapCache = new LinoCache({
    basePath: '.cache-examples/wrap',
  });

  let callCount = 0;
  const expensiveOperation = async () => {
    callCount++;
    console.log(`  [expensiveOperation called - count: ${callCount}]`);
    await delay(100);
    return { result: 'computed value', timestamp: Date.now() };
  };

  console.log('First call (computes):');
  const result1 = await wrapCache.wrap('expensive', expensiveOperation);
  console.log('Result:', result1);

  console.log('\nSecond call (from cache):');
  const result2 = await wrapCache.wrap('expensive', expensiveOperation);
  console.log('Result:', result2);

  console.log(`\nTotal function calls: ${callCount} (should be 1)`);
  console.log();
}

// Example 5: Multi-key operations
async function exampleMultiKey() {
  console.log('5. Multi-key Operations');
  console.log('-'.repeat(50));

  const multiCache = new LinoCache({
    basePath: '.cache-examples/multi',
  });

  await multiCache.mset([
    { key: 'product:1', value: { name: 'Widget', price: 9.99 } },
    { key: 'product:2', value: { name: 'Gadget', price: 19.99 } },
    { key: 'product:3', value: { name: 'Doohickey', price: 29.99 } },
  ]);
  console.log('Set 3 products with mset()');

  const products = await multiCache.mget(['product:1', 'product:2', 'missing']);
  console.log('mget() results:', products);

  await multiCache.mdel(['product:1', 'product:2']);
  console.log('Deleted product:1 and product:2');

  const remainingKeys = await multiCache.keys();
  console.log('Remaining keys:', remainingKeys);
  console.log();
}

// Example 6: Factory function
async function exampleFactory() {
  console.log('6. Factory Function');
  console.log('-'.repeat(50));

  const factoryCache = createLinoCache({
    basePath: '.cache-examples/factory',
    ttl: 60000,
  });

  await factoryCache.set('quick', 'easy setup');
  console.log('Created cache with createLinoCache()');
  console.log('Value:', await factoryCache.get('quick'));
  console.log();
}

async function main() {
  console.log('=== lino-cache Basic Usage Examples ===\n');

  await exampleFolderMode();
  await exampleSingleFileMode();
  await exampleTTL();
  await exampleWrap();
  await exampleMultiKey();
  await exampleFactory();

  console.log('Cleaning up example caches...');
  await cleanup('.cache-examples');
  console.log('Done!');
}

main().catch(console.error);
