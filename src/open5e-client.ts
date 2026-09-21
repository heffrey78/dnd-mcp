import NodeCache from 'node-cache';
import {
  ENDPOINTS, PAGE_MAX, type EndpointName, type EndpointSpec, type FilterValue, type FiltersFor
} from './open5e-endpoints.js';
import {
  type ContentScope, type SourceLabel,
  documentKeyOf, pickByName, resolveScope, sourceOf, toSourceLabel
} from './sources.js';

export type { ContentScope, SourceLabel } from './sources.js';

// Enhanced interfaces based on Open5e API structure
export interface EnhancedSpellData {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  classes: string[];
  key: string;
  source: SourceLabel;
  url: string;

  // Enhanced fields from Open5e API
  ritual: boolean;
  concentration: boolean;
  higherLevel?: string;
  damageRoll?: string;
  damageTypes: string[];
  savingThrow?: string;
  attackRoll: boolean;
  targetType?: string;
  targetCount?: number;
  reactionCondition?: string;
  componentDetails: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    materialSpecified?: string;
    materialCost?: number;
    materialConsumed?: boolean;
  };
}

export interface EnhancedClassData {
  name: string;
  hitDie: string;
  primaryAbility: string[];
  savingThrows: string[];
  description: string;
  subclasses: string[];
  url: string;
  
  // Enhanced fields
  hpAt1stLevel?: string;
  hpAtHigherLevels?: string;
  proficiencies: {
    armor?: string;
    weapons?: string;
    tools?: string;
    skills?: string;
  };
  equipment?: string;
  progressionTable?: string;
  spellcastingAbility?: string;
  detailedArchetypes: Array<{
    name: string;
    desc: string;
    [key: string]: any;
  }>;
}

export interface EnhancedRaceData {
  name: string;
  size: string;
  speed: string;
  abilityScoreIncrease: string;
  traits: string[];
  description: string;
  url: string;
  
  // Enhanced fields
  key: string;
  isSubrace: boolean;
  subraceOf?: string;
  detailedTraits: Array<{
    name: string;
    desc: string;
  }>;
  source: SourceLabel;
}

export interface MonsterData {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: number;
  hitPoints: number;
  hitDice: string;
  speed: Record<string, any>;
  abilities: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  savingThrows?: string;
  skills?: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  challengeRating: string;
  actions: any[];
  specialAbilities?: any[];
  reactions?: any[];
  legendaryActions?: any[];
  description?: string;
  url: string;
}

export interface WeaponData {
  name: string;
  key: string;
  category: 'simple' | 'martial';
  damageDice?: string;
  damageType?: string;
  /** "20/60 feet" for ranged and thrown weapons; absent for melee-only ones. */
  range?: string;
  properties: {
    martial: boolean;
    melee: boolean;
    ranged: boolean;
    finesse: boolean;
    light: boolean;
    heavy: boolean;
    twoHanded: boolean;
    versatile: boolean;
    thrown: boolean;
  };
  /** Every property as printed, with its detail: "Versatile (1d10)". */
  propertyNames: string[];
  source: SourceLabel;
  url: string;
}

export interface MagicItemData {
  name: string;
  type: string;
  description: string;
  rarity: string;
  requiresAttunement: string;
  document: {
    slug: string;
    title: string;
    url: string;
  };
  url: string;
}

export interface ArmorData {
  name: string;
  key: string;
  category: string;
  acDisplay: string;
  acBase: number;
  acAddDexMod: boolean;
  acCapDexMod: number | null;
  grantsStealthDisadvantage: boolean;
  strengthScoreRequired: number | null;
  source: SourceLabel;
  url: string;
}

export interface FeatData {
  name: string;
  key: string;
  description: string;
  prerequisite: string;
  hasPrerequisite: boolean;
  /** GENERAL, ORIGIN, FIGHTING_STYLE, EPIC_BOON, ... as Open5e reports it. */
  type: string;
  benefits: Array<{
    desc: string;
  }>;
  source: SourceLabel;
  url: string;
}

export interface ConditionData {
  name: string;
  key: string;
  /** The description for the requested ruleset, else the 2014 one. */
  description: string;
  ruleset: string | null;
  /** Every ruleset's wording, keyed by game system ("5e-2014", ...). */
  descriptions: Record<string, string>;
  source: SourceLabel;
  url: string;
}

export interface BackgroundData {
  name: string;
  description: string;
  key: string;
  benefits: Array<{
    name: string;
    desc: string;
    type: string;
  }>;
  abilityScoreIncrease: string;
  skillProficiencies: string;
  toolProficiencies: string;
  languages: string;
  equipment: string;
  feature: string;
  source: SourceLabel;
  url: string;
}

export interface SectionData {
  slug: string;
  name: string;
  description: string;
  parent?: string;
  document: string;
  url: string;
}

export interface EncounterData {
  id: string;
  name: string;
  description: string;
  partySize: number;
  partyLevel: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'deadly';
  monsters: EncounterMonster[];
  totalXP: number;
  adjustedXP: number;
  estimatedDuration: string;
  terrain?: string;
  environment?: string;
  tactics?: string;
}

export interface EncounterMonster {
  name: string;
  cr: string;
  count: number;
  xp: number;
  totalXP: number;
  monsterData: MonsterData;
}

export interface EncounterBuilderOptions {
  partySize: number;
  partyLevel: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'deadly';
  environment?: string;
  minCR?: number;
  maxCR?: number;
  monsterTypes?: string[];
  maxMonsters?: number;
}

export interface CharacterBuildData {
  id: string;
  name: string;
  description: string;
  race: EnhancedRaceData;
  class: EnhancedClassData;
  background: BackgroundData;
  suggestedFeats: FeatData[];
  abilityScorePriority: string[];
  keySpells?: EnhancedSpellData[];
  recommendedEquipment: string[];
  buildStrategy: string;
  levelProgression: {
    level: number;
    features: string[];
    recommendations: string[];
  }[];
  playstyle: string;
  strengths: string[];
  weaknesses: string[];
}

export interface CharacterBuildOptions {
  preferredClass?: string;
  preferredRace?: string;
  preferredBackground?: string;
  playstyle?: 'damage' | 'support' | 'tank' | 'utility' | 'balanced';
  campaignType?: 'combat' | 'roleplay' | 'exploration' | 'mixed';
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
  focusLevel?: number; // Target level for optimization
  allowMulticlass?: boolean;
  preferredAbilityScores?: string[]; // ['strength', 'dexterity', etc.]
}

interface Open5eResponse<T> {
  count: number;
  next?: string;
  previous?: string;
  results: T[];
}

export class Open5eClient {
  private cache: NodeCache;
  private readonly cacheMaxAge = 30 * 60; // 30 minutes in seconds
  private readonly baseURL = 'https://api.open5e.com';
  /** Longest query-parameter value the client will send; longer ones throw. */
  private static readonly MAX_PARAM_LENGTH = 1000;

  constructor() {
    this.cache = new NodeCache({ 
      stdTTL: this.cacheMaxAge,
      checkperiod: 60, // Check for expired keys every minute
      useClones: false // For better performance
    });
  }

  /**
   * Local filtering has to see the whole server-filtered set, so it pages
   * through at most this many full pages before giving up. Past that the
   * caller must narrow the query with a server-side filter.
   */
  private static readonly MAX_LOCAL_SCAN_PAGES = 5;

  /**
   * The one way the client reads a collection. Each filter is looked up in
   * ENDPOINTS: server filters become query parameters, local ones run over the
   * fetched rows. A filter the endpoint does not declare is an error, never a
   * parameter sent on the hope that Open5e honours it.
   */
  async query<E extends EndpointName>(
    endpoint: E,
    filters: FiltersFor<E> = {},
    options: { limit?: number; ordering?: string } = {}
  ): Promise<{ count: number; rows: any[]; hasMore: boolean }> {
    const spec: EndpointSpec = ENDPOINTS[endpoint];
    const params: Record<string, any> = {};
    const locals: Array<[(row: any, value: any) => boolean, FilterValue]> = [];

    for (const [filter, value] of Object.entries(filters) as Array<[string, FilterValue | undefined]>) {
      if (value === undefined) continue;
      const rule = spec.filters[filter];
      if (!rule) throw new Error(`${spec.path} has no "${filter}" filter`);
      if ('server' in rule) {
        params[rule.server] = value;
      } else if (!(typeof value === 'string' && value.trim() === '')) {
        // A blank value means "no filter", as it does for server filters.
        locals.push([rule.local, value]);
      }
    }

    if (options.ordering !== undefined) {
      if (!spec.ordering?.includes(options.ordering)) {
        throw new Error(`Invalid ordering "${options.ordering}" for ${spec.path}. ` +
          `Use one of: ${(spec.ordering ?? []).join(', ') || '(none supported)'}`);
      }
      params.ordering = options.ordering;
    }

    let result: { count: number; rows: any[]; hasMore: boolean };

    if (locals.length === 0) {
      if (options.limit !== undefined) params.limit = options.limit;
      const response = await this.makeRequest<Open5eResponse<any>>(spec.path, params);
      result = { count: response.count, rows: response.results, hasMore: !!response.next };
    } else {
      const rows: any[] = [];
      for (let page = 1; ; page++) {
        const response = await this.makeRequest<Open5eResponse<any>>(spec.path, {
          ...params, limit: PAGE_MAX, ...(page > 1 ? { page } : {})
        });
        rows.push(...response.results);
        if (!response.next) break;
        if (page >= Open5eClient.MAX_LOCAL_SCAN_PAGES) {
          throw new Error(`Too many ${endpoint} to filter locally ` +
            `(over ${PAGE_MAX * page}); narrow the query`);
        }
      }
      const matched = rows.filter(row => locals.every(([match, value]) => match(row, value)));
      const limited = options.limit !== undefined ? matched.slice(0, options.limit) : matched;
      result = { count: matched.length, rows: limited, hasMore: limited.length < matched.length };
    }

    await this.embedDocuments(result.rows);
    return result;
  }

