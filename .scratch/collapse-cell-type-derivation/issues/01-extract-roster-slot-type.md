# 01 — Extract `rosterSlotType.ts` and migrate all consumers

**What to build:** One shared `buildSlotTypeMap`/`slotKey` implementation, in a new standalone
module `src/rosterSlotType.ts`, that `App.tsx`, `SummaryScreen.tsx`, and
`src/export/exportRosters.ts` all import instead of each defining or duplicating it. `App.tsx`'s
`buildCellTypeMap`/`cellKey` and local `TOTAL_ROUNDS = 16` are deleted; `App.tsx` imports
`TOTAL_ROUNDS` from `constants.ts` instead. The board's cell badges, the summary screen's slot
badges, and the CSV export's `slot_type` column all render identically before and after — this is
a pure internal deduplication with no observable behavior change.

**Blocked by:** None — can start immediately

- [ ] `src/rosterSlotType.ts` exists, exporting `slotKey(teamIndex, round)` and
      `buildSlotTypeMap(teams, pickHistory)`; imports only from `types.ts`/`constants.ts` (no
      import from `src/engine/`, and nothing in `src/engine/` imports it)
  - [ ] `buildSlotTypeMap`'s docstring documents the `!map.has` guard's purpose (a future
        `pickHistory`-sourced franchise entry would win over the fallback, not be overwritten)
- [ ] `src/export/exportRosters.ts` deletes its local `buildSlotTypeMap`/`slotKey` and imports
      both from `../rosterSlotType`; `buildCsvRows`/`toCsvString`/`CsvRow` are otherwise unchanged
- [ ] `src/App.tsx` deletes `buildCellTypeMap`, `cellKey`, and the local `TOTAL_ROUNDS = 16`;
      imports `buildSlotTypeMap`/`slotKey` from `./rosterSlotType` and `TOTAL_ROUNDS` from
      `./constants`; the `cellTypeMap` `useMemo` call site uses `buildSlotTypeMap`
- [ ] `src/SummaryScreen.tsx` updates its `buildSlotTypeMap`/`slotKey` import from
      `./export/exportRosters` to `./rosterSlotType`; no other change
- [ ] New test `src/__tests__/rosterSlotType.test.ts` covers `buildSlotTypeMap` directly: normal /
      save / pullback picks sourced from `pickHistory`; a franchise pre-fill detected via
      `franchisePlayer`/`team.roster[TOTAL_ROUNDS]` with no `pickHistory` entry; the `!map.has`
      guard not overwriting an existing `pickHistory`-sourced entry at the same key
- [ ] `src/export/__tests__/exportRosters.test.ts` passes unmodified
- [ ] `CONTEXT.md` gains a "Slot" glossary entry near "Roster": *"Slot — a single (team, round)
      position in a roster; identified by a `slotKey`. Filled by a normal pick, save, pullback, or
      franchise pre-fill (its `slot_type`)."*
- [ ] No changes to `App.css`, `CELL_TYPE_CONFIG`, `CsvRow`'s `slot_type` union, or any CSS class
      naming (`pick-cell`, `active-cell`, `summary-slot`, etc.)
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` all pass
