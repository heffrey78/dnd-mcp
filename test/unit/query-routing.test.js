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
    ['searchMagicItems', '/v2/magicitems/', [{ name: 'Bag of Beans' }]],
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

  test('searchSections matches rules prose locally, since /v2/rules/ ignores search=', async () => {
    mockWith(page([
      { key: 'srd_grappling', name: 'Grappling', desc: 'When you want to grab a creature...', document: { key: 'srd-2014' } },
      { key: 'srd_shoving', name: 'Shoving a Creature', desc: 'Using the Attack action, you can shove.', document: { key: 'srd-2014' } },
      { key: 'srd_escape', name: 'Escaping a Grapple', desc: 'A grappled creature can escape.', document: { key: 'srd-2014' } }
    ]));
    const result = await client.searchSections('grapple');

    assert.equal(mock.pathOf(), '/v2/rules/');
    assert.equal(mock.paramsOf().search, undefined);
    assert.equal(mock.paramsOf().name__icontains, undefined);
    assert.deepEqual(result.results.map(s => s.key), ['srd_escape'],
      'name and text are both searched; "grapple" is not in "Grappling"');
  });

  test('a rules section is found by key as well as by name', async () => {
    mockWith(page([
      { key: 'srd_grappling', name: 'Grappling', desc: 'x', ruleset: 'srd_combat', document: { key: 'srd-2014' } },
      { key: 'srd-2024_grappling', name: 'Grappling', desc: 'y', document: { key: 'srd-2024' } }
    ]));

    assert.equal((await client.getSectionDetails('srd_grappling')).description, 'x');
    assert.equal((await client.getSectionDetails('srd_grappling')).parent, 'srd_combat');
    const byName = await client.getSectionDetails('grappling');
    assert.equal(byName.key, 'srd-2024_grappling', 'the 2024 SRD copy wins by default');
  });

  test('getAllSections lists sections without their text', async () => {
    mockWith(page([{ key: 'srd_grappling', name: 'Grappling', desc: 'long text', document: { key: 'srd-2014' } }]));
    const [summary] = await client.getAllSections();

    assert.equal(summary.name, 'Grappling');
    assert.equal(summary.description, undefined);
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
