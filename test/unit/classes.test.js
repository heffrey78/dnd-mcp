// Class lookups against /v2/classes/. Fixtures are trimmed from real 2014 and
// 2024 Bard rows, whose proficiencies and table columns are shaped differently.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Open5eClient } from '../../dist/open5e-client.js';
import { installMockFetch, page } from '../helpers/mock-fetch.js';

let mock;
afterEach(() => { mock?.restore(); mock = undefined; });

const doc2014 = { key: 'srd-2014', display_name: '5e 2014 Rules', gamesystem: { key: '5e-2014' } };
const doc2024 = { key: 'srd-2024', display_name: '5e 2024 Rules', gamesystem: { key: '5e-2024' } };

const bard2014 = {
  key: 'srd_bard', name: 'Bard', document: doc2014, hit_dice: 'D8', caster_type: null,
  primary_abilities: [], subclass_of: null, desc: '',
  saving_throws: [{ name: 'Charisma' }, { name: 'Dexterity' }],
  hit_points: { hit_points_at_1st_level: '8 + your Constitution modifier' },
  features: [
    { key: 'srd_bard_proficiencies', name: 'Proficiencies', feature_type: 'PROFICIENCIES', gained_at: [], data_for_class_table: [],
      desc: '**Armor:** Light armor\r\n**Weapons:** Simple weapons, rapiers\r\n**Skills:** Choose any three' },
    { key: 'srd_bard_bardic-inspiration', name: 'Bardic Inspiration', feature_type: 'CLASS_LEVEL_FEATURE',
      gained_at: [{ level: 10, detail: 'd10' }, { level: 1, detail: 'd6' }, { level: 5, detail: 'd8' }], data_for_class_table: [], desc: 'Inspire.' },
    { key: 'srd_bard_jack', name: 'Jack of All Trades', feature_type: 'CLASS_LEVEL_FEATURE',
      gained_at: [{ level: 2, detail: null }], data_for_class_table: [], desc: 'Half proficiency.' },
    // Mis-tagged in Open5e: a table column typed as a level feature.
    { key: 'srd_bard_spells-known', name: 'Spells Known', feature_type: 'CLASS_LEVEL_FEATURE', gained_at: [],
      data_for_class_table: [{ level: 1, column_value: '4' }, { level: 2, column_value: '5' }], desc: '[Column data]' },
    { key: 'srd_bard_slots-2nd', name: '2nd', feature_type: 'SPELL_SLOTS', gained_at: [],
      data_for_class_table: [{ level: 4, column_value: '2' }], desc: '[Column data]' },
    { key: 'srd_bard_equipment', name: 'Equipment', feature_type: 'STARTING_EQUIPMENT', gained_at: [], data_for_class_table: [],
      desc: 'A rapier and a lute.' }
  ]
};

const bard2024 = {
  key: 'srd-2024_bard', name: 'Bard', document: doc2024, hit_dice: 'D8', caster_type: 'FULL',
  primary_abilities: [], subclass_of: null, saving_throws: [],
  features: [{
    key: 'srd-2024_bard_core', name: 'Core Bard Traits', feature_type: 'CORE_TRAITS_TABLE', gained_at: [], data_for_class_table: [],
    desc: '|||\n|---|---|\n|Primary Ability|Charisma|\n|Armor Training|Light armor|\n' +
      '|Weapon Proficiencies|Simple weapons|\n|Starting Equipment|Leather Armor and 19 GP|'
  }]
};

const lore = {
  key: 'srd_college-of-lore', name: 'College of Lore', document: doc2014, subclass_of: { key: 'srd_bard', name: 'Bard' },
  features: [
    { key: 'lore_peerless', name: 'Peerless Skill', feature_type: 'CLASS_LEVEL_FEATURE', gained_at: [{ level: 14 }] },
    { key: 'lore_cutting', name: 'Cutting Words', feature_type: 'CLASS_LEVEL_FEATURE', gained_at: [{ level: 3 }] }
  ]
};

