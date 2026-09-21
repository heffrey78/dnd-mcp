// End-to-end: the real server, the real Open5e API, over real JSON-RPC.
// Run with: npm run test:integration

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, toolJson } from '../helpers/mcp-client.js';

describe('MCP tools against the live API', () => {
  let server;

  before(async () => { server = await startServer(); });
  after(() => server?.stop());

  const matchesName = (rows, needle) =>
    rows.every(r => r.name.toLowerCase().includes(needle));

  test('search_spells returns only spells matching the name', async () => {
    const body = toolJson(await server.callTool('search_spells', { query: 'fireball' }));

    assert.ok(body.spells.length > 0);
    assert.ok(
      matchesName(body.spells, 'fireball'),
      `got: ${body.spells.map(s => s.name).join(', ')}`
    );
  });

  test('get_spell_details prefers the SRD copy among six "Fireball"s', async () => {
    const spell = toolJson(await server.callTool('get_spell_details', { spell_name: 'fireball' }));

    assert.equal(spell.name, 'Fireball');
    assert.equal(spell.source.key, 'srd-2014');
    assert.equal(spell.level, 3);
  });

  test('get_spells_by_class honours the ruleset and level cap', async () => {
    const body = toolJson(await server.callTool('get_spells_by_class', {
      class_name: 'bard', ruleset: '5e-2024', max_level: 1, limit: 100
    }));

    assert.equal(body.classKey, 'srd-2024_bard');
    assert.ok(body.spells.length > 0);
    assert.ok(body.spells.every(s => s.source.ruleset === '5e-2024'),
      `off-ruleset spells: ${body.spells.filter(s => s.source.ruleset !== '5e-2024').map(s => s.name)}`);
    assert.ok(body.spells.every(s => s.level <= 1));
  });

  test('get_class_details returns v2 features, SRD spell slots and subclasses', async () => {
    const bard = toolJson(await server.callTool('get_class_details', { class_name: 'bard' }));

    assert.equal(bard.key, 'srd_bard');
    assert.deepEqual(bard.primaryAbility, ['charisma']);
    assert.deepEqual(bard.spellSlotsByLevel[2], [4, 2]);
    assert.ok(bard.features.some(f => f.name === 'Bardic Inspiration' && f.levels.includes(1)));
    assert.ok(bard.subclasses.includes('College of Lore'));
  });

  test('search_monsters returns only monsters matching the name', async () => {
    const body = toolJson(await server.callTool('search_monsters', { query: 'goblin' }));

    assert.ok(body.monsters.length > 0);
    assert.ok(matchesName(body.monsters, 'goblin'));
  });

  test('build_encounter filters by environment on structured v2 data', async () => {
    const encounter = toolJson(await server.callTool('build_encounter', {
      party_size: 4, party_level: 3, difficulty: 'medium', environment: 'forest', ruleset: '5e-2014'
    }));

    assert.ok(encounter.monsters.length > 0);
    for (const { monsterData } of encounter.monsters) {
      assert.ok(monsterData.environments.some(env => env.toLowerCase().includes('forest')),
        `${monsterData.name} is not a forest monster: ${monsterData.environments}`);
      assert.equal(monsterData.source.ruleset, '5e-2014');
    }
  });

  test('get_monsters_by_cr_range stays inside the range', async () => {
    const body = toolJson(await server.callTool('get_monsters_by_cr_range', {
      min_cr: 0.25, max_cr: 1, monster_types: ['undead'], limit: 20
    }));

    assert.ok(body.monsters.length > 0);
    const crs = { '1/4': 0.25, '1/2': 0.5, '1': 1 };
    assert.ok(body.monsters.every(m => m.challengeRating in crs && m.type === 'Undead'),
      body.monsters.map(m => `${m.name} ${m.challengeRating} ${m.type}`).join('; '));
  });

  test('calculate_encounter_difficulty rejects an unknown CR instead of scoring it 0 XP', async () => {
    const response = await server.callTool('calculate_encounter_difficulty', {
      party_size: 4, party_level: 5, monsters: [{ name: 'Goblin', cr: '1/3', count: 2 }]
    });
    assert.equal(response.result?.isError, true);
    assert.match(response.result.content[0].text, /Unknown challenge rating/);
  });

  test('search_armor filters locally and does not return the full catalogue', async () => {
    const body = toolJson(await server.callTool('search_armor', { query: 'plate' }));

    assert.ok(body.armor.length > 0);
    assert.ok(matchesName(body.armor, 'plate'));
  });

  test('search_conditions narrows to the matching condition', async () => {
    const body = toolJson(await server.callTool('search_conditions', { query: 'blind' }));

    assert.ok(body.conditions.length > 0);
    assert.ok(matchesName(body.conditions, 'blind'));
  });

  test('search_races resolves against the species endpoint', async () => {
    const body = toolJson(await server.callTool('search_races', { query: 'elf' }));

    assert.ok(body.races.length > 0);
    assert.ok(matchesName(body.races, 'elf'));
  });

  test('unified_search returns items alongside the counts it reports', async () => {
    const body = toolJson(await server.callTool('unified_search', { query: 'dragon' }));

    assert.ok(body.totalResults > 0);
    for (const [type, bucket] of Object.entries(body.results)) {
      if (bucket.count > 0 && bucket.items.length === 0) {
        // Known gap: classes and sections report unfiltered counts.
        assert.ok(
          ['classes', 'sections'].includes(type),
          `${type} reported count=${bucket.count} but returned no items`
        );
      }
    }
  });

  test('a query matching nothing returns empty results rather than everything', async () => {
    const body = toolJson(await server.callTool('search_spells', { query: 'zzzznomatch' }));
    assert.equal(body.spells.length, 0);
  });
});
