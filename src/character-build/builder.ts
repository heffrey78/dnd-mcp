/**
 * Character build generation. Picks a class, species and background from the
 * scoped Open5e data, then works out ability scores, hit points, spellcasting,
 * feats and a level-by-level plan from class-rules.ts and the class's own
 * feature list. Nothing is filled in with placeholder text: what cannot be
 * determined is left out and listed in `warnings`.
 */

import {
  ABILITIES, type Ability, asiLevels, classRulesFor, proficiencyBonus, spellSlots
} from '../class-rules.js';
import type {
  BackgroundData, EnhancedClassData, EnhancedRaceData, EnhancedSpellData, FeatData, Open5eClient
} from '../open5e-client.js';
import { type ContentScope, type SourceLabel, compareRanks, pickByName, sourceRank } from '../sources.js';
import {
  abilityModifier, applyIncreases, assignStandardArray, backgroundIncreases, increaseFit,
  modifiers, planImprovements, priorityOrder
} from './abilities.js';
import {
  ABILITY_FILL_ORDER, EITHER_ABILITY_BY_PLAYSTYLE, EXPERIENCE_TIPS, FEAT_KEYWORDS, PLAYSTYLE_DESCRIPTIONS,
  PLAYSTYLE_NAMES, SPECIES_FIT_WEIGHT, SPELL_ROLE_WEIGHTS, STAPLE_SPELLS, STAPLE_SPELL_BONUS,
  campaignFit, roleFit, spellRoles
} from './heuristics.js';
import { checkPrerequisite } from './prerequisites.js';
import {
  CAMPAIGN_TYPES, EXPERIENCE_LEVELS, PLAYSTYLES,
  type AbilityScores, type CharacterBuildData, type CharacterBuildOptions, type Playstyle, type SpellSuggestion
} from './types.js';

/**
 * Builds use the 2024 SRD unless told otherwise: the current rules, and a set
 * of sources known to fit together (four backgrounds with origin feats, where
 * the 2014 SRD has only Acolyte).
 */
export const DEFAULT_BUILD_SCOPE: ContentScope = { sources: ['srd-2024'] };

type Ruleset = '5e-2014' | '5e-2024';

/** "resistance to poison", "resistance to acid and fire" -- named damage types only. */
const DAMAGE_RESISTANCE = /resistance to (?:\w+ (?:and|or) )?(acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder|bludgeoning|piercing|slashing)\b/gi;

/** Background names that suit a campaign's emphasis. */
const BACKGROUND_THEMES: Record<string, RegExp> = {
  combat: /soldier|gladiator|mercenary|guard|knight/i,
  roleplay: /noble|entertainer|charlatan|acolyte|courtier|guild/i,
  exploration: /outlander|sage|folk hero|hermit|wayfarer|sailor|guide/i
};

export class CharacterBuilder {
  constructor(private readonly client: Open5eClient) {}

