# ADR-007: v2 only, a filter registry, source scopes, and a rules-based build engine

## Status
Accepted. Supersedes decisions 2 and 3 of ADR-006. Decision 6 is superseded
by ADR-008 (default to the 2024 SRD).

## Context

ADR-006 kept v1 and v2 endpoints mixed and routed name queries per endpoint by
hand. Three problems followed.

**Filters kept failing silently.** Probing every filter the client relied on
found more that Open5e ignores: `school=` on spells, `cr=` on creatures,
`has_prerequisite` on feats, `is_martial` on weapons and `category` on armor.
Some v2 rows also lacked the fields the transforms read. Weapons have no
`is_melee` or `is_light`, so every weapon property came back false. Conditions
have no `desc`, so every description was undefined. Nothing errored in any of
these cases.

**Results mixed sourcebooks.** Open5e serves 24 documents across three game
systems. An unscoped feat search interleaves A5e and Tome of Heroes feats with
the SRD's, and "Fireball" has six rows. The character build generator took the
first rows of these lists, so it suggested alphabetical A5e feats (Ace Driver)
and third-party spells.

**Builds were not built from rules.** The generator matched class names with
substring heuristics and filled its output with placeholder text ("Level 3
Bard features"). When a preference didn't match, it quietly fell back to
something else.

Mixing v1 and v2 also meant two vocabularies for the same concept: v1
`document__slug=wotc-srd` against v2 `document__key=srd-2014`.

## Decision

1. **Use v2 only.** Every v1 endpoint has a v2 equivalent with richer data.
   Classes list the levels their features are gained at; creatures have
   structured senses and environments. `/v1/spelllist/` has no equivalent,
   and `/v2/spells/?classes__key=` replaces it. The four spell-list tools are
   removed because `get_spells_by_class` covers them.

2. **Declare every filter in a registry** (`src/open5e-endpoints.ts`). Each
   is either a verified server parameter or a local predicate. The client
   refuses undeclared filters. Filters with a fixed set of values name the
   lookup endpoint that lists them, so values are checked before sending. A
   contract test walks the registry against the live API, and a second list
   asserts that the parameters we avoid are still ignored.

3. **Scope by source, label every result.** `{ ruleset, sources }` resolves to
   `document__key__in` through `/v2/documents/`, and unknown values are
   errors. Plain searches default to all sources, with each result carrying a
   `source` label. Lookups by name rank duplicates the same way everywhere:
   exact name, then the 2014 SRD, then the 2024 SRD, then the rest.

4. **Keep game rules in code, and judgments separately.**
   - `src/class-rules.ts` holds key abilities, caster type, spell slots,
     proficiency bonus and ASI levels, each cited to the SRD. Open5e's
     versions are missing or wrong.
   - `src/character-build/abilities.ts` and `prerequisites.ts` hold the build
     rules, also cited.
   - `src/character-build/heuristics.ts` holds the opinions: how well a class
     fills a role, spell weights and staple spells. They're there to be read
     and argued with.

5. **Resolve species inheritance explicitly** (`src/species.ts`). A subspecies
   combines its ability increases with its parent's and inherits size, speed
   and traits. Where a parent defers ("determined by your Heritage Subrace"),
   size and speed come from the species a heritage or chassis names. Anything
   that can't be found stays `null` with a reason.

6. **Builds default to the 2014 SRD**, the one set of sources known to fit
   together. A preference outside the scope is an error naming the book it's
   in.

## Consequences

- Tool output shapes changed:
  - every result has `source` in place of the old, inconsistent `document`;
  - classes, monsters and species gained structured fields;
  - builds have a new, smaller shape without placeholder fields.
- Some requests got more expensive, some cheaper:
  - a class lookup fetches its subclasses;
  - a species lookup may fetch its parent and origin;
  - creature filters that must be applied locally use a sparse scan, then
    fetch full rows by key;
  - `get_spells_by_class` went from up to 50 requests to one.
- Rules come from the SRD tables in code. Where Open5e's data is wrong or
  missing, the output says so (`warnings`, `resolved.unresolved`) instead of
  papering over it.
- The 2014 SRD alone is thin: one background and one feat. Builds say so and
  point to `ruleset` / `sources`.
