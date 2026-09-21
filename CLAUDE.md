# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project overview

An MCP server exposing D&D 5E content from the **Open5e v2 REST API**
(`https://api.open5e.com/v2/`). It advertises 33 tools covering spells,
monsters, classes, species, equipment, rules sections, encounter building and
character builds.

An earlier version scraped `dnd5e.wikidot.com`, and a later one mixed v1 and v2
endpoints. Both are gone. Documents in `docs/history/` describe those eras;
they are kept as a record, not as guidance.

## Layout

```
src/
  index.ts                  MCP server: tool schemas, argument validation, handlers
  open5e-client.ts          Open5e HTTP client: query(), caching, row transforms
  open5e-endpoints.ts       Filter registry: which filter works on which endpoint
  sources.ts                Source labels, { ruleset, sources } scopes, duplicate ranking
  species.ts                Reading species prose: ability increases, size, speed, origin
  class-rules.ts            SRD class rules Open5e lacks: key abilities, spell slots, ASIs
  unified-search-engine.ts  Cross-content-type search, fuzzy matching, ranking
  character-build/
    builder.ts              Build engine: picks, then works out the numbers
    abilities.ts            Standard array, increases, ASI planning (rules, cited)
    legacy.ts               2014 species and backgrounds in 2024 builds (2024 PHB)
    prerequisites.ts        Feat prerequisite checks
    heuristics.ts           Judgment calls: role fit, spell weights, staple spells
    types.ts                Build options and output
test/
  unit/                     No network; global fetch is mocked
  integration/              Hits the live Open5e API
  helpers/                  Fetch mock, lookup fixtures, stdio JSON-RPC client
docs/
  api-filters.md            Filter support per endpoint, and known data gaps
  adr/                      Architecture decision records (007 is the current design)
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

**Open5e ignores filters it does not support.** It does not error. It returns
the entire collection, which looks exactly like a page of results, so a
dropped or misspelt filter reads as "everything matched". Many plausible v2
parameters are ignored this way (`school=`, `cr=`, `is_martial=`,
`has_prerequisite=`, `category=` on armor). So:

- Read the collection only through `Open5eClient.query()`, and declare every
  filter in `src/open5e-endpoints.ts`, either as a verified `server`
  parameter or as a `local` predicate. `query()` refuses anything else.
- A new server filter needs a probe in
  `test/integration/filter-registry.contract.test.js` (the suite fails
  without one). Verify it live before adding it: a valid value must narrow
  the count, and a bogus value must return 400 or 0.
- Never let an invalid value silently become "no filter"; reject it. Filters
  with a fixed set of values name a lookup endpoint (`values:`), so bad values
  are rejected with the valid list.

**`search=` is ignored on every v2 endpoint.** Use `name__icontains`. Rules
text (`/v2/rules/`) has no working server-side text filter, so it is matched
locally.

**Results span 24 sourcebooks.** Label every result with `source`
(`sourceOf`). Pick among same-named rows with `pickByName`, not "the first
row". Scope with `{ ruleset, sources }` via `scopeDocuments()`, which
resolves to `document__key__in` (the one scope filter that works
everywhere). Conditions are the exception; see `searchConditions`.

**Open5e data has gaps.** Report them, don't guess. Known ones are listed in
`docs/api-filters.md`: wrong 2014 spell-slot columns, empty
`primary_abilities`, no Paladin on 2014 spells, and species whose size
"is determined by your Heritage Subrace". Unresolvable values are `null`,
with the reason in `warnings` / `resolved.unresolved`.

## Conventions

- ES modules throughout (`"type": "module"`); imports of local files need the
  `.js` extension even from TypeScript.
- Tests use the built output in `dist/`, so `npm test` builds first.
- Game rules belong in code with a citation in a comment, covered by a unit
  test that would fail if the numbers drift. Examples: the DMG encounter
  tables in `open5e-client.ts`, and `class-rules.ts`.
- Opinions are not rules. Scoring judgments go in
  `character-build/heuristics.ts`, not beside the cited rules.
- Respect Open5e: results are cached in-process, and tests that hit the
  network live in `test/integration/` so the default `npm test` stays offline.
  Large collections are scanned with sparse `fields=` rather than fetched
  whole.
