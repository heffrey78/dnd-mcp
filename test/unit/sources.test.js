// Source labelling, scope resolution and the ranking used by every detail
// lookup. Pure functions; no network.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentKeyOf, sourceOf, resolveScope, pickByName, sourceRank
} from '../../dist/sources.js';

const known = [
  { key: 'srd-2014', name: '5e 2014 Rules', ruleset: '5e-2014' },
  { key: 'core', name: '5e Core', ruleset: '5e-2014' },
  { key: 'toh', name: 'Tome of Heroes', ruleset: '5e-2014' },
  { key: 'srd-2024', name: '5e 2024 Rules', ruleset: '5e-2024' },
  { key: 'a5e-ag', name: "Adventurer's Guide", ruleset: 'a5e' }
];

describe('source labels', () => {
  test('an embedded document object gives key, title and ruleset', () => {
    const row = { document: { key: 'srd-2014', display_name: '5e 2014 Rules', gamesystem: { key: '5e-2014' } } };
    assert.deepEqual(sourceOf(row), { key: 'srd-2014', name: '5e 2014 Rules', ruleset: '5e-2014' });
  });

  test('a bare document key is looked up in the index', () => {
    const index = new Map(known.map(doc => [doc.key, doc]));
    assert.deepEqual(sourceOf({ document: 'toh' }, index), known[2]);
  });

  test('an unknown bare key still yields a label rather than throwing', () => {
    assert.deepEqual(sourceOf({ document: 'mystery' }), { key: 'mystery', name: 'mystery', ruleset: null });
  });

  test('documentKeyOf reads both shapes', () => {
    assert.equal(documentKeyOf({ document: 'srd-2014' }), 'srd-2014');
    assert.equal(documentKeyOf({ document: { key: 'toh' } }), 'toh');
    assert.equal(documentKeyOf({}), '');
  });
});

describe('scope resolution', () => {
  test('no scope means no restriction', () => {
    assert.equal(resolveScope(undefined, known), undefined);
    assert.equal(resolveScope({}, known), undefined);
  });

  test('a ruleset selects every document of that game system', () => {
    assert.deepEqual(resolveScope({ ruleset: '5e-2014' }, known), ['srd-2014', 'core', 'toh']);
  });

  test('sources select documents directly', () => {
    assert.deepEqual(resolveScope({ sources: ['toh', 'a5e-ag'] }, known), ['toh', 'a5e-ag']);
  });

  test('ruleset and sources together must both hold', () => {
    assert.deepEqual(resolveScope({ ruleset: '5e-2014', sources: ['toh', 'a5e-ag'] }, known), ['toh']);
  });

  test('an unknown ruleset is rejected, not widened to everything', () => {
    assert.throws(() => resolveScope({ ruleset: '5e-2099' }, known), /Unknown ruleset "5e-2099".*5e-2014/);
  });

  test('an unknown source is rejected and the known ones are listed', () => {
    assert.throws(() => resolveScope({ sources: ['srd-2014', 'nope'] }, known),
      /Unknown source document\(s\): nope.*srd-2014/);
  });

  test('an empty source list is rejected', () => {
    assert.throws(() => resolveScope({ sources: [] }, known), /at least one/);
  });

  test('a ruleset and sources with nothing in common are rejected', () => {
    assert.throws(() => resolveScope({ ruleset: 'a5e', sources: ['srd-2014'] }, known), /No document matches/);
  });
});

describe('pickByName', () => {
  const opts = { nameOf: r => r.name, sourceKeyOf: r => r.source };
  const rows = [
    { name: 'Delayed Blast Fireball', source: 'srd-2014' },
    { name: 'Fireball', source: 'a5e-ag' },
    { name: 'Fireball', source: 'srd-2024' },
    { name: 'Fireball', source: 'srd-2014' }
  ];

  test('an exact name from the 2014 SRD wins over other books', () => {
    assert.deepEqual(pickByName(rows, 'fireball', opts), rows[3]);
  });

  test('without an SRD copy, the 2024 SRD beats third-party books', () => {
    assert.deepEqual(pickByName(rows.slice(0, 3), 'Fireball', opts), rows[2]);
  });

  test('an exact name beats a longer one from a preferred source', () => {
    const picked = pickByName([rows[0], rows[1]], 'fireball', opts);
    assert.equal(picked.name, 'Fireball');
  });

  test('extra rank keys apply before source priority', () => {
    const species = [
      { name: 'Halfling', source: 'srd-2014', sub: true },
      { name: 'Halfling', source: 'toh', sub: false }
    ];
    const picked = pickByName(species, 'halfling', { ...opts, extraRank: r => [r.sub ? 1 : 0] });
    assert.equal(picked.source, 'toh');
  });

  test('rows whose names do not contain the needle are never picked', () => {
    assert.equal(pickByName([{ name: 'Magic Missile', source: 'srd-2014' }], 'fireball', opts), null);
  });

  test('a blank needle picks nothing', () => {
    assert.equal(pickByName(rows, '  ', opts), null);
  });

  test('unlisted sources rank after every listed one', () => {
    assert.ok(sourceRank('toh') > sourceRank('srd-2024'));
    assert.ok(sourceRank('srd-2014') < sourceRank('core'));
  });
});
