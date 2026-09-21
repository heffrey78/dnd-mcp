// The stdio transport *is* stdout, so anything else written there corrupts the
// JSON-RPC stream. A stray console.log once made the whole server unusable,
// so protocol hygiene is asserted directly against a real server process.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/mcp-client.js';

describe('MCP stdio protocol', () => {
  let server;

  before(async () => { server = await startServer(); });
  after(() => server?.stop());

  test('the server completes the initialize handshake', () => {
    assert.equal(server.initResult.result.serverInfo.name, 'dnd-mcp-server');
    assert.ok(server.initResult.result.protocolVersion);
  });

  test('every line written to stdout is valid JSON-RPC', async () => {
    await server.listTools();

    const lines = server.stdoutRaw.split('\n').filter(l => l.trim());
    for (const line of lines) {
      let parsed;
      assert.doesNotThrow(
        () => { parsed = JSON.parse(line); },
        `stdout must carry only JSON-RPC, got: ${line.slice(0, 80)}`
      );
      assert.equal(parsed.jsonrpc, '2.0');
    }
  });

  test('diagnostics go to stderr, keeping stdout clean', () => {
    assert.match(server.stderrRaw, /started/i);
  });

  test('tools are advertised with name, description and input schema', async () => {
    const { result } = await server.listTools();

    assert.ok(result.tools.length > 0);
    for (const tool of result.tools) {
      assert.equal(typeof tool.name, 'string');
      assert.ok(tool.name.length > 0);
      assert.equal(typeof tool.description, 'string');
      assert.equal(tool.inputSchema.type, 'object');
    }
  });

  test('tool names are unique', async () => {
    const { result } = await server.listTools();
    const names = result.tools.map(t => t.name);
    assert.equal(new Set(names).size, names.length);
  });

  test('the documented core tools are present', async () => {
    const { result } = await server.listTools();
    const names = new Set(result.tools.map(t => t.name));

    for (const expected of [
      'unified_search', 'search_spells', 'get_spell_details',
      'search_monsters', 'search_races', 'search_classes',
      'search_magic_items', 'search_armor', 'search_conditions'
    ]) {
      assert.ok(names.has(expected), `missing tool: ${expected}`);
    }
  });

  test('an over-long string argument is rejected before any lookup', async () => {
    const response = await server.callTool('search_races', { query: 'a'.repeat(101) });
    assert.equal(response.result?.isError, true);
    assert.match(response.result.content[0].text, /query is too long \(maximum 100/);
  });

  test('the length check reaches strings nested in arrays and objects', async () => {
    const response = await server.callTool('compare_character_builds', {
      build_options: [{ preferred_class: 'a'.repeat(101) }]
    });
    assert.equal(response.result?.isError, true);
    assert.match(response.result.content[0].text, /build_options\[0\]\.preferred_class is too long/);
  });

  test('an unknown tool returns an error instead of crashing the server', async () => {
    const response = await server.callTool('no_such_tool', {});
    const failed = Boolean(response.error) || Boolean(response.result?.isError);
    assert.ok(failed, 'unknown tool should be reported as an error');

    // The server must still be usable afterwards.
    const { result } = await server.listTools();
    assert.ok(result.tools.length > 0);
  });
});
