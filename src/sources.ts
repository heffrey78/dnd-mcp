/**
 * Source documents: labelling results, scoping queries to a ruleset or set of
 * books, and choosing between same-named entries from different books.
 *
 * Open5e mixes 24 documents across three game systems (5e-2014, 5e-2024 and
 * a5e). Unscoped, a search for feats interleaves A5e feats with SRD ones and a
 * lookup for "Fireball" has six candidates, so every result says where it
 * came from and every lookup ranks candidates by source the same way.
 */

export interface SourceLabel {
  /** Open5e document key, e.g. "srd-2014". */
  key: string;
  /** Human-readable title, e.g. "5e 2014 Rules". */
  name: string;
  /** Game system key, e.g. "5e-2014"; null when Open5e did not say. */
  ruleset: string | null;
}

/**
 * Restricts a query to some documents. `ruleset` selects every document of a
 * game system; `sources` names documents directly. Given both, a document must
 * satisfy both.
 */
export interface ContentScope {
  ruleset?: string;
  sources?: string[];
}

/** Rows carry `document` either as a key or, on most endpoints, as an object. */
export function documentKeyOf(row: any): string {
  const doc = row?.document;
  if (typeof doc === 'string') return doc;
  return typeof doc?.key === 'string' ? doc.key : '';
}

/** Label from the row itself when it embeds its document, else from `index`. */
export function sourceOf(row: any, index?: ReadonlyMap<string, SourceLabel>): SourceLabel {
  const doc = row?.document;
  if (doc && typeof doc === 'object' && typeof doc.key === 'string') {
    return {
      key: doc.key,
      name: doc.display_name || doc.name || doc.key,
      ruleset: doc.gamesystem?.key ?? null
    };
  }
  const key = documentKeyOf(row);
  return index?.get(key) ?? { key, name: key, ruleset: null };
}

/** Parses a /v2/documents/ row. */
export function toSourceLabel(row: any): SourceLabel {
  return sourceOf({ document: row });
}

/**
 * The document keys a scope allows, or undefined for "no restriction".
 * Unknown rulesets or documents are errors: an unrecognised scope silently
 * dropped would widen the query to every source.
 */
export function resolveScope(
  scope: ContentScope | undefined,
  known: readonly SourceLabel[]
): string[] | undefined {
  if (!scope || (scope.ruleset === undefined && scope.sources === undefined)) return undefined;

  let allowed = known;

  if (scope.ruleset !== undefined) {
    const rulesets = [...new Set(known.map(doc => doc.ruleset).filter(Boolean))].sort();
    if (!rulesets.includes(scope.ruleset)) {
      throw new Error(`Unknown ruleset "${scope.ruleset}". Known rulesets: ${rulesets.join(', ')}`);
    }
    allowed = allowed.filter(doc => doc.ruleset === scope.ruleset);
  }

  if (scope.sources !== undefined) {
    if (scope.sources.length === 0) {
      throw new Error('sources must name at least one document');
    }
    const keys = new Set(known.map(doc => doc.key));
    const unknown = scope.sources.filter(key => !keys.has(key));
    if (unknown.length > 0) {
      throw new Error(`Unknown source document(s): ${unknown.join(', ')}. ` +
        `Known documents: ${[...keys].sort().join(', ')}`);
    }
    const wanted = new Set(scope.sources);
    allowed = allowed.filter(doc => wanted.has(doc.key));
  }

  if (allowed.length === 0) {
    throw new Error(`No document matches ruleset "${scope.ruleset}" and sources ` +
      `${scope.sources?.join(', ')}`);
  }
  return allowed.map(doc => doc.key);
}

/**
 * Preference among same-named entries when the caller did not scope the
 * lookup: the 2014 SRD (and "core", which holds its conditions) first, then
 * the 2024 SRD, then everything else.
 */
export const DEFAULT_SOURCE_PRIORITY: readonly string[] = ['srd-2014', 'core', 'srd-2024'];

export function sourceRank(key: string, priority: readonly string[] = DEFAULT_SOURCE_PRIORITY): number {
  const rank = priority.indexOf(key);
  return rank === -1 ? priority.length : rank;
}

export interface PickOptions<T> {
  nameOf: (row: T) => string;
  sourceKeyOf: (row: T) => string;
  /** Extra rank keys, compared after exact-name and before source. Lower wins. */
  extraRank?: (row: T) => number[];
  priority?: readonly string[];
}

/**
 * The best row for a name lookup: exact name, then any `extraRank`, then
 * source priority, then the shortest name. Rows whose name does not contain
 * the needle are never returned -- a lookup that matches nothing is null, not
 * the first row of an unrelated page.
 */
export function pickByName<T>(rows: readonly T[], needle: string, options: PickOptions<T>): T | null {
  const wanted = needle.trim().toLowerCase();
  if (!wanted) return null;

  const rankOf = (row: T): number[] => {
    const rowName = options.nameOf(row).toLowerCase();
    return [
      rowName === wanted ? 0 : 1,
      ...(options.extraRank?.(row) ?? []),
      sourceRank(options.sourceKeyOf(row), options.priority),
      rowName.length
    ];
  };

  const ranked = rows
    .filter(row => options.nameOf(row).toLowerCase().includes(wanted))
    .map(row => ({ row, rank: rankOf(row) }))
    .sort((a, b) => compareRanks(a.rank, b.rank));

  return ranked[0]?.row ?? null;
}

export function compareRanks(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
