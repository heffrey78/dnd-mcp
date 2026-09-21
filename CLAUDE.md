# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project overview

An MCP server exposing D&D 5E content from the **Open5e REST API**
(`https://api.open5e.com`). It advertises ~37 tools covering spells, monsters,
classes, species, equipment, rules sections, encounter building and character
builds.

An earlier version scraped `dnd5e.wikidot.com`. That approach is gone -- the
scraper module was removed and only the Open5e client remains. Documents in
`docs/history/` still describe the scraping era; they are kept as a record, not
as guidance.

## Layout

```
src/
  index.ts                  MCP server: tool schemas and request handlers
  open5e-client.ts          Open5e HTTP client, caching, D&D domain logic
  unified-search-engine.ts  Cross-content-type search, fuzzy matching, ranking
test/
  unit/                     No network; global fetch is mocked
  integration/              Hits the live Open5e API
  helpers/                  Fetch mock and a stdio JSON-RPC client
docs/
  api-filters.md            Which Open5e filter works on which endpoint
  adr/                      Architecture decision records
  history/                  Point-in-time reports; superseded
```

## Commands

```bash
npm run build             # tsc -> dist/
npm test                  # unit tests (builds first via pretest)
npm run test:integration  # live API tests; needs network
npm run test:all          # both
npm run lint              # eslint over src/
npm run dev               # tsx watch
```

## Things that will bite you

**stdout is the transport.** The server speaks JSON-RPC over stdio, so *any*
`console.log` in `src/` corrupts the stream and breaks the server for every
client. Use `console.error` for diagnostics. `test/unit/mcp-protocol.test.js`
asserts that every line on stdout parses as JSON-RPC; keep it passing.

**Open5e ignores filters it does not support.** It does not error -- it returns
the entire collection, which looks exactly like a page of results. A dropped or
misspelled filter therefore reads as "everything matched". Never let an invalid
value silently become "no filter"; reject it instead. See `docs/api-filters.md`
for the per-endpoint table and `applyNameQuery` / `filterByName` in
`open5e-client.ts` for the routing.

**`search=` is not a name search.** On v1 it matches description text; on v2 it
is ignored. Use `name__icontains` unless you actually want full-text (which
`/v1/sections/` does, since sections are rules prose).

**v1 and v2 are both in use.** Endpoints are mixed deliberately; the shapes
differ between versions, so check `docs/api-filters.md` before moving one.

## Conventions

- ES modules throughout (`"type": "module"`); imports of local files need the
  `.js` extension even from TypeScript.
- Tests use the built output in `dist/`, so `npm test` builds first.
- Game rules belong in code with a citation in a comment (e.g. the DMG
  encounter tables in `open5e-client.ts`), and should be covered by a unit test
  that would fail if the numbers drift.
- Respect Open5e: results are cached in-process, and tests that hit the network
  live in `test/integration/` so the default `npm test` stays offline.
