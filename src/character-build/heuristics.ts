/**
 * Judgment calls the build engine scores with. Unlike class-rules.ts these
 * are not game rules and cite nothing: they are one opinion of how well a
 * class fills a role, which spells suit a playstyle, and so on. They live in
 * one place so they can be read, argued with and changed without touching
 * the engine.
 */

import type { Ability } from '../class-rules.js';
import type { CampaignType, Playstyle } from './types.js';

type Role = Exclude<Playstyle, 'balanced'>;

/** How well each SRD class fills each role, 0-5. */
export const CLASS_ROLE_FIT: Readonly<Record<string, Record<Role, number>>> = {
  barbarian: { damage: 4, support: 0, tank: 5, utility: 1 },
  bard: { damage: 2, support: 5, tank: 1, utility: 5 },
  cleric: { damage: 2, support: 5, tank: 4, utility: 3 },
  druid: { damage: 3, support: 4, tank: 2, utility: 4 },
  fighter: { damage: 5, support: 1, tank: 5, utility: 1 },
  monk: { damage: 4, support: 1, tank: 2, utility: 3 },
  paladin: { damage: 4, support: 3, tank: 5, utility: 1 },
  ranger: { damage: 4, support: 2, tank: 2, utility: 4 },
  rogue: { damage: 5, support: 1, tank: 1, utility: 5 },
  sorcerer: { damage: 5, support: 2, tank: 0, utility: 3 },
  warlock: { damage: 5, support: 1, tank: 1, utility: 3 },
  wizard: { damage: 4, support: 3, tank: 0, utility: 5 }
};

/** Extra fit for a campaign's emphasis, 0-2. Classes not listed get 0. */
export const CLASS_CAMPAIGN_FIT: Readonly<Record<Exclude<CampaignType, 'mixed'>, Record<string, number>>> = {
  combat: { barbarian: 2, fighter: 2, paladin: 2, monk: 1, ranger: 1, warlock: 1 },
  roleplay: { bard: 2, warlock: 1, sorcerer: 1, paladin: 1, cleric: 1, rogue: 1 },
  exploration: { ranger: 2, druid: 2, rogue: 1, monk: 1, bard: 1, wizard: 1 }
};

