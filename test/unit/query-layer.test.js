// The client's single read path (query) and the filter registry behind it.
// Open5e ignores filters it does not support, so the registry decides what is
// sent upstream and what is matched locally; these tests pin that down.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Open5eClient } from '../../dist/open5e-client.js';
import { ENDPOINTS, PAGE_MAX } from '../../dist/open5e-endpoints.js';
import { installMockFetch, page } from '../helpers/mock-fetch.js';

let mock;
afterEach(() => { mock?.restore(); mock = undefined; });

const documents = [
  { key: 'srd-2014', display_name: '5e 2014 Rules', gamesystem: { key: '5e-2014' } },
  { key: 'core', display_name: '5e Core', gamesystem: { key: '5e-2014' } },
  { key: 'srd-2024', display_name: '5e 2024 Rules', gamesystem: { key: '5e-2024' } },
  { key: 'a5e-ag', display_name: "Adventurer's Guide", gamesystem: { key: 'a5e' } }
];

/** Answers /v2/documents/ with `documents` and everything else via `responder`. */
function mockWithDocuments(responder) {
  mock = installMockFetch(url =>
    url.pathname === '/v2/documents/' ? page(documents) : responder(url));
  return new Open5eClient();
}

describe('query', () => {
  test('a filter the endpoint does not declare is refused before any request', async () => {
    mock = installMockFetch(() => page([]));
    const client = new Open5eClient();

    await assert.rejects(() => client.query('spells', { colour: 'red' }), /has no "colour" filter/);
    assert.equal(mock.calls.length, 0);
  });

  test('an ordering the endpoint does not support is refused', async () => {
    mock = installMockFetch(() => page([]));
    const client = new Open5eClient();

    await assert.rejects(() => client.query('spells', {}, { ordering: 'colour' }), /Invalid ordering "colour"/);
    assert.equal(mock.calls.length, 0);
  });

  test('server filters are sent under their verified parameter names', async () => {
    mock = installMockFetch(() => page([]));
    const client = new Open5eClient();

    await client.query('spells', { school: 'evocation', classKey: 'srd_bard', maxLevel: 3 });
    const params = mock.paramsOf();
    assert.equal(params.school__key, 'evocation', 'school= alone is ignored upstream');
    assert.equal(params.classes__key, 'srd_bard');
    assert.equal(params.level__lte, '3');
    assert.equal(params.school, undefined);
  });

  test('local filters are never sent upstream', async () => {
    mock = installMockFetch(() => page([]));
    const client = new Open5eClient();

    await client.query('feats', { hasPrerequisite: true });
    assert.equal(mock.paramsOf().has_prerequisite, undefined, 'has_prerequisite is ignored upstream');
  });

  test('local filtering pages through the whole server-filtered set', async () => {
    const pageOne = Array.from({ length: 3 }, (_, i) => ({ name: `Feat ${i}`, has_prerequisite: i === 0 }));
    const pageTwo = [{ name: 'Feat 3', has_prerequisite: true }];
    mock = installMockFetch(url => url.searchParams.get('page') === '2'
      ? page(pageTwo)
      : page(pageOne, { count: 4, next: 'https://api.open5e.com/v2/feats/?page=2' }));
    const client = new Open5eClient();

    const result = await client.query('feats', { hasPrerequisite: true });

    assert.equal(mock.calls.length, 2);
    assert.equal(mock.paramsOf(0).limit, String(PAGE_MAX));
    assert.deepEqual(result.rows.map(r => r.name), ['Feat 0', 'Feat 3']);
    assert.equal(result.count, 2);
  });

  test('local filtering refuses to scan an unbounded collection', async () => {
    mock = installMockFetch(() => page([{ name: 'Goblin', environments: [] }],
      { count: 99999, next: 'https://api.open5e.com/v2/creatures/?page=next' }));
    const client = new Open5eClient();

    await assert.rejects(() => client.query('creatures', { environment: 'forest' }), /narrow the query/);
  });

  test('a blank local filter value means no filter', async () => {
    mock = installMockFetch(() => page([{ name: 'Plate' }, { name: 'Leather' }]));
    const client = new Open5eClient();

    const result = await client.query('armor', { name: '   ' });
    assert.equal(result.count, 2);
  });

  test('every declared filter is either a server parameter or a local predicate', () => {
    for (const [endpoint, spec] of Object.entries(ENDPOINTS)) {
      for (const [filter, rule] of Object.entries(spec.filters)) {
        const ok = typeof rule.server === 'string' || typeof rule.local === 'function';
        assert.ok(ok, `${endpoint}.${filter} is malformed`);
      }
    }
  });
});

describe('source labels and scope', () => {
  test('a bare document key on a row is expanded from /v2/documents/', async () => {
    const client = mockWithDocuments(() => page([{ key: 'srd_acolyte', name: 'Acolyte', document: 'srd-2014' }]));

    const background = (await client.searchBackgrounds('acolyte')).results[0];
    assert.deepEqual(background.source, { key: 'srd-2014', name: '5e 2014 Rules', ruleset: '5e-2014' });
  });

  test('the document index is fetched once and reused', async () => {
    const client = mockWithDocuments(() => page([{ key: 'srd_acolyte', name: 'Acolyte', document: 'srd-2014' }]));

    await client.searchBackgrounds('acolyte');
    await client.searchBackgrounds('sage');
    assert.equal(mock.calls.filter(u => u.pathname === '/v2/documents/').length, 1);
  });

  test('a ruleset scope becomes a document__key__in filter', async () => {
    const client = mockWithDocuments(() => page([]));

    await client.searchFeats('alert', { scope: { ruleset: '5e-2014' } });
    const request = mock.calls.find(u => u.pathname === '/v2/feats/');
    assert.equal(request.searchParams.get('document__key__in'), 'srd-2014,core');
  });

  test('an unknown ruleset fails instead of searching every source', async () => {
    const client = mockWithDocuments(() => page([]));

    await assert.rejects(() => client.searchFeats('alert', { scope: { ruleset: 'bogus' } }), /Unknown ruleset/);
    assert.equal(mock.calls.filter(u => u.pathname === '/v2/feats/').length, 0);
  });
});