  private documentIndexPromise?: Promise<Map<string, SourceLabel>>;

  /** Every Open5e document, by key. Fetched once per client. */
  private documentIndex(): Promise<Map<string, SourceLabel>> {
    this.documentIndexPromise ??= this.query('documents', {}, { limit: PAGE_MAX })
      .then(({ rows }) => new Map(rows.map(row => [row.key, toSourceLabel(row)])))
      .catch(error => {
        this.documentIndexPromise = undefined; // do not cache a failure
        throw error;
      });
    return this.documentIndexPromise;
  }

  /**
   * Some list endpoints return `document` as a bare key. Replace it with the
   * document object so every transform can label its source the same way.
   */
  private async embedDocuments(rows: any[]): Promise<void> {
    if (!rows.some(row => typeof row?.document === 'string')) return;
    const index = await this.documentIndex();
    for (const row of rows) {
      if (typeof row?.document !== 'string') continue;
      const label = index.get(row.document);
      row.document = {
        key: row.document,
        display_name: label?.name ?? row.document,
        gamesystem: label?.ruleset ? { key: label.ruleset } : null
      };
    }
  }

  /** The document keys a scope allows (see resolveScope), or undefined for all. */
  async scopeDocuments(scope?: ContentScope): Promise<string[] | undefined> {
    if (!scope || (scope.ruleset === undefined && scope.sources === undefined)) return undefined;
    return resolveScope(scope, [...(await this.documentIndex()).values()]);
  }

  private async makeRequest<T>(path: string, params?: Record<string, any>): Promise<T> {
    // Input validation
    if (!path || typeof path !== 'string') {
      throw new Error('Invalid API path provided');
    }

    // Sanitize and validate parameters
    const sanitizedParams = this.sanitizeParams(params);
    const cacheKey = `${path}${sanitizedParams ? '?' + new URLSearchParams(sanitizedParams).toString() : ''}`;
    
    // Check cache first
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      console.error(`📦 Cache hit: ${cacheKey}`);
      return cached;
    }

