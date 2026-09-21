# Open5e API filter reference

> **Verified 2026-09-21** against `api.open5e.com`. The client uses v2 only.
> The source of truth is [`src/open5e-endpoints.ts`](../src/open5e-endpoints.ts);
> this page explains it. `test/integration/filter-registry.contract.test.js`
> checks every entry against the live API, so if this page and the API
> disagree, that test fails.

## Why a registry

Open5e **ignores a filter it does not support** and returns the whole
collection, which looks exactly like a page of matches. Nothing errors. So a
misspelt or unsupported parameter reads as "everything matched".

Every filter the client uses is therefore declared once, per endpoint, as one
of:

- **server** — a query parameter verified to narrow results on that endpoint;
- **local** — a predicate run over fetched rows, for filters the endpoint
  ignores.

`Open5eClient.query()` refuses any filter an endpoint does not declare. There
is no path for sending a parameter and hoping it works.

## Filters by endpoint

| Endpoint | Server filters (parameter) | Local filters |
|----------|----------------------------|---------------|
| `/v2/spells/` | name (`name__icontains`), level (`level`), max level (`level__lte`), school (`school__key`), class (`classes__key`), documents | — |
| `/v2/creatures/` | name, CR (`challenge_rating`), CR range (`challenge_rating__gte`/`__lte`), type (`type`), keys (`key__in`), documents | several types, environment |
| `/v2/magicitems/` | name, rarity (`rarity`), category (`category`), attunement (`requires_attunement`), documents | — |
| `/v2/rules/` | name, documents | text (name + rules prose) |
| `/v2/classes/` | subclass or not (`is_subclass`), parent (`subclass_of`), documents | name |
| `/v2/species/` | name, parents (`subspecies_of__key__in`), documents | — |
| `/v2/feats/` | name, documents | has prerequisite |
| `/v2/backgrounds/` | name, documents | — |
| `/v2/conditions/` | documents | name, ruleset |
| `/v2/weapons/` | finesse (`is_finesse`), documents | name, martial |
| `/v2/armor/` | AC (`ac_base`), stealth (`grants_stealth_disadvantage`), documents | name, category |

"name" is `name__icontains` and "documents" is `document__key__in` wherever
they appear as server filters.

## Parameters that look right and are ignored

Each of these returns the entire collection. The contract test asserts they
are still ignored, so it will say when one starts working.

| Endpoint | Ignored | Use instead |
|----------|---------|-------------|
| `/v2/spells/` | `school=evocation` | `school__key` |
| `/v2/creatures/` | `cr=`, `challenge_rating_decimal=`, `type__key=`, `environments=`, `environments__key=` | `challenge_rating`, `type`, local environment |
| `/v2/magicitems/` | `category__key=`, `rarity__key=`, `document__gamesystem__key=` | `category`, `rarity`, `document__key__in` |
| `/v2/rules/` | `search=`, `desc__icontains=` | local text match |
| `/v2/classes/` | `name__icontains=`, `subclass_of__key=`, `subclass_of__isnull=` | local name, `subclass_of`, `is_subclass` |
| `/v2/species/` | `subspecies_of=` | `subspecies_of__key__in` |
| `/v2/feats/` | `has_prerequisite=` | local |
| `/v2/weapons/` | `is_martial=`, `name__icontains=` | local (`is_simple` is the only flag on the row) |
| `/v2/armor/` | `category=`, `name__icontains=` | local |
| `/v2/conditions/` | `name__icontains=` | local |
| every v2 endpoint | `search=` | `name__icontains` |

## Filters with a fixed set of values

School, creature type, environment, item rarity and item category name a
lookup endpoint (`/v2/spellschools/`, `/v2/creaturetypes/`,
`/v2/environments/`, `/v2/itemrarities/`, `/v2/itemcategories/`). The client
accepts a key or a name ("Wondrous Item" for `wondrous-item`), sends the key,
and rejects anything else with the list of valid keys. Upstream, an unknown
value either returns 400 (`type`, `rarity`, `category`) or matches nothing
(`school__key`); neither is a helpful error.

## Scoping to sources

A `{ ruleset, sources }` scope resolves against `/v2/documents/`, which lists
each document's game system, into a `document__key__in` filter. That one
parameter works on every endpoint above; `document__gamesystem__key` does not
(it is ignored on `/v2/magicitems/`). An unknown ruleset or document is an
error, never "no restriction".

Conditions are the exception. The core ones live in a single document
(`core`) with one description per game system, so a ruleset selects them by
their `descriptions`, not their document.

## Large collections

Local filtering has to see the whole server-filtered set. For an endpoint that
declares `scanFields` (creatures: 3,500 rows, about 4 KB each), `query()` scans
a sparse fieldset (`fields=key,name,type,environments`), filters locally, then
fetches full rows only for the matches through `key__in`. Scans stop at five
pages of 1,000; past that the caller must narrow the query.

## Response shapes worth knowing

- `document` is an object on most rows, but a bare key on `/v2/rules/` and
  `/v2/backgrounds/` list rows. The client expands keys from `/v2/documents/`.
- Class table columns (cantrips known, spells known) are in
  `data_for_class_table`, not `data`.
- Spell casting times are keys: `action`, `bonus-action`, `10minutes`.
- Species traits are prose; see `src/species.ts` for how they are read.

`test/integration/open5e-contract.test.js` pins these shapes.

## Known data gaps

The client reports these rather than papering over them:

- No 2014 SRD spell lists the Paladin (`classes__key=srd_paladin` finds only
  third-party spells), so SRD-scoped Paladin builds get no spell suggestions
  and say why.
- Open5e's 2014 spell-slot columns have gaps (the Bard has no 2nd-level slots
  at 3rd level). Slots come from `src/class-rules.ts` instead.
- `primary_abilities` is empty for every SRD class, and `caster_type` is null
  for the 2014 ones. Both come from `src/class-rules.ts`.
- Tome of Heroes' Dwarf heritage reads "Wisdon"; the increase is reported as
  unreadable, not guessed.
- There is no Kobold species for the Kobold darakhul heritage to inherit size
  and speed from, so they stay unresolved.

## History

The 2025 v1-era reference this page replaced is in
[`history/API-FILTERS-2025.md`](history/API-FILTERS-2025.md).