  async build(options: CharacterBuildOptions = {}): Promise<CharacterBuildData> {
    const playstyle = oneOf(options.playstyle ?? 'balanced', PLAYSTYLES, 'playstyle');
    const campaignType = oneOf(options.campaignType ?? 'mixed', CAMPAIGN_TYPES, 'campaign_type');
    const experienceLevel = oneOf(options.experienceLevel ?? 'intermediate', EXPERIENCE_LEVELS, 'experience_level');
    const level = options.focusLevel ?? 5;
    if (!Number.isInteger(level) || level < 1 || level > 20) {
      throw new Error(`focus_level must be an integer from 1 to 20 (got ${level})`);
    }
    if (options.allowMulticlass) {
      throw new Error('Multiclass builds are not supported yet; leave allow_multiclass unset');
    }
    const preferredAbilities = (options.preferredAbilityScores ?? []).map(a => oneOf(a, ABILITIES, 'preferred_ability_scores'));

    const scope = options.scope ?? DEFAULT_BUILD_SCOPE;
    await this.client.scopeDocuments(scope); // rejects an unknown ruleset or source up front
    const warnings: string[] = [];
    const notes: string[] = [];
    if (!options.scope) {
      notes.push('Built from the 2024 SRD only. Pass ruleset or sources to draw on other books.');
    }

    // Class and species are chosen together: a class's fit for the
    // playstyle, plus how much the species raises that class's key abilities.
    const classes = (await this.client.searchClasses({ scope })).results;
    const allSpecies = (await this.client.searchRaces('', { limit: 100, scope })).results;
    const hasChildren = (race: EnhancedRaceData) => allSpecies.some(o => o.isSubrace && o.subraceOf === race.key);

    const classCandidates = options.preferredClass
      ? [await this.preferred(classes, options.preferredClass, 'Class', scope, name => this.client.getClassDetails(name))]
      : classes;
    if (classCandidates.length === 0) throw new Error('No classes in the chosen sources');

    let speciesCandidates: EnhancedRaceData[];
    if (options.preferredRace) {
      const picked = await this.preferred(allSpecies, options.preferredRace, 'Species', scope,
        name => this.client.getRaceDetails(name), r => [r.isSubrace ? 1 : 0]);
      speciesCandidates = hasChildren(picked) ? allSpecies.filter(o => o.subraceOf === picked.key) : [picked];
      if (hasChildren(picked)) notes.push(`${picked.name} is played as one of its subspecies.`);
    } else {
      // Fully resolved species only: one whose size or speed is unknown cannot be built.
      speciesCandidates = allSpecies.filter(r =>
        !hasChildren(r) && r.resolved.walkingSpeed !== null && r.resolved.sizeCategories.length > 0);
    }
    if (speciesCandidates.length === 0) throw new Error('No playable species in the chosen sources');

    const pairs = classCandidates.flatMap(candidate => {
      const candidateRules = classRulesFor(candidate.name);
      return speciesCandidates.map(species => {
        const keys = this.keyAbilities(candidate, candidateRules, playstyle, preferredAbilities, species);
        const increases = species.resolved.abilityScoreIncreases;
        const score = (roleFit(candidate.name, playstyle) ?? -1) + campaignFit(candidate.name, campaignType) +
          SPECIES_FIT_WEIGHT * increaseFit(increases, keys) +
          preferredAbilities.reduce((sum, a) => sum + (increases.fixed[a] ?? 0), 0);
        const rank = [-score, sourceRank(candidate.source.key), sourceRank(species.source.key)];
        return { candidate, species, rank, tie: `${candidate.name} ${species.name}` };
      });
    }).sort((x, y) => compareRanks(x.rank, y.rank) || x.tie.localeCompare(y.tie));

    const { candidate: chosenClass, species: race } = pairs[0];
    const tiedSpecies = pairs.filter(p => p.candidate === chosenClass && p.rank[0] === pairs[0].rank[0]);
    if (tiedSpecies.length > 1) {
      notes.push(`${tiedSpecies.length} species fit this ${chosenClass.name} equally well; chose ${race.name}. ` +
        'Name one with preferred_race to choose another.');
    } else if (options.preferredRace && speciesCandidates.length > 1) {
      notes.push(`Chose ${race.name} for its ability increases.`);
    }
    const cls = await this.client.getClassDetails(chosenClass.key, scope);
    if (!cls) throw new Error(`Class ${chosenClass.key} could not be loaded`);

    const ruleset: Ruleset = cls.source.ruleset === '5e-2024' ? '5e-2024' : '5e-2014';
    const rules = classRulesFor(cls.name);
    if (!rules) warnings.push(`${cls.name} is not an SRD class: key abilities and spell slots are not known`);
    warnings.push(...race.resolved.unresolved.map(reason => `${race.name}: ${reason}`));

    const keyAbilities = this.keyAbilities(cls, rules, playstyle, preferredAbilities, race);
    const priority = priorityOrder(keyAbilities, preferredAbilities, ABILITY_FILL_ORDER[playstyle]);

    // Background
    const backgrounds = (await this.client.searchBackgrounds('', { limit: 100, scope })).results;
    const background = options.preferredBackground
      ? await this.preferred(backgrounds, options.preferredBackground, 'Background', scope,
        name => this.client.getBackgroundDetails(name))
      : best(backgrounds, bg => {
        const listed = backgroundAbilities(bg);
        const theme = campaignType !== 'mixed' && BACKGROUND_THEMES[campaignType].test(bg.name) ? 1 : 0;
        return increaseFit(backgroundIncreases(listed, keyAbilities), keyAbilities) + theme;
      }, bg => bg);
    if (!background) throw new Error('No backgrounds in the chosen sources');

    // Ability scores
    const base = assignStandardArray(priority);
    const steps: string[] = [];
    let atFirstLevel = base;
    const speciesIncreases = race.resolved.abilityScoreIncreases;
    const listed = backgroundAbilities(background);
    if (Object.keys(speciesIncreases.fixed).length > 0 || speciesIncreases.choices.length > 0) {
      const applied = applyIncreases(atFirstLevel, speciesIncreases, priority, race.name);
      atFirstLevel = applied.scores;
      steps.push(...applied.steps);
    }
    if (listed.length > 0) {
      const applied = applyIncreases(atFirstLevel, backgroundIncreases(listed, priority), priority, background.name);
      atFirstLevel = applied.scores;
      steps.push(...applied.steps);
      if (speciesIncreases.choices.length > 0 || Object.keys(speciesIncreases.fixed).length > 0) {
        warnings.push('Both the species and the background raise ability scores: the 2014 and 2024 rules are being mixed');
      }
    }
    const improvementLevels = asiLevels(cls.name, ruleset).filter(l => l <= level);
    const plan = planImprovements(atFirstLevel, improvementLevels, priority);
    const atLevel = plan.scores;
    const mods = modifiers(atLevel);

    // Subclass: the first in source order whose earliest feature is within reach.
    const subclasses = cls.detailedArchetypes
      .map(sub => ({ sub, unlock: Math.min(...sub.features.flatMap(f => f.levels), 99) }))
      .filter(({ unlock }) => unlock <= level)
      .sort((a, b) => sourceRank(a.sub.source.key) - sourceRank(b.sub.source.key) ||
        a.sub.name.localeCompare(b.sub.name));
    const subclass = subclasses[0] ?? null;
    if (!subclass && cls.detailedArchetypes.length === 0 && level >= 3) {
      warnings.push(`No ${cls.name} subclass is in the chosen sources`);
    }

    const classFeatures = cls.features.filter(f => f.levels.some(l => l <= level));
    const subclassFeatures = subclass?.sub.features.filter(f => f.levels.some(l => l <= level)) ?? [];
    const featureNames = [...classFeatures, ...subclassFeatures].map(f => f.name.toLowerCase());

    // Hit points: max hit die at 1st level, the fixed value after, and the
    // Constitution modifier every level -- retroactively, so the final one
    // (SRD 5.1 "Hit Points" / class "Hit Points at Higher Levels").
    const die = Number(/d(\d+)/i.exec(cls.hitDie)?.[1] ?? 0);
    const perLevelBonus = [...race.detailedTraits, ...race.resolved.inheritedTraits]
      .some(t => /hit point maximum increases by 1,? and it increases by 1 every time you gain a level/i.test(t.desc)) ? 1 : 0;
    const hitPoints = die
      ? Math.max(level, die + (level - 1) * (die / 2 + 1) + level * (mods.constitution + perLevelBonus))
      : 0;
    if (!die) warnings.push(`${cls.name} has no hit die in Open5e; hit points are not calculated`);

    // Spellcasting
    const spellcasting = await this.spellcasting(cls, rules, level, ruleset, mods, playstyle, scope, warnings);
    const canCastSpells = !!spellcasting && (spellcasting.slots.some(n => n > 0) || (spellcasting.cantripsKnown ?? 0) > 0);

    // Feats: only those whose prerequisites are known to be met.
    const feats = level >= Math.min(4, ...improvementLevels.concat(99))
      ? await this.suggestFeats({ level, scores: atLevel, canCastSpells, features: featureNames }, playstyle, keyAbilities, scope)
      : [];
    const originFeat = background.benefits.find(b => b.type === 'feat')?.desc;

    // Level-by-level plan
    const levelProgression = [];
    for (let l = 1; l <= level; l++) {
      const features = [
        ...cls.features.filter(f => f.levels.includes(l)).map(f => f.details[l] ? `${f.name} (${f.details[l]})` : f.name),
        ...subclassFeatures.filter(f => f.levels.includes(l)).map(f => `${f.name} (${subclass!.sub.name})`)
      ].filter(name => !/^ability score improvement$/i.test(name));
      const choices: string[] = [];
      if (subclass && l === subclass.unlock) choices.push(`Subclass: ${subclass.sub.name}`);
      if (l === 1 && originFeat) choices.push(`Origin feat from ${background.name}: ${originFeat}`);
      const improvement = plan.choices.find(c => c.level === l);
      if (improvement) {
        choices.push(feats.length > 0
          ? `${improvement.text}, or a feat: ${feats.map(f => f.name).join(', ')}`
          : improvement.text);
      }
      if (rules && rules.casterType !== 'none') {
        const now = spellSlots(rules.casterType, l, ruleset).maxSpellLevel;
        const before = l > 1 ? spellSlots(rules.casterType, l - 1, ruleset).maxSpellLevel : 0;
        if (now > before) features.push(`${ordinal(now)}-level spells`);
      }
      if (l > 1 && proficiencyBonus(l) > proficiencyBonus(l - 1)) features.push(`Proficiency bonus +${proficiencyBonus(l)}`);
      levelProgression.push({ level: l, features, choices });
    }

    const sources = uniqueSources([
      cls.source, subclass?.sub.source, race.source, background.source,
      ...(spellcasting?.suggested.map(s => s.source) ?? []), ...feats.map(f => f.source)
    ]);

    return {
      id: `build_${Date.now()}`,
      name: `${PLAYSTYLE_NAMES[playstyle]} ${race.name} ${cls.name}`,
      description: `A level ${level} ${race.name} ${subclass ? `${cls.name} (${subclass.sub.name})` : cls.name} ` +
        `with the ${background.name} background, ${PLAYSTYLE_DESCRIPTIONS[playstyle]}.`,
      level,
      playstyle,
      campaignType,
      ruleset,
      sources,
      race: {
        name: race.name,
        key: race.key,
        source: race.source,
        sizeCategories: race.resolved.sizeCategories,
        walkingSpeed: race.resolved.walkingSpeed,
        abilityScoreIncreases: race.resolved.abilityScoreIncreases,
        traits: [...race.resolved.inheritedTraits.map(t => t.name), ...race.traits]
          .filter(name => !/^(ability score increase|size|speed|age|alignment)$/i.test(name))
      },
      class: {
        name: cls.name,
        key: cls.key,
        source: cls.source,
        hitDie: cls.hitDie,
        primaryAbility: cls.primaryAbility,
        savingThrows: cls.savingThrows,
        casterType: cls.casterType,
        subclass: subclass
          ? { name: subclass.sub.name, key: subclass.sub.key, source: subclass.sub.source, features: subclassFeatures.map(f => f.name) }
          : null
      },
      background: {
        name: background.name,
        key: background.key,
        source: background.source,
        skillProficiencies: background.skillProficiencies,
        feature: background.feature,
        ...(originFeat ? { originFeat } : {})
      },
      abilityScores: {
        method: 'Standard array (15, 14, 13, 12, 10, 8), highest first down the priority list',
        base,
        atFirstLevel,
        atLevel,
        modifiers: mods,
        steps: [...steps, ...plan.choices.map(c => `Level ${c.level}: ${c.text}`)]
      },
      abilityScorePriority: priority,
      hitPoints: {
        atLevel: hitPoints,
        method: `${die} at 1st level, then ${die / 2 + 1} per level, plus Constitution` +
          (perLevelBonus ? ' and 1 per level from a species trait' : '')
      },
      proficiencyBonus: proficiencyBonus(level),
      spellcasting,
      levelProgression,
      suggestedFeats: feats,
      startingEquipment: { class: cls.equipment, background: background.equipment || undefined },
      strengths: this.strengths(cls, race, atFirstLevel, keyAbilities),
      weaknesses: this.weaknesses(cls, race, mods, atLevel, ruleset),
      buildStrategy: `${EXPERIENCE_TIPS[experienceLevel]} As a ${cls.name}, lead with ` +
        `${keyAbilities.join(' and ')}` +
        (classFeatures.length > 0 ? `; your signature features by level ${level} are ` +
          `${classFeatures.slice(0, 3).map(f => f.name).join(', ')}` : '') + '.',
      warnings,
      notes
    };
  }