    // Build URL with parameters
    const url = new URL(path, this.baseURL);
    if (sanitizedParams) {
      Object.entries(sanitizedParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'DND-MCP-Server/2.0.0 (Open5e Integration)',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`Open5e API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      let data: T;
      try {
        data = await response.json() as T;
      } catch (parseError) {
        throw new Error(`Invalid JSON response from Open5e API: ${parseError}`);
      }
      
      // Validate response structure
      if (!this.validateApiResponse(data)) {
        throw new Error('Invalid response format from Open5e API');
      }
      
      // Cache successful responses
      this.cache.set(cacheKey, data);
      
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Open5e API timeout: ${path} (request took longer than 15 seconds)`);
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error accessing Open5e API: ${path}`);
      }
      throw error;
    }
  }

  private sanitizeParams(params?: Record<string, any>): Record<string, any> | undefined {
    if (!params) return undefined;

    const sanitized: Record<string, any> = {};
    
    Object.entries(params).forEach(([key, value]) => {
      // Validate parameter keys
      if (typeof key !== 'string' || key.length === 0) {
        return; // Skip invalid keys
      }

      // Sanitize values
      if (value === null || value === undefined) {
        return; // Skip null/undefined values
      }

      // Type-specific validation. An invalid value must throw rather than be
      // dropped: a silently discarded filter turns a bad query into an
      // unfiltered one, which returns the whole collection as if it matched.
      if (typeof value === 'string') {
        // Length limits on user input are enforced at the MCP boundary. This is
        // only a guard against building an unreasonable URL, and it throws
        // rather than truncates: a shortened value is a different filter.
        const sanitizedValue = value.trim();
        if (sanitizedValue.length > Open5eClient.MAX_PARAM_LENGTH) {
          throw new Error(`Invalid value for ${key}: longer than ${Open5eClient.MAX_PARAM_LENGTH} characters`);
        }
        if (sanitizedValue.length > 0) {
          sanitized[key] = sanitizedValue;
        }
        // An all-whitespace value means "no filter", which is a valid request.
      } else if (Array.isArray(value)) {
        // Multi-value filters (`__in`) are sent comma-separated. An empty list
        // would be dropped by Open5e and match everything, so reject it.
        const items = value.map(item => typeof item === 'string' ? item.trim() : item);
        if (items.length === 0 ||
            items.some(item => typeof item !== 'string' || item.length === 0 || item.includes(','))) {
          throw new Error(`Invalid value for ${key}: expected a non-empty list of strings without commas`);
        }
        const joined = items.join(',');
        if (joined.length > Open5eClient.MAX_PARAM_LENGTH) {
          throw new Error(`Invalid value for ${key}: longer than ${Open5eClient.MAX_PARAM_LENGTH} characters`);
        }
        sanitized[key] = joined;
      } else if (typeof value === 'number') {
        if (!isFinite(value) || value < 0 || value > 1000) {
          throw new Error(`Invalid value for ${key}: must be a number between 0 and 1000`);
        }
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      } else {
        throw new Error(`Invalid value for ${key}: expected a string, string list, number or boolean`);
      }
    });

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  private validateApiResponse(data: any): boolean {
    // Basic structure validation for Open5e API responses
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check for expected API response structure
    if (Array.isArray(data)) {
      return true; // Direct array responses are valid
    }

    // Check for paginated response structure
    if (typeof data.count === 'number' && Array.isArray(data.results)) {
      return true;
    }

    // Check for single item responses (should have basic properties)
    if (data.name || data.url || data.desc) {
      return true;
    }

    return false;
  }

  private formatComponents(spell: any): string {
    const components = [];
    if (spell.verbal) components.push('V');
    if (spell.somatic) components.push('S');
    if (spell.material) {
      if (spell.material_specified) {
        components.push(`M (${spell.material_specified})`);
      } else {
        components.push('M');
      }
    }
    return components.join(', ');
  }

  private formatDescription(spell: any): string {
    let description = spell.desc || '';
    if (spell.higher_level) {
      description += `\n\nAt Higher Levels: ${spell.higher_level}`;
    }
    return description;
  }

  /** v2 casting times are keys: "action", "bonus-action", "10minutes". */
  private formatCastingTime(value: unknown): string {
    const text = String(value ?? '');
    if (['action', 'bonus-action', 'reaction', 'round', 'turn'].includes(text)) {
      return `1 ${text.replace('-', ' ')}`;
    }
    const match = /^(\d+)([a-z]+)$/.exec(text);
    return match ? `${match[1]} ${match[2]}` : text;
  }

  private extractPrimaryAbilities(classData: any): string[] {
    // Extract from saving throws as primary indicator
    if (classData.prof_saving_throws) {
      return classData.prof_saving_throws.split(',').map((s: string) => s.trim());
    }
    return [];
  }

  private transformSpell(spell: any): EnhancedSpellData {
    return {
      name: spell.name,
      key: spell.key ?? '',
      level: spell.level ?? 0,
      school: spell.school?.name ?? '',
      castingTime: this.formatCastingTime(spell.casting_time),
      range: spell.range_text ?? '',
      components: this.formatComponents(spell),
      duration: spell.duration ?? '',
      description: this.formatDescription(spell),
      classes: (spell.classes ?? []).map((cls: any) => cls.name),
      source: sourceOf(spell),
      url: spell.key ? `https://api.open5e.com/v2/spells/${spell.key}/` : '',

      ritual: Boolean(spell.ritual),
      concentration: Boolean(spell.concentration),
      higherLevel: spell.higher_level || undefined,
      damageRoll: spell.damage_roll || undefined,
      damageTypes: spell.damage_types ?? [],
      savingThrow: spell.saving_throw_ability || undefined,
      attackRoll: Boolean(spell.attack_roll),
      targetType: spell.target_type || undefined,
      targetCount: spell.target_count ?? undefined,
      reactionCondition: spell.reaction_condition || undefined,
      componentDetails: {
        verbal: Boolean(spell.verbal),
        somatic: Boolean(spell.somatic),
        material: Boolean(spell.material),
        materialSpecified: spell.material_specified || undefined,
        materialCost: spell.material_cost ? Number(spell.material_cost) : undefined,
        materialConsumed: Boolean(spell.material_consumed)
      }
    };
  }

  async searchSpells(query?: string, options: {
    level?: number;
    maxLevel?: number;
    school?: string;
    classKey?: string;
    limit?: number;
    ordering?: string;
    scope?: ContentScope;
  } = {}): Promise<{ count: number; results: EnhancedSpellData[]; hasMore: boolean }> {
    const response = await this.query('spells', {
      name: query,
      level: options.level,
      maxLevel: options.maxLevel,
      // School keys are lower case ("evocation"); accept "Evocation" too.
      school: options.school?.trim().toLowerCase(),
      classKey: options.classKey,
      documents: await this.scopeDocuments(options.scope)
    }, { limit: options.limit, ordering: options.ordering });

    return {
      count: response.count,
      results: response.rows.map(spell => this.transformSpell(spell)),
      hasMore: response.hasMore
    };
  }

  async getSpellDetails(spellName: string, scope?: ContentScope): Promise<EnhancedSpellData | null> {
    // Six sourcebooks have a "Fireball"; fetch enough to see them all and rank.
    const { results } = await this.searchSpells(spellName, { limit: 50, scope });
    return this.pickResult(results, spellName);
  }

  async getSpellsByLevel(level: number, options: {
    limit?: number;
    scope?: ContentScope;
  } = {}): Promise<{ count: number; results: EnhancedSpellData[]; hasMore: boolean }> {
    return this.searchSpells('', { level, limit: options.limit ?? 20, scope: options.scope });
  }

  /**
   * Spells on a class's list. The class is resolved to a key within the scope
   * first ("bard" is srd_bard for 2014 content, srd-2024_bard for 2024), then
   * filtered server-side with classes__key.
   */
  async getSpellsByClass(className: string, options: {
    level?: number;
    maxLevel?: number;
    limit?: number;
    scope?: ContentScope;
  } = {}): Promise<{ class: string; classKey: string; count: number; results: EnhancedSpellData[]; hasMore: boolean }> {
    const cls = await this.findBaseClass(className, options.scope);
    if (!cls) throw new Error(`Class "${className}" not found`);

    const spells = await this.searchSpells('', {
      classKey: cls.key,
      level: options.level,
      maxLevel: options.maxLevel,
      limit: options.limit ?? 20,
      ordering: 'level',
      scope: options.scope
    });
    return { class: cls.name, classKey: cls.key, ...spells };
  }

  /** A base (non-subclass) class row by name or key, ranked like any lookup. */
  private async findBaseClass(className: string, scope?: ContentScope): Promise<{ key: string; name: string } | null> {
    const needle = className.trim().toLowerCase();
    const { rows } = await this.query('classes', {
      isSubclass: false,
      documents: await this.scopeDocuments(scope)
    }, { limit: PAGE_MAX });

    const byKey = rows.find(row => row.key === needle);
    if (byKey) return { key: byKey.key, name: byKey.name };

    const best = pickByName(rows, needle, { nameOf: row => row.name, sourceKeyOf: documentKeyOf });
    return best ? { key: best.key, name: best.name } : null;
  }

  async searchRaces(query?: string, options: {
    limit?: number;
    scope?: ContentScope;
  } = {}): Promise<{ count: number; results: EnhancedRaceData[]; hasMore: boolean }> {
    const documents = await this.scopeDocuments(options.scope);
    const response = await this.query('species', { name: query, documents }, {
      limit: options.limit ?? 10 // kept small by default to avoid timeouts
    });
    const rows = response.rows;

    // Subspecies names often omit the parent ("Lightfoot" for Halfling), so a
    // name match alone misses them. Pull in the subspecies of every matched
    // parent species.
    const parentKeys = query
      ? rows.filter(race => !race.is_subspecies && race.key).map(race => race.key as string)
      : [];
    const subspecies = await this.fetchSubspecies(parentKeys, documents);
    const seen = new Set(rows.map(race => race.key));
    const added = subspecies.filter(race => !seen.has(race.key));

    return {
      count: response.count + added.length,
      results: [...rows, ...added].map(race => this.transformRace(race)),
      hasMore: response.hasMore
    };
  }

  /** Species whose parent is one of `parentKeys`. */
  private async fetchSubspecies(parentKeys: string[], documents?: string[]): Promise<any[]> {
    if (parentKeys.length === 0) return [];

    const response = await this.query('species', { subspeciesOf: parentKeys, documents }, { limit: 50 });
    return response.rows;
  }

  private transformRace(race: any): EnhancedRaceData {
    const traits = race.traits || [];

    return {
      // Current MCP format fields
      name: race.name,
      // Subspecies usually omit size and speed because they inherit them from
      // the parent species. Leave them blank rather than guess; getRaceDetails
      // fills them in from the parent.
      size: this.findSpeciesTrait(traits, 'size'),
      speed: this.findSpeciesTrait(traits, 'speed'),
      abilityScoreIncrease: this.findSpeciesTrait(traits, 'ability score increase'),
      traits: traits.map((trait: any) => trait.name),
      description: race.desc || '',
      url: race.key ? `https://api.open5e.com/v2/species/${race.key}/` : '',

      // Enhanced fields
      key: race.key ?? '',
      isSubrace: race.is_subspecies || false,
      subraceOf: race.subspecies_of,
      detailedTraits: traits,
      source: sourceOf(race)
    };
  }

  /**
   * Species traits are free text. Match on the trait's name (or its v2 `type`,
   * e.g. SIZE/SPEED on srd-2024) -- never its description, which mentions
   * "size" and "speed" in unrelated traits such as Halfling Nimbleness.
   */
  private findSpeciesTrait(traits: any[], traitName: string): string {
    const wanted = traitName.toLowerCase();
    const trait = traits.find(t => (t.name ?? '').toLowerCase() === wanted)
      ?? traits.find(t => (t.type ?? '').toLowerCase() === wanted);
    return trait?.desc ?? '';
  }

  async getRaceDetails(raceName: string, scope?: ContentScope): Promise<EnhancedRaceData | null> {
    const needle = raceName.trim().toLowerCase();
    if (!needle) return null;

    // Species keys ("srd_halfling") are not names, so fetch those directly.
    if (Open5eClient.looksLikeKey(needle)) {
      try {
        const race = await this.makeRequest<any>(`/v2/species/${needle}/`);
        return this.inheritFromParentSpecies(this.transformRace(race));
      } catch {
        // Not a key after all; fall back to a name search.
      }
    }

    // Open5e holds several species with the same name ("Halfling" in both
    // srd-2014 and srd-2024), plus subspecies and third-party entries whose
    // names contain it ("Stoor Halfling", "Halfling Heritage"). Fetch enough
    // rows that the exact match cannot be crowded out, then prefer a
    // non-subspecies from the core SRD.
    const { results } = await this.searchRaces(raceName.trim(), { limit: 50, scope });
    const best = pickByName(results, needle, {
      nameOf: race => race.name,
      sourceKeyOf: race => race.source.key,
      extraRank: race => [race.isSubrace ? 1 : 0]
    });
    return best ? this.inheritFromParentSpecies(best) : null;
  }

  /** Open5e keys are `<document>_<slug>`: "srd_halfling", "srd-2024_elf". */
  private static looksLikeKey(value: string): boolean {
    return /^[a-z0-9-]+_[a-z0-9-]+$/.test(value);
  }

  /** Fills in size and speed a subspecies inherits from its parent species. */
  private async inheritFromParentSpecies(race: EnhancedRaceData): Promise<EnhancedRaceData> {
    if (!race.isSubrace || !race.subraceOf || (race.size && race.speed)) return race;

    try {
      const parent = this.transformRace(
        await this.makeRequest<any>(`/v2/species/${race.subraceOf}/`)
      );
      return {
        ...race,
        size: race.size || parent.size,
        speed: race.speed || parent.speed
      };
    } catch (error) {
      console.error(`Could not load parent species ${race.subraceOf}:`, error);
      return race;
    }
  }

  async searchClasses(): Promise<{ count: number; results: EnhancedClassData[]; hasMore: boolean }> {
    const response = await this.makeRequest<Open5eResponse<any>>('/v1/classes/');

    const transformedResults: EnhancedClassData[] = response.results.map(cls => ({
      // Current MCP format fields
      name: cls.name,
      hitDie: cls.hit_dice,
      primaryAbility: this.extractPrimaryAbilities(cls),
      savingThrows: cls.prof_saving_throws ? 
        cls.prof_saving_throws.split(',').map((s: string) => s.trim()) : [],
      description: cls.desc || '',
      subclasses: cls.archetypes?.map((arch: any) => arch.name) || [],
      url: cls.url,
      
      // Enhanced fields
      hpAt1stLevel: cls.hp_at_1st_level,
      hpAtHigherLevels: cls.hp_at_higher_levels,
      proficiencies: {
        armor: cls.prof_armor,
        weapons: cls.prof_weapons,
        tools: cls.prof_tools,
        skills: cls.prof_skills
      },
      equipment: cls.equipment,
      progressionTable: cls.table,
      spellcastingAbility: cls.spellcasting_ability,
      detailedArchetypes: cls.archetypes || []
    }));

    return {
      count: response.count,
      results: transformedResults,
      hasMore: !!response.next
    };
  }

  async getClassDetails(className: string): Promise<EnhancedClassData | null> {
    try {
      // Try direct lookup first
      const response = await this.makeRequest<any>(`/v1/classes/${className.toLowerCase()}/`);
      
      return {
        name: response.name,
        hitDie: response.hit_dice,
        primaryAbility: this.extractPrimaryAbilities(response),
        savingThrows: response.prof_saving_throws ? 
          response.prof_saving_throws.split(',').map((s: string) => s.trim()) : [],
        description: response.desc || '',
        subclasses: response.archetypes?.map((arch: any) => arch.name) || [],
        url: response.url,
        hpAt1stLevel: response.hp_at_1st_level,
        hpAtHigherLevels: response.hp_at_higher_levels,
        proficiencies: {
          armor: response.prof_armor,
          weapons: response.prof_weapons,
          tools: response.prof_tools,
          skills: response.prof_skills
        },
        equipment: response.equipment,
        progressionTable: response.table,
        spellcastingAbility: response.spellcasting_ability,
        detailedArchetypes: response.archetypes || []
      };
    } catch (error) {
      // Fallback to search
      const searchResults = await this.searchClasses();
      const match = searchResults.results.find(
        cls => cls.name.toLowerCase() === className.toLowerCase()
      );
      
      return match || null;
    }
  }

  // New monster functionality
  async searchMonsters(query?: string, options: {
    cr?: number;
    limit?: number;
    documentSlug?: string;
  } = {}): Promise<{ count: number; results: MonsterData[]; hasMore: boolean }> {
    const params: Record<string, any> = {};
    
    if (query) params.name__icontains = query;
    if (options.cr !== undefined) params.cr = options.cr;
    if (options.limit) params.limit = options.limit;
    if (options.documentSlug) params.document__slug = options.documentSlug;

    const response = await this.makeRequest<Open5eResponse<any>>('/v1/monsters/', params);

    const transformedResults: MonsterData[] = response.results.map(monster => ({
      name: monster.name,
      size: monster.size,
      type: monster.type,
      alignment: monster.alignment,
      armorClass: monster.armor_class,
      hitPoints: monster.hit_points,
      hitDice: monster.hit_dice,
      speed: monster.speed,
      abilities: {
        strength: monster.strength,
        dexterity: monster.dexterity,
        constitution: monster.constitution,
        intelligence: monster.intelligence,
        wisdom: monster.wisdom,
        charisma: monster.charisma
      },
      savingThrows: monster.saving_throws,
      skills: monster.skills,
      damageResistances: monster.damage_resistances,
      damageImmunities: monster.damage_immunities,
      conditionImmunities: monster.condition_immunities,
      senses: monster.senses,
      languages: monster.languages,
      challengeRating: monster.challenge_rating,
      actions: monster.actions || [],
      specialAbilities: monster.special_abilities || [],
      reactions: monster.reactions || [],
      legendaryActions: monster.legendary_actions || [],
      description: monster.desc,
      url: monster.url
    }));

    return {
      count: response.count,
      results: transformedResults,
      hasMore: !!response.next
    };
  }

  async getMonstersByCR(challengeRating: number): Promise<{ count: number; results: MonsterData[]; hasMore: boolean }> {
    return this.searchMonsters('', { cr: challengeRating, limit: 20 });
  }

  // Weapons
  async searchWeapons(query?: string, options: {
    isMartial?: boolean;
    isFinesse?: boolean;
    limit?: number;
    scope?: ContentScope;
  } = {}): Promise<{ count: number; results: WeaponData[]; hasMore: boolean }> {
    const response = await this.query('weapons', {
      name: query,
      martial: options.isMartial,
      finesse: options.isFinesse,
      documents: await this.scopeDocuments(options.scope)
    }, { limit: options.limit });

    return {
      count: response.count,
      results: response.rows.map(weapon => this.transformWeapon(weapon)),
      hasMore: response.hasMore
    };
  }

  /**
   * v2 weapons have no melee/martial/finesse booleans -- only `is_simple`, a
   * range and a list of named properties -- so the flags are derived here.
   */
  private transformWeapon(weapon: any): WeaponData {
    const properties: Array<{ name: string; detail: string | null }> =
      (weapon.properties ?? []).map((p: any) => ({ name: p.property?.name ?? '', detail: p.detail ?? null }));
    const has = (propertyName: string) =>
      properties.some(p => p.name.toLowerCase() === propertyName.toLowerCase());

    const thrown = has('Thrown');
    const ranged = (weapon.range ?? 0) > 0 && !thrown;
    const unit = weapon.distance_unit || 'feet';

    return {
      name: weapon.name,
      key: weapon.key ?? '',
      category: weapon.is_simple ? 'simple' : 'martial',
      damageDice: weapon.damage_dice,
      damageType: weapon.damage_type?.name,
      range: weapon.range > 0 ? `${weapon.range}/${weapon.long_range} ${unit}` : undefined,
      properties: {
        martial: !weapon.is_simple,
        melee: !ranged,
        ranged: ranged || thrown,
        finesse: has('Finesse'),
        light: has('Light'),
        heavy: has('Heavy'),
        twoHanded: has('Two-Handed'),
        versatile: has('Versatile'),
        thrown
      },
      propertyNames: properties.map(p => p.detail ? `${p.name} (${p.detail})` : p.name),
      source: sourceOf(weapon),
      url: weapon.key ? `https://api.open5e.com/v2/weapons/${weapon.key}/` : ''
    };
  }

  // Magic Items functionality
  async searchMagicItems(query?: string, options: {
    rarity?: string;
    type?: string;
    requiresAttunement?: boolean;
    limit?: number;
  } = {}): Promise<{ count: number; results: MagicItemData[]; hasMore: boolean }> {
    // Validate inputs
    if (query && typeof query !== 'string') {
      throw new Error('Search query must be a string');
    }
    if (options.limit && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 50)) {
      throw new Error('Limit must be an integer between 1 and 50');
    }

    const params: Record<string, any> = {};
    
    if (query) params.name__icontains = query;
    if (options.rarity) params.rarity = options.rarity;
    if (options.type) params.type = options.type;
    if (options.requiresAttunement !== undefined) {
      params.requires_attunement = options.requiresAttunement ? 'true' : 'false';
    }
    if (options.limit) params.limit = options.limit;

    try {
      const response = await this.makeRequest<Open5eResponse<any>>('/v1/magicitems/', params);

      const transformedResults: MagicItemData[] = response.results
        .filter(item => this.validateMagicItem(item))
        .map(item => ({
          name: item.name || 'Unknown Item',
          type: item.type || 'Unknown Type',
          description: item.desc || 'No description available',
          rarity: item.rarity || 'unknown',
          requiresAttunement: item.requires_attunement || 'No',
          document: {
            slug: item.document__slug || '',
            title: item.document__title || 'Unknown Source',
            url: item.document__url || ''
          },
          url: item.slug ? `https://api.open5e.com/v1/magicitems/${item.slug}/` : ''
        }));

      return {
        count: response.count || 0,
        results: transformedResults,
        hasMore: !!response.next
      };
    } catch (error) {
      throw new Error(`Failed to search magic items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateMagicItem(item: any): boolean {
    return item && typeof item === 'object' && 
           (item.name || item.slug) && 
           typeof item.name === 'string';
  }

  async getMagicItemDetails(itemName: string): Promise<MagicItemData | null> {
    // Search for the magic item first
    const searchResults = await this.searchMagicItems(itemName, { limit: 5 });
    
    // Find exact match or closest match
    const exactMatch = searchResults.results.find(
      item => item.name.toLowerCase() === itemName.toLowerCase()
    );
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // Return first result if no exact match but results exist
    return searchResults.results.length > 0 ? searchResults.results[0] : null;
  }

  // Armor
  async searchArmor(query?: string, options: {
    category?: string;
    acBase?: number;
    stealthDisadvantage?: boolean;
    limit?: number;
    scope?: ContentScope;
  } = {}): Promise<{ count: number; results: ArmorData[]; hasMore: boolean }> {
    const response = await this.query('armor', {
      name: query,
      category: options.category,
      acBase: options.acBase,
      stealthDisadvantage: options.stealthDisadvantage,
      documents: await this.scopeDocuments(options.scope)
    }, { limit: options.limit });

    const results: ArmorData[] = response.rows.map(armor => ({
      name: armor.name,
      key: armor.key ?? '',
      category: armor.category,
      acDisplay: armor.ac_display,
      acBase: armor.ac_base,
      acAddDexMod: armor.ac_add_dexmod,
      acCapDexMod: armor.ac_cap_dexmod,
      grantsStealthDisadvantage: armor.grants_stealth_disadvantage,
      strengthScoreRequired: armor.strength_score_required,
      source: sourceOf(armor),
      url: armor.key ? `https://api.open5e.com/v2/armor/${armor.key}/` : ''
    }));

    return { count: response.count, results, hasMore: response.hasMore };
  }

  async getArmorDetails(armorName: string, scope?: ContentScope): Promise<ArmorData | null> {
    const { results } = await this.searchArmor(armorName, { scope });
    return this.pickResult(results, armorName);
  }

  /** The best-named result, preferring core SRD sources (see pickByName). */
  private pickResult<T extends { name: string; source: SourceLabel }>(rows: T[], name: string): T | null {
    return pickByName(rows, name, { nameOf: row => row.name, sourceKeyOf: row => row.source.key });
  }

  // Feats
  async searchFeats(query?: string, options: {
    hasPrerequisite?: boolean;
    limit?: number;
    scope?: ContentScope;
  } = {}): Promise<{ count: number; results: FeatData[]; hasMore: boolean }> {
    const response = await this.query('feats', {
      name: query,
      hasPrerequisite: options.hasPrerequisite,
      documents: await this.scopeDocuments(options.scope)
    }, { limit: options.limit });

    const results: FeatData[] = response.rows.map(feat => ({
      name: feat.name,
      key: feat.key ?? '',
      description: feat.desc ?? '',
      prerequisite: feat.prerequisite ?? '',
      hasPrerequisite: Boolean(feat.has_prerequisite),
      type: feat.type ?? '',
      benefits: feat.benefits || [],
      source: sourceOf(feat),
      url: feat.key ? `https://api.open5e.com/v2/feats/${feat.key}/` : ''
    }));

    return { count: response.count, results, hasMore: response.hasMore };
  }

  async getFeatDetails(featName: string, scope?: ContentScope): Promise<FeatData | null> {
    const { results } = await this.searchFeats(featName, { limit: 50, scope });
    return this.pickResult(results, featName);
  }

  // Conditions
  async searchConditions(query?: string, options: {
    limit?: number;
    scope?: ContentScope;
  } = {}): Promise<{ count: number; results: ConditionData[]; hasMore: boolean }> {
    // A ruleset selects conditions by their per-ruleset descriptions, not by
    // document: the 2014 and 2024 wordings share one "core" row (see
    // ENDPOINTS.conditions). Sources still filter by document.
    const ruleset = options.scope?.ruleset;
    const sourcesOnly = options.scope?.sources ? { sources: options.scope.sources } : undefined;
    if (ruleset !== undefined) await this.scopeDocuments({ ruleset }); // validates the name

    const response = await this.query('conditions', {
      name: query,
      ruleset,
      documents: await this.scopeDocuments(sourcesOnly)
    }, { limit: options.limit });

    const results: ConditionData[] = response.rows.map(condition => {
      const descriptions: Record<string, string> = {};
      for (const entry of condition.descriptions ?? []) {
        if (entry?.gamesystem && typeof entry.desc === 'string') descriptions[entry.gamesystem] = entry.desc;
      }
      const chosen = [ruleset, '5e-2014', '5e-2024', ...Object.keys(descriptions)]
        .find(system => system !== undefined && system in descriptions) ?? null;

      return {
        name: condition.name,
        key: condition.key ?? '',
        description: chosen ? descriptions[chosen] : '',
        ruleset: chosen,
        descriptions,
        source: sourceOf(condition),
        url: condition.key ? `https://api.open5e.com/v2/conditions/${condition.key}/` : ''
      };
    });

    return { count: response.count, results, hasMore: response.hasMore };
  }

  async getConditionDetails(conditionName: string, scope?: ContentScope): Promise<ConditionData | null> {
    const { results } = await this.searchConditions(conditionName, { scope });
    return this.pickResult(results, conditionName);
  }

  async getAllConditions(scope?: ContentScope): Promise<ConditionData[]> {
    return (await this.searchConditions('', { scope })).results;
  }

  // Backgrounds
  async searchBackgrounds(query?: string, options: {
    limit?: number;
    scope?: ContentScope;
  } = {}): Promise<{ count: number; results: BackgroundData[]; hasMore: boolean }> {
    const response = await this.query('backgrounds', {
      name: query,
      documents: await this.scopeDocuments(options.scope)
    }, { limit: options.limit });

    const results: BackgroundData[] = response.rows.map(background => {
      const benefits = background.benefits || [];
      const getBenefit = (...types: string[]): string =>
        benefits.find((b: any) => types.includes(b.type))?.desc ?? '';

      return {
        name: background.name,
        description: background.desc || 'No description available',
        key: background.key,
        benefits,
        abilityScoreIncrease: getBenefit('ability_score', 'ability_score_increases'),
        skillProficiencies: getBenefit('skill_proficiency', 'skill_proficiencies'),
        toolProficiencies: getBenefit('tool_proficiency', 'tool_proficiencies'),
        languages: getBenefit('language', 'languages'),
        equipment: getBenefit('equipment', 'suggested_equipment'),
        feature: getBenefit('feature'),
        source: sourceOf(background),
        url: background.key ? `https://api.open5e.com/v2/backgrounds/${background.key}/` : ''
      };
    });

    return { count: response.count, results, hasMore: response.hasMore };
  }

  async getBackgroundDetails(backgroundName: string, scope?: ContentScope): Promise<BackgroundData | null> {
    const { results } = await this.searchBackgrounds(backgroundName, { limit: 50, scope });
    return this.pickResult(results, backgroundName);
  }

  // Rules Sections functionality
  async searchSections(query?: string, options: {
    limit?: number;
  } = {}): Promise<{ count: number; results: SectionData[]; hasMore: boolean }> {
    const params: Record<string, any> = {};
    
    if (query) params.search = query;  // full-text: sections are rules prose, not just titles
    if (options.limit) params.limit = options.limit;

    const response = await this.makeRequest<Open5eResponse<any>>('/v1/sections/', params);

    const transformedResults: SectionData[] = response.results.map(section => ({
      slug: section.slug,
      name: section.name,
      description: section.desc || 'No description available',
      parent: section.parent,
      document: section.document,
      url: `https://api.open5e.com/v1/sections/${section.slug}/`
    }));

    return {
      count: response.count,
      results: transformedResults,
      hasMore: !!response.next
    };
  }

  async getSectionDetails(sectionName: string): Promise<SectionData | null> {
    // First try to get all sections and find exact match
    const allResults = await this.searchSections('', { limit: 100 });
    
    // Find exact match first (by name or slug)
    const exactMatch = allResults.results.find(
      section => section.name.toLowerCase() === sectionName.toLowerCase() ||
                 section.slug.toLowerCase() === sectionName.toLowerCase()
    );
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // Try partial match by name
    const partialMatch = allResults.results.find(
      section => section.name.toLowerCase().includes(sectionName.toLowerCase())
    );
    
    return partialMatch || null;
  }

  async getAllSections(): Promise<SectionData[]> {
    // Get all sections for quick reference
    const response = await this.searchSections('', { limit: 100 });
    return response.results;
  }

  // DM Encounter Builder functionality
  private readonly CR_TO_XP: Record<string, number> = {
    '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
    '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
    '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
    '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
    '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
    '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
    '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000
  };

  private readonly ENCOUNTER_THRESHOLDS: Record<number, Record<string, number>> = {
    1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
    2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
    3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
    4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
    5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
    6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
    7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
    8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
    9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
    10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
    11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
    12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
    13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
    14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
    15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
    16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
    17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
    18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
    19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
    20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 }
  };

  // DMG p.82 encounter multipliers, keyed by number of monsters:
  // 1 -> x1, 2 -> x1.5, 3-6 -> x2, 7-10 -> x2.5, 11-14 -> x3, 15+ -> x4.
  private readonly XP_MULTIPLIERS: Record<number, number> = {
    1: 1, 2: 1.5, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2.5,
    8: 2.5, 9: 2.5, 10: 2.5, 11: 3, 12: 3, 13: 3, 14: 3, 15: 4
  };

  async buildRandomEncounter(options: EncounterBuilderOptions): Promise<EncounterData> {
    const { partySize, partyLevel, difficulty, environment, minCR = 0, maxCR = partyLevel + 3 } = options;
    
    // Calculate target XP budget
    const thresholds = this.ENCOUNTER_THRESHOLDS[Math.min(partyLevel, 20)];
    if (!thresholds) {
      throw new Error(`Invalid party level: ${partyLevel}`);
    }
    
    const budgetPerCharacter = thresholds[difficulty];
    const totalBudget = budgetPerCharacter * partySize;
    
    // Get monsters within CR range
    const monsters = await this.getMonstersByCRRange(minCR, maxCR, environment, options.monsterTypes);
    
    if (monsters.length === 0) {
      throw new Error('No monsters found matching criteria');
    }
    
    // Build encounter using budget allocation
    const encounterMonsters = this.allocateMonstersToEncounter(monsters, totalBudget, options.maxMonsters || 8);
    
    // Calculate XP values
    const totalXP = encounterMonsters.reduce((sum, em) => sum + em.totalXP, 0);
    const monsterCount = encounterMonsters.reduce((sum, em) => sum + em.count, 0);
    const multiplier = this.XP_MULTIPLIERS[Math.min(monsterCount, 15)] ?? 1;
    const adjustedXP = Math.floor(totalXP * multiplier);
    
    // Generate encounter data
    const encounter: EncounterData = {
      id: `encounter_${Date.now()}`,
      name: this.generateEncounterName(encounterMonsters, environment),
      description: this.generateEncounterDescription(encounterMonsters, environment, difficulty),
      partySize,
      partyLevel,
      difficulty,
      monsters: encounterMonsters,
      totalXP,
      adjustedXP,
      estimatedDuration: this.estimateEncounterDuration(encounterMonsters.length, difficulty),
      environment,
      tactics: this.generateTacticalAdvice(encounterMonsters)
    };
    
    return encounter;
  }

  private async getMonstersByCRRange(minCR: number, maxCR: number, environment?: string, types?: string[]): Promise<MonsterData[]> {
    const allMonsters: MonsterData[] = [];
    
    // Iterate through CR range and fetch monsters
    for (let cr = minCR; cr <= maxCR; cr++) {
      try {
        // Handle CR 0 specially - get fractional CRs instead
        if (cr === 0) {
          const fractions = ['1/8', '1/4', '1/2'];
          for (const fraction of fractions) {
            const fracResults = await this.searchMonsters('', { cr: fraction as any, limit: 50 });
            allMonsters.push(...fracResults.results);
          }
        } else {
          const results = await this.searchMonsters('', { cr: cr, limit: 50 });
          allMonsters.push(...results.results);
        }
      } catch (error) {
        console.warn(`Failed to fetch monsters for CR ${cr}:`, error);
      }
    }
    
    // Filter by environment and type if specified
    let filteredMonsters = allMonsters;
    
    if (environment) {
      filteredMonsters = filteredMonsters.filter(monster => 
        monster.description?.toLowerCase().includes(environment.toLowerCase()) ||
        monster.type.toLowerCase().includes(environment.toLowerCase())
      );
    }
    
    if (types && types.length > 0) {
      filteredMonsters = filteredMonsters.filter(monster =>
        types.some(type => monster.type.toLowerCase().includes(type.toLowerCase()))
      );
    }
    
    return filteredMonsters;
  }

  private allocateMonstersToEncounter(monsters: MonsterData[], budget: number, maxMonsters: number): EncounterMonster[] {
    const encounterMonsters: EncounterMonster[] = [];
    let remainingBudget = budget;
    let remainingSlots = maxMonsters;
    
    // Sort monsters by XP value for better allocation
    const sortedMonsters = monsters.sort((a, b) => {
      const aXP = this.CR_TO_XP[a.challengeRating] || 0;
      const bXP = this.CR_TO_XP[b.challengeRating] || 0;
      return bXP - aXP;
    });
    
    while (remainingBudget > 0 && remainingSlots > 0 && sortedMonsters.length > 0) {
      // Find monsters that fit in remaining budget
      const affordableMonsters = sortedMonsters.filter(monster => {
        const xp = this.CR_TO_XP[monster.challengeRating] || 0;
        return xp <= remainingBudget;
      });
      
      if (affordableMonsters.length === 0) break;
      
      // Randomly select a monster
      const monster = affordableMonsters[Math.floor(Math.random() * affordableMonsters.length)];
      const xp = this.CR_TO_XP[monster.challengeRating] || 0;
      
      // Determine how many of this monster we can afford
      const maxAffordable = Math.floor(remainingBudget / xp);
      const maxBySlots = remainingSlots;
      const count = Math.min(maxAffordable, maxBySlots, 4); // Max 4 of same monster
      
      if (count > 0) {
        encounterMonsters.push({
          name: monster.name,
          cr: monster.challengeRating,
          count,
          xp,
          totalXP: xp * count,
          monsterData: monster
        });
        
        remainingBudget -= xp * count;
        remainingSlots -= count;
      }
      
      // Remove this monster from consideration to avoid infinite loops
      const index = sortedMonsters.indexOf(monster);
      sortedMonsters.splice(index, 1);
    }
    
    return encounterMonsters;
  }

  private generateEncounterName(monsters: EncounterMonster[], environment?: string): string {
    if (monsters.length === 0) return 'Empty Encounter';
    
    const envPrefix = environment ? `${environment.charAt(0).toUpperCase() + environment.slice(1)} ` : '';
    
    if (monsters.length === 1) {
      const monster = monsters[0];
      if (monster.count === 1) {
        return `${envPrefix}${monster.name}`;
      } else {
        return `${envPrefix}${monster.count} ${monster.name}s`;
      }
    }
    
    const monsterTypes = monsters.map(m => m.monsterData.type).filter((type, index, arr) => arr.indexOf(type) === index);
    
    if (monsterTypes.length === 1) {
      return `${envPrefix}${monsterTypes[0]} Pack`;
    }
    
    return `${envPrefix}Mixed Encounter`;
  }

  private generateEncounterDescription(monsters: EncounterMonster[], environment?: string, difficulty?: string): string {
    const monsterDescriptions = monsters.map(em => 
      em.count === 1 ? `a ${em.name}` : `${em.count} ${em.name}s`
    );
    
    let description = `This ${difficulty || 'balanced'} encounter features `;
    
    if (monsterDescriptions.length === 1) {
      description += monsterDescriptions[0];
    } else if (monsterDescriptions.length === 2) {
      description += `${monsterDescriptions[0]} and ${monsterDescriptions[1]}`;
    } else {
      description += `${monsterDescriptions.slice(0, -1).join(', ')}, and ${monsterDescriptions[monsterDescriptions.length - 1]}`;
    }
    
    if (environment) {
      description += ` in a ${environment} environment`;
    }
    
    description += '.';
    
    return description;
  }

  private estimateEncounterDuration(monsterCount: number, difficulty: string): string {
    const baseDuration = monsterCount * 2; // 2 rounds per monster as baseline
    const difficultyMultiplier = {
      'easy': 0.8,
      'medium': 1.0,
      'hard': 1.2,
      'deadly': 1.5
    }[difficulty] || 1.0;
    
    const rounds = Math.ceil(baseDuration * difficultyMultiplier);
    const minutes = Math.ceil((rounds * 6) / 60); // 6 seconds per round
    
    return `${rounds} rounds (~${minutes} minutes)`;
  }

  private generateTacticalAdvice(monsters: EncounterMonster[]): string {
    const advice: string[] = [];
    
    const totalMonsters = monsters.reduce((sum, em) => sum + em.count, 0);
    
    if (totalMonsters === 1) {
      advice.push("Single powerful foe - focus on dynamic positioning and legendary actions");
    } else if (totalMonsters <= 3) {
      advice.push("Small group - consider coordinated attacks and positioning");
    } else {
      advice.push("Large group - use area effects and focus fire tactics");
    }
    
    const hasFlying = monsters.some(em => em.monsterData.speed && typeof em.monsterData.speed === 'object' && em.monsterData.speed.fly);
    if (hasFlying) {
      advice.push("Flying enemies present - prepare ranged attacks and vertical positioning");
    }
    
    const hasSpellcasters = monsters.some(em => em.monsterData.actions.some(action => 
      action.desc?.toLowerCase().includes('spell') || action.name?.toLowerCase().includes('spell')
    ));
    if (hasSpellcasters) {
      advice.push("Spellcasters present - prioritize concentration saves and spell disruption");
    }
    
    return advice.join('. ') + '.';
  }

  async getEncounterDifficulty(partySize: number, partyLevel: number, monsters: EncounterMonster[]): Promise<string> {
    const totalXP = monsters.reduce((sum, em) => sum + em.totalXP, 0);
    const monsterCount = monsters.reduce((sum, em) => sum + em.count, 0);
    const multiplier = this.XP_MULTIPLIERS[Math.min(monsterCount, 15)] ?? 1;
    const adjustedXP = Math.floor(totalXP * multiplier);
    
    const thresholds = this.ENCOUNTER_THRESHOLDS[Math.min(partyLevel, 20)];
    if (!thresholds) return 'unknown';
    
    const partyThresholds = {
      easy: thresholds.easy * partySize,
      medium: thresholds.medium * partySize,
      hard: thresholds.hard * partySize,
      deadly: thresholds.deadly * partySize
    };
    
    if (adjustedXP < partyThresholds.easy) return 'trivial';
    if (adjustedXP < partyThresholds.medium) return 'easy';
    if (adjustedXP < partyThresholds.hard) return 'medium';
    if (adjustedXP < partyThresholds.deadly) return 'hard';
    return 'deadly';
  }

  // Player-focused Character Build Helper functionality
  async generateCharacterBuild(options: CharacterBuildOptions = {}): Promise<CharacterBuildData> {
    const {
      preferredClass,
      preferredRace,
      preferredBackground,
      playstyle = 'balanced',
      campaignType = 'mixed',
      experienceLevel = 'intermediate',
      focusLevel = 5,
      // NOTE: accepted and advertised by generate_character_build but not yet
      // honoured -- multiclass builds are not generated. See ROADMAP.
      allowMulticlass: _allowMulticlass = false,
      preferredAbilityScores
    } = options;

    // Get available data
    const [classes, races, backgrounds, feats] = await Promise.all([
      this.searchClasses(),
      this.searchRaces(''),
      this.searchBackgrounds('', { limit: 100 }),
      this.searchFeats('', { limit: 100 })
    ]);

    // Select race
    const selectedRace = await this.selectOptimalRace(
      races.results,
      preferredRace,
      playstyle,
      preferredAbilityScores
    );

    // Select class
    const selectedClass = await this.selectOptimalClass(
      classes.results,
      preferredClass,
      playstyle,
      campaignType,
      selectedRace
    );

    // Select background
    const selectedBackground = await this.selectOptimalBackground(
      backgrounds.results,
      preferredBackground,
      selectedClass,
      campaignType
    );

    // Get suggested feats
    const suggestedFeats = await this.getSuggestedFeats(
      feats.results,
      selectedRace,
      selectedClass,
      playstyle,
      focusLevel
    );

    // Get key spells if spellcaster
    const keySpells = selectedClass.spellcastingAbility ? 
      await this.getKeySpells(selectedClass, focusLevel) : undefined;

    // Generate build strategy and progression
    const buildStrategy = this.generateBuildStrategy(
      selectedRace,
      selectedClass,
      selectedBackground,
      playstyle,
      experienceLevel
    );

    const levelProgression = this.generateLevelProgression(
      selectedClass,
      focusLevel,
      playstyle
    );

    const build: CharacterBuildData = {
      id: `build_${Date.now()}`,
      name: this.generateBuildName(selectedRace, selectedClass, playstyle),
      description: this.generateBuildDescription(selectedRace, selectedClass, selectedBackground, playstyle),
      race: selectedRace,
      class: selectedClass,
      background: selectedBackground,
      suggestedFeats: suggestedFeats,
      abilityScorePriority: this.getAbilityScorePriority(selectedClass, playstyle),
      keySpells,
      recommendedEquipment: this.getRecommendedEquipment(selectedClass, playstyle),
      buildStrategy,
      levelProgression,
      playstyle,
      strengths: this.analyzeBuildStrengths(selectedRace, selectedClass, selectedBackground, playstyle),
      weaknesses: this.analyzeBuildWeaknesses(selectedRace, selectedClass, selectedBackground, playstyle)
    };

    return build;
  }

  private async selectOptimalRace(
    races: EnhancedRaceData[],
    preferredRace?: string,
    playstyle?: string,
    preferredAbilityScores?: string[]
  ): Promise<EnhancedRaceData> {
    // If specific race requested, find it
    if (preferredRace) {
      const found = races.find(race => 
        race.name.toLowerCase().includes(preferredRace.toLowerCase())
      );
      if (found) return found;
    }

    // Score races based on playstyle and ability score preferences
    const scoredRaces = races.map(race => ({
      race,
      score: this.scoreRaceForPlaystyle(race, playstyle, preferredAbilityScores)
    }));

    scoredRaces.sort((a, b) => b.score - a.score);
    return scoredRaces[0].race;
  }

  private async selectOptimalClass(
    classes: EnhancedClassData[],
    preferredClass?: string,
    playstyle?: string,
    campaignType?: string,
    selectedRace?: EnhancedRaceData
  ): Promise<EnhancedClassData> {
    // If specific class requested, find it
    if (preferredClass) {
      const found = classes.find(cls => 
        cls.name.toLowerCase().includes(preferredClass.toLowerCase())
      );
      if (found) return found;
    }

    // Score classes based on playstyle and campaign type
    const scoredClasses = classes.map(cls => ({
      class: cls,
      score: this.scoreClassForPlaystyle(cls, playstyle, campaignType, selectedRace)
    }));

    scoredClasses.sort((a, b) => b.score - a.score);
    return scoredClasses[0].class;
  }

  private async selectOptimalBackground(
    backgrounds: BackgroundData[],
    preferredBackground?: string,
    selectedClass?: EnhancedClassData,
    campaignType?: string
  ): Promise<BackgroundData> {
    // If specific background requested, find it
    if (preferredBackground) {
      const found = backgrounds.find(bg => 
        bg.name.toLowerCase().includes(preferredBackground.toLowerCase())
      );
      if (found) return found;
    }

    // Score backgrounds based on class synergy and campaign type
    const scoredBackgrounds = backgrounds.map(bg => ({
      background: bg,
      score: this.scoreBackgroundSynergy(bg, selectedClass, campaignType)
    }));

    scoredBackgrounds.sort((a, b) => b.score - a.score);
    return scoredBackgrounds[0].background;
  }

  private async getSuggestedFeats(
    feats: FeatData[],
    race: EnhancedRaceData,
    cls: EnhancedClassData,
    playstyle?: string,
    // NOTE: feat scoring does not yet weight character level.
    _level?: number
  ): Promise<FeatData[]> {
    // Score feats based on race/class synergy and playstyle
    const scoredFeats = feats.map(feat => ({
      feat,
      score: this.scoreFeatSynergy(feat, race, cls, playstyle)
    }));

    scoredFeats.sort((a, b) => b.score - a.score);
    
    // Return top 5 suggested feats
    return scoredFeats.slice(0, 5).map(sf => sf.feat);
  }

  private async getKeySpells(cls: EnhancedClassData, level: number): Promise<EnhancedSpellData[]> {
    try {
      const classSpells = (await this.getSpellsByClass(cls.name, { limit: 100 })).results;
      
      // Filter spells by level and importance
      const keySpells = classSpells
        .filter(spell => spell.level <= Math.ceil(level / 2))
        .sort((a, b) => {
          // Prioritize by level and utility
          if (a.level !== b.level) return a.level - b.level;
          return this.getSpellUtilityScore(a) - this.getSpellUtilityScore(b);
        })
        .slice(0, 10);

      return keySpells;
    } catch (error) {
      return [];
    }
  }

  private scoreRaceForPlaystyle(race: EnhancedRaceData, playstyle?: string, preferredAbilities?: string[]): number {
    let score = 0;
    
    // Base score for all races
    score += 1;

    // Analyze traits for playstyle fit
    const traitText = race.traits.join(' ').toLowerCase();
    
    switch (playstyle) {
      case 'damage':
        if (traitText.includes('damage') || traitText.includes('attack')) score += 3;
        if (traitText.includes('strength') || traitText.includes('dexterity')) score += 2;
        break;
      case 'support':
        if (traitText.includes('spell') || traitText.includes('magic')) score += 3;
        if (traitText.includes('wisdom') || traitText.includes('charisma')) score += 2;
        break;
      case 'tank':
        if (traitText.includes('constitution') || traitText.includes('armor')) score += 3;
        if (traitText.includes('resistance') || traitText.includes('hardy')) score += 2;
        break;
      case 'utility':
        if (traitText.includes('skill') || traitText.includes('tool')) score += 3;
        if (traitText.includes('intelligence') || traitText.includes('versatile')) score += 2;
        break;
    }

    // Bonus for preferred abilities
    if (preferredAbilities) {
      preferredAbilities.forEach(ability => {
        if (race.abilityScoreIncrease.toLowerCase().includes(ability.toLowerCase())) {
          score += 2;
        }
      });
    }

    return score;
  }

  private scoreClassForPlaystyle(
    cls: EnhancedClassData,
    playstyle?: string,
    campaignType?: string,
    // NOTE: race synergy is not yet part of this score.
    _race?: EnhancedRaceData
  ): number {
    let score = 0;
    
    const className = cls.name.toLowerCase();

    // Base playstyle scoring
    switch (playstyle) {
      case 'damage':
        if (['fighter', 'barbarian', 'ranger', 'rogue'].includes(className)) score += 5;
        if (['paladin', 'warlock'].includes(className)) score += 3;
        break;
      case 'support':
        if (['cleric', 'bard', 'druid'].includes(className)) score += 5;
        if (['paladin', 'ranger'].includes(className)) score += 3;
        break;
      case 'tank':
        if (['fighter', 'paladin', 'barbarian'].includes(className)) score += 5;
        if (['cleric', 'druid'].includes(className)) score += 2;
        break;
      case 'utility':
        if (['wizard', 'bard', 'rogue'].includes(className)) score += 5;
        if (['ranger', 'druid'].includes(className)) score += 3;
        break;
      case 'balanced':
        if (['paladin', 'ranger', 'bard'].includes(className)) score += 4;
        score += 2; // All classes get some points for balanced
        break;
    }

    // Campaign type scoring
    switch (campaignType) {
      case 'combat':
        if (['fighter', 'barbarian', 'paladin'].includes(className)) score += 2;
        break;
      case 'roleplay':
        if (['bard', 'warlock', 'sorcerer'].includes(className)) score += 2;
        break;
      case 'exploration':
        if (['ranger', 'druid', 'rogue'].includes(className)) score += 2;
        break;
    }

    return score;
  }

  private scoreBackgroundSynergy(
    background: BackgroundData,
    cls?: EnhancedClassData,
    campaignType?: string
  ): number {
    let score = 1; // Base score

    if (!cls) return score;

    const bgName = background.name.toLowerCase();
    const className = cls.name.toLowerCase();

    // Class-specific synergies
    if (className.includes('cleric') && bgName.includes('acolyte')) score += 3;
    if (className.includes('rogue') && (bgName.includes('criminal') || bgName.includes('charlatan'))) score += 3;
    if (className.includes('fighter') && bgName.includes('soldier')) score += 3;
    if (className.includes('wizard') && bgName.includes('sage')) score += 3;
    if (className.includes('bard') && bgName.includes('entertainer')) score += 3;

    // Campaign type synergies
    switch (campaignType) {
      case 'roleplay':
        if (bgName.includes('noble') || bgName.includes('entertainer')) score += 2;
        break;
      case 'exploration':
        if (bgName.includes('outlander') || bgName.includes('folk hero')) score += 2;
        break;
      case 'combat':
        if (bgName.includes('soldier') || bgName.includes('gladiator')) score += 2;
        break;
    }

    return score;
  }

  private scoreFeatSynergy(
    feat: FeatData,
    race: EnhancedRaceData,
    cls: EnhancedClassData,
    playstyle?: string
  ): number {
    let score = 1;
    
    const featName = feat.name.toLowerCase();
    const featDesc = feat.description.toLowerCase();
    const className = cls.name.toLowerCase();

    // Playstyle-based scoring
    switch (playstyle) {
      case 'damage':
        if (featName.includes('weapon') || featName.includes('sharpshooter') || featName.includes('great weapon')) score += 4;
        if (featDesc.includes('damage') || featDesc.includes('attack')) score += 2;
        break;
      case 'support':
        if (featName.includes('healer') || featName.includes('inspiring')) score += 4;
        if (featDesc.includes('ally') || featDesc.includes('help')) score += 2;
        break;
      case 'tank':
        if (featName.includes('tough') || featName.includes('shield') || featName.includes('armor')) score += 4;
        if (featDesc.includes('ac') || featDesc.includes('hit points')) score += 2;
        break;
      case 'utility':
        if (featName.includes('skill') || featName.includes('expertise')) score += 4;
        if (featDesc.includes('proficiency') || featDesc.includes('advantage')) score += 2;
        break;
    }

    // Class-specific feat synergies
    if (className.includes('fighter') && featName.includes('weapon')) score += 2;
    if (className.includes('wizard') && featName.includes('spell')) score += 2;
    if (className.includes('rogue') && featName.includes('skill')) score += 2;

    return score;
  }

  private getSpellUtilityScore(spell: EnhancedSpellData): number {
    let score = 0;
    
    const desc = spell.description.toLowerCase();
    
    // High utility spells get higher scores
    if (desc.includes('heal') || desc.includes('cure')) score += 5;
    if (desc.includes('damage') && spell.level <= 3) score += 4;
    if (desc.includes('buff') || desc.includes('enhance')) score += 3;
    if (desc.includes('utility') || desc.includes('ritual')) score += 2;
    
    // Lower level spells are more accessible
    score += (10 - spell.level);
    
    return score;
  }

  private generateBuildName(race: EnhancedRaceData, cls: EnhancedClassData, playstyle: string): string {
    const styleNames = {
      damage: 'Destroyer',
      support: 'Guardian',
      tank: 'Bulwark',
      utility: 'Versatile',
      balanced: 'Adaptable'
    };
    
    return `${styleNames[playstyle as keyof typeof styleNames] || 'Balanced'} ${race.name} ${cls.name}`;
  }

  private generateBuildDescription(
    race: EnhancedRaceData,
    cls: EnhancedClassData,
    background: BackgroundData,
    playstyle: string
  ): string {
    const descriptions = {
      damage: 'focused on dealing maximum damage to enemies',
      support: 'dedicated to helping allies and controlling the battlefield',
      tank: 'built to absorb damage and protect the party',
      utility: 'designed for problem-solving and skill versatility',
      balanced: 'well-rounded for any situation'
    };

    return `A ${race.name} ${cls.name} with a ${background.name} background, ${descriptions[playstyle as keyof typeof descriptions] || 'adaptable to various challenges'}. This build combines the ${race.name}'s natural abilities with the ${cls.name}'s class features for optimal ${playstyle} performance.`;
  }

  // NOTE: priorities are class-driven only; playstyle is not yet applied.
  private getAbilityScorePriority(cls: EnhancedClassData, _playstyle: string): string[] {
    const className = cls.name.toLowerCase();
    
    // Class-based priorities
    const classPriorities: Record<string, string[]> = {
      fighter: ['strength', 'constitution', 'dexterity'],
      wizard: ['intelligence', 'constitution', 'dexterity'],
      cleric: ['wisdom', 'constitution', 'strength'],
      rogue: ['dexterity', 'intelligence', 'constitution'],
      barbarian: ['strength', 'constitution', 'dexterity'],
      bard: ['charisma', 'dexterity', 'constitution'],
      druid: ['wisdom', 'constitution', 'dexterity'],
      monk: ['dexterity', 'wisdom', 'constitution'],
      paladin: ['strength', 'charisma', 'constitution'],
      ranger: ['dexterity', 'wisdom', 'constitution'],
      sorcerer: ['charisma', 'constitution', 'dexterity'],
      warlock: ['charisma', 'constitution', 'dexterity']
    };

    return classPriorities[className] || ['strength', 'dexterity', 'constitution'];
  }

  private getRecommendedEquipment(cls: EnhancedClassData, playstyle: string): string[] {
    const className = cls.name.toLowerCase();
    const baseEquipment: string[] = [];

    // Class-based equipment
    if (['fighter', 'paladin', 'barbarian'].includes(className)) {
      baseEquipment.push('Melee weapons', 'Heavy armor', 'Shield');
    } else if (['wizard', 'sorcerer', 'warlock'].includes(className)) {
      baseEquipment.push('Spellcasting focus', 'Spell components', 'Light armor');
    } else if (['rogue', 'ranger'].includes(className)) {
      baseEquipment.push('Ranged weapons', 'Thieves\' tools', 'Light armor');
    }

    // Playstyle additions
    switch (playstyle) {
      case 'damage':
        baseEquipment.push('Weapon enhancements', 'Damage-focused magic items');
        break;
      case 'support':
        baseEquipment.push('Healing potions', 'Utility magic items');
        break;
      case 'tank':
        baseEquipment.push('Defensive magic items', 'Health potions');
        break;
    }

    return baseEquipment;
  }

  private generateBuildStrategy(
    race: EnhancedRaceData,
    cls: EnhancedClassData,
    background: BackgroundData,
    playstyle: string,
    experienceLevel: string
  ): string {
    const strategies = {
      beginner: 'Focus on learning your core class abilities first. Use simple, effective tactics.',
      intermediate: 'Combine racial traits with class features for synergistic effects.',
      advanced: 'Optimize ability score placement and feat selection for maximum efficiency.'
    };

    return `${strategies[experienceLevel as keyof typeof strategies]} This ${race.name} ${cls.name} excels at ${playstyle} tactics. Use your ${background.name} background skills to complement your combat role.`;
  }

  private generateLevelProgression(
    cls: EnhancedClassData,
    focusLevel: number,
    playstyle: string
  ): { level: number; features: string[]; recommendations: string[] }[] {
    const progression = [];
    
    for (let level = 1; level <= Math.min(focusLevel, 10); level++) {
      const features = [`Level ${level} ${cls.name} features`];
      const recommendations = [];

      if (level === 1) {
        features.push('Starting equipment', 'Base class abilities');
        recommendations.push('Focus on learning core mechanics');
      } else if (level === 4 || level === 8) {
        features.push('Ability Score Improvement or Feat');
        recommendations.push('Consider feat vs ability score based on build goals');
      } else if (level % 2 === 0) {
        features.push('Class feature progression');
        recommendations.push(`Enhance ${playstyle} capabilities`);
      }

      progression.push({ level, features, recommendations });
    }

    return progression;
  }

  private analyzeBuildStrengths(
    race: EnhancedRaceData,
    cls: EnhancedClassData,
    background: BackgroundData,
    playstyle: string
  ): string[] {
    const strengths = [];
    
    // Add class-based strengths
    const className = cls.name.toLowerCase();
    if (['fighter', 'barbarian', 'paladin'].includes(className)) {
      strengths.push('High survivability', 'Strong melee combat');
    }
    if (['wizard', 'sorcerer', 'warlock'].includes(className)) {
      strengths.push('Powerful spellcasting', 'Versatile problem solving');
    }
    if (['rogue', 'ranger'].includes(className)) {
      strengths.push('High skill versatility', 'Excellent damage potential');
    }

    // Add playstyle strengths
    switch (playstyle) {
      case 'damage':
        strengths.push('Exceptional damage output', 'Combat effectiveness');
        break;
      case 'support':
        strengths.push('Team enhancement', 'Battlefield control');
        break;
      case 'tank':
        strengths.push('Damage absorption', 'Party protection');
        break;
      case 'utility':
        strengths.push('Problem solving', 'Skill coverage');
        break;
    }

    return strengths;
  }

  private analyzeBuildWeaknesses(
    race: EnhancedRaceData,
    cls: EnhancedClassData,
    background: BackgroundData,
    playstyle: string
  ): string[] {
    const weaknesses = [];
    
    // Add class-based weaknesses
    const className = cls.name.toLowerCase();
    if (['barbarian'].includes(className)) {
      weaknesses.push('Limited ranged options', 'Vulnerable to mental effects');
    }
    if (['wizard'].includes(className)) {
      weaknesses.push('Low hit points', 'Limited armor options');
    }
    if (['fighter'].includes(className)) {
      weaknesses.push('Limited magical abilities', 'Relies on equipment');
    }

    // Add playstyle weaknesses
    switch (playstyle) {
      case 'damage':
        weaknesses.push('May lack defensive options', 'Focused specialization');
        break;
      case 'support':
        weaknesses.push('Lower personal damage', 'Resource dependent');
        break;
      case 'tank':
        weaknesses.push('Limited damage output', 'Slower movement');
        break;
      case 'utility':
        weaknesses.push('Jack of all trades weakness', 'May lack specialization');
        break;
    }

    return weaknesses;
  }

  // Cache management
  getCacheStats(): { keys: number; hits: number; misses: number } {
    return this.cache.getStats();
  }

  clearCache(): void {
    this.cache.flushAll();
    console.error('🗑️ Open5e cache cleared');
  }
}