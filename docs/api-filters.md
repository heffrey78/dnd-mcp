# Open5e API Filter Parameters Reference

> **Verified 2026-09-20.** Open5e's filtering is uneven across v1 and v2, and an
> unsupported filter is *ignored* rather than rejected -- an unfiltered
> collection comes back looking like a page of matches. The table below records
> which parameter actually works where; `src/open5e-client.ts` routes queries
> accordingly, and `test/integration/open5e-contract.test.js` fails if any of
> this stops being true.

## Name lookup: which parameter to use

| Endpoint | `name__icontains` | `search` | Client strategy |
|----------|-------------------|----------|-----------------|
| `/v1/spells/` | works | full-text, matches descriptions | `name__icontains` |
| `/v1/monsters/` | works | full-text | `name__icontains` |
| `/v1/magicitems/` | works | full-text | `name__icontains` |
| `/v1/spelllist/` | works | full-text | `name__icontains` |
| `/v1/sections/` | works | full-text | `search` (rules prose; full-text is wanted) |
| `/v2/species/` | works | **ignored** | `name__icontains` |
| `/v2/backgrounds/` | works | **ignored** | `name__icontains` |
| `/v2/feats/` | works | **ignored** | `name__icontains` |
| `/v2/armor/` | **ignored** | **ignored** | fetch all, filter locally |
| `/v2/weapons/` | **ignored** | **ignored** | fetch all, filter locally |
| `/v2/conditions/` | **ignored** | **ignored** | fetch all, filter locally |

Notes:

- **`search=` is not a name filter.** On v1 it matches description text, so
  `/v1/spells/?search=fireball` returns *Antimagic Field*. On v2 it is ignored
  entirely and the full collection comes back.
- **`/v2/races/` no longer exists** -- it is now `/v2/species/`, and the fields
  `is_subrace` / `subrace_of` were renamed to `is_subspecies` / `subspecies_of`.
  Species rows carry `key` rather than a `url`.
- **Subspecies by parent: use `subspecies_of__key__in`.** A bare
  `subspecies_of=srd_halfling` is ignored and returns every species;
  `subspecies_of__key` and `subspecies_of__key__in` (comma-separated) filter
  correctly and return nothing for an unknown key. `searchRaces` uses this to
  include subspecies such as *Lightfoot* whose names omit the parent.
- The three local-filter collections are small (25 armor, 75 weapons, 21
  conditions), so fetching them whole is cheap.
- Results contain **duplicates across sourcebooks** -- two "Fireball" rows, two
  "Soldier" backgrounds. Deduplication is left to the caller.

---

## Original reference

The material below was written on 2025-06-27 and is kept for its per-endpoint
parameter detail. Treat the `search` guidance in it as superseded by the table
above.


**Date**: 2025-06-27  
**Source**: Testing of Open5e API endpoints  

---

## Common Parameters (All Endpoints)

### Pagination Parameters
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `limit` | Integer | Number of results per page (max 100) | `?limit=50` |
| `offset` | Integer | Skip N results (offset-based pagination) | `?offset=20` |
| `page` | Integer | Page number (page-based pagination) | `?page=3` |

### Search Parameters
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `search` | String | Full-text search across content | `?search=dragon` |

### Sorting Parameters
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `ordering` | String | Sort field (use `-` prefix for descending) | `?ordering=-level` |

---

## Spells Endpoint (`/v2/spells/`)

### Spell-Specific Filters
| Parameter | Type | Values | Description | Example |
|-----------|------|---------|-------------|---------|
| `level` | Integer | 0-9 | Filter by spell level (0=cantrip) | `?level=3` |
| `school` | String | School name | Filter by magic school | `?school=evocation` |

### Available Spell Schools
- `abjuration` - Protection and warding magic
- `conjuration` - Summoning and creation
- `divination` - Information gathering
- `enchantment` - Mind-affecting magic
- `evocation` - Energy and force magic
- `illusion` - Deception and trickery
- `necromancy` - Death and undeath magic
- `transmutation` - Transformation magic

