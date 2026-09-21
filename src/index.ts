#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { Open5eClient, type ContentScope } from './open5e-client.js';
import { UnifiedSearchEngine, ContentType } from './unified-search-engine.js';
import { CharacterBuilder } from './character-build/builder.js';
import type { CampaignType, ExperienceLevel, Playstyle } from './character-build/types.js';
import type { Ability } from './class-rules.js';

// Validation utilities
function validateStringInput(value: any, fieldName: string, required: boolean = true, maxLength: number = 100): string {
  if (!value && required) {
    throw new Error(`${fieldName} is required`);
  }
  if (!value && !required) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is too long (maximum ${maxLength} characters)`);
  }
  return trimmed;
}

function validateNumberInput(value: any, fieldName: string, min: number = 0, max: number = 1000): number {
  if (value === undefined || value === null) {
    throw new Error(`${fieldName} is required`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return value;
}

function validateOptionalNumberInput(value: any, fieldName: string, min: number = 0, max: number = 1000): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return value;
}

/** A CR as a number: 0-30, with 0.125, 0.25 and 0.5 for the fractional ones. */
function validateChallengeRating(value: any, fieldName: string): number {
  if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 30) {
    throw new Error(`${fieldName} must be a number between 0 and 30`);
  }
  if (!Number.isInteger(value) && ![0.125, 0.25, 0.5].includes(value)) {
    throw new Error(`${fieldName} must be a whole number or 0.125, 0.25 or 0.5`);
  }
  return value;
}

/** An optional list of strings; anything else is rejected rather than ignored. */
function validateOptionalStringArray(value: any, fieldName: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
  return value.map((item: string) => item.trim()).filter(item => item.length > 0);
}

/** A string argument that may be omitted; present, it must be a string. */
function optionalString(value: any, fieldName: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  return value.trim();
}

/** Schema for the arguments that restrict a tool to some sourcebooks. */
const SCOPE_PROPERTIES = {
  ruleset: {
    type: 'string',
    description: 'Only content for this game system: "5e-2014", "5e-2024" or "a5e" (optional; default: all sources, each result labelled with its source)',
  },
  sources: {
    type: 'array',
    items: { type: 'string' },
    description: 'Only content from these Open5e documents, e.g. ["srd-2014"] (optional)',
  },
} as const;

/** Tools that accept SCOPE_PROPERTIES. Passing them to any other tool is an error. */
const SCOPED_TOOLS = new Set([
  'unified_search',
  'search_spells', 'get_spell_details', 'get_spell_by_level', 'get_spells_by_class',
  'search_classes', 'get_class_details',
  'search_races', 'get_race_details',
  'search_monsters', 'get_monsters_by_cr', 'get_monsters_by_cr_range',
  'build_encounter', 'calculate_encounter_difficulty',
  'generate_character_build', 'compare_character_builds', 'get_build_recommendations',
  'search_weapons', 'search_armor', 'get_armor_details',
  'search_magic_items', 'get_magic_item_details',
  'search_feats', 'get_feat_details',
  'search_conditions', 'get_condition_details', 'get_all_conditions',
  'search_backgrounds', 'get_background_details',
  'search_sections', 'get_section_details', 'get_all_sections'
]);

function parseScope(toolName: string, args: Record<string, any> | undefined): ContentScope | undefined {
  const { ruleset, sources } = args ?? {};
  if (ruleset === undefined && sources === undefined) return undefined;
  if (!SCOPED_TOOLS.has(toolName)) {
    throw new Error(`${toolName} does not take ruleset or sources`);
  }
  if (ruleset !== undefined && typeof ruleset !== 'string') {
    throw new Error('ruleset must be a string');
  }
  if (sources !== undefined &&
      (!Array.isArray(sources) || sources.some(source => typeof source !== 'string'))) {
    throw new Error('sources must be an array of document keys');
  }
  return {
    ruleset: ruleset?.trim(),
    sources: sources?.map((source: string) => source.trim())
  };
}

/** Longest string any tool argument may carry. */
const MAX_STRING_ARG_LENGTH = 100;

/**
 * Rejects any string argument, however deeply nested, that is longer than
 * MAX_STRING_ARG_LENGTH. Checked once for every tool so no handler can forget
 * it; the HTTP client deliberately does not truncate on our behalf.
 */
function validateStringArgLengths(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (value.trim().length > MAX_STRING_ARG_LENGTH) {
      throw new Error(`${path} is too long (maximum ${MAX_STRING_ARG_LENGTH} characters)`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => validateStringArgLengths(item, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      validateStringArgLengths(item, path ? `${path}.${key}` : key);
    }
  }
}

const open5eClient = new Open5eClient();
const unifiedSearchEngine = new UnifiedSearchEngine();
const characterBuilder = new CharacterBuilder(open5eClient);

const server = new Server(
  {
    name: 'dnd-mcp-server',
    version: '2.0.0', // Updated version for Open5e migration
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools: Tool[] = [
  // Unified search across all content types
  {
    name: 'unified_search',
    description: 'Search across all D&D content types (spells, monsters, items, races, classes, etc.) with intelligent ranking and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (required)',
          minLength: 1
        },
        content_types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['spells', 'monsters', 'races', 'classes', 'weapons', 'armor', 'magic-items', 'feats', 'conditions', 'backgrounds', 'sections']
          },
          description: 'Filter by specific content types (optional - searches all if not specified)'
        },
        limit: {
          type: 'number',
          description: 'Maximum results per content type (default: 5)',
          minimum: 1,
          maximum: 20
        },
        include_details: {
          type: 'boolean',
          description: 'Include full details vs summary previews (default: false)'
        },
        fuzzy_threshold: {
          type: 'number',
          description: 'Fuzzy matching sensitivity 0.0-1.0 (default: 0.3)',
          minimum: 0.0,
          maximum: 1.0
        },
        sort_by: {
          type: 'string',
          enum: ['relevance', 'name', 'type'],
          description: 'Result sorting strategy (default: relevance)'
        }
      },
      required: ['query']
    }
  },

  // Enhanced spell tools
  {
    name: 'search_spells',
    description: 'Search for D&D 5E spells with advanced filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for spell names (optional)',
        },
        level: {
          type: 'number',
          description: 'Filter by spell level (0-9)',
          minimum: 0,
          maximum: 9,
        },
        school: {
          type: 'string',
          description: 'Filter by magic school (e.g., evocation, necromancy)',
        },
        class_name: {
          type: 'string',
          description: 'Only spells on this class\'s spell list (e.g., "bard")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 100,
        },
        ordering: {
          type: 'string',
          description: 'Sort order',
          enum: ['name', '-name', 'level', '-level'],
        },
      },
    },
  },
  {
    name: 'get_spell_details',
    description: 'Get detailed information about a specific D&D 5E spell',
    inputSchema: {
      type: 'object',
      properties: {
        spell_name: {
          type: 'string',
          description: 'The name of the spell to get details for',
        },
      },
      required: ['spell_name'],
    },
  },
  {
    name: 'get_spell_by_level',
    description: 'Get all spells of a specific level',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'number',
          description: 'Spell level (0 for cantrips, 1-9 for spell levels)',
          minimum: 0,
          maximum: 9,
        },
      },
      required: ['level'],
    },
  },
  {
    name: 'get_spells_by_class',
    description: 'Get the spells on a class\'s spell list, lowest level first',
    inputSchema: {
      type: 'object',
      properties: {
        class_name: {
          type: 'string',
          description: 'The name of the class (e.g., "wizard", "cleric", "bard")',
        },
        level: {
          type: 'number',
          description: 'Only spells of this level (0 for cantrips)',
          minimum: 0,
          maximum: 9,
        },
        max_level: {
          type: 'number',
          description: 'Only spells of this level or lower',
          minimum: 0,
          maximum: 9,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of spells to return (default: 20)',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['class_name'],
    },
  },
  
  // Enhanced class tools
  {
    name: 'search_classes',
    description: 'List D&D 5E base classes with their features and subclass names',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_class_details',
    description: 'Get a D&D 5E class: hit die, proficiencies, features by level, spell slots and subclasses with their features',
    inputSchema: {
      type: 'object',
      properties: {
        class_name: {
          type: 'string',
          description: 'The name of the class to get details for',
        },
      },
      required: ['class_name'],
    },
  },

  // Enhanced race tools
  {
    name: 'search_races',
    description: 'Search for D&D 5E races with detailed trait information',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for race names (optional)',
        },
      },
    },
  },
  {
    name: 'get_race_details',
    description: 'Get detailed information about a specific D&D 5E race',
    inputSchema: {
      type: 'object',
      properties: {
        race_name: {
          type: 'string',
          description: 'The name of the race to get details for',
        },
      },
      required: ['race_name'],
    },
  },

  // NEW: Monster tools
  {
    name: 'search_monsters',
    description: 'Search for D&D 5E monsters with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for monster names (optional)',
        },
        challenge_rating: {
          type: 'number',
          description: 'Filter by challenge rating (0.125, 0.25 and 0.5 for fractional CRs)',
          minimum: 0,
          maximum: 30,
        },
        type: {
          type: 'string',
          description: 'Filter by creature type, e.g. "dragon", "undead"',
        },
        environment: {
          type: 'string',
          description: 'Filter by environment, e.g. "forest", "underworld"',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'get_monsters_by_cr',
    description: 'Get monsters by challenge rating',
    inputSchema: {
      type: 'object',
      properties: {
        challenge_rating: {
          type: 'number',
          description: 'Challenge rating to filter by',
          minimum: 0,
          maximum: 30,
        },
      },
      required: ['challenge_rating'],
    },
  },

  // NEW: Equipment tools
  {
    name: 'search_weapons',
    description: 'Search for D&D 5E weapons with property filtering',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for weapon names (optional)',
        },
        is_martial: {
          type: 'boolean',
          description: 'Filter for martial weapons only',
        },
        is_finesse: {
          type: 'boolean',
          description: 'Filter for finesse weapons only',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },

  // NEW: Magic Items tools
  {
    name: 'search_magic_items',
    description: 'Search for D&D 5E magic items with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for magic item names (optional)',
        },
        rarity: {
          type: 'string',
          description: 'Filter by rarity',
          enum: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'],
        },
        type: {
          type: 'string',
          description: 'Filter by item category (e.g., weapon, armor, wondrous item, potion, ring)',
        },
        requires_attunement: {
          type: 'boolean',
          description: 'Filter by attunement requirement',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'get_magic_item_details',
    description: 'Get detailed information about a specific D&D 5E magic item',
    inputSchema: {
      type: 'object',
      properties: {
        item_name: {
          type: 'string',
          description: 'The name of the magic item to get details for',
        },
      },
      required: ['item_name'],
    },
  },

  // NEW: Armor tools
  {
    name: 'search_armor',
    description: 'Search for D&D 5E armor with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for armor names (optional)',
        },
        category: {
          type: 'string',
          description: 'Filter by armor category (light, medium, heavy)',
          enum: ['light', 'medium', 'heavy'],
        },
        ac_base: {
          type: 'number',
          description: 'Filter by base Armor Class value',
          minimum: 10,
          maximum: 18,
        },
        stealth_disadvantage: {
          type: 'boolean',
          description: 'Filter by stealth disadvantage (true for armor that imposes disadvantage)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'get_armor_details',
    description: 'Get detailed information about a specific D&D 5E armor',
    inputSchema: {
      type: 'object',
      properties: {
        armor_name: {
          type: 'string',
          description: 'The name of the armor to get details for',
        },
      },
      required: ['armor_name'],
    },
  },

  // NEW: Feats tools
  {
    name: 'search_feats',
    description: 'Search for D&D 5E feats with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for feat names (optional)',
        },
        has_prerequisite: {
          type: 'boolean',
          description: 'Filter by prerequisite requirement (true for feats with prerequisites)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'get_feat_details',
    description: 'Get detailed information about a specific D&D 5E feat',
    inputSchema: {
      type: 'object',
      properties: {
        feat_name: {
          type: 'string',
          description: 'The name of the feat to get details for',
        },
      },
      required: ['feat_name'],
    },
  },

  // NEW: Conditions tools
  {
    name: 'search_conditions',
    description: 'Search for D&D 5E conditions and status effects',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for condition names (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'get_condition_details',
    description: 'Get detailed information about a specific D&D 5E condition',
    inputSchema: {
      type: 'object',
      properties: {
        condition_name: {
          type: 'string',
          description: 'The name of the condition to get details for',
        },
      },
      required: ['condition_name'],
    },
  },
  {
    name: 'get_all_conditions',
    description: 'Get all D&D 5E conditions for quick reference',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // NEW: Backgrounds tools
  {
    name: 'search_backgrounds',
    description: 'Search for D&D 5E character backgrounds with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for background names (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'get_background_details',
    description: 'Get detailed information about a specific D&D 5E background',
    inputSchema: {
      type: 'object',
      properties: {
        background_name: {
          type: 'string',
          description: 'The name of the background to get details for',
        },
      },
      required: ['background_name'],
    },
  },

  // NEW: Rules Sections tools
  {
    name: 'search_sections',
    description: 'Search D&D 5E rules sections for quick rule lookups',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for rule section names or content (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  {
    name: 'get_section_details',
    description: 'Get detailed information about a specific D&D 5E rules section',
    inputSchema: {
      type: 'object',
      properties: {
        section_name: {
          type: 'string',
          description: 'The name or key of the rules section to get details for',
        },
      },
      required: ['section_name'],
    },
  },
  {
    name: 'get_all_sections',
    description: 'List every D&D 5E rules section by name, key and chapter (without the rules text; use get_section_details for that)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // NEW: DM Encounter Builder tools
  {
    name: 'build_encounter',
    description: 'Build a balanced D&D 5E encounter using monsters by CR for specified party',
    inputSchema: {
      type: 'object',
      properties: {
        party_size: {
          type: 'number',
          description: 'Number of player characters in the party',
          minimum: 1,
          maximum: 8,
        },
        party_level: {
          type: 'number',
          description: 'Average level of the party',
          minimum: 1,
          maximum: 20,
        },
        difficulty: {
          type: 'string',
          description: 'Desired encounter difficulty',
          enum: ['easy', 'medium', 'hard', 'deadly'],
        },
        environment: {
          type: 'string',
          description: 'Environment/terrain for the encounter (optional)',
        },
        min_cr: {
          type: 'number',
          description: 'Minimum challenge rating for monsters (optional)',
          minimum: 0,
          maximum: 30,
        },
        max_cr: {
          type: 'number',
          description: 'Maximum challenge rating for monsters (optional)',
          minimum: 0,
          maximum: 30,
        },
        monster_types: {
          type: 'array',
          description: 'Preferred monster types (optional)',
          items: {
            type: 'string',
          },
        },
        max_monsters: {
          type: 'number',
          description: 'Maximum number of monsters in encounter (optional, default: 8)',
          minimum: 1,
          maximum: 15,
        },
      },
      required: ['party_size', 'party_level', 'difficulty'],
    },
  },
  {
    name: 'calculate_encounter_difficulty',
    description: 'Calculate the difficulty of a custom encounter with specific monsters',
    inputSchema: {
      type: 'object',
      properties: {
        party_size: {
          type: 'number',
          description: 'Number of player characters in the party',
          minimum: 1,
          maximum: 8,
        },
        party_level: {
          type: 'number',
          description: 'Average level of the party',
          minimum: 1,
          maximum: 20,
        },
        monsters: {
          type: 'array',
          description: 'List of monsters with their counts',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Monster name',
              },
              cr: {
                type: 'string',
                description: 'Challenge rating (e.g., "1", "1/2", "3")',
              },
              count: {
                type: 'number',
                description: 'Number of this monster',
                minimum: 1,
              },
            },
            required: ['name', 'cr', 'count'],
          },
        },
      },
      required: ['party_size', 'party_level', 'monsters'],
    },
  },
  {
    name: 'get_monsters_by_cr_range',
    description: 'Get all monsters within a specific challenge rating range for encounter planning',
    inputSchema: {
      type: 'object',
      properties: {
        min_cr: {
          type: 'number',
          description: 'Minimum challenge rating',
          minimum: 0,
          maximum: 30,
        },
        max_cr: {
          type: 'number',
          description: 'Maximum challenge rating',
          minimum: 0,
          maximum: 30,
        },
        environment: {
          type: 'string',
          description: 'Filter by environment (optional)',
        },
        monster_types: {
          type: 'array',
          description: 'Filter by monster types (optional)',
          items: {
            type: 'string',
          },
        },
        limit: {
          type: 'number',
          description: 'Maximum number of monsters to return',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['min_cr', 'max_cr'],
    },
  },

  // Player-focused character build helper tools
  {
    name: 'generate_character_build',
    description: 'Generate a character build: species, class and subclass, background, ability scores, hit points, spells, feats and a level-by-level plan. Uses the 2024 SRD unless ruleset or sources say otherwise',
    inputSchema: {
      type: 'object',
      properties: {
        preferred_class: {
          type: 'string',
          description: 'Preferred character class (optional)',
        },
        preferred_race: {
          type: 'string',
          description: 'Preferred character race (optional)',
        },
        preferred_background: {
          type: 'string',
          description: 'Preferred character background (optional)',
        },
        playstyle: {
          type: 'string',
          description: 'Desired playstyle',
          enum: ['damage', 'support', 'tank', 'utility', 'balanced'],
        },
        campaign_type: {
          type: 'string',
          description: 'Type of campaign',
          enum: ['combat', 'roleplay', 'exploration', 'mixed'],
        },
        experience_level: {
          type: 'string',
          description: 'Player experience level',
          enum: ['beginner', 'intermediate', 'advanced'],
        },
        focus_level: {
          type: 'number',
          description: 'Target character level for optimization (default: 5)',
          minimum: 1,
          maximum: 20,
        },
        allow_multiclass: {
          type: 'boolean',
          description: 'Multiclass builds are not supported yet; true is rejected',
        },
        preferred_ability_scores: {
          type: 'array',
          description: 'Preferred ability scores to prioritize',
          items: {
            type: 'string',
            enum: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
          },
        },
      },
    },
  },
  {
    name: 'compare_character_builds',
    description: 'Generate and compare multiple character builds with different options',
    inputSchema: {
      type: 'object',
      properties: {
        build_options: {
          type: 'array',
          description: 'Array of build option sets to compare',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name for this build option',
              },
              playstyle: {
                type: 'string',
                enum: ['damage', 'support', 'tank', 'utility', 'balanced'],
              },
              preferred_class: {
                type: 'string',
              },
              preferred_race: {
                type: 'string',
              },
            },
          },
        },
        campaign_type: {
          type: 'string',
          enum: ['combat', 'roleplay', 'exploration', 'mixed'],
        },
        focus_level: {
          type: 'number',
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['build_options'],
    },
  },
  {
    name: 'get_build_recommendations',
    description: 'Get character build recommendations based on party composition and campaign needs',
    inputSchema: {
      type: 'object',
      properties: {
        existing_party: {
          type: 'array',
          description: 'Classes already in the party',
          items: {
            type: 'string',
          },
        },
        campaign_type: {
          type: 'string',
          enum: ['combat', 'roleplay', 'exploration', 'mixed'],
        },
        party_level: {
          type: 'number',
          description: 'Average party level',
          minimum: 1,
          maximum: 20,
        },
        missing_roles: {
          type: 'array',
          description: 'Roles the party is missing',
          items: {
            type: 'string',
            enum: ['damage', 'support', 'tank', 'utility', 'face', 'skill_monkey'],
          },
        },
      },
      required: ['existing_party', 'campaign_type'],
    },
  },

  // Utility tools
  {
    name: 'get_api_stats',
    description: 'Get API performance and caching statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

for (const tool of tools) {
  if (SCOPED_TOOLS.has(tool.name)) {
    tool.inputSchema.properties = { ...tool.inputSchema.properties, ...SCOPE_PROPERTIES };
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    validateStringArgLengths(args, '');
    const scope = parseScope(name, args);

    switch (name) {
      // Unified search across all content types
      case 'unified_search': {
        const { query, content_types, limit, include_details, fuzzy_threshold, sort_by } = args || {};
        
        if (!query) {
          throw new Error('Search query is required');
        }
        
        const searchOptions = {
          query: query as string,
          contentTypes: content_types as ContentType[] | undefined,
          limit: limit as number | undefined,
          includeDetails: include_details as boolean | undefined,
          fuzzyThreshold: fuzzy_threshold as number | undefined,
          sortBy: sort_by as 'relevance' | 'name' | 'type' | undefined,
          scope
        };
        
        const results = await unifiedSearchEngine.unifiedSearch(searchOptions);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: results.query,
                totalResults: results.totalResults,
                executionTime: `${results.executionTime}ms`,
                results: results.results,
                suggestions: results.suggestions,
                relatedContent: results.relatedContent
              }, null, 2),
            },
          ],
        };
      }

      // Enhanced spell tools
      case 'search_spells': {
        const { query, school, ordering, class_name } = args || {};
        const options: any = {
          level: validateOptionalNumberInput(args?.level, 'level', 0, 9),
          limit: validateOptionalNumberInput(args?.limit, 'limit', 1, 100),
          scope
        };

        if (school) options.school = validateStringInput(school, 'school');
        if (ordering) options.ordering = validateStringInput(ordering, 'ordering');

        const results = class_name
          ? await open5eClient.getSpellsByClass(validateStringInput(class_name, 'class_name'), {
            level: options.level, limit: options.limit, scope
          })
          : await open5eClient.searchSpells(optionalString(query, 'query'), options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                spells: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_spell_details': {
        const spellName = validateStringInput(args?.spell_name, 'spell_name');

        const spell = await open5eClient.getSpellDetails(spellName, scope);
        if (!spell) {
          return {
            content: [
              {
                type: 'text',
                text: `Spell "${spellName}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(spell, null, 2),
            },
          ],
        };
      }

      case 'get_spell_by_level': {
        // Spell levels are 0 (cantrip) through 9; anything else is a client
        // error, not an empty result set.
        const level = validateNumberInput(args?.level, 'level', 0, 9);
        const results = await open5eClient.getSpellsByLevel(level, { scope });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                level,
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                spells: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_spells_by_class': {
        const className = validateStringInput(args?.class_name, 'class_name');

        const result = await open5eClient.getSpellsByClass(className, {
          level: validateOptionalNumberInput(args?.level, 'level', 0, 9),
          maxLevel: validateOptionalNumberInput(args?.max_level, 'max_level', 0, 9),
          limit: validateOptionalNumberInput(args?.limit, 'limit', 1, 100),
          scope
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                class: result.class,
                classKey: result.classKey,
                found: result.count,
                showing: result.results.length,
                hasMore: result.hasMore,
                spells: result.results
              }, null, 2),
            },
          ],
        };
      }

      // Enhanced class tools
      case 'search_classes': {
        const results = await open5eClient.searchClasses({ scope });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                classes: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_class_details': {
        const className = validateStringInput(args?.class_name, 'class_name');

        const classData = await open5eClient.getClassDetails(className, scope);
        if (!classData) {
          return {
            content: [
              {
                type: 'text',
                text: `Class "${className}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(classData, null, 2),
            },
          ],
        };
      }

      // Enhanced race tools
      case 'search_races': {
        const query = args?.query as string;
        const results = await open5eClient.searchRaces(optionalString(query, 'query'), { scope });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                races: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_race_details': {
        const raceName = validateStringInput(args?.race_name, 'race_name');

        const race = await open5eClient.getRaceDetails(raceName, scope);
        if (!race) {
          return {
            content: [
              {
                type: 'text',
                text: `Race "${raceName}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(race, null, 2),
            },
          ],
        };
      }

      // NEW: Monster tools
      case 'search_monsters': {
        const { query, challenge_rating } = args || {};
        const options: any = {
          type: optionalString(args?.type, 'type'),
          environment: optionalString(args?.environment, 'environment'),
          limit: validateOptionalNumberInput(args?.limit, 'limit', 1, 50),
          scope
        };

        if (challenge_rating !== undefined) options.cr = validateChallengeRating(challenge_rating, 'challenge_rating');

        const results = await open5eClient.searchMonsters(optionalString(query, 'query'), options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                monsters: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_monsters_by_cr': {
        if (args?.challenge_rating === undefined || args?.challenge_rating === null) {
          throw new Error('challenge_rating is required');
        }
        const challengeRating = validateChallengeRating(args.challenge_rating, 'challenge_rating');

        const results = await open5eClient.getMonstersByCR(challengeRating, scope);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                challengeRating,
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                monsters: results.results
              }, null, 2),
            },
          ],
        };
      }

      // NEW: Equipment tools
      case 'search_weapons': {
        const { query, is_martial, is_finesse, limit } = args || {};
        const options: any = { scope };
        
        if (is_martial !== undefined) options.isMartial = is_martial;
        if (is_finesse !== undefined) options.isFinesse = is_finesse;
        if (limit) options.limit = limit;

        const results = await open5eClient.searchWeapons(optionalString(query, 'query'), options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                weapons: results.results
              }, null, 2),
            },
          ],
        };
      }

      // NEW: Magic Items tools
      case 'search_magic_items': {
        const { query, rarity, type, requires_attunement } = args || {};

        const results = await open5eClient.searchMagicItems(optionalString(query, 'query'), {
          // Rarity keys are hyphenated ("very-rare"); the schema offers "very rare".
          rarity: optionalString(rarity, 'rarity')?.replace(/\s+/g, '-'),
          // Category keys are too ("wondrous-item"); names are also accepted.
          type: optionalString(type, 'type'),
          requiresAttunement: requires_attunement === undefined ? undefined : Boolean(requires_attunement),
          limit: validateOptionalNumberInput(args?.limit, 'limit', 1, 50),
          scope
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                magicItems: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_magic_item_details': {
        const itemName = validateStringInput(args?.item_name, 'item_name');

        const item = await open5eClient.getMagicItemDetails(itemName, scope);
        if (!item) {
          return {
            content: [
              {
                type: 'text',
                text: `Magic item "${itemName}" not found. Try searching with partial names using search_magic_items.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(item, null, 2),
            },
          ],
        };
      }

      // NEW: Armor tools
      case 'search_armor': {
        const { query, category, ac_base, stealth_disadvantage, limit } = args || {};
        const options: any = { scope };
        
        if (category) options.category = category;
        if (ac_base !== undefined) options.acBase = ac_base;
        if (stealth_disadvantage !== undefined) options.stealthDisadvantage = stealth_disadvantage;
        if (limit) options.limit = limit;

        const results = await open5eClient.searchArmor(optionalString(query, 'query'), options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                armor: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_armor_details': {
        const armorName = validateStringInput(args?.armor_name, 'armor_name');

        const armor = await open5eClient.getArmorDetails(armorName, scope);
        if (!armor) {
          return {
            content: [
              {
                type: 'text',
                text: `Armor "${armorName}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(armor, null, 2),
            },
          ],
        };
      }

      // NEW: Feats tools
      case 'search_feats': {
        const { query, has_prerequisite, limit } = args || {};
        const options: any = { scope };
        
        if (has_prerequisite !== undefined) options.hasPrerequisite = has_prerequisite;
        if (limit) options.limit = limit;

        const results = await open5eClient.searchFeats(optionalString(query, 'query'), options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                feats: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_feat_details': {
        const featName = validateStringInput(args?.feat_name, 'feat_name');

        const feat = await open5eClient.getFeatDetails(featName, scope);
        if (!feat) {
          return {
            content: [
              {
                type: 'text',
                text: `Feat "${featName}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(feat, null, 2),
            },
          ],
        };
      }

      // NEW: Conditions tools
      case 'search_conditions': {
        const { query, limit } = args || {};
        const options: any = {};
        
        if (limit) options.limit = limit;

        const results = await open5eClient.searchConditions(optionalString(query, 'query'), { ...options, scope });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                conditions: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_condition_details': {
        const conditionName = validateStringInput(args?.condition_name, 'condition_name');

        const condition = await open5eClient.getConditionDetails(conditionName, scope);
        if (!condition) {
          return {
            content: [
              {
                type: 'text',
                text: `Condition "${conditionName}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(condition, null, 2),
            },
          ],
        };
      }

      case 'get_all_conditions': {
        const conditions = await open5eClient.getAllConditions(scope);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                total: conditions.length,
                conditions: conditions
              }, null, 2),
            },
          ],
        };
      }

      // NEW: Backgrounds tools
      case 'search_backgrounds': {
        const { query, limit } = args || {};
        const options: any = {};
        
        if (limit) options.limit = limit;

        const results = await open5eClient.searchBackgrounds(optionalString(query, 'query'), { ...options, scope });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                backgrounds: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_background_details': {
        const backgroundName = validateStringInput(args?.background_name, 'background_name');

        const background = await open5eClient.getBackgroundDetails(backgroundName, scope);
        if (!background) {
          return {
            content: [
              {
                type: 'text',
                text: `Background "${backgroundName}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(background, null, 2),
            },
          ],
        };
      }

      // NEW: Rules Sections tools
      case 'search_sections': {
        const results = await open5eClient.searchSections(optionalString(args?.query, 'query'), {
          limit: validateOptionalNumberInput(args?.limit, 'limit', 1, 50),
          scope
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                sections: results.results
              }, null, 2),
            },
          ],
        };
      }

      case 'get_section_details': {
        const sectionName = validateStringInput(args?.section_name, 'section_name');

        const section = await open5eClient.getSectionDetails(sectionName, scope);
        if (!section) {
          return {
            content: [
              {
                type: 'text',
                text: `Rules section "${sectionName}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(section, null, 2),
            },
          ],
        };
      }

      case 'get_all_sections': {
        const sections = await open5eClient.getAllSections(scope);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                total: sections.length,
                sections: sections
              }, null, 2),
            },
          ],
        };
      }

      // DM-focused encounter builder tools
      case 'build_encounter': {
        const { party_size, party_level, difficulty, environment, min_cr, max_cr, monster_types, max_monsters } = args || {};
        
        if (!party_size || !party_level || !difficulty) {
          throw new Error('party_size, party_level, and difficulty are required');
        }

        // The DMG XP thresholds only cover character levels 1-20.
        const validDifficulties = ['easy', 'medium', 'hard', 'deadly'];
        if (!validDifficulties.includes(difficulty as string)) {
          throw new Error(`difficulty must be one of: ${validDifficulties.join(', ')}`);
        }

        const options = {
          partySize: validateNumberInput(party_size, 'party_size', 1, 12),
          partyLevel: validateNumberInput(party_level, 'party_level', 1, 20),
          difficulty: difficulty as 'easy' | 'medium' | 'hard' | 'deadly',
          environment: environment as string | undefined,
          minCR: validateOptionalNumberInput(min_cr, 'min_cr', 0, 30),
          maxCR: validateOptionalNumberInput(max_cr, 'max_cr', 0, 30),
          monsterTypes: validateOptionalStringArray(monster_types, 'monster_types'),
          maxMonsters: validateOptionalNumberInput(max_monsters, 'max_monsters', 1, 30),
          scope
        };

        const encounter = await open5eClient.buildRandomEncounter(options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(encounter, null, 2),
            },
          ],
        };
      }

      case 'calculate_encounter_difficulty': {
        const { party_size, party_level, monsters } = args || {};

        if (!party_size || !party_level || !monsters) {
          throw new Error('party_size, party_level, and monsters are required');
        }
        if (!Array.isArray(monsters)) {
          throw new Error('monsters must be an array');
        }

        const encounterMonsters = await Promise.all(
          (monsters as Array<{ name: string, cr: string, count: number }>).map(async (monster, i) => {
            const monsterName = validateStringInput(monster?.name, `monsters[${i}].name`);
            const cr = validateStringInput(String(monster?.cr ?? ''), `monsters[${i}].cr`);
            const count = validateNumberInput(monster?.count, `monsters[${i}].count`, 1, 100);
            const xp = open5eClient.xpForChallengeRating(cr);

            const matches = await open5eClient.searchMonsters(monsterName, { limit: 20, scope });
            const monsterData = matches.results.find(m => m.name.toLowerCase() === monsterName.toLowerCase())
              ?? matches.results[0];
            if (!monsterData) {
              throw new Error(`Monster "${monsterName}" not found`);
            }
            return { name: monsterName, cr, count, xp, totalXP: xp * count, monsterData };
          })
        );

        const difficulty = await open5eClient.getEncounterDifficulty(
          validateNumberInput(party_size, 'party_size', 1, 12),
          validateNumberInput(party_level, 'party_level', 1, 20),
          encounterMonsters
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                partySize: party_size,
                partyLevel: party_level,
                monsters: encounterMonsters,
                difficulty: difficulty,
                monsterCount: encounterMonsters.reduce((sum, em) => sum + em.count, 0)
              }, null, 2),
            },
          ],
        };
      }

      case 'get_monsters_by_cr_range': {
        const { min_cr, max_cr } = args || {};

        if (min_cr === undefined || max_cr === undefined) {
          throw new Error('min_cr and max_cr are required');
        }

        const minCr = validateChallengeRating(min_cr, 'min_cr');
        const maxCr = validateChallengeRating(max_cr, 'max_cr');
        const results = await open5eClient.getMonstersByCRRange({
          minCr,
          maxCr,
          environment: optionalString(args?.environment, 'environment'),
          types: validateOptionalStringArray(args?.monster_types, 'monster_types'),
          limit: validateOptionalNumberInput(args?.limit, 'limit', 1, 100),
          scope
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                crRange: `${minCr}-${maxCr}`,
                found: results.count,
                showing: results.results.length,
                hasMore: results.hasMore,
                monsters: results.results
              }, null, 2),
            },
          ],
        };
      }

      // Player-focused character build helper tools
      case 'generate_character_build': {
        const build = await characterBuilder.build({
          preferredClass: optionalString(args?.preferred_class, 'preferred_class'),
          preferredRace: optionalString(args?.preferred_race, 'preferred_race'),
          preferredBackground: optionalString(args?.preferred_background, 'preferred_background'),
          playstyle: optionalString(args?.playstyle, 'playstyle') as Playstyle | undefined,
          campaignType: optionalString(args?.campaign_type, 'campaign_type') as CampaignType | undefined,
          experienceLevel: optionalString(args?.experience_level, 'experience_level') as ExperienceLevel | undefined,
          focusLevel: validateOptionalNumberInput(args?.focus_level, 'focus_level', 1, 20),
          allowMulticlass: args?.allow_multiclass === undefined ? undefined : Boolean(args.allow_multiclass),
          preferredAbilityScores: validateOptionalStringArray(args?.preferred_ability_scores, 'preferred_ability_scores') as Ability[] | undefined,
          scope
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(build, null, 2),
            },
          ],
        };
      }

      case 'compare_character_builds': {
        const { build_options } = args || {};

        if (!Array.isArray(build_options) || build_options.length === 0) {
          throw new Error('build_options must be a non-empty array');
        }
        if (build_options.length > 5) {
          throw new Error('compare at most 5 builds at a time');
        }

        const campaignType = optionalString(args?.campaign_type, 'campaign_type') as CampaignType | undefined;
        const focusLevel = validateOptionalNumberInput(args?.focus_level, 'focus_level', 1, 20);
        const builds = await Promise.all(
          build_options.map(async (option: any, i: number) => {
            const build = await characterBuilder.build({
              preferredClass: optionalString(option?.preferred_class, `build_options[${i}].preferred_class`),
              preferredRace: optionalString(option?.preferred_race, `build_options[${i}].preferred_race`),
              playstyle: optionalString(option?.playstyle, `build_options[${i}].playstyle`) as Playstyle | undefined,
              campaignType,
              focusLevel,
              scope
            });
            return {
              name: optionalString(option?.name, `build_options[${i}].name`) || build.name,
              build
            };
          })
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                comparison: builds,
                summary: builds.map(b => ({
                  name: b.name,
                  race: b.build.race.name,
                  class: b.build.class.name,
                  subclass: b.build.class.subclass?.name ?? null,
                  background: b.build.background.name,
                  playstyle: b.build.playstyle,
                  hitPoints: b.build.hitPoints.atLevel,
                  keyAbilityScores: Object.fromEntries(b.build.abilityScorePriority.slice(0, 2)
                    .map(ability => [ability, b.build.abilityScores.atLevel[ability]])),
                  strengths: b.build.strengths,
                  weaknesses: b.build.weaknesses
                }))
              }, null, 2),
            },
          ],
        };
      }

      case 'get_build_recommendations': {
        const partyClasses = validateOptionalStringArray(args?.existing_party, 'existing_party');
        const campaignType = optionalString(args?.campaign_type, 'campaign_type') as CampaignType | undefined;
        if (!partyClasses || !campaignType) {
          throw new Error('existing_party and campaign_type are required');
        }
        const focusLevel = validateOptionalNumberInput(args?.party_level, 'party_level', 1, 20);
        const missingRoles = validateOptionalStringArray(args?.missing_roles, 'missing_roles') ?? [];

        // Which roles the party already covers, by class.
        const covers = (classes: string[]) => partyClasses.some(cls => classes.includes(cls.toLowerCase()));
        const coverage = {
          support: covers(['cleric', 'druid', 'bard', 'paladin']),
          tank: covers(['fighter', 'paladin', 'barbarian']),
          damage: covers(['fighter', 'barbarian', 'rogue', 'ranger', 'warlock', 'sorcerer']),
          utility: covers(['wizard', 'bard', 'rogue', 'ranger'])
        };
        // Roles asked for explicitly count as missing; "face" and "skill_monkey" are utility.
        for (const role of missingRoles) {
          const mapped = role === 'face' || role === 'skill_monkey' ? 'utility' : role;
          if (mapped in coverage) coverage[mapped as keyof typeof coverage] = false;
        }

        const wanted: Array<{ role: string; playstyle: Playstyle; priority: string }> = [];
        if (!coverage.support) wanted.push({ role: 'healer/support', playstyle: 'support', priority: 'high' });
        if (!coverage.tank) wanted.push({ role: 'tank', playstyle: 'tank', priority: 'high' });
        if (!coverage.damage) wanted.push({ role: 'damage dealer', playstyle: 'damage', priority: 'medium' });
        if (!coverage.utility) wanted.push({ role: 'utility/skills', playstyle: 'utility', priority: 'medium' });
        if (wanted.length === 0) wanted.push({ role: 'balanced/flexible', playstyle: 'balanced', priority: 'low' });

        const recommendations = await Promise.all(wanted.map(async ({ role, playstyle, priority }) => ({
          role,
          priority,
          build: await characterBuilder.build({ playstyle, campaignType, focusLevel, scope })
        })));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                partyAnalysis: {
                  existingClasses: partyClasses,
                  hasHealer: coverage.support,
                  hasTank: coverage.tank,
                  hasDamage: coverage.damage,
                  hasUtility: coverage.utility
                },
                recommendations,
                summary: `Based on your party of ${partyClasses.join(', ')}, here are ${recommendations.length} recommended character builds to fill missing roles.`
              }, null, 2),
            },
          ],
        };
      }

      // Utility tools
      case 'get_api_stats': {
        const stats = open5eClient.getCacheStats();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                cache: stats,
                version: '2.0.0',
                apiSource: 'Open5e API',
                capabilities: [
                  'Enhanced spell search with filtering and class-specific spell lists',
                  'Complete class progression data',
                  'Working race functionality with detailed traits',
                  'Monster stat blocks (3000+ monsters)',
                  'Weapon and armor equipment data',
                  'Magic items database with rarity filtering',
                  'Feats database with prerequisite filtering',
                  'Complete conditions reference system',
                  'Character backgrounds with rich details and benefits',
                  'Rules sections for quick game rule lookups',
                  'Advanced search and filtering',
                  'Intelligent caching system'
                ]
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('D&D MCP Server (Open5e) started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});