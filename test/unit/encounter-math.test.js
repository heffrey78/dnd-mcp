// Encounter difficulty is pure arithmetic over the DMG tables, so it is pinned
// here against the published values (DMG pp.82, 274) rather than against
// whatever the implementation happens to produce.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Open5eClient } from '../../dist/open5e-client.js';

const client = new Open5eClient();

/** One encounter entry worth `xp` each, `count` of them. */
const group = (xp, count = 1) => ({
  count,
  totalXP: xp * count,
  monsterData: { actions: [] }
});

describe('encounter difficulty', () => {
  test('a lone weak monster is trivial for a standard party', async () => {
    // 4x level 1: easy threshold is 4 * 25 = 100 XP. One CR 1/8 monster = 25 XP.
    const result = await client.getEncounterDifficulty(4, 1, [group(25)]);
    assert.equal(result, 'trivial');
  });

  test('thresholds scale with party size', async () => {
    // Level 1 medium threshold is 50 XP per character.
    // 200 adjusted XP is medium for a 4-person party but trivial for a larger one.
    assert.equal(await client.getEncounterDifficulty(4, 1, [group(200)]), 'medium');
    assert.equal(await client.getEncounterDifficulty(4, 5, [group(200)]), 'trivial');
  });

  test('a deadly encounter is reported as deadly', async () => {
    // 4x level 1: deadly threshold is 4 * 100 = 400 XP.
    const result = await client.getEncounterDifficulty(4, 1, [group(500)]);
    assert.equal(result, 'deadly');
  });

  test('party level beyond 20 clamps to the level 20 row', async () => {
    const atTwenty = await client.getEncounterDifficulty(4, 20, [group(20000)]);
    const beyond = await client.getEncounterDifficulty(4, 25, [group(20000)]);
    assert.equal(beyond, atTwenty);
  });
});

describe('DMG group multipliers', () => {
  // getEncounterDifficulty only returns a label, so each band is probed with a
  // per-monster XP chosen to land just inside the "easy" band (100-199 adjusted
  // XP for four level-1 characters) at the correct multiplier. Any inflated
  // multiplier pushes the same encounter over 200 and reports "medium", so
  // these cases fail loudly if the DMG bands are ever widened again.
  const bands = [
    { count: 1, perMonster: 192, multiplier: 1, adjusted: 192 },
    { count: 2, perMonster: 64, multiplier: 1.5, adjusted: 192 },
    { count: 3, perMonster: 32, multiplier: 2, adjusted: 192 },
    { count: 4, perMonster: 24, multiplier: 2, adjusted: 192 },
    { count: 5, perMonster: 19, multiplier: 2, adjusted: 190 },
    { count: 6, perMonster: 16, multiplier: 2, adjusted: 192 },
    { count: 7, perMonster: 11, multiplier: 2.5, adjusted: 192 },
    { count: 9, perMonster: 8, multiplier: 2.5, adjusted: 180 },
    { count: 10, perMonster: 7, multiplier: 2.5, adjusted: 175 },
    { count: 11, perMonster: 5, multiplier: 3, adjusted: 165 },
    { count: 12, perMonster: 5, multiplier: 3, adjusted: 180 },
    { count: 14, perMonster: 4, multiplier: 3, adjusted: 168 },
    { count: 15, perMonster: 3, multiplier: 4, adjusted: 180 }
  ];

  for (const { count, perMonster, multiplier, adjusted } of bands) {
    test(`${count} monster(s) apply the x${multiplier} band`, async () => {
      assert.equal(
        Math.floor(perMonster * count * multiplier), adjusted,
        'fixture arithmetic'
      );

      const result = await client.getEncounterDifficulty(4, 1, [group(perMonster, count)]);

      assert.equal(result, 'easy',
        `${count} x ${perMonster} XP should adjust to ${adjusted} (x${multiplier}) ` +
        'and stay easy; "medium" means the multiplier is too high');
    });
  }

  test('more than 15 monsters stays in the x4 band rather than inflating further', async () => {
    const fifteen = await client.getEncounterDifficulty(4, 20, [group(200, 15)]);
    const thirty = await client.getEncounterDifficulty(4, 20, [group(100, 30)]);
    // Both adjust to 200*15*4 = 12000 and 100*30 -> clamped 15 -> 3000*4 = 12000.
    assert.equal(fifteen, thirty);
  });

  test('an empty encounter is trivial, not an error', async () => {
    const result = await client.getEncounterDifficulty(4, 5, []);
    assert.equal(result, 'trivial');
  });
});