### Sorting Options for Spells
| Field | Description | Example |
|-------|-------------|---------|
| `name` | Alphabetical by spell name | `?ordering=name` |
| `level` | By spell level | `?ordering=level` |
| `-level` | By spell level (high to low) | `?ordering=-level` |

---

## Monsters Endpoint (`/v1/monsters/`)

### Monster-Specific Filters
| Parameter | Type | Values | Description | Example |
|-----------|------|---------|-------------|---------|
| `cr` | Number | 0-30 | Filter by Challenge Rating | `?cr=3` |
| `document__slug` | String | Document ID | Filter by source document | `?document__slug=tob` |

### Available Document Sources
- `srd` - System Reference Document
- `tob` - Tome of Beasts
- `cc` - Creature Codex
- `tob2` - Tome of Beasts 2
- `menagerie` - Kobold Press sources

### Sorting Options for Monsters
| Field | Description | Example |
|-------|-------------|---------|
| `name` | Alphabetical by monster name | `?ordering=name` |
| `challenge_rating` | By Challenge Rating | `?ordering=challenge_rating` |
| `-challenge_rating` | By CR (high to low) | `?ordering=-challenge_rating` |

---

## Races Endpoint (`/v2/races/`)

### Race-Specific Filters
| Parameter | Type | Values | Description | Example |
|-----------|------|---------|-------------|---------|
| `is_subrace` | Boolean | true/false | Filter for subraces only | `?is_subrace=true` |

### Sorting Options for Races
| Field | Description | Example |
|-------|-------------|---------|
| `name` | Alphabetical by race name | `?ordering=name` |

---

## Classes Endpoint (`/v1/classes/`)

### Sorting Options for Classes
| Field | Description | Example |
|-------|-------------|---------|
| `name` | Alphabetical by class name | `?ordering=name` |

---

## Weapons Endpoint (`/v2/weapons/`)

### Weapon-Specific Filters
| Parameter | Type | Values | Description | Example |
|-----------|------|---------|-------------|---------|
| `is_martial` | Boolean | true/false | Filter for martial weapons | `?is_martial=true` |
| `is_melee` | Boolean | true/false | Filter for melee weapons | `?is_melee=true` |
| `is_ranged` | Boolean | true/false | Filter for ranged weapons | `?is_ranged=true` |
| `is_finesse` | Boolean | true/false | Filter for finesse weapons | `?is_finesse=true` |
| `is_light` | Boolean | true/false | Filter for light weapons | `?is_light=true` |
| `is_heavy` | Boolean | true/false | Filter for heavy weapons | `?is_heavy=true` |
| `is_two_handed` | Boolean | true/false | Filter for two-handed weapons | `?is_two_handed=true` |
| `is_versatile` | Boolean | true/false | Filter for versatile weapons | `?is_versatile=true` |

### Sorting Options for Weapons
| Field | Description | Example |
|-------|-------------|---------|
| `name` | Alphabetical by weapon name | `?ordering=name` |

---

## Armor Endpoint (`/v2/armor/`)

### Armor-Specific Filters
| Parameter | Type | Values | Description | Example |
|-----------|------|---------|-------------|---------|
| `category` | String | Category name | Filter by armor type | `?category=heavy` |
| `grants_stealth_disadvantage` | Boolean | true/false | Filter by stealth penalty | `?grants_stealth_disadvantage=false` |

### Available Armor Categories
- `light` - Light armor
- `medium` - Medium armor  
- `heavy` - Heavy armor
- `shield` - Shields

### Sorting Options for Armor
| Field | Description | Example |
|-------|-------------|---------|
| `name` | Alphabetical by armor name | `?ordering=name` |
| `ac_base` | By armor class value | `?ordering=ac_base` |

---

## Magic Items Endpoint (`/v1/magicitems/`)

