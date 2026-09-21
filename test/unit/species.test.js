// Species traits are prose, and a subspecies states only what it adds. These
// cover reading that prose and resolving a subspecies against its parent and,
// for heritages, the species it used to be. Fixtures are trimmed live rows.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAbilityScoreIncreases, combineIncreases, isDeferredTrait,
  parseSizeCategories, parseWalkingSpeed, originSpeciesNames
} from '../../dist/species.js';
import { Open5eClient } from '../../dist/open5e-client.js';
import { installMockFetch, page } from '../helpers/mock-fetch.js';

describe('ability score increases', () => {
  const cases = [
    ['Your Dexterity score increases by 2.', { dexterity: 2 }, []],
    ['Your Strength score increases by 2, and your Charisma score increases by 1.', { strength: 2, charisma: 1 }, []],
    ['**_Ability Score Increase._** Your Constitution score increases by 1.', { constitution: 1 }, []],
    ['Your ability scores each increase by 1.',
      { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 }, []],
    ['Your Charisma score increases by 2, and two other ability scores of your choice increase by 1.',
      { charisma: 2 }, [{ count: 2, amount: 1, exclude: ['charisma'] }]],
    ['One ability score of your choice, other than Constitution, increases by 2.',
      {}, [{ count: 1, amount: 2, exclude: ['constitution'] }]],
    ['Your Strength or Dexterity score increases by 1.',
      {}, [{ count: 1, amount: 1, from: ['strength', 'dexterity'] }]],
    ['Your Dexterity score increases by 2, and you can choose to increase either your Wisdom or Charisma score by 1.',
      { dexterity: 2 }, [{ count: 1, amount: 1, from: ['wisdom', 'charisma'] }]],
    ['Two different ability scores of your choice increase by 1.', {}, [{ count: 2, amount: 1 }]]
  ];

  for (const [text, fixed, choices] of cases) {
    test(text, () => {
      const parsed = parseAbilityScoreIncreases(text);
      assert.deepEqual(parsed.fixed, fixed);
      assert.deepEqual(parsed.choices, choices);
      assert.deepEqual(parsed.warnings, []);
    });
  }

  test('a misspelt ability is a warning, not a guess (Tome of Heroes "Wisdon")', () => {
    const parsed = parseAbilityScoreIncreases('Your Wisdon score increases by 2.');
    assert.deepEqual(parsed.fixed, {});
    assert.match(parsed.warnings[0], /Unrecognised ability "Wisdon"/);
  });

  test('an unreadable increase is a warning', () => {
    const parsed = parseAbilityScoreIncreases('Increase any score you like, within reason.');
    assert.match(parsed.warnings[0], /Could not read/);
  });

  test('no text means no increase and no warning', () => {
    assert.deepEqual(parseAbilityScoreIncreases(''), { fixed: {}, choices: [], warnings: [] });
  });

  test('parent and subspecies increases add up', () => {
    const combined = combineIncreases(
      { fixed: { dexterity: 2 }, choices: [] },
      { fixed: { charisma: 1, dexterity: 1 }, choices: [{ count: 1, amount: 1 }] });
    assert.deepEqual(combined, { fixed: { dexterity: 3, charisma: 1 }, choices: [{ count: 1, amount: 1 }] });
  });
});

describe('size, speed and origin', () => {
  test('size categories from 2014 and 2024 phrasing', () => {
    assert.deepEqual(parseSizeCategories('Halflings average about 3 feet tall. Your size is Small.'), ['Small']);
    assert.deepEqual(parseSizeCategories('Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen when you select this species'),
      ['Medium', 'Small']);
  });

  test('walking speed from 2014, 2024 and Tome of Heroes phrasing', () => {
    assert.equal(parseWalkingSpeed('Your base walking speed is 25 feet.'), 25);
    assert.equal(parseWalkingSpeed('30 feet'), 30);
    assert.equal(parseWalkingSpeed('Alseid are fast for their size, with a base walking speed of 40 feet.'), 40);
  });

  test('a trait that defers to another species gives no value', () => {
    for (const text of ['Your size is determined by your Heritage Subrace.',
      "A mushroomfolk's size is determined by its subrace.",
      'Your base walking speed is determined by your Race Chassis.']) {
      assert.ok(isDeferredTrait(text), text);
      assert.deepEqual(parseSizeCategories(text), []);
      assert.equal(parseWalkingSpeed(text), null);
    }
  });

  test('heritage and chassis names give the origin species', () => {
    assert.deepEqual(originSpeciesNames('Halfling Heritage'), ['Halfling']);
    assert.deepEqual(originSpeciesNames('Elf/Shadow Fey Heritage'), ['Elf', 'Shadow Fey']);
    assert.deepEqual(originSpeciesNames('Dwarf Chassis'), ['Dwarf']);
    assert.deepEqual(originSpeciesNames('Lightfoot'), []);
  });
});

