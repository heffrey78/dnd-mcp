# Field Mapping Analysis: Current Implementation vs Open5e API
## Complete Data Structure Comparison and Migration Mapping

**Date**: 2025-06-27  
**Purpose**: Field-by-field mapping for migration from web scraping to Open5e API

---

## Spell Data Mapping

### Current SpellData Interface (10 fields)
```typescript
interface SpellData {
  name: string;           // Basic spell name
  level: number;          // Spell level (0-9)
  school: string;         // Magic school
  castingTime: string;    // Casting time text
  range: string;          // Range text
  components: string;     // Components text
  duration: string;       // Duration text
  description: string;    // Spell description
  classes: string[];      // Available classes
  url: string;           // Source URL
}
```

### Open5e API Spell Fields (30+ fields)
```typescript
interface Open5eSpellData {
  // Basic Information (matches current)
  name: string;                    // ✅ Direct mapping
  level: number;                   // ✅ Direct mapping
  school: string;                  // ✅ Direct mapping
  desc: string;                    // ✅ Maps to description
  
  // Enhanced Basic Fields
  casting_time: string;            // ✅ Maps to castingTime
  range_text: string;              // ✅ Maps to range
  range: number;                   // 🆕 Numeric range value
  range_unit: string;              // 🆕 Range unit (feet, etc.)
  duration: string;                // ✅ Direct mapping
  
  // Component Details (enhanced from current)
  verbal: boolean;                 // 🆕 V component flag
  somatic: boolean;                // 🆕 S component flag
  material: boolean;               // 🆕 M component flag
  material_specified: string;      // 🆕 Specific material
  material_cost: number;           // 🆕 Material cost in gp
  material_consumed: boolean;      // 🆕 Material consumed flag
  
  // Advanced Spell Mechanics (new)
  ritual: boolean;                 // 🆕 Ritual casting
  concentration: boolean;          // 🆕 Concentration required
  higher_level: string;            // 🆕 Scaling information
  casting_options: array;          // 🆕 Multi-level casting
  
  // Combat Mechanics (new)
  attack_roll: boolean;            // 🆕 Requires attack roll
  damage_roll: string;             // 🆕 Damage dice
  damage_types: array;             // 🆕 Damage type list
  saving_throw_ability: string;   // 🆕 Save type (Dex, Con, etc.)
  
  // Targeting (new)
  target_type: string;             // 🆕 Target specification
  target_count: number;            // 🆕 Number of targets
  shape_type: string;              // 🆕 Area shape (cone, sphere)
  shape_size: number;              // 🆕 Area size
  shape_size_unit: string;         // 🆕 Area unit
  
  // Metadata
  url: string;                     // ✅ Direct mapping
  document: string;                // 🆕 Source document
  key: string;                     // 🆕 Unique identifier
  classes: array;                  // ✅ Enhanced with more detail
}
```

### Migration Mapping for Spells
| Current Field | Open5e Field(s) | Enhancement Level |
|---------------|-----------------|-------------------|
| `name` | `name` | ✅ Direct mapping |
| `level` | `level` | ✅ Direct mapping |
| `school` | `school` | ✅ Direct mapping |
| `castingTime` | `casting_time` | ✅ Direct mapping |
| `range` | `range_text` | ✅ Direct mapping |
| `components` | `verbal` + `somatic` + `material` + `material_specified` | 🚀 **5x enhancement** |
| `duration` | `duration` | ✅ Direct mapping |
| `description` | `desc` + `higher_level` | 🚀 **Enhanced with scaling** |
| `classes` | `classes` (array of objects) | 🚀 **Enhanced structure** |
| `url` | `url` | ✅ Direct mapping |

**New Capabilities Available**: 20+ additional fields for advanced spell mechanics

---

## Class Data Mapping

### Current ClassData Interface (7 fields)
```typescript
interface ClassData {
  name: string;               // Class name
  hitDie: string;             // Hit die type
  primaryAbility: string[];   // Primary abilities
  savingThrows: string[];     // Saving throw proficiencies
  description: string;        // Class description
  subclasses: string[];       // Subclass names
  url: string;               // Source URL
}
```

### Open5e API Class Fields (15+ fields)
```typescript
interface Open5eClassData {
  // Basic Information (matches current)
  name: string;                    // ✅ Direct mapping
  desc: string;                    // ✅ Maps to description
  
  // Character Creation (enhanced)
  hit_dice: string;                // ✅ Maps to hitDie
  hp_at_1st_level: string;        // 🆕 Starting HP calculation
  hp_at_higher_levels: string;    // 🆕 HP gain per level
  
  // Proficiencies (enhanced from current)
  prof_armor: string;              // 🆕 Armor proficiencies
  prof_weapons: string;            // 🆕 Weapon proficiencies
  prof_tools: string;              // 🆕 Tool proficiencies
  prof_saving_throws: string;     // ✅ Maps to savingThrows
  prof_skills: string;             // 🆕 Skill proficiencies
  
  // Starting Equipment
  equipment: string;               // 🆕 Starting equipment
  
  // Progression
  table: string;                   // 🆕 Level progression table
  spellcasting_ability: string;    // 🆕 Spellcasting attribute
  
  // Subclasses (enhanced)
  subtypes_name: string;           // 🆕 Subclass category name
  archetypes: array;               // 🚀 **Detailed subclass objects**
  
  // Metadata
  slug: string;                    // 🆕 URL-friendly name
  url: string;                     // ✅ Direct mapping
}
```