describe('v2 row shapes', () => {
  test('weapon flags are derived from is_simple, range and named properties', async () => {
    mock = installMockFetch(() => page([
      {
        key: 'srd_dagger', name: 'Dagger', damage_dice: '1d4', damage_type: { name: 'Piercing' },
        range: 20, long_range: 60, is_simple: true,
        properties: [
          { property: { name: 'Finesse' }, detail: null },
          { property: { name: 'Light' }, detail: null },
          { property: { name: 'Thrown' }, detail: 'range 20/60' }
        ]
      },
      {
        key: 'srd_longbow', name: 'Longbow', damage_dice: '1d8', range: 150, long_range: 600,
        is_simple: false, properties: [{ property: { name: 'Two-Handed' }, detail: null }]
      },
      {
        key: 'srd_battleaxe', name: 'Battleaxe', damage_dice: '1d8', range: 0, long_range: 0,
        is_simple: false, properties: [{ property: { name: 'Versatile' }, detail: '1d10' }]
      }
    ]));
    const client = new Open5eClient();

    const [dagger, longbow, battleaxe] = (await client.searchWeapons()).results;

    assert.equal(dagger.category, 'simple');
    assert.equal(dagger.damageType, 'Piercing');
    assert.deepEqual(
      { melee: dagger.properties.melee, ranged: dagger.properties.ranged, thrown: dagger.properties.thrown,
        finesse: dagger.properties.finesse, light: dagger.properties.light },
      { melee: true, ranged: true, thrown: true, finesse: true, light: true });
    assert.equal(dagger.range, '20/60 feet');

    assert.equal(longbow.properties.martial, true);
    assert.equal(longbow.properties.melee, false);
    assert.equal(longbow.properties.twoHanded, true);

    assert.equal(battleaxe.range, undefined);
    assert.equal(battleaxe.properties.versatile, true);
    assert.deepEqual(battleaxe.propertyNames, ['Versatile (1d10)']);
  });

  test('the martial weapon filter is applied locally from is_simple', async () => {
    mock = installMockFetch(() => page([
      { name: 'Club', is_simple: true, properties: [] },
      { name: 'Longsword', is_simple: false, properties: [] }
    ]));
    const client = new Open5eClient();

    const result = await client.searchWeapons('', { isMartial: true });
    assert.deepEqual(result.results.map(w => w.name), ['Longsword']);
    assert.equal(mock.paramsOf().is_martial, undefined, 'is_martial is ignored upstream');
  });

  test('the armor category filter is applied locally', async () => {
    mock = installMockFetch(() => page([
      { name: 'Plate', category: 'heavy' },
      { name: 'Leather', category: 'light' }
    ]));
    const client = new Open5eClient();

    const result = await client.searchArmor('', { category: 'heavy' });
    assert.deepEqual(result.results.map(a => a.name), ['Plate']);
    assert.equal(mock.paramsOf().category, undefined, 'category is ignored upstream');
  });

  test('a condition takes its description from the requested ruleset', async () => {
    const blinded = {
      key: 'blinded', name: 'Blinded', document: { key: 'core', gamesystem: { key: '5e-2014' } },
      descriptions: [
        { gamesystem: 'a5e', desc: 'a5e wording' },
        { gamesystem: '5e-2014', desc: '2014 wording' },
        { gamesystem: '5e-2024', desc: '2024 wording' }
      ]
    };
    const client = mockWithDocuments(() => page([blinded]));

    const byDefault = await client.getConditionDetails('blinded');
    assert.equal(byDefault.description, '2014 wording');
    assert.equal(byDefault.ruleset, '5e-2014');
    assert.equal(Object.keys(byDefault.descriptions).length, 3);

    const scoped = await client.getConditionDetails('blinded', { ruleset: '5e-2024' });
    assert.equal(scoped.description, '2024 wording');
  });

  test('a condition ruleset scope filters on descriptions, not the core document', async () => {
    const client = mockWithDocuments(() => page([
      { key: 'blinded', name: 'Blinded', descriptions: [{ gamesystem: '5e-2014', desc: 'x' }] },
      { key: 'a5e-ag_rattled', name: 'Rattled', descriptions: [{ gamesystem: 'a5e', desc: 'y' }] }
    ]));

    const result = await client.searchConditions('', { scope: { ruleset: 'a5e' } });
    assert.deepEqual(result.results.map(c => c.name), ['Rattled']);
    const request = mock.calls.find(u => u.pathname === '/v2/conditions/');
    assert.equal(request.searchParams.get('document__key__in'), null);
  });

  test('a feat detail lookup prefers the SRD copy of a name', async () => {
    mock = installMockFetch(() => page([
      { key: 'a5e-ag_grappler', name: 'Grappler', document: { key: 'a5e-ag' } },
      { key: 'srd_grappler', name: 'Grappler', document: { key: 'srd-2014' } }
    ]));
    const client = new Open5eClient();

    const feat = await client.getFeatDetails('grappler');
    assert.equal(feat.key, 'srd_grappler');
    assert.equal(feat.source.key, 'srd-2014');
  });
});
