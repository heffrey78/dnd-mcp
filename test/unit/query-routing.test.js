// Open5e filters inconsistently across v1/v2, and a silently-ignored filter
// returns a full unfiltered collection rather than an error. These tests pin
// down which query parameter each endpoint is sent, so an upstream-shaped
// regression fails here instead of silently returning wrong search results.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Open5eClient } from '../../dist/open5e-client.js';
import { installMockFetch, page } from '../helpers/mock-fetch.js';

let mock;
let client;

function mockWith(body) {
  mock = installMockFetch(() => body);
  client = new Open5eClient();
}

afterEach(() => {
  mock?.restore();
  mock = undefined;
});

describe('name queries are routed per endpoint', () => {
  // Endpoints where Open5e honours name__icontains server-side.
  const serverFiltered = [
    ['searchSpells', '/v2/spells/', [{ name: 'Fireball', level: 3 }]],
    ['searchMonsters', '/v2/creatures/', [{ name: 'Goblin' }]],
    ['searchMagicItems', '/v1/magicitems/', [{ name: 'Bag of Beans' }]],
    ['searchFeats', '/v2/feats/', [{ name: 'Alert' }]],
    ['searchBackgrounds', '/v2/backgrounds/', [{ name: 'Soldier' }]],
    ['searchRaces', '/v2/species/', [{ name: 'Elf', key: 'elf', traits: [] }]]
  ];

  for (const [method, path, rows] of serverFiltered) {
    test(`${method} sends name__icontains to ${path}`, async () => {
      mockWith(page(rows));
      await client[method]('elf');

      assert.equal(mock.pathOf(), path);
      const params = mock.paramsOf();
      assert.equal(params.name__icontains, 'elf');
      assert.equal(params.search, undefined, 'search= is full-text on v1 and ignored on v2');
    });
  }

  test('searchSections keeps full-text search, since sections are rules prose', async () => {
    mockWith(page([{ name: 'Actions in Combat', desc: 'text', slug: 'actions' }]));
    await client.searchSections('grapple');

    assert.equal(mock.pathOf(), '/v1/sections/');
    assert.equal(mock.paramsOf().search, 'grapple');
    assert.equal(mock.paramsOf().name__icontains, undefined);
  });

  test('races use /v2/species/, not the removed /v2/races/', async () => {
    mockWith(page([{ name: 'Elf', key: 'elf', traits: [] }]));
    await client.searchRaces('elf');
    assert.equal(mock.pathOf(), '/v2/species/');
  });

  test('no name filter is sent when no query is given', async () => {
    mockWith(page([{ name: 'Fireball', level: 3 }]));
    await client.searchSpells();

    const params = mock.paramsOf();
    assert.equal(params.name__icontains, undefined);
    assert.equal(params.search, undefined);
  });
});

describe('endpoints that ignore every filter are matched locally', () => {
  // /v2/armor/, /v2/weapons/ and /v2/conditions/ return the whole collection
  // regardless of query params, so the client filters by name itself.
  const localFiltered = [
    ['searchArmor', '/v2/armor/', [
      { name: 'Plate Armor', ac_base: 18 },
      { name: 'Breastplate', ac_base: 14 },
      { name: 'Chain Mail', ac_base: 16 }
    ], 'plate', ['Plate Armor', 'Breastplate']],
    ['searchWeapons', '/v2/weapons/', [
      { name: 'Longsword' },
      { name: 'Shortsword' },
      { name: 'Battleaxe' }
    ], 'sword', ['Longsword', 'Shortsword']],
    ['searchConditions', '/v2/conditions/', [
      { name: 'Blinded', desc: 'x' },
      { name: 'Charmed', desc: 'y' }
    ], 'blind', ['Blinded']]
  ];

  for (const [method, path, rows, query, expected] of localFiltered) {
    test(`${method} filters "${query}" locally and reports the matched count`, async () => {
      mockWith(page(rows));
      const result = await client[method](query);

      assert.equal(mock.pathOf(), path);
      assert.deepEqual(result.results.map(r => r.name), expected);
      assert.equal(result.count, expected.length,
        'count must reflect matches, not the unfiltered collection size');
    });

    test(`${method} requests the full collection so local matching sees every row`, async () => {
      mockWith(page(rows));
      await client[method](query, { limit: 2 });

      assert.equal(mock.paramsOf().limit, '1000',
        'a caller limit must not truncate the page before local filtering');
    });
  }

  test('local filtering is case-insensitive', async () => {
    mockWith(page([{ name: 'Plate Armor', ac_base: 18 }]));
    const result = await client.searchArmor('PLATE');
    assert.deepEqual(result.results.map(r => r.name), ['Plate Armor']);
  });

  test('a caller limit still caps locally-filtered results', async () => {
    mockWith(page([
      { name: 'Longsword' }, { name: 'Shortsword' }, { name: 'Greatsword' }
    ]));
    const result = await client.searchWeapons('sword', { limit: 2 });

    assert.equal(result.results.length, 2);
    assert.equal(result.count, 3, 'count reports total matches');
    assert.equal(result.hasMore, true);
  });

  test('an unmatched local query returns nothing rather than the whole collection', async () => {
    mockWith(page([{ name: 'Plate Armor' }, { name: 'Chain Mail' }]));
    const result = await client.searchArmor('zzzz');

    assert.equal(result.results.length, 0);
    assert.equal(result.count, 0);
  });
});
