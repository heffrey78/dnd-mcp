# ADR-006: Open5e API as the content source

## Status
Accepted. Decisions 2 and 3 are superseded by
[ADR-007](007-v2-registry-scope-and-builds.md): the client is now v2 only and
routes every filter through a verified registry.

## Context

The server originally scraped `dnd5e.wikidot.com` (ADR-001). Scraping was
fragile, needed rate limiting (ADR-003) and a content-quality scheme (ADR-004),
and produced loosely structured data.

[Open5e](https://open5e.com) publishes the same body of content as a JSON REST
API with stable slugs, per-item licence metadata and server-side filtering.

A subsequent problem surfaced in 2026: Open5e's filtering is **uneven across
API versions, and unsupported filters are ignored rather than rejected**. A
query the API does not understand returns the entire collection, which is
indistinguishable from a page of genuine matches. This had gone unnoticed and
was returning wrong results for every search.

## Decision

1. Source all content from the Open5e API. The scraper and its module are
   removed.
2. Keep v1 and v2 endpoints mixed, choosing per endpoint on data quality rather
   than version. Neither version covers everything.
3. Route name queries per endpoint, because no single parameter works
   everywhere:
   - `name__icontains` where Open5e honours it;
   - `search` only for `/v1/sections/`, where full-text over rules prose is
     what is wanted;
   - fetch-all plus local name matching for `/v2/armor/`, `/v2/weapons/` and
     `/v2/conditions/`, which ignore every filter and are small enough
     (under 100 rows each) for this to be cheap.
4. **Never let an invalid parameter degrade into "no filter."** Reject it.
   Silently dropping a filter turns a malformed query into an unfiltered one
   and returns the whole catalogue as if it matched.
5. Pin these upstream assumptions in `test/integration/open5e-contract.test.js`
   so a change at Open5e fails a test instead of quietly corrupting results.

## Consequences

- Content is structured and licence-tagged; no HTML parsing.
- The per-endpoint routing table is a maintenance burden, and it lives in
  [`../api-filters.md`](../api-filters.md). It must be updated together with
  the contract tests.
- Results contain duplicates across sourcebooks; deduplication is deferred.
- Migrating fully onto v2 remains open. It would make the client uniform, but
  v2 shapes differ from v1, so every field mapping and tool response changes.
  The contract and unit tests now exist to make that migration safe.
