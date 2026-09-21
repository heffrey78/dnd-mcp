/**
 * Using 2014 options in a 2024 build, as the 2024 Player's Handbook allows
 * (chapter 2, backgrounds and species from older books):
 *
 * - a 2014 species keeps its traits but not its ability score increases,
 *   which come from the background instead;
 * - a 2014 background gives +2 to one ability and +1 to another (or +1 to
 *   three) and an Origin feat;
 * - a 2014 feat is a General feat, never an Origin feat.
 *
 * This is not in SRD 5.2; see docs/adr/008-default-to-2024.md for why it is
 * applied. Pure.
 */

import { ABILITIES, type Ability } from '../class-rules.js';
import type { AbilityIncreases } from '../species.js';

export type BuildRuleset = '5e-2014' | '5e-2024';

/** A 2014 option in a 2024 build. A5e and unlabelled content are left alone. */
export function isLegacy(optionRuleset: string | null | undefined, buildRuleset: BuildRuleset): boolean {
  return buildRuleset === '5e-2024' && optionRuleset === '5e-2014';
}

const NONE: AbilityIncreases = { fixed: {}, choices: [] };

/** The species increases a build applies: none for a 2014 species in a 2024 build. */
export function speciesIncreasesFor(
  increases: AbilityIncreases, speciesRuleset: string | null | undefined, buildRuleset: BuildRuleset
): AbilityIncreases {
  return isLegacy(speciesRuleset, buildRuleset) ? NONE : increases;
}

/** A 2014 background in a 2024 build may raise any ability. */
export const LEGACY_BACKGROUND_ABILITIES: readonly Ability[] = ABILITIES;
