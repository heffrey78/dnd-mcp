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

## Open question: mixing editions

The 2024 Player's Handbook (p. 38) lets older options into 2024 games:

- a 2014 species loses its ability score increases, which come from the
  background instead;
- a 2014 background gives +2/+1 (or +1/+1/+1) and an origin feat;
- 2014 subclasses start at level 3, gaining the earlier features then;
- 2014 feats are general feats, not origin feats.

This is how most tables use older content, but it is not in SRD 5.2, so it
would be a design choice cited to the PHB rather than an SRD rule. Until it
is decided, a build scope that mixes editions uses each row's own rules.

## Consequences

- Default builds get a real background, origin feat and background ability
  increases.
- Callers that relied on the 2014 answer to an unscoped lookup (e.g.
  `get_class_details` for "bard") now get the 2024 row; pass
  `ruleset: "5e-2014"` to get the old one.
- Unit and live tests that exercise 2014 mechanics now ask for the 2014 SRD
  explicitly.