  /**
   * A class's key abilities in order. For "Strength or Dexterity" classes the
   * one chosen is, in turn: a preferred ability, the one the species raises
   * more, or the playstyle's lean.
   */
  private keyAbilities(
    cls: EnhancedClassData,
    rules: ReturnType<typeof classRulesFor>,
    playstyle: Playstyle,
    preferred: Ability[],
    race?: EnhancedRaceData
  ): Ability[] {
    if (!rules) return cls.primaryAbility.filter((a): a is Ability => (ABILITIES as readonly string[]).includes(a));
    if ('allOf' in rules.keyAbilities) return rules.keyAbilities.allOf;

    const options = rules.keyAbilities.anyOf;
    const fromPreference = options.find(a => preferred.includes(a));
    if (fromPreference) return [fromPreference];
    const boost = (a: Ability) => race?.resolved.abilityScoreIncreases.fixed[a] ?? 0;
    const bySpecies = [...options].sort((a, b) => boost(b) - boost(a));
    if (boost(bySpecies[0]) > boost(bySpecies[1] ?? bySpecies[0])) return [bySpecies[0]];
    const lean = EITHER_ABILITY_BY_PLAYSTYLE[playstyle];
    return [options.includes(lean) ? lean : options[0]];
  }

  /**
   * The row a caller asked for by name. If it is not in scope but exists
   * elsewhere, the error says where, instead of quietly picking something else.
   */
  private async preferred<T extends { name: string; source: SourceLabel }>(
    rows: T[],
    name: string,
    kind: string,
    scope: ContentScope,
    lookupAnywhere: (name: string) => Promise<{ name: string; source: SourceLabel } | null>,
    extraRank?: (row: T) => number[]
  ): Promise<T> {
    const found = pickByName(rows, name, { nameOf: r => r.name, sourceKeyOf: r => r.source.key, extraRank });
    if (found) return found;

    const elsewhere = await lookupAnywhere(name).catch(() => null);
    const scopeText = [scope.ruleset && `ruleset ${scope.ruleset}`, scope.sources && `sources ${scope.sources.join(', ')}`]
      .filter(Boolean).join(' and ');
    if (elsewhere) {
      throw new Error(`${kind} "${name}" is not in ${scopeText}; ${elsewhere.name} is in ` +
        `${elsewhere.source.name} (${elsewhere.source.key}). Pass sources or ruleset to include it.`);
    }
    throw new Error(`${kind} "${name}" not found`);
  }

