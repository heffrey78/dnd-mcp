// Live checks of the v2 response shapes the client's transforms rely on.
// Filters are covered by filter-registry.contract.test.js; this file covers
// fields. When one fails, Open5e has changed a row shape and the matching
// transform in open5e-client.ts needs revisiting -- treat it as a signal,
// not flake.
//
// Run with: npm run test:integration

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://api.open5e.com';

async function get(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'DND-MCP-Server/tests' }
  });
  assert.ok(response.ok, `${path} returned ${response.status}`);
  return response.json();
}

describe('Open5e v2 row shapes', () => {
  test('/v2/races/ is gone and /v2/species/ replaces it', async () => {
    const races = await fetch(`${BASE}/v2/races/`);
    assert.equal(races.status, 404);

    const species = await get('/v2/species/');
    assert.ok(species.count > 0);
  });

  test('species rows carry key, traits and subspecies fields', async () => {
    const row = (await get('/v2/species/?name__icontains=elf&limit=1')).results[0];

    assert.equal(typeof row.key, 'string');
    assert.ok(Array.isArray(row.traits));
    assert.ok('is_subspecies' in row, 'field renamed from is_subrace');
    assert.ok('subspecies_of' in row, 'field renamed from subrace_of');
  });

  test('documents list their game system, which scopes resolve against', async () => {
    const body = await get('/v2/documents/?limit=1000');
    const srd = body.results.find(doc => doc.key === 'srd-2014');

    assert.equal(body.next, null, 'documents no longer fit in one page');
    assert.equal(srd?.gamesystem?.key, '5e-2014');
    assert.ok(body.results.some(doc => doc.key === 'core'), 'the core conditions document is gone');
  });

  test('spells carry school and classes as objects and casting time as a key', async () => {
    const spell = await get('/v2/spells/srd_fireball/');

    assert.equal(spell.school.key, 'evocation');
    assert.ok(spell.classes.some(cls => cls.key === 'srd_wizard'));
    assert.equal(spell.casting_time, 'action');
    assert.equal(spell.range_text, '150 feet');
    assert.equal(spell.document.gamesystem.key, '5e-2014');
  });

  test('classes list features with the levels they are gained at', async () => {
    const bard = await get('/v2/classes/srd_bard/');
    const inspiration = bard.features.find(f => f.name === 'Bardic Inspiration');

    assert.equal(bard.hit_dice, 'D8');
    assert.ok(inspiration.gained_at.some(g => g.level === 1 && g.detail === 'd6'));
    assert.ok(bard.features.some(f => f.feature_type === 'PROFICIENCIES'));
    const cantrips = bard.features.find(f => f.name === 'Cantrips Known');
    assert.equal(cantrips.data_for_class_table.length, 20, 'table columns moved out of data_for_class_table');
    assert.deepEqual(bard.primary_abilities, [],
      'primary_abilities is now populated; class-rules.ts key abilities could come from data');
  });

  test('2024 classes keep their proficiencies in a core traits table', async () => {
    const bard = await get('/v2/classes/srd-2024_bard/');
    const core = bard.features.find(f => f.feature_type === 'CORE_TRAITS_TABLE');

    assert.match(core.desc, /\|Armor Training\|/);
    assert.equal(bard.caster_type, 'FULL');
  });

  test('subclasses point at their parent class by key', async () => {
    const lore = await get('/v2/classes/srd_college-of-lore/');
    assert.equal(lore.subclass_of.key, 'srd_bard');
  });

  test('creatures carry numeric CRs, structured environments and typed actions', async () => {
    const goblin = await get('/v2/creatures/srd_goblin/');

    assert.equal(goblin.challenge_rating, 0.25);
    assert.equal(goblin.experience_points, 50);
    assert.equal(goblin.type.key, 'humanoid');
    assert.ok(goblin.environments.some(env => env.key === 'forest'));
    assert.ok(goblin.actions.every(action => typeof action.action_type === 'string'));
    assert.equal(goblin.ability_scores.dexterity, 14);
  });

  test('magic items carry category and rarity as objects', async () => {
    const bag = await get('/v2/magicitems/srd_bag-of-holding/');

    assert.equal(bag.category.key, 'wondrous-item');
    assert.equal(bag.rarity.key, 'uncommon');
    assert.equal(typeof bag.requires_attunement, 'boolean');
  });

  test('conditions keep one description per game system', async () => {
    const blinded = await get('/v2/conditions/blinded/');
    const systems = blinded.descriptions.map(d => d.gamesystem);

    assert.ok(systems.includes('5e-2014') && systems.includes('5e-2024'));
    assert.equal(blinded.desc, undefined, 'conditions now have a desc field again');
  });

  test('weapons have is_simple and named properties instead of per-property flags', async () => {
    const dagger = await get('/v2/weapons/srd_dagger/');

    assert.equal(dagger.is_simple, true);
    assert.equal(dagger.is_martial, undefined);
    assert.ok(dagger.properties.some(p => p.property.name === 'Thrown'));
  });

  test('rules list rows give the document as a bare key', async () => {
    const row = (await get('/v2/rules/?limit=1')).results[0];
    assert.equal(typeof row.document, 'string');
    assert.equal(typeof row.ruleset, 'string');
  });

  // Known gaps in Open5e's data that the client reports rather than papers
  // over. When one of these fails, the gap has been fixed upstream.
  test('known gap: no 2014 SRD spell lists the Paladin', async () => {
    // Third-party books do list srd_paladin; the 2014 SRD itself does not.
    const body = await get('/v2/spells/?classes__key=srd_paladin&document__key__in=srd-2014&limit=1');
    assert.equal(body.count, 0, 'SRD spells now list the Paladin; builds will suggest them automatically');
  });
});
