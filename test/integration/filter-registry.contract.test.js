// Checks src/open5e-endpoints.ts against the live API. Open5e ignores filters
// it does not support and returns the whole collection, so for every filter
// the client sends upstream this asserts that it really narrows results, and
// that a bogus value fails or matches nothing instead of matching everything.
//
// Adding a server filter to the registry without a probe here fails the
// "every server filter has a probe" test, so the two cannot drift apart.
//
// Run with: npm run test:integration

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { ENDPOINTS } from '../../dist/open5e-endpoints.js';

const BASE = 'https://api.open5e.com';

/** Returns { status, count } for a query; count is null on an error status. */
async function countOf(path, params = {}) {
  const url = new URL(path, BASE);
  url.searchParams.set('limit', '1');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'DND-MCP-Server/tests' }
  });
  if (!response.ok) return { status: response.status, count: null };
  return { status: response.status, count: (await response.json()).count };
}

// A value that should narrow results and, where one exists, a value that
// should match nothing. Keyed `${endpoint}.${filter}`.
const PROBES = {
  'spells.name': { valid: 'fireball', invalid: 'zzzznomatch' },
  'spells.documents': { valid: ['srd-2014'], invalid: ['bogus'] },
  'spells.level': { valid: 3, invalid: 99 },
  'spells.maxLevel': { valid: 1 },
  'spells.school': { valid: 'evocation', invalid: 'bogus' },
  'spells.classKey': { valid: 'srd_bard', invalid: 'bogus' },

  'creatures.name': { valid: 'goblin', invalid: 'zzzznomatch' },
  'creatures.documents': { valid: ['srd-2014'], invalid: ['bogus'] },
  'creatures.cr': { valid: 0.25, invalid: 31 },
  'creatures.minCr': { valid: 20, invalid: 31 },
  'creatures.maxCr': { valid: 1 },
  'creatures.type': { valid: 'dragon', invalid: 'bogus' },

  'magicitems.name': { valid: 'holding', invalid: 'zzzznomatch' },
  'magicitems.documents': { valid: ['srd-2014'], invalid: ['bogus'] },
  'magicitems.rarity': { valid: 'very-rare', invalid: 'bogus' },
  'magicitems.category': { valid: 'wondrous-item', invalid: 'bogus' },
  'magicitems.requiresAttunement': { valid: true },

  'rules.name': { valid: 'grappl', invalid: 'zzzznomatch' },
  'rules.documents': { valid: ['srd-2014'], invalid: ['bogus'] },

  'classes.documents': { valid: ['srd-2014'], invalid: ['bogus'] },
  'classes.isSubclass': { valid: false },
  'classes.subclassOf': { valid: 'srd_bard', invalid: 'bogus' },

  'species.name': { valid: 'elf', invalid: 'zzzznomatch' },
  'species.documents': { valid: ['srd-2014'], invalid: ['bogus'] },
  'species.subspeciesOf': { valid: ['srd_halfling'], invalid: ['bogus'] },

  'feats.name': { valid: 'alert', invalid: 'zzzznomatch' },
  'feats.documents': { valid: ['srd-2014'], invalid: ['bogus'] },

  'backgrounds.name': { valid: 'soldier', invalid: 'zzzznomatch' },
  'backgrounds.documents': { valid: ['srd-2014'], invalid: ['bogus'] },

  'conditions.documents': { valid: ['core'], invalid: ['bogus'] },

  'weapons.documents': { valid: ['srd-2014'], invalid: ['bogus'] },
  'weapons.finesse': { valid: true },

  'armor.documents': { valid: ['srd-2014'], invalid: ['bogus'] },
  'armor.acBase': { valid: 18 },
  'armor.stealthDisadvantage': { valid: true }
};

// Parameters the registry deliberately does NOT send, because the endpoint
// ignores them. If one starts working, its local fallback can become a server
// filter.
const IGNORED_UPSTREAM = [
  ['spells', { school: 'evocation' }],
  ['creatures', { type__key: 'dragon' }],
  ['creatures', { environments__key: 'forest' }],
  ['creatures', { environments: 'forest' }],
  ['magicitems', { category__key: 'wondrous-item' }],
  ['rules', { search: 'grapple' }],
  ['rules', { desc__icontains: 'grapple' }],
  ['classes', { name__icontains: 'bard' }],
  ['classes', { subclass_of__key: 'srd_bard' }],
  ['feats', { has_prerequisite: true }],
  ['weapons', { is_martial: true }],
  ['weapons', { name__icontains: 'zzzznomatch' }],
  ['armor', { category: 'heavy' }],
  ['armor', { name__icontains: 'zzzznomatch' }],
  ['conditions', { name__icontains: 'zzzznomatch' }]
];

const serverFilters = Object.entries(ENDPOINTS).flatMap(([endpoint, spec]) =>
  Object.entries(spec.filters)
    .filter(([, rule]) => typeof rule.server === 'string')
    .map(([filter, rule]) => ({ endpoint, filter, param: rule.server, path: spec.path })));

describe('filter registry contract', () => {
  const totals = {};

  before(async () => {
    for (const [endpoint, spec] of Object.entries(ENDPOINTS)) {
      totals[endpoint] = (await countOf(spec.path)).count;
    }
  });

  test('every server filter has a probe', () => {
    const missing = serverFilters
      .map(({ endpoint, filter }) => `${endpoint}.${filter}`)
      .filter(id => !(id in PROBES));
    assert.deepEqual(missing, [], 'add a PROBES entry for each new server filter');
  });

  for (const { endpoint, filter, param, path } of serverFilters) {
    const probe = PROBES[`${endpoint}.${filter}`];
    if (!probe) continue;

    test(`${endpoint}.${filter} (${param}) narrows results`, async () => {
      const { status, count } = await countOf(path, { [param]: probe.valid });
      assert.equal(status, 200);
      assert.ok(count > 0, `${param}=${probe.valid} matched nothing`);
      assert.ok(count < totals[endpoint],
        `${param}=${probe.valid} returned the whole collection (${count}); Open5e is ignoring it`);
    });

    if (probe.invalid !== undefined) {
      test(`${endpoint}.${filter} with a bogus value does not match everything`, async () => {
        const { status, count } = await countOf(path, { [param]: probe.invalid });
        assert.ok(status === 400 || count === 0,
          `${param}=${probe.invalid} gave status ${status}, count ${count}`);
      });
    }
  }

  for (const [endpoint, params] of IGNORED_UPSTREAM) {
    const label = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');

    test(`${endpoint} still ignores ${label}`, async () => {
      const { count } = await countOf(ENDPOINTS[endpoint].path, params);
      assert.equal(count, totals[endpoint],
        `${ENDPOINTS[endpoint].path}?${label} now filters; its local fallback can move upstream`);
    });
  }
});