  private async spellcasting(
    cls: EnhancedClassData,
    rules: ReturnType<typeof classRulesFor>,
    level: number,
    ruleset: Ruleset,
    mods: AbilityScores,
    playstyle: Playstyle,
    scope: ContentScope,
    warnings: string[]
  ): Promise<CharacterBuildData['spellcasting']> {
    const casterType = rules?.casterType ?? cls.casterType;
    if (!casterType || casterType === 'none') return null;
    const ability = rules?.spellcastingAbility;
    if (!ability) {
      warnings.push(`${cls.name}'s spellcasting ability is not known; spellcasting is left out`);
      return null;
    }

    const slots = spellSlots(casterType, level, ruleset);
    const column = (pattern: RegExp) => {
      const name = Object.keys(cls.tableColumns).find(n => pattern.test(n));
      const value = name ? Number.parseInt(cls.tableColumns[name][level] ?? '', 10) : NaN;
      return Number.isFinite(value) ? value : null;
    };
    const cantripsKnown = column(/^cantrips(?: known)?$/i);
    let spellsKnown = column(/spells known|prepared spells/i);
    if (spellsKnown === null && slots.maxSpellLevel > 0) {
      // SRD 5.1 "Preparing and Casting Spells": level + modifier for full
      // casters, half level (rounded down) + modifier for the Paladin.
      const casterLevel = casterType === 'half' ? Math.floor(level / 2) : level;
      spellsKnown = Math.max(1, casterLevel + mods[ability]);
    }
    if (slots.maxSpellLevel === 0 && !cantripsKnown) return null;

    const { results } = await this.client.getSpellsByClass(cls.key, {
      maxLevel: slots.maxSpellLevel, limit: 1000, scope
    });
    if (results.length === 0) {
      warnings.push(`Open5e lists no ${cls.name} spells in these sources, so none are suggested`);
    }
    const scored = results.map(spell => {
      const roles = spellRoles(spell);
      const weights = SPELL_ROLE_WEIGHTS[playstyle];
      const staple = STAPLE_SPELLS.has(spell.name.toLowerCase()) ? STAPLE_SPELL_BONUS : 0;
      return { spell, roles, score: roles.reduce((sum, role) => sum + weights[role], 0) + staple };
    }).sort((a, b) => b.score - a.score || sourceRank(a.spell.source.key) - sourceRank(b.spell.source.key) ||
      a.spell.name.localeCompare(b.spell.name));

    const pick = (candidates: typeof scored, count: number) => {
      const chosen: typeof scored = [];
      // One of each available level first, so every slot level has something, then the best of the rest.
      for (let spellLevel = slots.maxSpellLevel; spellLevel >= 1 && chosen.length < count; spellLevel--) {
        const top = candidates.find(c => c.spell.level === spellLevel && !chosen.includes(c));
        if (top) chosen.push(top);
      }
      for (const candidate of candidates) {
        if (chosen.length >= count) break;
        if (!chosen.includes(candidate)) chosen.push(candidate);
      }
      return chosen;
    };

    const cantrips = scored.filter(c => c.spell.level === 0).slice(0, cantripsKnown ?? 0);
    const leveled = pick(scored.filter(c => c.spell.level > 0), spellsKnown ?? 0);
    const toSuggestion = ({ spell, roles }: { spell: EnhancedSpellData; roles: string[] }): SpellSuggestion =>
      ({ name: spell.name, key: spell.key, level: spell.level, roles, source: spell.source });

    const prof = proficiencyBonus(level);
    return {
      ability,
      saveDC: 8 + prof + mods[ability],
      attackBonus: prof + mods[ability],
      slots: slots.byLevel,
      pactMagic: slots.pact,
      cantripsKnown,
      spellsKnownOrPrepared: spellsKnown,
      suggested: [...cantrips, ...leveled].map(toSuggestion).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    };
  }