### Magic Item Filters
| Parameter | Type | Values | Description | Example |
|-----------|------|---------|-------------|---------|
| `rarity` | String | Rarity level | Filter by item rarity | `?rarity=rare` |
| `type` | String | Item type | Filter by item category | `?type=wondrous` |

### Available Rarities
- `common` - Common magic items
- `uncommon` - Uncommon magic items
- `rare` - Rare magic items
- `very_rare` - Very rare magic items
- `legendary` - Legendary magic items
- `artifact` - Artifact-level items

### Available Item Types
- `weapon` - Magic weapons
- `armor` - Magic armor
- `shield` - Magic shields
- `wondrous` - Wondrous items
- `potion` - Potions
- `scroll` - Scrolls
- `ring` - Magic rings
- `rod` - Magic rods
- `staff` - Magic staves
- `wand` - Magic wands

---

## Complex Query Examples

### Multi-Parameter Combinations
```
# Level 3 evocation spells, ordered by name
/v2/spells/?level=3&school=evocation&ordering=name

# CR 5+ dragons from Tome of Beasts
/v1/monsters/?cr__gte=5&search=dragon&document__slug=tob

# Martial finesse weapons
/v2/weapons/?is_martial=true&is_finesse=true

# Rare magic weapons
/v1/magicitems/?rarity=rare&type=weapon

# High elf subraces
/v2/races/?search=elf&is_subrace=true

# High-level spells with healing
/v2/spells/?search=heal&level__gte=7&ordering=-level
```

### Advanced Search Patterns
```
# Case-insensitive search
/v2/spells/?search=FIRE (works same as ?search=fire)

# Partial name matching
/v1/monsters/?search=dra (matches dragons, drakes, etc.)

# Deep pagination
/v1/monsters/?page=50&limit=5

# Large result sets
/v2/spells/?limit=100
```

---

## Query Parameter Validation

### Parameter Behavior
- **Case Insensitive**: Search terms work regardless of case
- **Partial Matching**: Search matches substrings in names and descriptions
- **Parameter Combining**: Multiple filters work together (AND logic)
- **Pagination Compatibility**: All filters work with pagination
- **Sort Stability**: Ordering is consistent across requests

### Error Handling
- Invalid parameter values return 400 Bad Request
- Non-existent fields are ignored
- Empty results return valid JSON with empty results array
- Invalid page numbers return appropriate pagination metadata

---

## Performance Notes

### Efficient Query Practices
1. **Use specific filters** instead of broad searches when possible
2. **Limit result sets** to reasonable sizes (10-50 items)
3. **Cache frequently used queries** to reduce API calls
4. **Use ordering** to get predictable results

### Query Performance by Complexity
- **Simple filters** (level, CR): ~200-500ms
- **Text search**: ~500-1000ms  
- **Complex combinations**: ~1000-2000ms
- **Large result sets**: Linear increase with limit

---

## Migration Notes for MCP Tools

### Current Implementation Mapping
| Current MCP Tool | Open5e Parameters | Improvement |
|------------------|-------------------|-------------|
| `search_spells` | `?search={query}` | Add level/school filters |
| `get_spell_by_level` | `?level={level}` | Already supported |
| `get_spells_by_class` | Custom logic needed | Requires class-spell mapping |
| `search_classes` | `?search={query}` | Full-text search available |
| `get_class_details` | `/{class_name}/` | Individual class lookup |
| `search_races` | `?search={query}` | Working (vs broken current) |
| `get_race_details` | `/{race_name}/` | Individual race lookup |

### New Capabilities Available
- **Monster search/filtering** (not in current implementation)
- **Equipment search/filtering** (not in current implementation)  
- **Magic item search/filtering** (not in current implementation)
- **Advanced spell filtering** (school, complex combinations)
- **Robust race functionality** (currently broken)

This comprehensive parameter reference enables full utilization of Open5e API capabilities for our MCP server migration.