import type { Ability, CasterType } from '../class-rules.js';
import type { ContentScope, SourceLabel } from '../sources.js';
import type { AbilityIncreases } from '../species.js';

export type Playstyle = 'damage' | 'support' | 'tank' | 'utility' | 'balanced';
export type CampaignType = 'combat' | 'roleplay' | 'exploration' | 'mixed';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export const PLAYSTYLES: readonly Playstyle[] = ['damage', 'support', 'tank', 'utility', 'balanced'];
export const CAMPAIGN_TYPES: readonly CampaignType[] = ['combat', 'roleplay', 'exploration', 'mixed'];
export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

export interface CharacterBuildOptions {
  preferredClass?: string;
  preferredRace?: string;
  preferredBackground?: string;
  playstyle?: Playstyle;
  campaignType?: CampaignType;
  experienceLevel?: ExperienceLevel;
  /** Character level to build to, 1-20 (default 5). */
  focusLevel?: number;
  /** Multiclass builds are not generated; true is rejected. */
  allowMulticlass?: boolean;
  preferredAbilityScores?: Ability[];
  /** Sources to build from. Default: the 2024 SRD only. */
  scope?: ContentScope;
  /**
   * More Open5e documents to draw backgrounds from, on top of `scope`. Only
   * the background widens; species, feats and spells stay in `scope`.
   */
  backgroundSources?: string[];
}

export type AbilityScores = Record<Ability, number>;

export interface BuildChoice {
  name: string;
  key: string;
  source: SourceLabel;
}

export interface SpellSuggestion {
  name: string;
  key: string;
  level: number;
  /** Why it was picked: "damage", "healing", "control", "buff" or "utility". */
  roles: string[];
  source: SourceLabel;
}

export interface CharacterBuildData {
  id: string;
  name: string;
  description: string;
  level: number;
  playstyle: Playstyle;
  campaignType: CampaignType;
  /** Rules edition the numbers follow. */
  ruleset: '5e-2014' | '5e-2024';
  /** Every document the build draws on. */
  sources: SourceLabel[];

  race: BuildChoice & {
    sizeCategories: string[];
    walkingSpeed: number | null;
    abilityScoreIncreases: AbilityIncreases;
    traits: string[];
  };
  class: BuildChoice & {
    hitDie: string;
    primaryAbility: string[];
    savingThrows: string[];
    casterType: CasterType | null;
    subclass: (BuildChoice & { features: string[] }) | null;
  };
  background: BuildChoice & {
    skillProficiencies: string;
    feature: string;
    /** 2024 backgrounds grant an origin feat. */
    originFeat?: string;
  };

  abilityScores: {
    method: string;
    /** The standard array as assigned, before any increase. */
    base: AbilityScores;
    /** After species or background increases: the 1st-level scores. */
    atFirstLevel: AbilityScores;
    /** After every Ability Score Improvement up to `level`. */
    atLevel: AbilityScores;
    modifiers: AbilityScores;
    /** Each increase applied, in order. */
    steps: string[];
  };
  abilityScorePriority: Ability[];
  hitPoints: { atLevel: number; method: string };
  proficiencyBonus: number;
  spellcasting: {
    ability: Ability;
    saveDC: number;
    attackBonus: number;
    /** Slots per spell level at `level`, index 0 = 1st. */
    slots: number[];
    pactMagic: boolean;
    cantripsKnown: number | null;
    /** Spells known or prepared at `level`; null when the class does neither. */
    spellsKnownOrPrepared: number | null;
    suggested: SpellSuggestion[];
  } | null;

  levelProgression: Array<{ level: number; features: string[]; choices: string[] }>;
  suggestedFeats: Array<BuildChoice & { why: string; prerequisite: string }>;
  startingEquipment: { class?: string; background?: string };
  strengths: string[];
  weaknesses: string[];
  buildStrategy: string;
  /** Anything the build could not decide or had to leave out. */
  warnings: string[];
  notes: string[];
}