describe('resolving a species', () => {
  let mock;
  afterEach(() => { mock?.restore(); mock = undefined; });

  const srd = { key: 'srd-2014', display_name: '5e 2014 Rules', gamesystem: { key: '5e-2014' } };
  const toh = { key: 'toh', display_name: 'Tome of Heroes', gamesystem: { key: '5e-2014' } };
  const species = {
    srd_halfling: {
      key: 'srd_halfling', name: 'Halfling', document: srd, is_subspecies: false,
      traits: [
        { name: 'Ability Score Increase', desc: 'Your Dexterity score increases by 2.' },
        { name: 'Size', desc: 'Your size is Small.' },
        { name: 'Speed', desc: 'Your base walking speed is 25 feet.' },
        { name: 'Lucky', desc: 'Reroll 1s.' }
      ]
    },
    srd_lightfoot: {
      key: 'srd_lightfoot', name: 'Lightfoot', document: srd, is_subspecies: true, subspecies_of: 'srd_halfling',
      traits: [
        { name: 'Ability Score Increase', desc: 'Your Charisma score increases by 1.' },
        { name: 'Naturally Stealthy', desc: 'Hide behind larger creatures.' }
      ]
    },
    toh_darakhul: {
      key: 'toh_darakhul', name: 'Darakhul', document: toh, is_subspecies: false,
      traits: [
        { name: 'Ability Score Increase', desc: 'Your Constitution score increases by 1.' },
        { name: 'Size', desc: 'Your size is determined by your Heritage Subrace.' },
        { name: 'Speed', desc: 'Your base walking speed is determined by your Heritage Subrace.' },
        { name: 'Hunger for Flesh', desc: 'Eat raw meat.' }
      ]
    },
    'toh_halfling-heritage': {
      key: 'toh_halfling-heritage', name: 'Halfling Heritage', document: toh, is_subspecies: true,
      subspecies_of: 'toh_darakhul',
      traits: [
        { name: 'Ability Score Increase', desc: 'Your Dexterity score increases by 2.' },
        { name: 'Ill Fortune', desc: 'Attackers reroll 20s.' }
      ]
    },
    'toh_kobold-heritage': {
      key: 'toh_kobold-heritage', name: 'Kobold Heritage', document: toh, is_subspecies: true,
      subspecies_of: 'toh_darakhul',
      traits: [{ name: 'Ability Score Increase', desc: 'Your Intelligence score increases by 2.' }]
    }
  };

  function responder(url) {
    if (url.pathname === '/v2/documents/') return page([srd, toh]);
    const direct = /^\/v2\/species\/([^/]+)\/$/.exec(url.pathname);
    if (direct) return species[direct[1]] ?? { __status: 404 };
    const needle = url.searchParams.get('name__icontains')?.toLowerCase();
    const parents = url.searchParams.get('subspecies_of__key__in')?.split(',');
    return page(Object.values(species).filter(s =>
      (needle && s.name.toLowerCase().includes(needle)) || (parents && parents.includes(s.subspecies_of))));
  }

  test('a subspecies adds its increases to its parent\'s and takes size, speed and traits from it', async () => {
    mock = installMockFetch(responder);
    const lightfoot = await new Open5eClient().getRaceDetails('lightfoot');

    assert.deepEqual(lightfoot.resolved.abilityScoreIncreases.fixed, { dexterity: 2, charisma: 1 });
    assert.deepEqual(lightfoot.resolved.sizeCategories, ['Small']);
    assert.equal(lightfoot.resolved.walkingSpeed, 25);
    assert.equal(lightfoot.size, 'Your size is Small.');
    assert.deepEqual(lightfoot.resolved.from, {
      size: 'srd_halfling', speed: 'srd_halfling', abilityScores: ['srd_halfling', 'srd_lightfoot']
    });
    assert.deepEqual(lightfoot.resolved.inheritedTraits.map(t => t.name), ['Lucky']);
    assert.deepEqual(lightfoot.resolved.unresolved, []);
  });

  test('a heritage takes size and speed from the species it names when its parent defers', async () => {
    mock = installMockFetch(responder);
    const heritage = await new Open5eClient().getRaceDetails('halfling heritage');

    assert.deepEqual(heritage.resolved.sizeCategories, ['Small']);
    assert.equal(heritage.resolved.walkingSpeed, 25);
    assert.equal(heritage.resolved.from.size, 'srd_halfling');
    assert.deepEqual(heritage.resolved.abilityScoreIncreases.fixed, { constitution: 1, dexterity: 2 });
    assert.deepEqual(heritage.resolved.inheritedTraits.map(t => t.name), ['Hunger for Flesh']);
  });

  test('a heritage whose origin species does not exist stays unresolved and says why', async () => {
    mock = installMockFetch(responder);
    const kobold = await new Open5eClient().getRaceDetails('kobold heritage');

    assert.equal(kobold.size, null);
    assert.equal(kobold.resolved.walkingSpeed, null);
    assert.ok(kobold.resolved.unresolved.some(r => /size: Your size is determined by your Heritage Subrace/.test(r)));
    assert.deepEqual(kobold.resolved.abilityScoreIncreases.fixed, { constitution: 1, intelligence: 2 },
      'what can be resolved still is');
  });

  test('search results are resolved too', async () => {
    mock = installMockFetch(responder);
    const { results } = await new Open5eClient().searchRaces('halfling');
    const lightfoot = results.find(r => r.key === 'srd_lightfoot');

    assert.equal(lightfoot.resolved.walkingSpeed, 25);
  });
});
