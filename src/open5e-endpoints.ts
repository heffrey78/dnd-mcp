/**
 * Which Open5e filters actually work, per endpoint.
 *
 * Open5e ignores a filter it does not support and returns the whole
 * collection, which looks exactly like a page of matches. So every filter the
 * client uses is declared here, once, as either:
 *
 *  - `server`: a query parameter verified to narrow results on that endpoint;
 *  - `local`:  a predicate applied after fetching, for filters the endpoint
 *              ignores.
 *
 * The client refuses any filter not listed, and
 * `test/integration/open5e-contract.test.js` checks every `server` entry
 * against the live API. Verified 2026-09-21; see docs/api-filters.md.
 */

export type FilterValue = string | number | boolean | readonly string[];

export type FilterRule =
  | { server: string }
  | { local: (row: any, value: any) => boolean };

export interface EndpointSpec {
  path: string;
  filters: Record<string, FilterRule>;
  /** Accepted `ordering` values; anything else is rejected. */
  ordering?: readonly string[];
}

/** Largest page Open5e serves; `limit` above this is capped upstream. */
export const PAGE_MAX = 1000;

const lower = (value: unknown): string => String(value ?? '').toLowerCase();

const name: FilterRule = { server: 'name__icontains' };
const localName: FilterRule = {
  local: (row, value: string) => lower(row.name).includes(lower(value).trim())
};
const documents: FilterRule = { server: 'document__key__in' };

export const ENDPOINTS = {
  spells: {
    path: '/v2/spells/',
    filters: {
      name,
      documents,
      level: { server: 'level' },
      maxLevel: { server: 'level__lte' },
      // `school=` is ignored; only the key lookup filters.
      school: { server: 'school__key' },
      classKey: { server: 'classes__key' }
    },
    ordering: ['name', '-name', 'level', '-level']
  },
  creatures: {
    path: '/v2/creatures/',
    filters: {
      name,
      documents,
      cr: { server: 'challenge_rating' },
      minCr: { server: 'challenge_rating__gte' },
      maxCr: { server: 'challenge_rating__lte' },
      // `type__key` is ignored; `type` takes the key and rejects unknown ones.
      type: { server: 'type' },
      // Neither `environments` nor `environments__key` filters.
      environment: {
        local: (row, value: string) => (row.environments ?? []).some((env: any) =>
          lower(env.key) === lower(value) || lower(env.name).includes(lower(value)))
      }
    },
    ordering: ['name', '-name', 'challenge_rating', '-challenge_rating']
  },
  magicitems: {
    path: '/v2/magicitems/',
    filters: {
      name,
      documents,
      // Keys such as "very-rare"; an unknown key is a 400.
      rarity: { server: 'rarity' },
      // `category__key` is ignored; `category` takes the key.
      category: { server: 'category' },
      requiresAttunement: { server: 'requires_attunement' }
    }
  },
  rules: {
    path: '/v2/rules/',
    filters: {
      name,
      documents,
      // `search` and `desc__icontains` are both ignored, so rules text is
      // matched locally. The collection is under 300 rows.
      text: {
        local: (row, value: string) =>
          `${lower(row.name)}\n${lower(row.desc)}`.includes(lower(value).trim())
      }
    }
  },
  classes: {
    path: '/v2/classes/',
    filters: {
      documents,
      // `name__icontains`, `subclass_of__key` and `subclass_of__isnull` are
      // all ignored here.
      name: localName,
      isSubclass: { server: 'is_subclass' },
      subclassOf: { server: 'subclass_of' }
    }
  },
  species: {
    path: '/v2/species/',
    filters: {
      name,
      documents,
      // A bare `subspecies_of` is ignored.
      subspeciesOf: { server: 'subspecies_of__key__in' }
    }
  },
  feats: {
    path: '/v2/feats/',
    filters: {
      name,
      documents,
      // `has_prerequisite` is accepted and ignored.
      hasPrerequisite: { local: (row, value: boolean) => Boolean(row.has_prerequisite) === value }
    }
  },
  backgrounds: {
    path: '/v2/backgrounds/',
    filters: { name, documents }
  },
  conditions: {
    path: '/v2/conditions/',
    filters: {
      name: localName,
      documents,
      // The core conditions live in one document ("core") with a description
      // per game system, so a ruleset is matched on those descriptions rather
      // than on the document.
      ruleset: {
        local: (row, value: string) =>
          (row.descriptions ?? []).some((d: any) => d.gamesystem === value)
      }
    }
  },
  weapons: {
    path: '/v2/weapons/',
    filters: {
      name: localName,
      documents,
      finesse: { server: 'is_finesse' },
      // `is_martial` is ignored, and rows carry `is_simple` rather than a
      // martial flag.
      martial: { local: (row, value: boolean) => !row.is_simple === value }
    }
  },
  armor: {
    path: '/v2/armor/',
    filters: {
      name: localName,
      documents,
      // `category` is ignored.
      category: { local: (row, value: string) => lower(row.category) === lower(value) },
      acBase: { server: 'ac_base' },
      stealthDisadvantage: { server: 'grants_stealth_disadvantage' }
    }
  },
  documents: {
    path: '/v2/documents/',
    filters: {}
  }
} satisfies Record<string, EndpointSpec>;

export type EndpointName = keyof typeof ENDPOINTS;

export type FiltersFor<E extends EndpointName> =
  Partial<Record<keyof (typeof ENDPOINTS)[E]['filters'], FilterValue | undefined>>;
