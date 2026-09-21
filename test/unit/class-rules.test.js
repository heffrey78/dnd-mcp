// Class rules kept in code because Open5e's data is incomplete or wrong for
// them. Each expectation is read off the SRD table cited in class-rules.ts; a
// failure here means the numbers drifted.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_RULES, classRulesFor, keyAbilityList, spellSlots, proficiencyBonus, asiLevels
} from '../../dist/class-rules.js';

describe('class rules table', () => {
  test('covers exactly the twelve SRD classes', () => {
    assert.deepEqual(Object.keys(CLASS_RULES).sort(), [
      'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
      'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'
    ]);
  });

  test('key abilities follow the multiclassing prerequisites', () => {
    assert.deepEqual(keyAbilityList(classRulesFor('Bard')), ['charisma']);
    assert.deepEqual(keyAbilityList(classRulesFor('monk')), ['dexterity', 'wisdom']);
    assert.deepEqual(CLASS_RULES.fighter.keyAbilities, { anyOf: ['strength', 'dexterity'] });
    assert.deepEqual(CLASS_RULES.paladin.keyAbilities, { allOf: ['strength', 'charisma'] });
  });

  test('caster types and spellcasting abilities', () => {
    const casters = Object.fromEntries(Object.entries(CLASS_RULES)
      .map(([name, rules]) => [name, `${rules.casterType}/${rules.spellcastingAbility}`]));
    assert.deepEqual(casters, {
      barbarian: 'none/null', bard: 'full/charisma', cleric: 'full/wisdom', druid: 'full/wisdom',
      fighter: 'none/null', monk: 'none/null', paladin: 'half/charisma', ranger: 'half/wisdom',
      rogue: 'none/null', sorcerer: 'full/charisma', warlock: 'pact/charisma', wizard: 'full/intelligence'
    });
  });

  test('a non-SRD class has no rules rather than borrowed ones', () => {
    assert.equal(classRulesFor('Marshal'), null);
  });
});

describe('spell slots', () => {
  test('full casters follow the Multiclass Spellcaster table', () => {
    assert.deepEqual(spellSlots('full', 1).byLevel, [2]);
    // Open5e's 2014 Bard column has no 2nd-level slots at 3rd level; the SRD does.
    assert.deepEqual(spellSlots('full', 3).byLevel, [4, 2]);
    assert.deepEqual(spellSlots('full', 5).byLevel, [4, 3, 2]);
    assert.deepEqual(spellSlots('full', 17).byLevel, [4, 3, 3, 3, 2, 1, 1, 1, 1]);
    assert.deepEqual(spellSlots('full', 20).byLevel, [4, 3, 3, 3, 3, 2, 2, 1, 1]);
    assert.equal(spellSlots('full', 9).maxSpellLevel, 5);
  });

  test('2014 half casters start at 2nd level, 2024 ones at 1st', () => {
    assert.deepEqual(spellSlots('half', 1, '5e-2014').byLevel, []);
    assert.deepEqual(spellSlots('half', 1, '5e-2024').byLevel, [2]);
    assert.deepEqual(spellSlots('half', 2, '5e-2014').byLevel, [2]);
    assert.deepEqual(spellSlots('half', 5).byLevel, [4, 2]);
    assert.deepEqual(spellSlots('half', 17).byLevel, [4, 3, 3, 3, 1]);
    assert.equal(spellSlots('half', 20).maxSpellLevel, 5);
  });

  test('pact magic slots are all one level', () => {
    assert.deepEqual(spellSlots('pact', 1), { byLevel: [1], maxSpellLevel: 1, pact: true });
    assert.deepEqual(spellSlots('pact', 5).byLevel, [0, 0, 2]);
    assert.deepEqual(spellSlots('pact', 11).byLevel, [0, 0, 0, 0, 3]);
    assert.deepEqual(spellSlots('pact', 20).byLevel, [0, 0, 0, 0, 4]);
  });

  test('non-casters have none', () => {
    assert.deepEqual(spellSlots('none', 10), { byLevel: [], maxSpellLevel: 0, pact: false });
  });

  test('a level outside 1-20 is rejected', () => {
    assert.throws(() => spellSlots('full', 0), /1 to 20/);
    assert.throws(() => spellSlots('full', 21), /1 to 20/);
  });
});

describe('advancement', () => {
  test('proficiency bonus by level', () => {
    assert.deepEqual([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonus), [2, 2, 3, 3, 4, 5, 6, 6]);
  });

  test('ASI levels, with the Fighter and Rogue extras', () => {
    assert.deepEqual(asiLevels('Bard'), [4, 8, 12, 16, 19]);
    assert.deepEqual(asiLevels('fighter'), [4, 6, 8, 12, 14, 16, 19]);
    assert.deepEqual(asiLevels('rogue'), [4, 8, 10, 12, 16, 19]);
  });

  test('in 2024 the 19th-level slot is an Epic Boon, not an ASI', () => {
    assert.deepEqual(asiLevels('bard', '5e-2024'), [4, 8, 12, 16]);
  });
});
