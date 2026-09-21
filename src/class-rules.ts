/**
 * Class rules that Open5e does not supply reliably, kept in code with their
 * source so a unit test fails if the numbers drift.
 *
 * Open5e leaves `primary_abilities` empty for every SRD class and
 * `caster_type` null for all 2014 ones, and its 2014 spell-slot columns have
 * gaps (the Bard's 2nd-level slots skip 3rd level). These tables cover the
 * twelve SRD classes; anything else is reported as unknown, not guessed.
 */

export type Ability =
  'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

export const ABILITIES: readonly Ability[] =
  ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

export type CasterType = 'full' | 'half' | 'pact' | 'none';

export type Ruleset = '5e-2014' | '5e-2024';

export interface ClassRules {
  /**
   * Abilities the class depends on. Taken from the multiclassing
   * prerequisites (SRD 5.1 p.56; SRD 5.2 "Multiclassing"), which name
   * exactly the abilities each class is built around. `anyOf` means one of
   * them is enough (the Fighter's Strength or Dexterity).
   */
  keyAbilities: { allOf: Ability[] } | { anyOf: Ability[] };
  /** SRD 5.1 / 5.2 class "Spellcasting Ability"; null for non-casters. */
  spellcastingAbility: Ability | null;
  casterType: CasterType;
}

export const CLASS_RULES: Readonly<Record<string, ClassRules>> = {
  barbarian: { keyAbilities: { allOf: ['strength'] }, spellcastingAbility: null, casterType: 'none' },
  bard: { keyAbilities: { allOf: ['charisma'] }, spellcastingAbility: 'charisma', casterType: 'full' },
  cleric: { keyAbilities: { allOf: ['wisdom'] }, spellcastingAbility: 'wisdom', casterType: 'full' },
  druid: { keyAbilities: { allOf: ['wisdom'] }, spellcastingAbility: 'wisdom', casterType: 'full' },
  fighter: { keyAbilities: { anyOf: ['strength', 'dexterity'] }, spellcastingAbility: null, casterType: 'none' },
  monk: { keyAbilities: { allOf: ['dexterity', 'wisdom'] }, spellcastingAbility: null, casterType: 'none' },
  paladin: { keyAbilities: { allOf: ['strength', 'charisma'] }, spellcastingAbility: 'charisma', casterType: 'half' },
  ranger: { keyAbilities: { allOf: ['dexterity', 'wisdom'] }, spellcastingAbility: 'wisdom', casterType: 'half' },
  rogue: { keyAbilities: { allOf: ['dexterity'] }, spellcastingAbility: null, casterType: 'none' },
  sorcerer: { keyAbilities: { allOf: ['charisma'] }, spellcastingAbility: 'charisma', casterType: 'full' },
  warlock: { keyAbilities: { allOf: ['charisma'] }, spellcastingAbility: 'charisma', casterType: 'pact' },
  wizard: { keyAbilities: { allOf: ['intelligence'] }, spellcastingAbility: 'intelligence', casterType: 'full' }
};

/** Rules for an SRD class by name ("Bard", "bard"), or null for any other class. */
export function classRulesFor(className: string): ClassRules | null {
  return CLASS_RULES[className.trim().toLowerCase()] ?? null;
}

export function keyAbilityList(rules: ClassRules): Ability[] {
  return 'allOf' in rules.keyAbilities ? rules.keyAbilities.allOf : rules.keyAbilities.anyOf;
}

/**
 * Spell slots per spell level (index 0 = 1st level) at each class level
 * (index 0 = level 1).
 *
 * Full casters: the Bard/Cleric/Druid/Sorcerer/Wizard tables, which are also
 * the Multiclass Spellcaster table (SRD 5.1 p.57). Identical in SRD 5.2.
 */
const FULL_CASTER_SLOTS: readonly (readonly number[])[] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
];

/**
 * Half casters: the Paladin/Ranger tables. In SRD 5.1 they gain spellcasting
 * at 2nd level; in SRD 5.2 at 1st, with two 1st-level slots. From 2nd level
 * on the two editions agree.
 */
const HALF_CASTER_SLOTS_2014: readonly (readonly number[])[] = [
  [], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]
];
const HALF_CASTER_SLOTS_2024: readonly (readonly number[])[] =
  [[2], ...HALF_CASTER_SLOTS_2014.slice(1)];

/**
 * Warlock Pact Magic (SRD 5.1 and 5.2 Warlock table): every slot is the same
 * level. [slot count, slot level] per class level.
 */
const PACT_SLOTS: readonly (readonly [number, number])[] = [
  [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]
];

export interface SpellSlots {
  /** Slots per spell level, index 0 = 1st level. Empty for non-casters. */
  byLevel: number[];
  /** Highest spell level the character can cast; 0 when none. */
  maxSpellLevel: number;
  /** True for Pact Magic: all slots are maxSpellLevel and recover on a short rest. */
  pact: boolean;
}

export function spellSlots(casterType: CasterType, classLevel: number, ruleset: Ruleset = '5e-2014'): SpellSlots {
  if (!Number.isInteger(classLevel) || classLevel < 1 || classLevel > 20) {
    throw new Error(`Class level must be an integer from 1 to 20 (got ${classLevel})`);
  }
  const index = classLevel - 1;

  switch (casterType) {
    case 'full': {
      const byLevel = [...FULL_CASTER_SLOTS[index]];
      return { byLevel, maxSpellLevel: byLevel.length, pact: false };
    }
    case 'half': {
      const table = ruleset === '5e-2024' ? HALF_CASTER_SLOTS_2024 : HALF_CASTER_SLOTS_2014;
      const byLevel = [...table[index]];
      return { byLevel, maxSpellLevel: byLevel.length, pact: false };
    }
    case 'pact': {
      const [count, level] = PACT_SLOTS[index];
      const byLevel = Array.from({ length: level }, (_, i) => (i === level - 1 ? count : 0));
      return { byLevel, maxSpellLevel: level, pact: true };
    }
    case 'none':
      return { byLevel: [], maxSpellLevel: 0, pact: false };
  }
}

/** Proficiency bonus by character level (SRD 5.1 p.12 / SRD 5.2 Character Advancement). */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

/**
 * Levels at which a class gains an Ability Score Improvement or feat (SRD 5.1
 * and 5.2 class tables). The Fighter and Rogue get extras. In SRD 5.2 the
 * 19th-level slot is an Epic Boon feat instead, so it is not listed there.
 */
export function asiLevels(className: string, ruleset: Ruleset = '5e-2014'): number[] {
  const levels = (() => {
    switch (className.trim().toLowerCase()) {
      case 'fighter': return [4, 6, 8, 12, 14, 16, 19];
      case 'rogue': return [4, 8, 10, 12, 16, 19];
      default: return [4, 8, 12, 16, 19];
    }
  })();
  return ruleset === '5e-2024' ? levels.filter(level => level !== 19) : levels;
}
