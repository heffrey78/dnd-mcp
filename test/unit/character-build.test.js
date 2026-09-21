// The build engine end to end, against a small mocked SRD catalogue. These
// pin down the failures of the old generator: unscoped sources, alphabetical
// filler, silent fallbacks and placeholder text.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Open5eClient } from '../../dist/open5e-client.js';
import { CharacterBuilder } from '../../dist/character-build/builder.js';
import { installMockFetch, page } from '../helpers/mock-fetch.js';

let mock;
afterEach(() => { mock?.restore(); mock = undefined; });

const srd = { key: 'srd-2014', display_name: '5e 2014 Rules', gamesystem: { key: '5e-2014' } };
const a5e = { key: 'a5e-ag', display_name: "Adventurer's Guide", gamesystem: { key: 'a5e' } };
const toh = { key: 'toh', display_name: 'Tome of Heroes', gamesystem: { key: '5e-2014' } };

const feature = (name, levels, extra = {}) => ({
  key: name.toLowerCase().replace(/\W+/g, '-'), name, feature_type: 'CLASS_LEVEL_FEATURE',
  gained_at: levels.map(level => ({ level, detail: null })), data_for_class_table: [], desc: name, ...extra
});
const column = (name, values) => ({
  key: name, name, feature_type: 'CLASS_TABLE_DATA', gained_at: [], desc: '[Column data]',
  data_for_class_table: values.map((v, i) => ({ level: i + 1, column_value: String(v) }))
});

const bard = {
  key: 'srd_bard', name: 'Bard', document: srd, hit_dice: 'D8', subclass_of: null,
  saving_throws: [{ name: 'Dexterity' }, { name: 'Charisma' }],
  features: [
    { key: 'p', name: 'Proficiencies', feature_type: 'PROFICIENCIES', gained_at: [], data_for_class_table: [],
      desc: '**Armor:** Light armor\n**Skills:** Choose any three' },
    feature('Bardic Inspiration', [1]), feature('Spellcasting', [1]), feature('Jack of All Trades', [2]),
    feature('Bard College', [3]), feature('Ability Score Improvement', [4, 8]),
    column('Cantrips Known', [2, 2, 2, 3, 3]), column('Spells Known', [4, 5, 6, 7, 8])
  ]
};
const fighter = {
  key: 'srd_fighter', name: 'Fighter', document: srd, hit_dice: 'D10', subclass_of: null,
  saving_throws: [{ name: 'Strength' }, { name: 'Constitution' }],
  features: [
    { key: 'p', name: 'Proficiencies', feature_type: 'PROFICIENCIES', gained_at: [], data_for_class_table: [],
      desc: '**Armor:** All armor, shields' },
    feature('Fighting Style', [1]), feature('Second Wind', [1]), feature('Action Surge', [2]),
    feature('Ability Score Improvement', [4, 6, 8])
  ]
};
const paladin = {
  key: 'srd_paladin', name: 'Paladin', document: srd, hit_dice: 'D10', subclass_of: null, saving_throws: [],
  features: [feature('Divine Sense', [1]), feature('Spellcasting', [2])]
};
const lore = {
  key: 'srd_college-of-lore', name: 'College of Lore', document: srd, subclass_of: { key: 'srd_bard' },
  features: [feature('Cutting Words', [3]), feature('Peerless Skill', [14])]
};
const classes = [bard, fighter, paladin, lore];

const species = [
  { key: 'srd_halfling', name: 'Halfling', document: srd, is_subspecies: false, traits: [
    { name: 'Ability Score Increase', desc: 'Your Dexterity score increases by 2.' },
    { name: 'Size', desc: 'Your size is Small.' },
    { name: 'Speed', desc: 'Your base walking speed is 25 feet.' },
    { name: 'Lucky', desc: 'Reroll 1s.' }
  ] },
  { key: 'srd_lightfoot', name: 'Lightfoot', document: srd, is_subspecies: true, subspecies_of: 'srd_halfling', traits: [
    { name: 'Ability Score Increase', desc: 'Your Charisma score increases by 1.' }
  ] },
  { key: 'srd_half-orc', name: 'Half-Orc', document: srd, is_subspecies: false, traits: [
    { name: 'Ability Score Increase', desc: 'Your Strength score increases by 2, and your Constitution score increases by 1.' },
    { name: 'Size', desc: 'Your size is Medium.' },
    { name: 'Speed', desc: 'Your base walking speed is 30 feet.' }
  ] },
  { key: 'toh_darakhul', name: 'Darakhul', document: toh, is_subspecies: false, traits: [] }
];

const backgrounds = [
  { key: 'srd_acolyte', name: 'Acolyte', document: srd, benefits: [
    { type: 'skill_proficiency', name: 'Skill Proficiencies', desc: 'Insight, Religion' },
    { type: 'feature', name: 'Shelter of the Faithful', desc: 'Temples help you.' }
  ] }
];