  private async suggestFeats(
    character: Parameters<typeof checkPrerequisite>[1],
    playstyle: Playstyle,
    keyAbilities: Ability[],
    scope: ContentScope
  ): Promise<CharacterBuildData['suggestedFeats']> {
    const { results } = await this.client.searchFeats('', { limit: 100, scope });
    const allowedType = (feat: FeatData) => {
      const type = feat.type.toLowerCase().replace(/_/g, ' ');
      if (type === 'origin') return false; // granted by a 2024 background, not at an ASI
      if (type === 'epic boon') return character.level >= 19;
      if (/^ability score improvement$/i.test(feat.name)) return false; // already the default choice
      return true;
    };

    return results
      .filter(feat => allowedType(feat) && checkPrerequisite(feat.prerequisite, character) === 'met')
      .map(feat => {
        const text = [feat.name, feat.description, ...feat.benefits.map(b => b.desc)].join(' ');
        const reasons: string[] = [];
        if (FEAT_KEYWORDS[playstyle].test(text)) reasons.push(`suits a ${playstyle} build`);
        const raised = keyAbilities.find(a => new RegExp(`increase your ${a}`, 'i').test(text));
        if (raised) reasons.push(`raises ${raised}`);
        return { feat, reasons };
      })
      .filter(({ reasons }) => reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length || a.feat.name.localeCompare(b.feat.name))
      .slice(0, 5)
      .map(({ feat, reasons }) => ({
        name: feat.name, key: feat.key, source: feat.source,
        why: reasons.join('; '), prerequisite: feat.prerequisite || 'none'
      }));
  }

