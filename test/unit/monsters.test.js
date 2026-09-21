// Monsters from /v2/creatures/: the stat-block transform, the sparse scan
// used for locally filtered queries, and encounter sampling.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Open5eClient } from '../../dist/open5e-client.js';
import { installMockFetch, page } from '../helpers/mock-fetch.js';

let mock;
afterEach(() => { mock?.restore(); mock = undefined; });

const goblin = {
  key: 'srd_goblin', name: 'Goblin', size: { name: 'Small' }, type: { name: 'Humanoid', key: 'humanoid' },
  subcategory: 'goblinoid', alignment: 'neutral evil', armor_class: 15, armor_detail: 'leather armor, shield',
  hit_points: 7, hit_dice: '2d6', speed: { walk: 30, unit: 'feet' },
  ability_scores: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
  saving_throws: {}, skill_bonuses: { stealth: 6 },
  resistances_and_immunities: { damage_immunities_display: '', condition_immunities_display: '' },
  languages: { as_string: 'Common, Goblin' }, darkvision_range: 60, passive_perception: 9,
  challenge_rating: 0.25, experience_points: 50,
  environments: [{ name: 'Forest or Jungle', key: 'forest' }, { name: 'Caves', key: 'caves' }],
  traits: [{ name: 'Nimble Escape', desc: 'Disengage or Hide as a bonus action.' }],
  actions: [
    { name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit.', action_type: 'ACTION' },
    { name: 'Parry', desc: 'Adds 2 to its AC.', action_type: 'REACTION' }
  ],
  document: { key: 'srd-2014', display_name: '5e 2014 Rules', gamesystem: { key: '5e-2014' } }
};

const dragon = {
  ...goblin, key: 'srd_adult-red-dragon', name: 'Adult Red Dragon', type: { name: 'Dragon', key: 'dragon' },
  speed: { walk: 40, climb: 40, fly: 80, burrow: 0, hover: false, unit: 'feet' },
  blindsight_range: 60, darkvision_range: 120, passive_perception: 23,
  resistances_and_immunities: { damage_immunities_display: 'fire' },
  challenge_rating: 17, environments: [{ name: 'Mountain', key: 'mountain' }],
  actions: [
    { name: 'Bite', desc: 'Melee.', action_type: 'ACTION' },
    { name: 'Wing Attack', desc: 'Beats its wings.', action_type: 'LEGENDARY_ACTION', legendary_action_cost: 2 }
  ]
};

describe('monster stat blocks', () => {
  test('a v2 creature maps onto the monster shape', async () => {
    mock = installMockFetch(() => page([goblin]));
    const monster = (await new Open5eClient().searchMonsters('goblin')).results[0];

    assert.equal(monster.size, 'Small');
    assert.equal(monster.type, 'Humanoid');
    assert.equal(monster.challengeRating, '1/4', 'fractional CRs are written as the DMG writes them');
    assert.equal(monster.experiencePoints, 50);
    assert.equal(monster.abilities.dexterity, 14);
    assert.deepEqual(monster.skills, { stealth: 6 });
    assert.equal(monster.senses, 'darkvision 60 ft., passive Perception 9');
    assert.equal(monster.languages, 'Common, Goblin');
    assert.deepEqual(monster.actions.map(a => a.name), ['Scimitar']);
    assert.deepEqual(monster.reactions.map(a => a.name), ['Parry']);
    assert.deepEqual(monster.specialAbilities.map(a => a.name), ['Nimble Escape']);
    assert.deepEqual(monster.environments, ['Forest or Jungle', 'Caves']);
    assert.equal(monster.source.key, 'srd-2014');
  });

  test('speeds drop unused modes, legendary actions keep their cost', async () => {
    mock = installMockFetch(() => page([dragon]));
    const monster = (await new Open5eClient().searchMonsters('dragon')).results[0];

    assert.deepEqual(monster.speed, { walk: 40, climb: 40, fly: 80, unit: 'feet' });
    assert.equal(monster.senses, 'blindsight 60 ft., darkvision 120 ft., passive Perception 23');
    assert.equal(monster.damageImmunities, 'fire');
    assert.deepEqual(monster.legendaryActions, [{ name: 'Wing Attack', desc: 'Beats its wings.', cost: 2 }]);
  });

  test('CR filters use the numeric v2 parameters', async () => {
    mock = installMockFetch(() => page([]));
    await new Open5eClient().searchMonsters('', { cr: 0.125, type: 'Dragon' });

    const params = mock.paramsOf();
    assert.equal(params.challenge_rating, '0.125');
    assert.equal(params.type, 'dragon', 'type keys are lower case; type__key is ignored upstream');
    assert.equal(params.cr, undefined, 'cr= is ignored by /v2/creatures/');
  });
});

describe('locally filtered monster queries', () => {
  function responder(url) {
    if (url.searchParams.has('key__in')) {
      const keys = url.searchParams.get('key__in').split(',');
      return page([goblin, dragon].filter(m => keys.includes(m.key)));
    }
    // The sparse scan: only the requested fields come back.
    return page([goblin, dragon].map(m => ({ key: m.key, name: m.name, type: m.type, environments: m.environments })));
  }

  test('an environment filter scans a sparse fieldset, then fetches the matches in full', async () => {
    mock = installMockFetch(responder);
    const result = await new Open5eClient().searchMonsters('', { environment: 'forest' });

    const scan = mock.calls[0];
    assert.ok(scan.searchParams.get('fields').split(',').includes('environments'));
    assert.equal(scan.searchParams.get('environments'), null, 'the environment filter is not sent upstream');
    assert.equal(mock.calls[1].searchParams.get('key__in'), 'srd_goblin');

    assert.deepEqual(result.results.map(m => m.name), ['Goblin']);
    assert.equal(result.results[0].hitPoints, 7, 'the hydrated row is the full stat block');
    assert.equal(result.count, 1);
  });

  test('several monster types are matched locally', async () => {
    mock = installMockFetch(responder);
    const result = await new Open5eClient().searchMonsters('', { types: ['dragon', 'undead'] });
    assert.deepEqual(result.results.map(m => m.name), ['Adult Red Dragon']);
  });

  test('a CR range is sent as gte/lte and ordered by CR', async () => {
    mock = installMockFetch(() => page([]));
    await new Open5eClient().getMonstersByCRRange({ minCr: 1, maxCr: 3 });

    const params = mock.paramsOf();
    assert.equal(params.challenge_rating__gte, '1');
    assert.equal(params.challenge_rating__lte, '3');
    assert.equal(params.ordering, 'challenge_rating');
  });

  test('an inverted CR range is an error, not an empty result', async () => {
    mock = installMockFetch(() => page([]));
    await assert.rejects(() => new Open5eClient().getMonstersByCRRange({ minCr: 5, maxCr: 1 }), /greater than max_cr/);
  });
});

describe('encounter sampling', () => {
  test('an encounter draws from the whole CR range, not the first page', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ key: `m${i}` }));
    mock = installMockFetch(url => {
      if (url.searchParams.has('key__in')) {
        return page(url.searchParams.get('key__in').split(',').map(key => ({
          ...goblin, key, name: `Monster ${key}`, challenge_rating: 1
        })));
      }
      return page(many);
    });
    const client = new Open5eClient();

    const encounter = await client.buildRandomEncounter({ partySize: 4, partyLevel: 5, difficulty: 'medium' });

    const scan = mock.calls[0];
    assert.equal(scan.searchParams.get('fields'), 'key', 'the candidate scan is key-only');
    assert.equal(scan.searchParams.get('challenge_rating__lte'), '8');
    assert.ok(encounter.monsters.length > 0);
    const fetched = mock.calls.filter(u => u.searchParams.has('key__in'))
      .flatMap(u => u.searchParams.get('key__in').split(','));
    assert.equal(fetched.length, 60, 'a sample of 60 is fetched in full');
  });
});

describe('XP by challenge rating', () => {
  test('known CRs map to the DMG XP values', () => {
    const client = new Open5eClient();
    assert.equal(client.xpForChallengeRating('1/4'), 50);
    assert.equal(client.xpForChallengeRating('5'), 1800);
    assert.equal(client.xpForChallengeRating('30'), 155000);
  });

  test('an unknown CR is an error, not 0 XP', () => {
    assert.throws(() => new Open5eClient().xpForChallengeRating('1/3'), /Unknown challenge rating "1\/3"/);
  });
});