function responder(url) {
  if (url.pathname === '/v2/documents/') return page([doc2014, doc2024]);
  if (url.pathname === '/v2/classes/srd_bard/') return bard2014;
  if (url.pathname === '/v2/classes/srd-2024_bard/') return bard2024;
  if (url.pathname === '/v2/classes/') {
    if (url.searchParams.get('subclass_of') === 'srd_bard') return page([lore]);
    if (url.searchParams.get('subclass_of')) return page([]);
    const allowed = url.searchParams.get('document__key__in')?.split(',');
    const base = [bard2014, bard2024].filter(c => !allowed || allowed.includes(c.document.key));
    return page(url.searchParams.get('is_subclass') === 'true' ? [lore] : base);
  }
  return { __status: 404 };
}

describe('class details', () => {
  test('a name resolves to the 2024 SRD class by default', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('bard');

    assert.equal(bard.key, 'srd-2024_bard');
    assert.equal(bard.source.ruleset, '5e-2024');
  });

  test('a 2014 scope resolves the 2014 SRD class', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('bard', { ruleset: '5e-2014' });

    assert.equal(bard.key, 'srd_bard');
    assert.equal(bard.hitDie, 'd8');
  });

  test('2014 proficiencies are parsed from the bold-label lines', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('bard', { ruleset: '5e-2014' });

    assert.deepEqual(bard.proficiencies, {
      armor: 'Light armor', weapons: 'Simple weapons, rapiers', tools: undefined, skills: 'Choose any three'
    });
    assert.equal(bard.equipment, 'A rapier and a lute.');
  });

  test('2024 proficiencies are parsed from the core traits table', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('bard', { ruleset: '5e-2024' });

    assert.equal(bard.key, 'srd-2024_bard');
    assert.equal(bard.proficiencies.armor, 'Light armor');
    assert.equal(bard.proficiencies.weapons, 'Simple weapons');
    assert.equal(bard.equipment, 'Leather Armor and 19 GP');
  });

  test('key abilities and caster type come from the rules table when Open5e leaves them empty', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('bard', { ruleset: '5e-2014' });

    assert.deepEqual(bard.primaryAbility, ['charisma']);
    assert.equal(bard.spellcastingAbility, 'charisma');
    assert.equal(bard.casterType, 'full');
    assert.deepEqual(bard.spellSlotsByLevel[2], [4, 2], 'slots come from the SRD table, not the gappy column');
  });

  test('features are ordered by the level they are gained, with per-level details', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('bard', { ruleset: '5e-2014' });

    assert.deepEqual(bard.features.map(f => f.name), ['Bardic Inspiration', 'Jack of All Trades']);
    assert.deepEqual(bard.features[0].levels, [1, 5, 10]);
    assert.deepEqual(bard.features[0].details, { 1: 'd6', 5: 'd8', 10: 'd10' });
  });

  test('table columns include mis-tagged ones but not the spell-slot columns', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('bard', { ruleset: '5e-2014' });

    assert.deepEqual(Object.keys(bard.tableColumns), ['Spells Known']);
    assert.deepEqual(bard.tableColumns['Spells Known'], { 1: '4', 2: '5' });
  });

  test('subclasses come with their features', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('bard', { ruleset: '5e-2014' });

    assert.deepEqual(bard.subclasses, ['College of Lore']);
    assert.deepEqual(bard.detailedArchetypes[0].features.map(f => f.name), ['Cutting Words', 'Peerless Skill']);
    assert.equal(mock.calls.find(u => u.searchParams.get('subclass_of')).searchParams.get('subclass_of'), 'srd_bard');
  });

  test('a class key is accepted as well as a name', async () => {
    mock = installMockFetch(responder);
    const bard = await new Open5eClient().getClassDetails('srd-2024_bard');
    assert.equal(bard.key, 'srd-2024_bard');
  });

  test('an unknown class is null', async () => {
    mock = installMockFetch(responder);
    assert.equal(await new Open5eClient().getClassDetails('bardbarian'), null);
  });
});

describe('class search', () => {
  test('lists base classes with the names of their subclasses', async () => {
    mock = installMockFetch(responder);
    const { results } = await new Open5eClient().searchClasses({ scope: { ruleset: '5e-2014' } });

    assert.deepEqual(results.map(c => c.key), ['srd_bard']);
    assert.deepEqual(results[0].subclasses, ['College of Lore']);
  });
});