const feats = [
  { key: 'srd_grappler', name: 'Grappler', document: srd, type: 'GENERAL', has_prerequisite: true,
    prerequisite: 'Strength 13 or higher', desc: 'You have advantage on attack rolls against a creature you are grappling.',
    benefits: [] },
  { key: 'a5e-ag_ace-driver', name: 'Ace Driver', document: a5e, type: 'GENERAL', has_prerequisite: true,
    prerequisite: 'Proficiency with a type of vehicle', desc: 'You drive well and deal damage.', benefits: [] }
];

const spell = (key, name, level, extra = {}) => ({
  key, name, level, document: srd, desc: `${name}.`, classes: [{ key: 'srd_bard', name: 'Bard' }], ...extra
});
const spells = [
  spell('srd_vicious-mockery', 'Vicious Mockery', 0, { damage_roll: '1d4', saving_throw_ability: 'wisdom' }),
  spell('srd_mage-hand', 'Mage Hand', 0),
  spell('srd_minor-illusion', 'Minor Illusion', 0),
  spell('srd_healing-word', 'Healing Word', 1, { desc: 'A creature regains hit points equal to 1d4.' }),
  spell('srd_alarm', 'Alarm', 1, { ritual: true }),
  spell('srd_sleep', 'Sleep', 1),
  spell('srd_hold-person', 'Hold Person', 2, { desc: 'The target is paralyzed.', saving_throw_ability: 'wisdom' }),
  spell('srd_hypnotic-pattern', 'Hypnotic Pattern', 3, { desc: 'Creatures are charmed and incapacitated.', saving_throw_ability: 'wisdom' })
];

function responder(url) {
  const path = url.pathname;
  const params = url.searchParams;
  const allowed = params.get('document__key__in')?.split(',');
  const inScope = row => !allowed || allowed.includes(row.document.key);

  if (path === '/v2/documents/') return page([srd, a5e, toh]);
  if (path === '/v2/classes/') {
    let rows = classes.filter(inScope);
    if (params.get('is_subclass') === 'false') rows = rows.filter(c => !c.subclass_of);
    if (params.get('is_subclass') === 'true') rows = rows.filter(c => c.subclass_of);
    if (params.get('subclass_of')) rows = rows.filter(c => c.subclass_of?.key === params.get('subclass_of'));
    return page(rows);
  }
  const classKey = /^\/v2\/classes\/([^/]+)\/$/.exec(path)?.[1];
  if (classKey) return classes.find(c => c.key === classKey) ?? { __status: 404 };
  if (path === '/v2/species/') {
    const needle = params.get('name__icontains')?.toLowerCase();
    const parents = params.get('subspecies_of__key__in')?.split(',');
    return page(species.filter(inScope).filter(s =>
      (!needle || s.name.toLowerCase().includes(needle)) && (!parents || parents.includes(s.subspecies_of))));
  }
  const speciesKey = /^\/v2\/species\/([^/]+)\/$/.exec(path)?.[1];
  if (speciesKey) return species.find(s => s.key === speciesKey) ?? { __status: 404 };
  if (path === '/v2/backgrounds/') return page(backgrounds.filter(inScope));
  if (path === '/v2/feats/') return page(feats.filter(inScope));
  if (path === '/v2/spells/') {
    const maxLevel = params.has('level__lte') ? Number(params.get('level__lte')) : 9;
    return page(spells.filter(inScope)
      .filter(s => s.classes.some(c => c.key === params.get('classes__key')) && s.level <= maxLevel));
  }
  return { __status: 404 };
}

function builder() {
  mock = installMockFetch(responder);
  return new CharacterBuilder(new Open5eClient());
}