  private strengths(cls: EnhancedClassData, race: EnhancedRaceData, scores: AbilityScores, keys: Ability[]): string[] {
    const strengths: string[] = [];
    const die = Number(/d(\d+)/i.exec(cls.hitDie)?.[1] ?? 0);
    if (die >= 10) strengths.push(`d${die} hit die: plenty of hit points`);
    if (/heavy/i.test(cls.proficiencies.armor ?? '')) strengths.push('Heavy armor proficiency');
    if (cls.casterType === 'full') strengths.push('Full spellcasting, reaching 9th-level spells');
    if (keys[0] && abilityModifier(scores[keys[0]]) >= 3) {
      strengths.push(`Starts with ${keys[0]} ${scores[keys[0]]} (+${abilityModifier(scores[keys[0]])})`);
    }
    for (const trait of [...race.detailedTraits, ...race.resolved.inheritedTraits]) {
      if (/^darkvision$/i.test(trait.name)) strengths.push('Darkvision');
      const types = trait.desc.match(DAMAGE_RESISTANCE);
      if (types) strengths.push(`Resistance to ${[...new Set(types.map(m => m.split(/\s+/).pop()!.toLowerCase()))].join(' and ')} damage`);
      else if (/resistance/i.test(trait.name)) strengths.push(trait.name);
      if (/^lucky$|^luck$/i.test(trait.name)) strengths.push('Rerolls natural 1s (Lucky)');
    }
    return [...new Set(strengths)];
  }

