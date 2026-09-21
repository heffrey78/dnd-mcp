// Live tests against api.open5e.com. These encode the upstream assumptions the
// client's per-endpoint query routing depends on. When one fails, Open5e has
// changed its filtering and the routing in open5e-client.ts needs revisiting --
// that is the point of these tests, so treat a failure as a signal, not flake.
//
// Run with: npm run test:integration

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://api.open5e.com';

async function get(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'DND-MCP-Server/tests' }
  });
  assert.ok(response.ok, `${path} returned ${response.status}`);
  return response.json();
}

const names = body => (body.results || []).map(r => r.name);

describe('Open5e filter contract', () => {
  test('name__icontains filters v2 species by name', async () => {
    const body = await get('/v2/species/?name__icontains=elf');

    assert.ok(body.count > 0);
    assert.ok(names(body).every(n => n.toLowerCase().includes('elf')));
  });

  test('name__icontains filters v2 backgrounds and feats by name', async () => {
    for (const [path, needle] of [
      ['/v2/backgrounds/?name__icontains=soldier', 'soldier'],
      ['/v2/feats/?name__icontains=alert', 'alert']
    ]) {
      const body = await get(path);
      assert.ok(body.count > 0, `${path} returned nothing`);
      assert.ok(names(body).every(n => n.toLowerCase().includes(needle)), path);
    }
  });

  test('v2 armor, weapons and conditions ignore name filters entirely', async () => {
    // These endpoints justify the client-side filtering fallback.
    for (const collection of ['armor', 'weapons', 'conditions']) {
      const all = await get(`/v2/${collection}/`);
      const filtered = await get(`/v2/${collection}/?name__icontains=zzzznomatch`);

      assert.equal(
        filtered.count, all.count,
        `/v2/${collection}/ now honours name__icontains -- the local filter ` +
        'fallback for it can be removed'
      );
    }
  });

  test('/v2/races/ is gone and /v2/species/ replaces it', async () => {
    const races = await fetch(`${BASE}/v2/races/`);
    assert.equal(races.status, 404);

    const species = await get('/v2/species/');
    assert.ok(species.count > 0);
  });

  test('species rows carry key, traits and subspecies fields', async () => {
    const body = await get('/v2/species/?name__icontains=elf&limit=1');
    const row = body.results[0];

    assert.equal(typeof row.key, 'string');
    assert.ok(Array.isArray(row.traits));
    assert.ok('is_subspecies' in row, 'field renamed from is_subrace');
    assert.ok('subspecies_of' in row, 'field renamed from subrace_of');
  });
});
