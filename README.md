# D&D 5E MCP Server

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access
to D&D 5th Edition content from the [Open5e](https://open5e.com) API: spells,
monsters, classes, species, equipment, rules references, plus encounter-building
and character-build helpers. It uses Open5e's v2 API.

## Requirements

- Node.js 20 or newer (developed against Node 26)
- Network access to `api.open5e.com`

## Setup

```bash
npm install
npm run build
```

## Connecting a client

The server speaks JSON-RPC over stdio. Point your MCP client at the built entry
point:

```json
{
  "mcpServers": {
    "dnd-5e": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/dnd-mcp"
    }
  }
}
```

Set `cwd` to wherever you cloned this repository. A starting point is in
[`mcp.json`](mcp.json).

Verify it responds:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node dist/index.js
```

## Tools

Every tool except `get_api_stats` also takes two optional arguments that
restrict it to some sourcebooks:

- `ruleset`: `"5e-2014"`, `"5e-2024"` or `"a5e"`;
- `sources`: Open5e document keys, e.g. `["srd-2014", "toh"]`.

Without them, searches cover every source Open5e serves. Each result carries
a `source` label (document key, title and ruleset), and lookups by name
prefer the 2024 SRD, then the 2014 SRD. Character builds default to the 2024
SRD only (see [ADR-008](docs/adr/008-default-to-2024.md)); pass
`ruleset: "5e-2014"` or `sources: ["srd-2014"]` for the older rules. An
unknown ruleset or document is an error.

### Universal search

| Tool | Description | Required |
|------|-------------|----------|
| `unified_search` | Search across all D&D content types (spells, monsters, items, races, classes, etc.) with intelligent ranking and filtering | `query` |

### Spells

| Tool | Description | Required |
|------|-------------|----------|
| `search_spells` | Search spells by name, level, school or class list | - |
| `get_spell_details` | Get detailed information about a specific D&D 5E spell | `spell_name` |
| `get_spell_by_level` | Get all spells of a specific level | `level` |
| `get_spells_by_class` | Get the spells on a class's spell list, lowest level first; filter by `level` or `max_level` | `class_name` |

### Classes and species

| Tool | Description | Required |
|------|-------------|----------|
| `search_classes` | List D&D 5E base classes with their features and subclass names | - |
| `get_class_details` | Get a class: hit die, proficiencies, features by level, spell slots and subclasses with their features | `class_name` |
| `search_races` | Search species, including subspecies whose names omit the parent (Lightfoot for Halfling) | - |
| `get_race_details` | Get a species with what it inherits resolved: size, speed, combined ability increases, parent traits | `race_name` |

### Monsters

| Tool | Description | Required |
|------|-------------|----------|
| `search_monsters` | Search monsters by name, challenge rating, type or environment | - |
| `get_monsters_by_cr` | Get monsters by challenge rating | `challenge_rating` |
| `get_monsters_by_cr_range` | Get monsters within a challenge rating range, optionally by environment and type | `min_cr, max_cr` |

### Equipment and items

| Tool | Description | Required |
|------|-------------|----------|
| `search_weapons` | Search for D&D 5E weapons with property filtering | - |
| `search_magic_items` | Search magic items by name, rarity, category or attunement | - |
| `get_magic_item_details` | Get detailed information about a specific D&D 5E magic item | `item_name` |
| `search_armor` | Search for D&D 5E armor with filtering options | - |
| `get_armor_details` | Get detailed information about a specific D&D 5E armor | `armor_name` |

### Character options

| Tool | Description | Required |
|------|-------------|----------|
| `search_feats` | Search for D&D 5E feats with filtering options | - |
| `get_feat_details` | Get detailed information about a specific D&D 5E feat | `feat_name` |
| `search_backgrounds` | Search for D&D 5E character backgrounds with filtering options | - |
| `get_background_details` | Get detailed information about a specific D&D 5E background | `background_name` |

### Rules reference

| Tool | Description | Required |
|------|-------------|----------|
| `search_conditions` | Search for D&D 5E conditions and status effects | - |
| `get_condition_details` | Get a condition, with its wording for the requested ruleset | `condition_name` |
| `get_all_conditions` | Get all D&D 5E conditions for quick reference | - |
| `search_sections` | Search rules sections by name or text | - |
| `get_section_details` | Get a rules section by name or key | `section_name` |
| `get_all_sections` | List every rules section by name, key and chapter, without the text | - |

### DM tools

| Tool | Description | Required |
|------|-------------|----------|
| `build_encounter` | Build a balanced encounter for a party, sampling monsters from the whole CR range | `party_size, party_level, difficulty` |
| `calculate_encounter_difficulty` | Calculate the difficulty of a custom encounter with specific monsters | `party_size, party_level, monsters` |

### Player tools

| Tool | Description | Required |
|------|-------------|----------|
| `generate_character_build` | Generate a build: species, class and subclass, background, ability scores, hit points, spells, feats and a level-by-level plan | - |
| `compare_character_builds` | Generate and compare multiple character builds with different options | `build_options` |
| `get_build_recommendations` | Get character build recommendations based on party composition and campaign needs | `existing_party, campaign_type` |

### Diagnostics

| Tool | Description | Required |
|------|-------------|----------|
| `get_api_stats` | Get API performance and caching statistics | - |

## Development

```bash
npm run dev               # watch mode
npm run build             # compile to dist/
npm run lint              # eslint over src/
npm test                  # unit tests, no network (builds first)
npm run test:integration  # live Open5e API tests
npm run test:all          # both suites
```

Tests use Node's built-in test runner. `test/unit/` mocks `fetch`, so it runs
offline and fast; `test/integration/` exercises the real API and the real server
process. See [docs/testing.md](docs/testing.md).

## Known quirks

- **Duplicate names across books.** A search for `fireball` returns every
  sourcebook's Fireball, each labelled with its `source`. Detail lookups pick
  one (2024 SRD first); pass `ruleset` or `sources` to choose another.
- **Uneven upstream filtering.** Open5e ignores many filter parameters and
  returns the whole collection. The client sends only verified parameters and
  matches the rest locally; see [docs/api-filters.md](docs/api-filters.md).
- **Gaps in Open5e's data** are reported, not guessed. Examples: no 2014 SRD
  spell lists the Paladin, and some Tome of Heroes heritages have no source
  for their size. Look in a build's `warnings` or a species'
  `resolved.unresolved`.
- **Builds are opinionated.** Game rules (spell slots, hit points, ASIs) come
  from the SRD, but the scoring choices that pick a class, species or spell
  are judgment calls, collected in `src/character-build/heuristics.ts`.
  Multiclass builds are not supported; `allow_multiclass: true` is rejected.
- **`unified_search` count vs items.** For `classes` the reported `count` can
  exceed the number of returned items, because classes are listed whole and
  then ranked against the query.

## Documentation

- [docs/api-filters.md](docs/api-filters.md) - per-endpoint Open5e filter support
- [docs/testing.md](docs/testing.md) - how the suites are organised
- [docs/adr/](docs/adr/) - architecture decision records
- [docs/history/](docs/history/) - superseded point-in-time reports
- [CLAUDE.md](CLAUDE.md) - guidance for Claude Code

## Data source and licence

Content comes from the Open5e API, which serves material published under the
OGL and Creative Commons licences. This server is MIT licensed; the game
content it returns is governed by its own licences. Each item's `source`
names the document it comes from.