### Migration Mapping for Classes
| Current Field | Open5e Field(s) | Enhancement Level |
|---------------|-----------------|-------------------|
| `name` | `name` | ✅ Direct mapping |
| `hitDie` | `hit_dice` | ✅ Direct mapping |
| `primaryAbility` | Derived from `prof_saving_throws` | ⚠️ **Needs derivation** |
| `savingThrows` | `prof_saving_throws` | ✅ Direct mapping |
| `description` | `desc` | ✅ Direct mapping |
| `subclasses` | `archetypes[].name` | 🚀 **10x enhancement** |
| `url` | `url` | ✅ Direct mapping |

**New Capabilities Available**: Complete character creation data, progression tables, detailed subclasses

---

## Race Data Mapping

### Current RaceData Interface (7 fields)
```typescript
interface RaceData {
  name: string;                   // Race name
  size: string;                   // Size category
  speed: string;                  // Movement speed
  abilityScoreIncrease: string;   // ASI text
  traits: string[];               // Racial traits
  description: string;            // Race description
  url: string;                   // Source URL
}
```

### Open5e API Race Fields (8+ fields)
```typescript
interface Open5eRaceData {
  // Basic Information (matches current)
  name: string;                    // ✅ Direct mapping
  desc: string;                    // ✅ Maps to description
  
  // Traits (enhanced structure)
  traits: array;                   // 🚀 **Structured trait objects**
  // Each trait: { name: string, desc: string }
  
  // Subrace Support (new)
  is_subrace: boolean;             // 🆕 Subrace flag
  subrace_of: string;              // 🆕 Parent race reference
  
  // Metadata
  url: string;                     // ✅ Direct mapping
  key: string;                     // 🆕 Unique identifier
  document: string;                // 🆕 Source document
}
```

### Migration Mapping for Races
| Current Field | Open5e Field(s) | Enhancement Level |
|---------------|-----------------|-------------------|
| `name` | `name` | ✅ Direct mapping |
| `size` | Derived from `traits` | ⚠️ **Needs trait parsing** |
| `speed` | Derived from `traits` | ⚠️ **Needs trait parsing** |
| `abilityScoreIncrease` | Derived from `traits` | ⚠️ **Needs trait parsing** |
| `traits` | `traits[].name` | 🚀 **Enhanced with descriptions** |
| `description` | `desc` | ✅ Direct mapping |
| `url` | `url` | ✅ Direct mapping |

**New Capabilities Available**: Structured traits, subrace relationships, enhanced metadata

---

## New Content Types Available

### 1. Monster Data (Not in Current Implementation)
```typescript
interface MonsterData {
  name: string;                    // Monster name
  size: string;                    // Size category
  type: string;                    // Creature type
  alignment: string;               // Alignment
  armor_class: number;             // AC value
  hit_points: number;              // HP total
  hit_dice: string;                // HP calculation
  speed: object;                   // Movement speeds
  strength: number;                // Ability scores
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  saving_throws: string;           // Save bonuses
  skills: string;                  // Skill bonuses
  damage_resistances: string;      // Resistances
  damage_immunities: string;       // Immunities
  condition_immunities: string;    // Condition immunities
  senses: string;                  // Special senses
  languages: string;               // Known languages
  challenge_rating: string;        // CR value
  actions: array;                  // Available actions
  special_abilities: array;        // Special abilities
  reactions: array;                // Reaction abilities
  legendary_actions: array;        // Legendary actions
  desc: string;                    // Description
}
```

### 2. Equipment Data (Not in Current Implementation)
```typescript
interface WeaponData {
  name: string;                    // Weapon name
  damage_dice: string;             // Damage dice
  damage_type: string;             // Damage type
  range: string;                   // Weapon range
  is_martial: boolean;             // Martial weapon flag
  is_melee: boolean;               // Melee weapon flag
  is_ranged: boolean;              // Ranged weapon flag
  is_finesse: boolean;             // Finesse property
  is_light: boolean;               // Light property
  is_heavy: boolean;               // Heavy property
  is_two_handed: boolean;          // Two-handed property
  is_versatile: boolean;           // Versatile property
  properties: array;               // Weapon properties
}

interface ArmorData {
  name: string;                    // Armor name
  ac_display: string;              // AC calculation display
  ac_base: number;                 // Base AC value
  ac_add_dexmod: boolean;          // Add Dex modifier
  ac_cap_dexmod: number;           // Dex modifier cap
  category: string;                // Armor category
  grants_stealth_disadvantage: boolean; // Stealth penalty
  strength_score_required: number; // Strength requirement
}
```

