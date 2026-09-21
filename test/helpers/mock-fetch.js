// Replaces global fetch so unit tests can assert on the URLs the client builds
// without touching the network. Query-string construction is the part of this
// client that breaks when Open5e changes its filtering, so it is worth asserting.

/**
 * Installs a fetch stub. Returns a handle exposing the captured requests and a
 * restore() that puts the real fetch back.
 *
 * @param {(url: URL) => any} responder - returns the JSON body for a request.
 */
export function installMockFetch(responder) {
  const realFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const body = responder(url);

    if (body && body.__status && body.__status >= 400) {
      return {
        ok: false,
        status: body.__status,
        statusText: body.__statusText || 'Error',
        text: async () => body.__body || '',
        json: async () => ({})
      };
    }

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(body),
      json: async () => body
    };
  };

  return {
    calls,
    /** Query params of the nth request (default: the first). */
    paramsOf(index = 0) {
      return Object.fromEntries(calls[index].searchParams.entries());
    },
    /** Path of the nth request (default: the first). */
    pathOf(index = 0) {
      return calls[index].pathname;
    },
    restore() {
      globalThis.fetch = realFetch;
    }
  };
}

/** A paginated Open5e list response. */
export function page(results, { count = results.length, next = null } = {}) {
  return { count, next, previous: null, results };
}

/**
 * Minimal copies of the Open5e lookup collections that enum-like filters are
 * validated against (see FilterRule.values in src/open5e-endpoints.ts).
 */
export const LOOKUPS = {
  '/v2/spellschools/': [
    { key: 'evocation', name: 'Evocation' }, { key: 'necromancy', name: 'Necromancy' }
  ],
  '/v2/creaturetypes/': [
    { key: 'dragon', name: 'Dragon' }, { key: 'humanoid', name: 'Humanoid' }, { key: 'undead', name: 'Undead' }
  ],
  '/v2/environments/': [
    { key: 'forest', name: 'Forest or Jungle' }, { key: 'caves', name: 'Caves' }, { key: 'mountain', name: 'Mountain' }
  ],
  '/v2/itemrarities/': [
    { key: 'rare', name: 'Rare' }, { key: 'very-rare', name: 'Very Rare' }
  ],
  '/v2/itemcategories/': [
    { key: 'wondrous-item', name: 'Wondrous Item' }, { key: 'potion', name: 'Potion' }
  ]
};

/** Wraps a responder so lookup collections are answered from LOOKUPS. */
export function withLookups(responder) {
  return url => (url.pathname in LOOKUPS ? page(LOOKUPS[url.pathname]) : responder(url));
}

/** The requests made to one path, ignoring lookup and document fetches. */
export function callsTo(mock, pathname) {
  return mock.calls.filter(url => url.pathname === pathname);
}
