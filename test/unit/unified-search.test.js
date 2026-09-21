// Option handling, ranking and result assembly for the unified search engine.
// Network is mocked, so these cover the engine's own logic rather than Open5e.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { UnifiedSearchEngine } from '../../dist/unified-search-engine.js';
import { installMockFetch, page } from '../helpers/mock-fetch.js';

let mock;
afterEach(() => { mock?.restore(); mock = undefined; });

/** Responds to any endpoint with rows named after the requested collection. */
function mockCatalogue(rowsByCollection = {}) {
  mock = installMockFetch(url => {
    const collection = url.pathname.split('/').filter(Boolean).pop();
    return page(rowsByCollection[collection] ?? []);
  });
  return new UnifiedSearchEngine();
}

describe('option validation', () => {
  test('an empty query is rejected rather than searching for everything', async () => {
    const engine = mockCatalogue();
    await assert.rejects(() => engine.unifiedSearch({ query: '' }), /query is required/i);
  });

  test('a whitespace-only query is rejected', async () => {
    const engine = mockCatalogue();
    await assert.rejects(() => engine.unifiedSearch({ query: '   ' }), /query is required/i);
  });

  test('a missing query is rejected', async () => {
    const engine = mockCatalogue();
    await assert.rejects(() => engine.unifiedSearch({}), /query is required/i);
  });
});

describe('content type selection', () => {
  test('only the requested content types are queried', async () => {
    const engine = mockCatalogue({ spells: [{ name: 'Fireball', level: 3 }] });

    const result = await engine.unifiedSearch({ query: 'fireball', contentTypes: ['spells'] });

    assert.ok(result.results.spells);
    assert.equal(result.results.monsters, undefined);
    assert.ok(mock.calls.every(u => u.pathname.includes('spells')),
      `unexpected endpoints: ${mock.calls.map(u => u.pathname).join(', ')}`);
  });

  test('all content types are searched by default', async () => {
    const engine = mockCatalogue();
    const result = await engine.unifiedSearch({ query: 'dragon' });

    assert.ok(Object.keys(result.results).length > 5);
  });
});

describe('result assembly', () => {
  test('results are capped at the requested limit per content type', async () => {
    const engine = mockCatalogue({
      spells: Array.from({ length: 20 }, (_, i) => ({
        name: `Dragon Spell ${i}`, level: 1, key: `s${i}`
      }))
    });

    const result = await engine.unifiedSearch({
      query: 'dragon', contentTypes: ['spells'], limit: 3
    });

    assert.equal(result.results.spells.items.length, 3);
    assert.equal(result.results.spells.hasMore, true);
  });

  test('the limit is clamped to the supported range', async () => {
    const engine = mockCatalogue({
      spells: Array.from({ length: 50 }, (_, i) => ({
        name: `Dragon Spell ${i}`, level: 1, key: `s${i}`
      }))
    });

    const result = await engine.unifiedSearch({
      query: 'dragon', contentTypes: ['spells'], limit: 999
    });

    assert.ok(result.results.spells.items.length <= 20);
  });

  test('a content type with no matches reports an empty bucket', async () => {
    const engine = mockCatalogue({ spells: [] });
    const result = await engine.unifiedSearch({ query: 'dragon', contentTypes: ['spells'] });

    assert.deepEqual(result.results.spells.items, []);
  });

  test('an upstream failure degrades that content type instead of the whole search', async () => {
    mock = installMockFetch(url =>
      url.pathname.includes('creatures')
        ? { __status: 500, __statusText: 'Error', __body: 'boom' }
        : page([{ name: 'Dragon Spell', level: 1 }])
    );
    const engine = new UnifiedSearchEngine();

    const result = await engine.unifiedSearch({
      query: 'dragon', contentTypes: ['spells', 'monsters']
    });

    assert.ok(result.results.spells.items.length > 0, 'healthy type should still return');
    assert.deepEqual(result.results.monsters.items, [], 'failed type should be empty');
  });

  test('the response reports the query and an execution time', async () => {
    const engine = mockCatalogue({ spells: [{ name: 'Dragon Spell', level: 1 }] });
    const result = await engine.unifiedSearch({ query: 'dragon', contentTypes: ['spells'] });

    assert.equal(result.query, 'dragon');
    assert.equal(typeof result.executionTime, 'number');
    assert.ok(result.executionTime >= 0);
  });
});

describe('ranking', () => {
  test('an exact name match outranks a partial one', async () => {
    const engine = mockCatalogue({
      spells: [
        { name: 'Delayed Blast Fireball', level: 7 },
        { name: 'Fireball', level: 3 }
      ]
    });

    const result = await engine.unifiedSearch({
      query: 'fireball', contentTypes: ['spells'], limit: 5
    });

    assert.equal(result.results.spells.items[0].name, 'Fireball');
  });

  test('sorting by name orders results alphabetically', async () => {
    const engine = mockCatalogue({
      spells: [
        { name: 'Zone of Truth', level: 2 },
        { name: 'Aid', level: 2 },
        { name: 'Mage Hand', level: 0 }
      ]
    });

    const result = await engine.unifiedSearch({
      query: 'a', contentTypes: ['spells'], sortBy: 'name', fuzzyThreshold: 1.0
    });

    const names = result.results.spells.items.map(i => i.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('caching', () => {
  test('an identical search is served from cache', async () => {
    const engine = mockCatalogue({ spells: [{ name: 'Fireball', level: 3 }] });

    await engine.unifiedSearch({ query: 'fireball', contentTypes: ['spells'] });
    const before = mock.calls.length;
    await engine.unifiedSearch({ query: 'fireball', contentTypes: ['spells'] });

    assert.equal(mock.calls.length, before, 'repeat search should not refetch');
  });

  test('clearCache forces a refetch', async () => {
    const engine = mockCatalogue({ spells: [{ name: 'Fireball', level: 3 }] });

    await engine.unifiedSearch({ query: 'fireball', contentTypes: ['spells'] });
    const before = mock.calls.length;
    engine.clearCache();
    await engine.unifiedSearch({ query: 'fireball', contentTypes: ['spells'] });

    assert.ok(mock.calls.length > before);
  });
});
