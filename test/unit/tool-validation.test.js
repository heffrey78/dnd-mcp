// Bad tool input must fail loudly. The failure mode that matters here is the
// quiet one: a rejected filter that becomes "no filter" and returns the entire
// collection as though every row matched.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/mcp-client.js';

describe('tool input validation', () => {
  let server;

  before(async () => { server = await startServer(); });
  after(() => server?.stop());

  const errorText = response =>
    response.error?.message ?? response.result?.content?.[0]?.text ?? '';

  const assertRejected = (response, pattern, message) => {
    const failed = Boolean(response.error) || Boolean(response.result?.isError);
    assert.ok(failed, message ?? `expected an error, got: ${errorText(response)}`);
    if (pattern) assert.match(errorText(response), pattern);
  };

  test('a spell level above 9 is rejected rather than returning nothing', async () => {
    const response = await server.callTool('get_spell_by_level', { level: 99 });
    assertRejected(response, /between 0 and 9/i);
  });

  test('a negative spell level is rejected', async () => {
    assertRejected(await server.callTool('get_spell_by_level', { level: -1 }), /between 0 and 9/i);
  });

  test('a non-numeric spell level is rejected before reaching the API', async () => {
    const response = await server.callTool('get_spell_by_level', { level: 'abc' });
    assertRejected(response, /integer/i);
    assert.doesNotMatch(errorText(response), /Open5e API error/,
      'validation should happen locally, not surface an upstream 400');
  });

  test('a missing required name is rejected', async () => {
    assertRejected(await server.callTool('get_spell_details', {}), /required/i);
  });

  test('a blank name is rejected rather than treated as "match everything"', async () => {
    assertRejected(await server.callTool('get_spell_details', { spell_name: '   ' }), /empty|required/i);
  });

  test('a non-string name is rejected', async () => {
    assertRejected(await server.callTool('get_spell_details', { spell_name: 42 }), /string/i);
  });

  test('a non-string query does not silently return the whole catalogue', async () => {
    const response = await server.callTool('search_spells', { query: 12345 });

    if (!response.error && !response.result?.isError) {
      const body = JSON.parse(response.result.content[0].text);
      assert.ok(body.found < 100,
        `a rejected filter must not fall back to an unfiltered search (found ${body.found})`);
    }
  });

  test('a challenge rating outside 0-30 is rejected', async () => {
    assertRejected(await server.callTool('get_monsters_by_cr', { challenge_rating: 99 }), /between 0 and 30/i);
  });

  test('an unknown encounter difficulty is rejected', async () => {
    const response = await server.callTool('build_encounter', {
      party_size: 4, party_level: 5, difficulty: 'impossible'
    });
    assertRejected(response, /difficulty must be one of/i);
  });

  test('a party level beyond 20 is rejected, since the DMG tables stop there', async () => {
    const response = await server.callTool('build_encounter', {
      party_size: 4, party_level: 50, difficulty: 'medium'
    });
    assertRejected(response, /party_level must be between 1 and 20/i);
  });

  test('the server stays usable after a rejected call', async () => {
    await server.callTool('get_spell_by_level', { level: 99 });
    const { result } = await server.listTools();
    assert.ok(result.tools.length > 0);
  });
});
