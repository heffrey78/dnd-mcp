// Caching, error handling, parameter sanitisation and field mapping.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Open5eClient } from '../../dist/open5e-client.js';
import { installMockFetch, page } from '../helpers/mock-fetch.js';

let mock;
afterEach(() => { mock?.restore(); mock = undefined; });

describe('caching', () => {
  test('an identical request is served from cache instead of refetching', async () => {
    mock = installMockFetch(() => page([{ name: 'Fireball', level_int: 3 }]));
    const client = new Open5eClient();

    await client.searchSpells('fireball');
    await client.searchSpells('fireball');

    assert.equal(mock.calls.length, 1, 'second identical call should hit the cache');
  });

  test('a different query is fetched separately', async () => {
    mock = installMockFetch(() => page([{ name: 'Fireball', level_int: 3 }]));
    const client = new Open5eClient();

    await client.searchSpells('fireball');
    await client.searchSpells('icestorm');

    assert.equal(mock.calls.length, 2);
  });

  test('clearCache forces the next request back to the network', async () => {
    mock = installMockFetch(() => page([{ name: 'Fireball', level_int: 3 }]));
    const client = new Open5eClient();

    await client.searchSpells('fireball');
    client.clearCache();
    await client.searchSpells('fireball');

    assert.equal(mock.calls.length, 2);
  });

  test('cache stats are reported', async () => {
    mock = installMockFetch(() => page([{ name: 'Fireball', level_int: 3 }]));
    const client = new Open5eClient();
    await client.searchSpells('fireball');

    const stats = client.getCacheStats();
    assert.equal(typeof stats.keys, 'number');
    assert.equal(typeof stats.hits, 'number');
    assert.equal(typeof stats.misses, 'number');
  });
});

describe('error handling', () => {
  test('an HTTP error surfaces the status rather than returning empty results', async () => {
    mock = installMockFetch(() => ({
      __status: 500, __statusText: 'Internal Server Error', __body: 'boom'
    }));
    const client = new Open5eClient();

    await assert.rejects(() => client.searchSpells('fireball'), /500/);
  });

  test('a 404 is reported, not swallowed', async () => {
    mock = installMockFetch(() => ({
      __status: 404, __statusText: 'Not Found', __body: 'missing'
    }));
    const client = new Open5eClient();

    await assert.rejects(() => client.searchSpells('fireball'), /404/);
  });

  test('a failed request is not cached', async () => {
    let calls = 0;
    mock = installMockFetch(() => {
      calls += 1;
      return calls === 1
        ? { __status: 500, __statusText: 'Error', __body: 'boom' }
        : page([{ name: 'Fireball', level_int: 3 }]);
    });
    const client = new Open5eClient();

    await assert.rejects(() => client.searchSpells('fireball'));
    const result = await client.searchSpells('fireball');

    assert.equal(result.results[0].name, 'Fireball');
    assert.equal(mock.calls.length, 2);
  });
});

describe('parameter sanitisation', () => {
  test('a query is trimmed before being sent', async () => {
    mock = installMockFetch(() => page([{ name: 'Fireball', level_int: 3 }]));
    const client = new Open5eClient();

    await client.searchSpells('  fireball  ');
    assert.equal(mock.paramsOf().name__icontains, 'fireball');
  });

  test('an over-long query is truncated rather than sent whole', async () => {
    mock = installMockFetch(() => page([]));
    const client = new Open5eClient();

    await client.searchSpells('a'.repeat(300));
    assert.equal(mock.paramsOf().name__icontains.length, 100);
  });

  test('a whitespace-only query sends no filter', async () => {
    mock = installMockFetch(() => page([{ name: 'Fireball', level_int: 3 }]));
    const client = new Open5eClient();

    await client.searchSpells('   ');
    assert.equal(mock.paramsOf().name__icontains, undefined);
  });

  test('spell level and school filters are forwarded', async () => {
    mock = installMockFetch(() => page([{ name: 'Fireball', level_int: 3 }]));
    const client = new Open5eClient();

    await client.searchSpells('fire', { level: 3, school: 'Evocation' });
    const params = mock.paramsOf();
    assert.equal(params.spell_level, '3');
    assert.equal(params.school, 'Evocation');
  });
});

describe('field mapping', () => {
  test('species traits and subspecies fields map onto the race shape', async () => {
    mock = installMockFetch(() => page([{
      name: 'High Elf',
      key: 'high-elf',
      desc: 'An elf subspecies.',
      is_subspecies: true,
      subspecies_of: 'elf',
      traits: [
        { name: 'Size', desc: 'Medium' },
        { name: 'Darkvision', desc: '60 feet' }
      ]
    }]));
    const client = new Open5eClient();

    const { results } = await client.searchRaces('high elf');
    const race = results[0];

    assert.equal(race.name, 'High Elf');
    assert.equal(race.isSubrace, true);
    assert.equal(race.subraceOf, 'elf');
    assert.deepEqual(race.traits, ['Size', 'Darkvision']);
    // /v2/species/ has no url field, so it is derived from the key.
    assert.match(race.url, /\/v2\/species\/high-elf\//);
  });

  test('a spell maps onto the documented MCP shape', async () => {
    mock = installMockFetch(() => page([{
      name: 'Fireball',
      level_int: 3,
      school: 'Evocation',
      casting_time: '1 action',
      range: '150 feet',
      components: 'V, S, M',
      duration: 'Instantaneous',
      desc: 'A bright streak flashes.',
      slug: 'fireball'
    }]));
    const client = new Open5eClient();

    const spell = (await client.searchSpells('fireball')).results[0];
    assert.equal(spell.name, 'Fireball');
    assert.equal(spell.level, 3);
    assert.equal(spell.school, 'Evocation');
    assert.equal(spell.castingTime, '1 action');
  });

  test('hasMore reflects the presence of a next page', async () => {
    mock = installMockFetch(() => page(
      [{ name: 'Fireball', level_int: 3 }],
      { count: 50, next: 'https://api.open5e.com/v1/spells/?page=2' }
    ));
    const client = new Open5eClient();

    const result = await client.searchSpells('fire');
    assert.equal(result.hasMore, true);
    assert.equal(result.count, 50);
  });
});
