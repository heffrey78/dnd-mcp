/**
 * Feat prerequisites, which Open5e gives as text: "Strength 13 or higher",
 * "Level 4+, Strength or Dexterity 13+", "Spellcasting Feature". Each clause
 * is checked against the character; one that cannot be read makes the
 * prerequisite "unknown", and an unknown feat is never suggested.
 */

import { ABILITIES, type Ability } from '../class-rules.js';
import type { AbilityScores } from './types.js';

export interface CharacterFacts {
  level: number;
  scores: AbilityScores;
  canCastSpells: boolean;
  /** Names of every class feature the character has, lower case. */
  features: string[];
}

export type PrerequisiteResult = 'met' | 'unmet' | 'unknown';

export function checkPrerequisite(text: string | null | undefined, character: CharacterFacts): PrerequisiteResult {
  if (!text || !text.trim()) return 'met';

  const results = text.split(/,|;|\band\b/i)
    .map(clause => clause.trim())
    .filter(Boolean)
    .map(clause => checkClause(clause, character));

  if (results.includes('unmet')) return 'unmet';
  if (results.includes('unknown')) return 'unknown';
  return 'met';
}

function checkClause(clause: string, character: CharacterFacts): PrerequisiteResult {
  const level = /^level (\d+)\+?$/i.exec(clause) ?? /^(\d+)(?:st|nd|rd|th) level$/i.exec(clause);
  if (level) return character.level >= Number(level[1]) ? 'met' : 'unmet';

  // "Strength 13 or higher", "Strength or Dexterity 13+"
  const score = /^([a-z]+)(?: or ([a-z]+))? (\d+)(?:\+| or higher)$/i.exec(clause);
  if (score) {
    const abilities = [score[1], score[2]].filter(Boolean).map(a => a.toLowerCase());
    if (!abilities.every(a => (ABILITIES as readonly string[]).includes(a))) return 'unknown';
    return abilities.some(a => character.scores[a as Ability] >= Number(score[3])) ? 'met' : 'unmet';
  }

  if (/spellcasting feature|ability to cast (?:at least one )?spell/i.test(clause)) {
    return character.canCastSpells ? 'met' : 'unmet';
  }

  // "Fighting Style Feature", "Pact Magic Feature": a named class feature.
  const feature = /^(.+?) feature$/i.exec(clause);
  if (feature) return character.features.includes(feature[1].toLowerCase()) ? 'met' : 'unmet';

  return 'unknown';
}
