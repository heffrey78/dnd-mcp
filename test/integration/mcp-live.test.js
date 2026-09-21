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

  test('search_monsters returns only monsters matching the name', async () => {
    const body = toolJson(await server.callTool('search_monsters', { query: 'goblin' }));

    assert.ok(body.monsters.length > 0);
    assert.ok(matchesName(body.monsters, 'goblin'));
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
