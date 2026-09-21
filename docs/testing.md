# Testing

The suites are split by whether they touch the network.

```
test/
  unit/          fetch is mocked; offline, ~250ms
  integration/   real Open5e API and a real server process
  helpers/       shared fixtures
```

```bash
npm test                  # unit only (runs tsc first)
npm run test:integration  # live API
npm run test:all          # both
```

Tests import from `dist/`, so `npm test` builds first via `pretest`.

## Unit suite

`test/helpers/mock-fetch.js` swaps out global `fetch` and records every URL the
client builds, which is what makes query-string construction testable.

| File | Covers |
|------|--------|
| `query-layer.test.js` | The filter registry: undeclared filters refused, local filters never sent, sparse scans, lookup-validated values, source labels and scope |
| `query-routing.test.js` | Which parameter each search sends, and local matching for endpoints that ignore filters |
| `sources.test.js` | Scope resolution and the ranking of same-named rows across sourcebooks |
| `client-behaviour.test.js` | Caching, HTTP errors, parameter sanitisation, field mapping, spells by class |
| `classes.test.js` | 2014 and 2024 class shapes: proficiencies, features by level, table columns, subclasses |
| `class-rules.test.js` | Key abilities, caster types and spell slots against the SRD tables |
| `monsters.test.js` | Creature stat blocks, CR filters, sparse scans, encounter sampling, XP by CR |
| `species.test.js` | Reading species prose, and resolving a subspecies against its parent and origin |
| `build-rules.test.js` | Standard array, increases, ASI planning, feat prerequisites, spell roles |
| `character-build.test.js` | The build engine end to end on a mocked SRD catalogue |
| `unified-search.test.js` | Option validation, limits, ranking, graceful degradation, scope |
| `encounter-math.test.js` | DMG XP thresholds and group multipliers |
| `tool-validation.test.js` | Tool input rejection, end to end over JSON-RPC |
| `mcp-protocol.test.js` | Handshake, tool advertisement, scope arguments, and that stdout carries only JSON-RPC |

`test/helpers/mock-fetch.js` also provides `withLookups()` (answers the lookup
collections that enum filters are validated against) and `callsTo()` (the
requests made to one path, so a test can skip past lookup and document
fetches).

## Integration suite

These hit the network and are expected to be run deliberately.

`filter-registry.contract.test.js` walks `src/open5e-endpoints.ts`. Every
server filter must narrow live results, and a bogus value must fail or match
nothing. Each lookup endpoint must list the probe values, and every parameter
the registry avoids must still be ignored. A server filter without a probe
fails the suite, so the registry and its checks can't drift apart.

`open5e-contract.test.js` pins the v2 row shapes the transforms read, plus the
known data gaps (such as the 2014 Paladin having no spells).

**A failure in either is a signal, not flake**: Open5e has changed. Each
assertion says what to revisit.

`mcp-live.test.js` drives the real server over stdio against the real API:
searches return only matching rows, scopes hold, and builds stay in scope with
real numbers.

## Writing new tests

- Anything that can be tested with a mocked `fetch` belongs in `test/unit/`.
- Make failures discriminating. A test that passes under both the correct and
  the incorrect implementation is not testing anything -- the multiplier cases
  in `encounter-math.test.js` are deliberately built so a wrong value changes
  the reported difficulty band.
- Game rules taken from a book should cite it and be pinned to the published
  numbers, not to whatever the code currently produces.
