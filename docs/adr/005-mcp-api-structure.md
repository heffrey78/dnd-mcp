# ADR-005: MCP API Structure and Tool Design

## Status
Accepted. Still current, and extended since with `unified_search` and the DM/player helper tools.

## Context
The MCP server needs to expose D&D 5e content through a well-structured set of tools that follow MCP protocol conventions. Based on the guide analysis, the API should provide comprehensive access to spells, races, classes, equipment, and other game content while maintaining usability and performance.

## Decision
Design a hierarchical MCP tool structure that mirrors D&D 5e content organization and supports both browsing and searching workflows.

### Core Tool Categories

#### 1. Spell Tools (Highest Priority)
```typescript
// Primary spell tools
search_spells(query?: string, class?: string, level?: number, school?: string)
get_spell_details(spell_name: string)
get_spell_by_level(level: number)
get_spells_by_class(class_name: string)
get_spells_by_school(school: string)
```

#### 2. Character Race/Lineage Tools  
```typescript
search_races(query?: string, category?: string)
get_race_details(race_name: string)
get_race_list(category?: string)
```

#### 3. Class and Character Building Tools
```typescript
search_classes()
get_class_details(class_name: string)
get_subclass_list(class_name: string)
get_class_features(class_name: string, feature_type?: string)
search_backgrounds(query?: string)
get_background_details(background_name: string)
search_feats(query?: string, category?: string)
get_feat_details(feat_name: string)
```

#### 4. Equipment and Item Tools
```typescript
get_weapon_list(category?: string)
get_armor_list(type?: string)
get_magic_items(rarity?: string, type?: string)
get_adventuring_gear()
search_equipment(query: string, type?: string)
```

#### 5. Search and Utility Tools
```typescript
search_content(query: string, content_type?: string)
validate_character_build(character_data: object)
get_random_content(content_type: string, filters?: object)
```

### Tool Response Structure
Standardized response format across all tools:

```typescript
interface ToolResponse<T> {
  success: boolean;
  data: T;
  metadata: {
    source: string;
    quality: QualityInfo;
    cached: boolean;
    timestamp: string;
  };
  pagination?: {
    total: number;
    page: number;
    per_page: number;
    has_more: boolean;
  };
  error?: string;
}

interface QualityInfo {
  source: 'Official' | 'Unearthed Arcana' | 'Homebrew' | 'Unknown';
  verified: boolean;
  book_references: string[];
  confidence: number; // 1-5 scale
}
```

### Parameter Conventions
- **Optional Parameters**: Most search parameters optional for broad discovery
- **Fuzzy Matching**: Support approximate name matching for spells/items
- **Case Insensitive**: All string parameters case-insensitive
- **Pagination**: Large result sets paginated (default 50 items)
- **Filtering**: Multiple filter parameters combinable with AND logic

### Tool Naming Conventions
- `search_*`: Return lists with basic info, support search queries
- `get_*_details`: Return complete information for specific items  
- `get_*_list`: Return structured lists, often categorized
- `get_*_by_*`: Filter lists by specific criteria

### Error Handling Strategy
```typescript
// Standard error responses
{
  success: false,
  error: "Spell 'nonexistent' not found",
  suggestions: ["fireball", "firebolt", "fire shield"], // fuzzy matches
  metadata: {
    timestamp: "2024-01-01T12:00:00Z",
    cached: false
  }
}
```

## Content Organization Priorities

### Phase 1 (MVP)
1. **Spells** - Core functionality, highest user demand
2. **Classes** - Essential for character building
3. **Races/Lineages** - Character creation foundation

### Phase 2 (Enhanced)
4. **Equipment** - Weapons, armor, magic items
5. **Backgrounds & Feats** - Character customization
6. **Search & Utility** - Cross-content search

### Phase 3 (Advanced)
7. **Monsters** - DM tools
8. **Magic Items** - Extended equipment
9. **Rules Reference** - Game mechanics

## Implementation Details

### Tool Registration
```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_spells",
      description: "Search for D&D 5e spells by name, class, level, or school",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term for spell name" },
          class: { type: "string", description: "Filter by spellcasting class" },
          level: { type: "number", minimum: 0, maximum: 9 },
          school: { type: "string", description: "School of magic" }
        }
      }
    },
    // ... other tools
  ]
}));
```

### Response Optimization
- **Truncated Lists**: Include summary info, link to detail endpoints
- **Smart Caching**: Cache by parameter combinations
- **Batch Operations**: Support multiple item requests where logical
- **Compressed Responses**: Minimize response size for large datasets

## Alternatives Considered
1. **Single Unified Search Tool**: Less discoverable, complex parameter handling
2. **REST-like URL Structure**: Doesn't fit MCP tool paradigm
3. **Flat Tool Structure**: Poor organization, harder navigation
4. **Database-style Query Language**: Too complex for typical users

## Consequences

### Positive
- Intuitive tool discovery following D&D content structure
- Flexible searching and filtering capabilities
- Consistent response formats aid client development
- Quality metadata supports informed decision-making
- Pagination prevents overwhelming responses

### Negative
- Large number of tools may be overwhelming initially
- Parameter complexity for advanced filtering
- Maintenance overhead for comprehensive API surface
- Potential for tool proliferation as content expands

### Performance Considerations
- Tool registration overhead minimal
- Response caching critical for performance
- Parameter validation adds latency
- Large content sets require pagination

## Future Enhancements
- **GraphQL-style Field Selection**: Allow clients to specify return fields
- **Bulk Operations**: Multi-item requests for efficiency  
- **Webhooks**: Content change notifications
- **API Versioning**: Support for backward compatibility
- **Rate Limiting**: Per-client rate limiting for public deployments

## Usage Examples
```typescript
// Find all fire spells for wizards
await client.callTool("search_spells", {
  query: "fire",
  class: "wizard"
});

// Get complete spell details
await client.callTool("get_spell_details", {
  spell_name: "fireball"
});

// Browse all races
await client.callTool("search_races", {});
```