/** A class's fit for a playstyle: its role score, or its average for "balanced". */
export function roleFit(className: string, playstyle: Playstyle): number | null {
  const fit = CLASS_ROLE_FIT[className.toLowerCase()];
  if (!fit) return null;
  if (playstyle === 'balanced') {
    const values = Object.values(fit);
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  return fit[playstyle];
}

/**
 * How much a species' fit to a class's key abilities counts against the
 * class's role fit. A +2 to the main ability scores 4 before weighting.
 */
export const SPECIES_FIT_WEIGHT = 0.5;

export function campaignFit(className: string, campaign: CampaignType): number {
  return campaign === 'mixed' ? 0 : CLASS_CAMPAIGN_FIT[campaign][className.toLowerCase()] ?? 0;
}

/**
 * Order to fill the standard array after a class's key abilities.
 * Constitution first (hit points, concentration), then what protects and
 * moves the character, then the rest.
 */
export const ABILITY_FILL_ORDER: Readonly<Record<Playstyle, Ability[]>> = {
  damage: ['constitution', 'dexterity', 'wisdom', 'strength', 'charisma', 'intelligence'],
  support: ['constitution', 'dexterity', 'wisdom', 'charisma', 'intelligence', 'strength'],
  tank: ['constitution', 'strength', 'dexterity', 'wisdom', 'charisma', 'intelligence'],
  utility: ['dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'strength'],
  balanced: ['constitution', 'dexterity', 'wisdom', 'charisma', 'intelligence', 'strength']
};

/** For "Strength or Dexterity" classes (the Fighter): which one a playstyle leans on. */
export const EITHER_ABILITY_BY_PLAYSTYLE: Readonly<Record<Playstyle, Ability>> = {
  damage: 'dexterity', support: 'strength', tank: 'strength', utility: 'dexterity', balanced: 'strength'
};

export type SpellRole = 'damage' | 'healing' | 'control' | 'buff' | 'utility';

/** How much each spell role counts for a playstyle. */
export const SPELL_ROLE_WEIGHTS: Readonly<Record<Playstyle, Record<SpellRole, number>>> = {
  damage: { damage: 3, control: 2, buff: 0.5, healing: 0, utility: 0.5 },
  support: { healing: 3, buff: 3, control: 2, damage: 1, utility: 1 },
  tank: { buff: 2, control: 2, healing: 2, damage: 1, utility: 0.5 },
  utility: { utility: 3, control: 2, buff: 1.5, damage: 1, healing: 1 },
  balanced: { healing: 2.5, damage: 2, control: 2, buff: 2, utility: 1.5 }
};

/** "takes 3d8 damage", "1d8 fire damage", "force damage equal to 1d8". */
const DICE_DAMAGE = /\d+d\d+[^.]*\bdamage\b|\bdamage equal to \d+d\d+/i;
/** "you take", "you and any creature ... each take", "deals 6d6 damage to you". */
const SELF_DAMAGE = /\byou (?:and [^.]*? )?(?:each )?take\b|\bdamage to you\b/i;

function dealsDiceDamage(description: string): boolean {
  const mainEffect = description.trim().split(/\n\s*\n/)[0];
  return mainEffect.split(/(?<=\.)\s+/).some(s => DICE_DAMAGE.test(s) && !SELF_DAMAGE.test(s));
}

const CONDITIONS = /\b(charmed|frightened|restrained|paralyzed|incapacitated|stunned|prone|blinded|deafened|petrified|slowed)\b/i;

/** The roles a spell plays, from its structured fields and description. */
export function spellRoles(spell: {
  description: string; damageRoll?: string; damageTypes: string[]; attackRoll?: boolean; savingThrow?: string;
  ritual: boolean;
}): SpellRole[] {
  const text = spell.description;
  const roles: SpellRole[] = [];
  // Open5e's damage fields cannot be trusted alone. 2024 rows put healing and
  // bonus dice in damage_roll (Cure Wounds 2d8, Bless 1d4) and set attack_roll
  // on spells that only mention attacks (Bless, Invisibility); most 2014 rows
  // leave them empty (Magic Missile, Sacred Flame). So a roll counts only with
  // a damage type, and otherwise the main effect (the first paragraph) must
  // deal dice of damage to someone other than the caster: Meld into Stone and
  // Contact Other Plane hurt you, and Chromatic Orb's type is chosen on casting.
  if (((spell.damageRoll || spell.attackRoll) && spell.damageTypes.length > 0) || dealsDiceDamage(text)) {
    roles.push('damage');
  }
  // "can't regain hit points" (Chill Touch) is the opposite of healing.
  if (/(?<!can't |cannot |can’t )regains? (?:a number of )?hit points|(?<!can't |cannot |can’t )regain \d+d\d+/i.test(text)) {
    roles.push('healing');
  }
  if (spell.savingThrow && CONDITIONS.test(text)) roles.push('control');
  // \b keeps "disadvantage on" (Vicious Mockery) from reading as a buff.
  if (/\badvantage on|bonus to (?:AC|attack|saving|ability)|temporary hit points|\bresistance to\b|roll a d4 and add/i.test(text) &&
      !roles.includes('damage')) roles.push('buff');
  if (roles.length === 0 || spell.ritual) roles.push('utility');
  return roles;
}

/**
 * Widely used SRD spells, by name. Keyword roles cannot tell Shield from
 * Alarm, so a staple gets a bonus; without one, ties would fall to
 * alphabetical order. Names are matched case-insensitively across editions.
 */
export const STAPLE_SPELLS: ReadonlySet<string> = new Set([
  // Cantrips
  'eldritch blast', 'fire bolt', 'sacred flame', 'guidance', 'mage hand', 'minor illusion',
  'vicious mockery', 'ray of frost', 'shocking grasp', 'prestidigitation', 'spare the dying', 'shillelagh',
  // 1st
  'shield', 'magic missile', 'healing word', 'cure wounds', 'bless', 'sleep', 'faerie fire',
  'detect magic', 'guiding bolt', 'thunderwave', "hunter's mark", 'command', 'sanctuary', 'hex',
  'find familiar', 'entangle', 'goodberry',
  // 2nd
  'misty step', 'hold person', 'spiritual weapon', 'invisibility', 'suggestion', 'shatter', 'web',
  'lesser restoration', 'aid', 'moonbeam', 'pass without trace', 'scorching ray',
  // 3rd
  'fireball', 'counterspell', 'hypnotic pattern', 'spirit guardians', 'revivify', 'haste', 'fly',
  'dispel magic', 'lightning bolt', 'mass healing word', 'conjure animals', 'call lightning',
  // 4th
  'polymorph', 'banishment', 'greater invisibility', 'dimension door', 'wall of fire', 'death ward',
  // 5th
  'wall of force', 'cone of cold', 'greater restoration', 'raise dead', 'hold monster',
  'mass cure wounds', 'telekinesis', 'animate objects',
  // 6th-9th
  'disintegrate', 'heal', 'globe of invulnerability', 'chain lightning', 'true seeing',
  'forcecage', 'plane shift', 'teleport', 'regenerate', 'resurrection',
  'maze', 'dominate monster', 'holy aura', 'sunburst',
  'wish', 'meteor swarm', 'time stop', 'foresight', 'mass heal', 'true resurrection', 'power word kill'
]);

/** Score bonus for a staple spell, on the scale of SPELL_ROLE_WEIGHTS. */
export const STAPLE_SPELL_BONUS = 2;

/** Words in a feat's text that suggest it suits a playstyle. */
export const FEAT_KEYWORDS: Readonly<Record<Playstyle, RegExp>> = {
  damage: /\b(damage|attack rolls?|extra attack|critical|reroll)\b/i,
  support: /\b(allies|ally|heal|regain hit points|inspire|help action)\b/i,
  tank: /\b(armor class|\bAC\b|hit point maximum|resistance|opportunity attack|shield)\b/i,
  utility: /\b(proficiency|skill|expertise|tool|language|advantage on .*checks)\b/i,
  balanced: /\b(initiative|hit point maximum)\b/i
};

export const PLAYSTYLE_NAMES: Readonly<Record<Playstyle, string>> = {
  damage: 'Destroyer', support: 'Guardian', tank: 'Bulwark', utility: 'Versatile', balanced: 'Adaptable'
};

export const PLAYSTYLE_DESCRIPTIONS: Readonly<Record<Playstyle, string>> = {
  damage: 'focused on dealing damage',
  support: 'built to keep allies standing and control the battlefield',
  tank: 'built to absorb damage and protect the party',
  utility: 'built for problem-solving and skill coverage',
  balanced: 'well-rounded for any situation'
};

export const EXPERIENCE_TIPS: Readonly<Record<string, string>> = {
  beginner: 'Learn your core class features first and lean on simple, reliable actions.',
  intermediate: 'Combine species traits with class features and plan your Ability Score Improvements.',
  advanced: 'Squeeze value from action economy, concentration and feat choices.'
};