### 3. Feat Data (Not in Current Implementation)
```typescript
interface FeatData {
  name: string;                    // Feat name
  desc: string;                    // Feat description
  has_prerequisite: boolean;       // Prerequisite flag
  prerequisite: string;            // Prerequisite text
  benefits: array;                 // Feat benefits
  // Each benefit: { name: string, desc: string }
}
```

### 4. Background Data (Not in Current Implementation)
```typescript
interface BackgroundData {
  name: string;                    // Background name
  desc: string;                    // Background description
  benefits: array;                 // Background benefits
  // Benefits include: skills, tools, languages, equipment
}
```

---

## Content Gap Analysis

### Current Implementation Gaps
| Content Type | Current Status | Open5e Coverage | Gap Impact |
|--------------|----------------|-----------------|------------|
| **Spells** | ✅ Working (basic) | 🚀 **30+ fields** | **High enhancement** |
| **Classes** | ⚠️ Limited scraping | 🚀 **Complete progression** | **Critical improvement** |
| **Races** | ❌ **Broken** | ✅ Working with traits | **Fix + enhancement** |
| **Monsters** | ❌ **Not implemented** | 🚀 **Complete stat blocks** | **New capability** |
| **Weapons** | ❌ **Not implemented** | 🚀 **Full properties** | **New capability** |
| **Armor** | ❌ **Not implemented** | 🚀 **AC calculations** | **New capability** |
| **Magic Items** | ❌ **Not implemented** | 🚀 **Rarity/attunement** | **New capability** |
| **Feats** | ❌ **Not implemented** | 🚀 **Prerequisites/benefits** | **New capability** |
| **Backgrounds** | ❌ **Not implemented** | 🚀 **Character creation** | **New capability** |

### Migration Priority Matrix
| Priority | Content Type | Reason | Implementation Effort |
|----------|--------------|--------|----------------------|
| **P0** | Races | Currently broken, critical for characters | Low |
| **P0** | Spells | Enhancement of working functionality | Medium |
| **P1** | Classes | Major improvement in detail/completeness | Medium |
| **P1** | Monsters | High-value new capability | Medium |
| **P2** | Weapons/Armor | Equipment support for characters | Low |
| **P2** | Feats | Character customization | Low |
| **P3** | Backgrounds | Character creation enhancement | Low |
| **P3** | Magic Items | Campaign/loot support | Low |

---

## Implementation Strategy

### Phase 1: Fix and Enhance (P0)
1. **Races**: Fix broken functionality with enhanced traits
2. **Spells**: Enhance with 20+ additional fields

### Phase 2: Major Improvements (P1)  
3. **Classes**: Complete progression and subclass details
4. **Monsters**: Add full stat block support

### Phase 3: New Capabilities (P2-P3)
5. **Equipment**: Weapons and armor support
6. **Feats**: Character customization options
7. **Backgrounds**: Character creation support
8. **Magic Items**: Campaign support tools

### Data Transformation Examples

#### Spell Component Enhancement
```typescript
// Current (simple)
components: "V, S, M (a pinch of sulfur)"

// Open5e (detailed)
verbal: true,
somatic: true, 
material: true,
material_specified: "a pinch of sulfur",
material_cost: 0,
material_consumed: false
```

#### Class Subclass Enhancement
```typescript
// Current (simple)
subclasses: ["Champion", "Battle Master", "Eldritch Knight"]

// Open5e (detailed)
archetypes: [
  {
    name: "Champion",
    desc: "Detailed description...",
    features: [...],
    progression: [...]
  },
  // ... more detailed subclasses
]
```

#### Race Trait Enhancement
```typescript
// Current (simple)
traits: ["Darkvision", "Fey Ancestry", "Trance"]

// Open5e (detailed)
traits: [
  {
    name: "Darkvision",
    desc: "You can see in dim light within 60 feet..."
  },
  {
    name: "Fey Ancestry", 
    desc: "You have advantage on saving throws..."
  }
  // ... detailed trait descriptions
]
```

---

## Migration Benefits Summary

### Quantitative Improvements
- **Spell fields**: 10 → 30+ (3x increase)
- **Class detail**: Basic → Complete progression (10x improvement)
- **Race functionality**: Broken → Working with traits (∞ improvement)
- **New content types**: 0 → 6 major categories (∞ expansion)

### Qualitative Improvements
- **Data structure**: Flat → Nested/rich objects
- **Error handling**: HTML parsing → Proper API responses
- **Reliability**: Website-dependent → API with CDN
- **Performance**: Sequential scraping → Concurrent API calls
- **Maintenance**: HTML selector updates → Stable API contracts

### Development Benefits
- **Type safety**: Enhanced TypeScript interfaces
- **Testing**: API mocking vs HTML simulation  
- **Documentation**: Self-documenting API vs scraping code
- **Extensibility**: Easy to add new endpoints vs new scrapers

This comprehensive field mapping provides the foundation for a systematic migration that preserves existing functionality while adding significant new capabilities.