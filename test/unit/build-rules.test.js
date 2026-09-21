// The pure parts of the build engine: ability scores, feat prerequisites and
// spell roles. Rule values are checked against their cited sources.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_ARRAY, abilityModifier, assignStandardArray, applyIncreases, backgroundIncreases,
  planImprovements, priorityOrder, increaseFit
} from '../../dist/character-build/abilities.js';
import { checkPrerequisite } from '../../dist/character-build/prerequisites.js';
import { spellRoles, roleFit } from '../../dist/character-build/heuristics.js';

const tens = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

describe('ability scores', () => {
  test('the standard array is 15, 14, 13, 12, 10, 8', () => {
    assert.deepEqual([...STANDARD_ARRAY], [15, 14, 13, 12, 10, 8]);
  });

  test('modifiers', () => {
    assert.deepEqual([1, 8, 9, 10, 11, 15, 20].map(abilityModifier), [-5, -1, -1, 0, 0, 2, 5]);
  });

  test('the array is assigned highest first down the priority list', () => {
    const scores = assignStandardArray(['charisma', 'dexterity', 'constitution']);
    assert.equal(scores.charisma, 15);
    assert.equal(scores.dexterity, 14);
    assert.equal(scores.constitution, 13);
    assert.deepEqual(Object.values(scores).sort((a, b) => b - a), [15, 14, 13, 12, 10, 8]);
  });

  test('priorityOrder lists every ability once', () => {
    assert.deepEqual(priorityOrder(['wisdom'], ['wisdom', 'strength']).slice(0, 2), ['wisdom', 'strength']);
    assert.equal(priorityOrder([]).length, 6);
  });

  test('fixed increases apply and choices go to the highest-priority allowed ability', () => {
    const { scores, steps } = applyIncreases(tens, {
      fixed: { charisma: 2 },
      choices: [{ count: 2, amount: 1, exclude: ['charisma'] }]
    }, ['charisma', 'dexterity', 'constitution'], 'Half-Elf');

    assert.equal(scores.charisma, 12);
    assert.equal(scores.dexterity, 11);
    assert.equal(scores.constitution, 11);
    assert.deepEqual(steps, ['Half-Elf: +2 charisma', 'Half-Elf: +1 dexterity (chosen)', 'Half-Elf: +1 constitution (chosen)']);
  });

  test('no increase takes a score past 20', () => {
    const { scores } = applyIncreases({ ...tens, strength: 19 }, { fixed: { strength: 2 }, choices: [] }, [], 'x');
    assert.equal(scores.strength, 20);
  });

  test('a 2024 background raises its best listed ability by 2 and the next by 1', () => {
    assert.deepEqual(backgroundIncreases(['intelligence', 'wisdom', 'charisma'], ['wisdom', 'constitution', 'charisma']),
      { fixed: { wisdom: 2, charisma: 1 }, choices: [] });
  });

  test('improvements raise the key ability to 20, splitting +1/+1 at 19', () => {
    const { scores, choices } = planImprovements({ ...tens, charisma: 17, dexterity: 14 }, [4, 8, 12], ['charisma', 'dexterity']);
    assert.equal(scores.charisma, 20);
    assert.equal(scores.dexterity, 17);
    assert.deepEqual(choices.map(c => c.text), [
      'Ability Score Improvement: +2 charisma (to 19)',
      'Ability Score Improvement: +1 charisma, +1 dexterity',
      'Ability Score Improvement: +2 dexterity (to 17)'
    ]);
  });

  test('species fit counts the main key ability double', () => {
    const lightfoot = { fixed: { dexterity: 2, charisma: 1 }, choices: [] };
    assert.equal(increaseFit(lightfoot, ['dexterity']), 4);
    assert.equal(increaseFit(lightfoot, ['charisma']), 2);
    assert.equal(increaseFit(lightfoot, ['wisdom']), 0);
  });
});

describe('feat prerequisites', () => {
  const character = {
    level: 4, scores: { ...tens, strength: 8, dexterity: 14 }, canCastSpells: true, features: ['spellcasting']
  };

  const cases = [
    ['', 'met'],
    ['Strength 13 or higher', 'unmet'],
    ['Strength or Dexterity 13+', 'met'],
    ['Level 4+, Strength or Dexterity 13+', 'met'],
    ['Level 19+', 'unmet'],
    ['Level 19+, Spellcasting Feature', 'unmet'],
    ['Requires the ability to cast at least one spell of 1st-level or higher', 'met'],
    ['Fighting Style Feature', 'unmet'],
    ['Proficiency with a type of vehicle', 'unknown']
  ];

  for (const [text, expected] of cases) {
    test(`"${text || '(none)'}" is ${expected}`, () => {
      assert.equal(checkPrerequisite(text, character), expected);
    });
  }
});

describe('spell roles', () => {
  const spell = (description, extra = {}) => ({ description, ritual: false, ...extra });

  test('damage comes from the structured fields, not passing mentions', () => {
    assert.deepEqual(spellRoles(spell('A streak of fire.', { damageRoll: '8d6' })), ['damage']);
    assert.ok(!spellRoles(spell('If the stone is destroyed you take 6d6 bludgeoning damage.')).includes('damage'));
  });

  test('healing, but not "can\'t regain hit points"', () => {
    assert.ok(spellRoles(spell('A creature you touch regains a number of hit points equal to 1d8.')).includes('healing'));
    assert.ok(!spellRoles(spell("The target can't regain hit points until your next turn.", { attackRoll: true }))
      .includes('healing'));
  });

  test('control needs a save and a condition', () => {
    assert.ok(spellRoles(spell('The target must succeed or be paralyzed.', { savingThrow: 'wisdom' })).includes('control'));
  });

  test('"disadvantage on" is not a buff', () => {
    assert.ok(!spellRoles(spell('It has disadvantage on the next attack roll.', { damageRoll: '1d4' })).includes('buff'));
    assert.ok(spellRoles(spell('Each target can roll a d4 and add the number rolled.')).includes('buff'));
  });

  test('rituals and anything else are utility', () => {
    assert.deepEqual(spellRoles(spell('You learn the item\'s properties.', { ritual: true })), ['utility']);
  });

  test('role fit covers only SRD classes', () => {
    assert.equal(roleFit('Bard', 'support'), 5);
    assert.equal(roleFit('Marshal', 'support'), null);
  });
});
