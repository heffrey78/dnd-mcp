/**
 * Reading species traits, which Open5e gives as prose.
 *
 * A subspecies lists only what it adds, so its size, speed and ability
 * increases come partly from its parent. Some parents defer further: a
 * darakhul's size "is determined by your Heritage Subrace", and a Halfling
 * Heritage darakhul was a halfling, so its size is a halfling's. Everything
 * here is pure; open5e-client.ts fetches the species it names.
 */

import { ABILITIES, type Ability } from './class-rules.js';

export interface AbilityChoice {
  /** How many different abilities to pick. */
  count: number;
  amount: number;
  /** Abilities to pick from; every ability when absent. */
  from?: Ability[];
  /** Abilities that may not be picked. */
  exclude?: Ability[];
}

export interface AbilityIncreases {
  fixed: Partial<Record<Ability, number>>;
  choices: AbilityChoice[];
}

export interface ParsedIncreases extends AbilityIncreases {
  /** Text that looked like an increase but could not be read, e.g. a misspelt ability. */
  warnings: string[];
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3 };

function asAbility(word: string): Ability | null {
  const lower = word.toLowerCase();
  return (ABILITIES as readonly string[]).includes(lower) ? lower as Ability : null;
}

/**
 * Parses an "Ability Score Increase" trait. Handles the SRD and Tome of
 * Heroes phrasings; anything that mentions an increase but is not understood
 * becomes a warning rather than a guess.
 */
export function parseAbilityScoreIncreases(text: string | null | undefined): ParsedIncreases {
  const result: ParsedIncreases = { fixed: {}, choices: [], warnings: [] };
  if (!text) return result;
  // Markdown emphasis and a leading "Ability Score Increase." label are not content.
  let rest = text.replace(/\*|_/g, '').replace(/^\s*ability score increases?\.?/i, '');

  const take = (pattern: RegExp, handle: (match: RegExpExecArray) => void) => {
    rest = rest.replace(pattern, (...args) => {
      handle(args.slice(0, -2) as unknown as RegExpExecArray);
      return ' ';
    });
  };

  // "Your ability scores each increase by 1." (Human)
  take(/your ability scores each increase by (\d+)/gi, m => {
    for (const ability of ABILITIES) result.fixed[ability] = (result.fixed[ability] ?? 0) + Number(m[1]);
  });

  // "Your Strength or Dexterity score increases by 1." /
  // "you can choose to increase either your Wisdom or Charisma score by 1"
  take(/(?:(?:you can choose to )?increase )?(?:either )?your ([a-z]+) or ([a-z]+) score (?:increases )?by (\d+)/gi, m => {
    const options = [asAbility(m[1]), asAbility(m[2])];
    if (options.some(a => a === null)) {
      result.warnings.push(`Unrecognised ability in "${m[0].trim()}"`);
      return;
    }
    result.choices.push({ count: 1, amount: Number(m[3]), from: options as Ability[] });
  });

  // "Your Dexterity score increases by 2", "your Charisma score increases by 1".
  // Read before the choices, which may exclude these ("two other ...").
  take(/your ([a-z]+) score increases by (\d+)/gi, m => {
    const ability = asAbility(m[1]);
    if (!ability) {
      result.warnings.push(`Unrecognised ability "${m[1]}" in "${m[0].trim()}"`);
      return;
    }
    result.fixed[ability] = (result.fixed[ability] ?? 0) + Number(m[2]);
  });

  // "One ability score of your choice, other than Constitution, increases by 2."
  // "two other ability scores of your choice increase by 1"
  // "Two different ability scores of your choice increase by 1."
  take(/(one|two|three) (other |different )?ability scores? of your choice(?:, other than ([a-z]+),)? increases? by (\d+)/gi, m => {
    const choice: AbilityChoice = { count: NUMBER_WORDS[m[1].toLowerCase()], amount: Number(m[4]) };
    const excluded = m[3] ? asAbility(m[3]) : null;
    if (m[3] && !excluded) {
      result.warnings.push(`Unrecognised ability in "${m[0].trim()}"`);
      return;
    }
    // "other" excludes the abilities this trait already raised.
    const exclude = [
      ...(excluded ? [excluded] : []),
      ...(m[2]?.trim() === 'other' ? Object.keys(result.fixed) as Ability[] : [])
    ];
    if (exclude.length > 0) choice.exclude = exclude;
    result.choices.push(choice);
  });

  if (/increase/i.test(rest)) {
    result.warnings.push(`Could not read ability score increase: "${text.trim()}"`);
  }
  return result;
}

/** Combines increases, e.g. a parent species' and its subspecies'. */
export function combineIncreases(...parts: AbilityIncreases[]): AbilityIncreases {
  const combined: AbilityIncreases = { fixed: {}, choices: [] };
  for (const part of parts) {
    for (const [ability, amount] of Object.entries(part.fixed) as Array<[Ability, number]>) {
      combined.fixed[ability] = (combined.fixed[ability] ?? 0) + amount;
    }
    combined.choices.push(...part.choices);
  }
  return combined;
}

/**
 * True when a size or speed trait defers to another species instead of
 * giving a value: "Your size is determined by your Heritage Subrace.",
 * "A mushroomfolk's size is determined by its subrace."
 */
export function isDeferredTrait(text: string | null | undefined): boolean {
  return !!text && /determined by (?:your|its)\b/i.test(text);
}

const SIZES = ['Tiny', 'Small', 'Medium', 'Large'] as const;

/**
 * Size categories a species may be. "Your size is Small." gives one; the
 * 2024 "Medium (...) or Small (...), chosen when you select this species"
 * gives a choice of two.
 */
export function parseSizeCategories(text: string | null | undefined): string[] {
  if (!text || isDeferredTrait(text)) return [];
  const stated = /your size is (tiny|small|medium|large)/i.exec(text);
  if (stated) return [stated[1][0].toUpperCase() + stated[1].slice(1).toLowerCase()];
  return SIZES
    .map(size => ({ size, at: text.search(new RegExp(`\\b${size}\\b`)) }))
    .filter(({ at }) => at !== -1)
    .sort((a, b) => a.at - b.at)
    .map(({ size }) => size);
}

/** Walking speed in feet: "Your base walking speed is 25 feet.", "30 feet". */
export function parseWalkingSpeed(text: string | null | undefined): number | null {
  if (!text || isDeferredTrait(text)) return null;
  const match = /walking speed (?:is|of) (\d+) feet/i.exec(text) ?? /^\s*(\d+) feet/i.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * The species a heritage or chassis subspecies was before: "Halfling
 * Heritage" -> ["Halfling"], "Elf/Shadow Fey Heritage" -> ["Elf", "Shadow
 * Fey"]. Empty for any other name.
 */
export function originSpeciesNames(name: string): string[] {
  const match = /^(.+?)\s+(?:heritage|chassis)$/i.exec(name.trim());
  if (!match) return [];
  return match[1].split('/').map(part => part.trim()).filter(Boolean);
}
