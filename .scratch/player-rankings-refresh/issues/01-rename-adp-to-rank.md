# 01 — Rename `adp` to `rank` throughout the app

**What to build:** The app's schema, types, parsing, AI pick logic, UI labels, and domain docs all consistently refer to the player-ranking field as `rank` (Expert Consensus Ranking, half-PPR) instead of the mislabeled `adp` (Average Draft Position). This is a foundational rename — no new data source or refresh mechanism yet, just correcting the existing field's name everywhere it appears so later tickets build on the right vocabulary.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `Player.adp` is renamed to `Player.rank` (and equivalent renames anywhere else the field is typed)
- [ ] `CSV_COLUMNS.playerPool`'s `adp` column is renamed to `rank`
- [ ] The default-on-missing/invalid value behavior for the field is preserved under the new name
- [ ] Simulated-team pick logic (`aiSimulator.ts` or equivalent) reads the renamed field
- [ ] Any UI copy/labels referencing "ADP" are updated to reflect the renamed field
- [ ] `public/defaults/players.csv`'s header is updated from `adp` to `rank`
- [ ] `test-data/players.csv`'s header is updated from `adp` to `rank` (a manual rename only — this fixture is not touched by any live fetch or refresh script, per spec)
- [ ] `CONTEXT.md`'s glossary entries referencing ADP are updated to describe `rank`/ECR (the mechanism description can stay provisional here — ticket 05 finalizes it once the live-fetch/fallback mechanism exists)
- [ ] Existing tests pass with the renamed field; any tests referencing `adp` are updated to `rank`
