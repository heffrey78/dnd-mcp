/**
 * Ability score generation and increases. Pure; rules cited inline.
 */

import { ABILITIES, type Ability } from '../class-rules.js';
import type { AbilityIncreases } from '../species.js';
import type { AbilityScores } from './types.js';

/** PHB (2014) p.13 and SRD 5.2 "Generate Your Ability Scores": the standard array. */
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

/** No score can exceed 20 through increases (SRD 5.1 class "Ability Score Improvement"; SRD 5.2). */
export const SCORE_CAP = 20;

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function modifiers(scores: AbilityScores): AbilityScores {
  return Object.fromEntries(ABILITIES.map(a => [a, abilityModifier(scores[a])])) as AbilityScores;
}

/** Every ability once, in `preferred` order first and `fallback` order after. */
export function priorityOrder(...lists: readonly (readonly Ability[])[]): Ability[] {
  const order: Ability[] = [];
  for (const ability of [...lists.flat(), ...ABILITIES]) {
    if (!order.includes(ability)) order.push(ability);
  }
  return order;
}

/** The standard array assigned highest-first down `order`. */
export function assignStandardArray(order: readonly Ability[]): AbilityScores {
  const full = priorityOrder(order);
  return Object.fromEntries(full.map((ability, i) => [ability, STANDARD_ARRAY[i]])) as AbilityScores;
}

/**
 * Applies fixed increases, then spends each choice on the highest-priority
 * abilities it allows, never pushing a score past the cap.
 */
export function applyIncreases(
  scores: AbilityScores,
  increases: AbilityIncreases,
  priority: readonly Ability[],
  label: string
): { scores: AbilityScores; steps: string[] } {
  const next = { ...scores };
  const steps: string[] = [];

  for (const [ability, amount] of Object.entries(increases.fixed) as Array<[Ability, number]>) {
    const applied = Math.min(amount, SCORE_CAP - next[ability]);
    if (applied > 0) {
      next[ability] += applied;
      steps.push(`${label}: +${applied} ${ability}`);
    }
  }

  for (const choice of increases.choices) {
    const allowed = priorityOrder(priority).filter(ability =>
      (!choice.from || choice.from.includes(ability)) &&
      !(choice.exclude ?? []).includes(ability) &&
      next[ability] + choice.amount <= SCORE_CAP);
    for (const ability of allowed.slice(0, choice.count)) {
      next[ability] += choice.amount;
      steps.push(`${label}: +${choice.amount} ${ability} (chosen)`);
    }
  }

  return { scores: next, steps };
}

/**
 * SRD 5.2 "Background" ability scores: increase one of the three listed by 2
 * and another by 1 (the alternative, +1 to all three, is never better for a
 * focused build).
 */
export function backgroundIncreases(listed: readonly Ability[], priority: readonly Ability[]): AbilityIncreases {
  const ordered = priorityOrder(priority).filter(ability => listed.includes(ability));
  const fixed: Partial<Record<Ability, number>> = {};
  if (ordered[0]) fixed[ordered[0]] = 2;
  if (ordered[1]) fixed[ordered[1]] = 1;
  return { fixed, choices: [] };
}

/**
 * Ability Score Improvements at each level in `levels`: +2 to the first
 * ability in `priority` below the cap, or +1 to each of two when the first is
 * at 19 (SRD 5.1 class feature "Ability Score Improvement").
 */
export function planImprovements(
  scores: AbilityScores,
  levels: readonly number[],
  priority: readonly Ability[]
): { scores: AbilityScores; choices: Array<{ level: number; text: string }> } {
  const next = { ...scores };
  const choices: Array<{ level: number; text: string }> = [];
  const order = priorityOrder(priority);

  for (const level of levels) {
    const open = order.filter(ability => next[ability] < SCORE_CAP);
    if (open.length === 0) {
      choices.push({ level, text: 'Every ability is at 20: take a feat' });
      continue;
    }
    const first = open[0];
    if (next[first] <= SCORE_CAP - 2 || open.length === 1) {
      const amount = Math.min(2, SCORE_CAP - next[first]);
      next[first] += amount;
      choices.push({ level, text: `Ability Score Improvement: +${amount} ${first} (to ${next[first]})` });
    } else {
      const second = open[1];
      next[first] += 1;
      next[second] += 1;
      choices.push({ level, text: `Ability Score Improvement: +1 ${first}, +1 ${second}` });
    }
  }

  return { scores: next, choices };
}

/**
 * How much an increase set can add to a class's key abilities, the first
 * counted double. Used to rank species for a class.
 */
export function increaseFit(increases: AbilityIncreases, keyAbilities: readonly Ability[]): number {
  if (keyAbilities.length === 0) return 0;
  const zero = Object.fromEntries(ABILITIES.map(a => [a, 10])) as AbilityScores;
  const { scores } = applyIncreases(zero, increases, keyAbilities, '');
  return keyAbilities.reduce((sum, ability, i) => sum + (scores[ability] - 10) * (i === 0 ? 2 : 1), 0) +
    (scores.constitution - 10) * 0.5;
}
