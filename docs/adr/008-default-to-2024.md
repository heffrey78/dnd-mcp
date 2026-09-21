# ADR-008: Default to the 2024 SRD

## Status
Accepted. Supersedes decision 6 of ADR-007.

## Context

ADR-007 defaulted builds to the 2014 SRD, "the one set of sources known to fit
together", and ranked it first among same-named rows. That default aged
badly:

- **The 2014 SRD is too thin to build from.** It has one background
  (Acolyte), so every default build was an Acolyte. The 2024 SRD has four
  (Acolyte, Criminal, Sage, Soldier), each with ability increases and an
  origin feat.
- **The 2024 rules are what tools now assume.** Foundry's dnd5e system made
  them the default in v4 and kept 2014 behind a "Legacy Rules" setting.
  Open5e's own site selects both SRDs by default and treats the game system
  as an optional filter.
- **Lookups and builds should agree.** If `get_spell_details` answers from
  2014 while the builder cites 2024, the same session gives two answers.

How Open5e's content splits by game system (live counts, September 2026):

| | 5e-2014 | 5e-2024 |
|---|---|---|
| Documents | 18 | 2 (`srd-2024`, and `open5e-2024`, which is empty) |
| Species | 54 | 9 |
| Backgrounds | 27 | 4 |
| Classes and subclasses | 123 | 24 |
| Spells | 1245 | 339 |

The third-party books are all 2014-era, so a strict 2024 scope loses most of
Open5e's variety.

## Decision

1. **Builds default to `{ sources: ['srd-2024'] }`** and say so in `notes`.
2. **Unscoped lookups by name rank `srd-2024` first**, then `srd-2014` and
   `core`, then everything else (`DEFAULT_SOURCE_PRIORITY`).
3. **Searches stay unscoped** and label every result with its source, as
   before.
4. **Rules are chosen by the row's ruleset**, not by the default: a 2014 class
   still gets 2014 spell slots, ASI levels and the Small-creature Heavy rule.

5. **2014 options in a 2024 build follow the 2024 Player's Handbook**
   (chapter 2, on backgrounds and species from older books;
   `src/character-build/legacy.ts`). A build's rules come from its class.
   In a 2024 build:
   - a 2014 species keeps its traits (speed, size, Lucky…) but not its
     ability score increases, which come from the background instead;
   - a 2014 background raises any one ability by 2 and another by 1, and
     grants an Origin feat from the scope, chosen by
     `ORIGIN_FEAT_PREFERENCE` in `heuristics.ts`. Magic Initiate names its
     spell list (`magicInitiateList`, never the class's own) and its
     spellcasting ability (the class's, else the best mental score);
   - 2014 feats are General feats, never Origin feats.

   Each conversion is stated in the build's `notes`. The rule is not in
   SRD 5.2, so it is cited to the PHB. The PHB page for backgrounds (p. 38)
   comes from a secondary source, not a copy of the book.

   Subclasses are not converted: Open5e ties each subclass to its own
   class's document, so a 2024 class only ever gets 2024 subclasses. The
   reverse (a 2024 species in a 2014 build) has no rule; it gets no species
   increases and a warning.

## Consequences

- Default builds get a real background, origin feat and background ability
  increases.
- Mixed scopes such as `["srd-2024", "open5e"]` bring Open5e's 2014 species
  (Stoor Halfling, Darakhul…) and backgrounds into 2024 builds. With species
  increases gone, many species tie for a class; the build notes the tie and
  picks by source rank.
- To widen only the backgrounds, `generate_character_build` takes
  `background_sources` (e.g. `["toh"]`, 19 backgrounds): backgrounds come
  from the scope plus those documents, while species, feats (including the
  Origin feat) and spells stay in the scope. Every 2014 background can raise
  any ability, so they tie on fit; the campaign theme
  (`BACKGROUND_THEMES`) breaks ties, then source rank, and the build notes
  the tie.
- Callers that relied on the 2014 answer to an unscoped lookup (e.g.
  `get_class_details` for "bard") now get the 2024 row; pass
  `ruleset: "5e-2014"` to get the old one.
- Unit and live tests that exercise 2014 mechanics now ask for the 2014 SRD
  explicitly.