  private weaknesses(
    cls: EnhancedClassData, race: EnhancedRaceData, mods: AbilityScores, scores: AbilityScores, ruleset: Ruleset
  ): string[] {
    const weaknesses: string[] = [];
    const die = Number(/d(\d+)/i.exec(cls.hitDie)?.[1] ?? 0);
    if (die > 0 && die <= 6) weaknesses.push(`d${die} hit die: few hit points`);
    if (!cls.proficiencies.armor || /^none$/i.test(cls.proficiencies.armor)) weaknesses.push('No armor proficiency');
    if (mods.constitution <= 0) weaknesses.push('Low Constitution');
    weaknesses.push(...heavyWeaponWeaknesses(ruleset, race.resolved.sizeCategories, scores,
      usesHeavyWeapons(cls.proficiencies.weapons)));
    for (const trait of [...race.detailedTraits, ...race.resolved.inheritedTraits]) {
      if (/sunlight sensitivity/i.test(trait.name)) weaknesses.push('Sunlight Sensitivity');
    }
    return [...new Set(weaknesses)];
  }
}

/**
 * Whether a class is trained with Heavy weapons: every Heavy weapon is
 * Martial, and none is Finesse or Light, so "Martial weapons that have the
 * Finesse or Light property" (the 2024 Rogue and Monk) does not count.
 */
export function usesHeavyWeapons(weapons: string | undefined): boolean {
  return /martial weapons(?! that have)/i.test(weapons ?? '');
}

/**
 * When Heavy weapons impose disadvantage. SRD 5.1 "Weapon Properties: Heavy":
 * Small creatures. SRD 5.2 "Weapon Properties: Heavy": a melee weapon below
 * Strength 13, a ranged one below Dexterity 13, whatever your size; only worth
 * saying for classes proficient with Martial weapons, since every Heavy weapon
 * is Martial.
 */
export function heavyWeaponWeaknesses(
  ruleset: Ruleset, sizes: string[], scores: Pick<AbilityScores, 'strength' | 'dexterity'>, martial: boolean
): string[] {
  if (ruleset === '5e-2024') {
    if (!martial) return [];
    return [
      ...(scores.strength < 13 ? ['Strength below 13: disadvantage on attack rolls with Heavy melee weapons'] : []),
      ...(scores.dexterity < 13 ? ['Dexterity below 13: disadvantage on attack rolls with Heavy ranged weapons'] : [])
    ];
  }
  return sizes.length === 1 && sizes[0] === 'Small' ? ['Small: disadvantage on attack rolls with Heavy weapons'] : [];
}

function oneOf<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')} (got "${value}")`);
  }
  return value as T;
}

/** The highest-scoring row; ties go to the preferred source, then the name. */
function best<T extends { name: string; source: SourceLabel }, R>(rows: T[], score: (row: T) => number, pick: (row: T) => R): R | null {
  const ranked = rows
    .map(row => ({ row, score: score(row) }))
    .sort((a, b) => b.score - a.score || sourceRank(a.row.source.key) - sourceRank(b.row.source.key) ||
      a.row.name.localeCompare(b.row.name));
  return ranked[0] ? pick(ranked[0].row) : null;
}

/** The abilities a 2024 background lets you raise: "Intelligence, Wisdom, Charisma". */
function backgroundAbilities(background: BackgroundData): Ability[] {
  const text = background.benefits.find(b => b.type === 'ability_score')?.desc ?? '';
  return ABILITIES.filter(a => new RegExp(`\\b${a}\\b`, 'i').test(text));
}

function uniqueSources(labels: Array<SourceLabel | undefined>): SourceLabel[] {
  const seen = new Map<string, SourceLabel>();
  for (const label of labels) if (label && !seen.has(label.key)) seen.set(label.key, label);
  return [...seen.values()];
}

function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}
