# D&D 5E MCP Server

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access
to D&D 5th Edition content from the [Open5e](https://open5e.com) API: spells,
monsters, classes, species, equipment, rules references, plus encounter-building
and character-build helpers.

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

### Universal search

| Tool | Description | Required |
|------|-------------|----------|
| `unified_search` | Search across all D&D content types (spells, monsters, items, races, classes, etc.) with intelligent ranking and filtering | `query` |

### Spells

| Tool | Description | Required |
|------|-------------|----------|
| `search_spells` | Search for D&D 5E spells with advanced filtering options | - |
| `get_spell_details` | Get detailed information about a specific D&D 5E spell | `spell_name` |
| `get_spell_by_level` | Get all spells of a specific level | `level` |
| `get_spells_by_class` | Get all spells available to a specific class | `class_name` |
| `search_spell_lists` | Search available D&D 5E spell lists by class | - |
| `get_spell_list_details` | Get detailed spell list information for a specific D&D 5E class | `class_name` |
| `get_all_spell_lists` | Get all available D&D 5E spell lists for quick reference | - |
| `get_spells_for_class` | Get detailed spell information for all spells available to a specific class | `class_name` |

### Classes and species

| Tool | Description | Required |
|------|-------------|----------|
| `search_classes` | Get all D&D 5E classes with comprehensive details | - |
| `get_class_details` | Get detailed information about a specific D&D 5E class | `class_name` |
| `search_races` | Search for D&D 5E races with detailed trait information | - |
| `get_race_details` | Get detailed information about a specific D&D 5E race | `race_name` |

### Monsters

| Tool | Description | Required |
|------|-------------|----------|
| `search_monsters` | Search for D&D 5E monsters with filtering options | - |
| `get_monsters_by_cr` | Get monsters by challenge rating | `challenge_rating` |
| `get_monsters_by_cr_range` | Get all monsters within a specific challenge rating range for encounter planning | `min_cr, max_cr` |

### Equipment and items

| Tool | Description | Required |
|------|-------------|----------|
| `search_weapons` | Search for D&D 5E weapons with property filtering | - |
| `search_magic_items` | Search for D&D 5E magic items with filtering options | - |
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
| `get_condition_details` | Get detailed information about a specific D&D 5E condition | `condition_name` |
| `get_all_conditions` | Get all D&D 5E conditions for quick reference | - |
| `search_sections` | Search D&D 5E rules sections for quick rule lookups | - |
| `get_section_details` | Get detailed information about a specific D&D 5E rules section | `section_name` |
| `get_all_sections` | Get all available D&D 5E rules sections for quick reference | - |

### DM tools

| Tool | Description | Required |
|------|-------------|----------|
| `build_encounter` | Build a balanced D&D 5E encounter using monsters by CR for specified party | `party_size, party_level, difficulty` |
| `calculate_encounter_difficulty` | Calculate the difficulty of a custom encounter with specific monsters | `party_size, party_level, monsters` |

### Player tools

| Tool | Description | Required |
|------|-------------|----------|
| `generate_character_build` | Generate an optimized character build combining race, class, background, and feats | - |
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

- **Duplicate results.** Open5e serves several sourcebooks, so a search for
  `fireball` returns more than one "Fireball" row. The server does not
  deduplicate.
- **Uneven upstream filtering.** Some Open5e endpoints ignore filter parameters
  and return the whole collection. The client works around this per endpoint;
  see [docs/api-filters.md](docs/api-filters.md).
- **`unified_search` count vs items.** For `classes` and `sections` the reported
  `count` can exceed the number of returned items, because those two are not
  filtered server-side before ranking.
- **Unimplemented build options.** `generate_character_build` accepts
  `allow_multiclass`, and `get_build_recommendations` accepts `missing_roles`,
  but neither yet affects the result.

## Documentation

- [docs/api-filters.md](docs/api-filters.md) - per-endpoint Open5e filter support
- [docs/testing.md](docs/testing.md) - how the suites are organised
- [docs/adr/](docs/adr/) - architecture decision records
- [docs/history/](docs/history/) - superseded point-in-time reports
- [CLAUDE.md](CLAUDE.md) - guidance for Claude Code

## Data source and licence

Content comes from the Open5e API, which serves material published under the
OGL and Creative Commons licences. This server is MIT licensed; the game
content it returns is governed by its own licences, exposed per item in the
`document` field.