describe('character builds', () => {
  test('a halfling is played as its subspecies, paired with the class its increases suit', async () => {
    const build = await builder().build({ preferredRace: 'halfling', playstyle: 'support', focusLevel: 5 });

    assert.equal(build.race.name, 'Lightfoot');
    assert.equal(build.class.name, 'Bard', '+1 Cha suits a support Bard better than a Fighter');
    assert.deepEqual(build.race.sizeCategories, ['Small']);
    assert.equal(build.race.walkingSpeed, 25);
    assert.ok(build.race.traits.includes('Lucky'), 'the parent species\' traits come with it');
  });

  test('ability scores follow the standard array, species increases and ASIs', async () => {
    const build = await builder().build({ preferredClass: 'bard', preferredRace: 'halfling', focusLevel: 5 });
    const { base, atFirstLevel, atLevel } = build.abilityScores;

    assert.equal(base.charisma, 15);
    assert.equal(atFirstLevel.charisma, 16, 'Lightfoot +1 Cha');
    assert.equal(atFirstLevel.dexterity, base.dexterity + 2, 'Halfling +2 Dex');
    assert.equal(atLevel.charisma, 18, 'the 4th-level ASI goes to Charisma');
  });

  test('hit points, proficiency and spellcasting numbers follow the rules', async () => {
    const build = await builder().build({ preferredClass: 'bard', preferredRace: 'halfling', focusLevel: 5 });
    const con = build.abilityScores.modifiers.constitution;

    assert.equal(build.hitPoints.atLevel, 8 + 4 * 5 + 5 * con);
    assert.equal(build.proficiencyBonus, 3);
    assert.deepEqual(build.spellcasting.slots, [4, 3, 2]);
    assert.equal(build.spellcasting.saveDC, 8 + 3 + build.abilityScores.modifiers.charisma);
    assert.equal(build.spellcasting.cantripsKnown, 3);
    assert.equal(build.spellcasting.spellsKnownOrPrepared, 8);
  });

  test('spell suggestions stay within the class list and castable levels, one per level first', async () => {
    const build = await builder().build({ preferredClass: 'bard', playstyle: 'support', focusLevel: 5 });
    const suggested = build.spellcasting.suggested;

    assert.equal(suggested.filter(s => s.level === 0).length, 3);
    for (const level of [1, 2, 3]) {
      assert.ok(suggested.some(s => s.level === level), `nothing suggested at level ${level}`);
    }
    assert.ok(suggested.every(s => s.level <= 3));
  });

  test('a subclass is chosen once its level is reached, with its features', async () => {
    const build = await builder().build({ preferredClass: 'bard', focusLevel: 3 });
    assert.equal(build.class.subclass.name, 'College of Lore');
    assert.deepEqual(build.class.subclass.features, ['Cutting Words']);
    assert.ok(build.levelProgression[2].choices.includes('Subclass: College of Lore'));
  });

  test('the level plan lists real features, never placeholders', async () => {
    const build = await builder().build({ preferredClass: 'bard', focusLevel: 5 });
    const everything = build.levelProgression.flatMap(p => [...p.features, ...p.choices]).join(' | ');

    assert.doesNotMatch(everything, /Level \d+ Bard features|Base class abilities|Class feature progression/);
    assert.ok(build.levelProgression[0].features.includes('Bardic Inspiration'));
    assert.ok(build.levelProgression[3].choices.some(c => /Ability Score Improvement: \+2 charisma/.test(c)));
  });

  test('feats come from the build scope and must meet their prerequisites', async () => {
    const bardBuild = await builder().build({ preferredClass: 'bard', focusLevel: 5 });
    assert.deepEqual(bardBuild.suggestedFeats, [], 'Grappler needs Strength 13; Ace Driver is out of scope');

    const fighterBuild = await builder().build({ preferredClass: 'fighter', preferredRace: 'half-orc', playstyle: 'damage', focusLevel: 5 });
    assert.deepEqual(fighterBuild.suggestedFeats.map(f => f.name), ['Grappler']);
  });

  test('a feat whose prerequisite cannot be checked is never suggested', async () => {
    const build = await builder().build({
      preferredClass: 'fighter', focusLevel: 5, playstyle: 'damage', scope: { sources: ['srd-2014', 'a5e-ag'] }
    });
    assert.ok(!build.suggestedFeats.some(f => f.name === 'Ace Driver'));
  });

  test('a species outside the scope is an error that says where it is', async () => {
    await assert.rejects(() => builder().build({ preferredRace: 'darakhul' }),
      /Species "darakhul" is not in sources srd-2014; Darakhul is in Tome of Heroes \(toh\)/);
  });

  test('an unknown class is an error, not a different class', async () => {
    await assert.rejects(() => builder().build({ preferredClass: 'bardbarian' }), /Class "bardbarian" not found/);
  });

  test('multiclass builds are rejected rather than quietly ignored', async () => {
    await assert.rejects(() => builder().build({ allowMulticlass: true }), /Multiclass builds are not supported/);
  });

  test('an invalid playstyle or level is rejected', async () => {
    await assert.rejects(() => builder().build({ playstyle: 'sneaky' }), /playstyle must be one of/);
    await assert.rejects(() => builder().build({ focusLevel: 21 }), /focus_level must be an integer from 1 to 20/);
  });

  test('a class with no spells in Open5e says so instead of listing none silently', async () => {
    const build = await builder().build({ preferredClass: 'paladin', focusLevel: 5 });
    assert.ok(build.warnings.some(w => /Open5e lists no Paladin spells/.test(w)));
  });

  test('every source used is listed, and the default scope is noted', async () => {
    const build = await builder().build({ preferredClass: 'bard' });
    assert.deepEqual(build.sources.map(s => s.key), ['srd-2014']);
    assert.ok(build.notes.some(n => /2014 SRD only/.test(n)));
  });
});
