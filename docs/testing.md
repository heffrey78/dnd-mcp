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
| `query-routing.test.js` | Which filter parameter each endpoint receives, and local filtering for the endpoints that ignore filters |
| `client-behaviour.test.js` | Caching, HTTP error handling, parameter sanitisation, field mapping |
| `unified-search.test.js` | Option validation, limits, ranking, graceful degradation when one content type fails |
| `encounter-math.test.js` | DMG XP thresholds and group multipliers |
| `tool-validation.test.js` | Tool input rejection, end to end over JSON-RPC |
| `mcp-protocol.test.js` | Handshake, tool advertisement, and that stdout carries only JSON-RPC |

## Integration suite

These hit the network and are expected to be run deliberately.

`open5e-contract.test.js` pins the upstream assumptions the client depends on --
that `name__icontains` filters where we rely on it, that `search=` is full-text,
that `/v2/armor/`, `/v2/weapons/` and `/v2/conditions/` ignore filters, and that
`/v2/races/` is gone. **A failure here is a signal, not flake**: Open5e has
changed, and the routing in `src/open5e-client.ts` needs revisiting. Each
assertion says what to do if it fails.

`mcp-live.test.js` drives the real server over stdio against the real API and
checks that searches return only matching rows.

## Writing new tests

- Anything that can be tested with a mocked `fetch` belongs in `test/unit/`.
- Make failures discriminating. A test that passes under both the correct and
  the incorrect implementation is not testing anything -- the multiplier cases
  in `encounter-math.test.js` are deliberately built so a wrong value changes
  the reported difficulty band.
- Game rules taken from a book should cite it and be pinned to the published
  numbers, not to whatever the code currently produces.
