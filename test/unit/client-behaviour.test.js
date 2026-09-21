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

  test('an over-long query is rejected rather than truncated into a different filter', async () => {
    mock = installMockFetch(() => page([]));
    const client = new Open5eClient();

    await assert.rejects(() => client.searchSpells('a'.repeat(1001)), /name__icontains.*longer than 1000/);
    assert.equal(mock.calls.length, 0);
  });

  test('a long query within the limit is sent whole', async () => {
    mock = installMockFetch(() => page([]));
    const client = new Open5eClient();

    await client.searchSpells('a'.repeat(300));
    assert.equal(mock.paramsOf().name__icontains.length, 300);
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

  test('a subspecies without size or speed traits is not given invented defaults', async () => {
    mock = installMockFetch(() => page([{
      name: 'Stoor Halfling', key: 'open5e_stoor-halfling',
      is_subspecies: true, subspecies_of: 'srd_halfling',
      traits: [{ name: 'Stoor Hardiness', desc: 'You gain resistance to poison damage.' }]
    }]));
    const client = new Open5eClient();

    const race = (await client.searchRaces('stoor')).results[0];
    assert.equal(race.size, '');
    assert.equal(race.speed, '');
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

describe('species lookup', () => {
  // Mirrors what /v2/species/?name__icontains=halfling returns: a subspecies
  // and a third-party entry sort ahead of the two core "Halfling" rows.
  const halflingRows = [
    {
      name: 'Stoor Halfling', key: 'open5e_stoor-halfling', document: { key: 'open5e' },
      is_subspecies: true, subspecies_of: 'srd_halfling',
      traits: [{ name: 'Stoor Hardiness', desc: 'Poison resistance.' }]
    },
    {
      name: 'Halfling', key: 'srd-2024_halfling', document: { key: 'srd-2024' },
      is_subspecies: false,
      traits: [
        { name: 'Size', type: 'SIZE', desc: 'Small (about 2-3 feet tall)' },
        { name: 'Speed', type: 'SPEED', desc: '30 feet' }
      ]
    },
    {
      name: 'Halfling', key: 'srd_halfling', document: { key: 'srd-2014' },
      is_subspecies: false,
      traits: [
        { name: 'Ability Score Increase', desc: 'Your Dexterity score increases by 2.' },
        { name: 'Speed', desc: 'Your base walking speed is 25 feet.' },
        { name: 'Size', desc: 'Your size is Small.' },
        { name: 'Halfling Nimbleness', desc: 'Move through the space of any creature of a size larger than you.' }
      ]
    },
    {
      name: 'Halfling Heritage', key: 'toh_halfling-heritage', document: { key: 'toh' },
      is_subspecies: true, subspecies_of: 'toh_darakhul', traits: []
    }
  ];

  test('an exact name match on the SRD species beats subspecies and look-alikes', async () => {
    mock = installMockFetch(() => page(halflingRows));
    const client = new Open5eClient();

    const race = await client.getRaceDetails('halfling');

    assert.equal(race.url, 'https://api.open5e.com/v2/species/srd_halfling/');
    assert.equal(race.speed, 'Your base walking speed is 25 feet.');
    assert.equal(race.size, 'Your size is Small.');
    assert.equal(race.abilityScoreIncrease, 'Your Dexterity score increases by 2.');
  });

  test('the name search asks for enough rows that the exact match is not cut off', async () => {
    mock = installMockFetch(() => page(halflingRows));
    const client = new Open5eClient();

    await client.getRaceDetails('halfling');

    assert.equal(mock.paramsOf(0).name__icontains, 'halfling');
    assert.ok(Number(mock.paramsOf(0).limit) >= 50);
  });

  test('a species key is fetched directly', async () => {
    mock = installMockFetch(url =>
      halflingRows.find(row => url.pathname === `/v2/species/${row.key}/`) ?? { __status: 404 });
    const client = new Open5eClient();

    const race = await client.getRaceDetails('srd_halfling');

    assert.equal(mock.pathOf(0), '/v2/species/srd_halfling/');
    assert.equal(race.name, 'Halfling');
    assert.equal(race.source.key, 'srd-2014');
  });

  test('a subspecies inherits size and speed from its parent species', async () => {
    mock = installMockFetch(url => {
      if (url.pathname === '/v2/species/') return page([halflingRows[0]]);
      return halflingRows.find(row => url.pathname === `/v2/species/${row.key}/`) ?? { __status: 404 };
    });
    const client = new Open5eClient();

    const race = await client.getRaceDetails('stoor halfling');

    assert.equal(race.name, 'Stoor Halfling');
    assert.equal(race.speed, 'Your base walking speed is 25 feet.');
    assert.equal(race.size, 'Your size is Small.');
  });

  test('a name that matches nothing returns null', async () => {
    mock = installMockFetch(() => page([]));
    const client = new Open5eClient();

    assert.equal(await client.getRaceDetails('tabaxi'), null);
  });

  const lightfoot = {
    name: 'Lightfoot', key: 'srd_lightfoot', document: { key: 'srd-2014' },
    is_subspecies: true, subspecies_of: 'srd_halfling', traits: []
  };

  // Answers name searches with halflingRows and subspecies lookups with the
  // subspecies of the requested parents.
  function speciesResponder(url) {
    const parents = url.searchParams.get('subspecies_of__key__in');
    if (parents === null) return page(halflingRows);
    const keys = parents.split(',');
    return page([...halflingRows, lightfoot]
      .filter(row => row.is_subspecies && keys.includes(row.subspecies_of)));
  }

  test('a search includes subspecies whose names omit the parent', async () => {
    mock = installMockFetch(speciesResponder);
    const client = new Open5eClient();

    const { results, count } = await client.searchRaces('halfling');
    const names = results.map(race => race.name);

    assert.ok(names.includes('Lightfoot'), `Lightfoot missing from ${names}`);
    assert.equal(names.filter(name => name === 'Stoor Halfling').length, 1,
      'a subspecies that also matched by name is not duplicated');
    assert.equal(count, halflingRows.length + 1);
  });

  test('subspecies are fetched with subspecies_of__key__in, not the ignored subspecies_of', async () => {
    mock = installMockFetch(speciesResponder);
    const client = new Open5eClient();

    await client.searchRaces('halfling');

    const params = mock.paramsOf(1);
    assert.equal(params.subspecies_of, undefined);
    assert.deepEqual(params.subspecies_of__key__in.split(',').sort(),
      ['srd-2024_halfling', 'srd_halfling']);
  });

  test('no subspecies request is made when only subspecies matched', async () => {
    mock = installMockFetch(() => page([halflingRows[0]]));
    const client = new Open5eClient();

    await client.searchRaces('stoor');
    assert.equal(mock.calls.length, 1);
  });

  test('many parent keys go out whole in a single subspecies request', async () => {
    const parents = Array.from({ length: 12 }, (_, i) => ({
      name: `Elf ${i}`, key: `some-long-document-key_elf-${i}`, is_subspecies: false, traits: []
    }));
    mock = installMockFetch(url =>
      url.searchParams.has('subspecies_of__key__in') ? page([]) : page(parents));
    const client = new Open5eClient();

    await client.searchRaces('elf');

    assert.equal(mock.calls.length, 2);
    assert.deepEqual(mock.paramsOf(1).subspecies_of__key__in.split(','),
      parents.map(p => p.key));
  });
});
