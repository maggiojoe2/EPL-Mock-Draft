# 02 — Extract the pick reducer module, fix the TOTAL_ROUNDS shadow

**What to build:** Pull normal-pick sequencing out of `draftEngine.ts` into its own module, `pickReducer.ts`, owning `nextPick`, `advanceCursor`, `nextNormalSlot`, `teamHasOpenNormalSlot`, `totalPicksFilled`, and the generic roster helpers `removeFromPool`/`placeInRoster` (their primary caller lives here; `saveReducer.ts`/`pullbackReducer.ts` will import them from this module in later tickets). Also add a new named function, `retractNormalPick(pickHistory, teamIndex, player)`, that encapsulates the filter currently inlined in `INVOKE_SAVE` (drop the `pickType: "normal"` record matching `teamIndex`/`player.id`) — this ticket only defines and exports it from `pickReducer.ts`; ticket 03 wires it into the save case. `advanceCursor` becomes the single "find the next team+round with an open slot" primitive — no other implementation of that logic should remain anywhere in the codebase after this ticket. Replace the local `const TOTAL_ROUNDS = 16` with an import of the shared constant from `src/constants.ts`. `draftEngine.ts`'s `PICK_PLAYER` case delegates to this module (still calling into `reactionQueue.ts` from ticket 01 to build/dequeue the reaction queue after placing the pick).

**Blocked by:** 01 — the `PICK_PLAYER` case calls `buildReactionQueue`/`dequeue`.

**Status:** ready-for-agent

- [ ] `pickReducer.ts` exists under `src/engine/` and exports `nextPick`, `advanceCursor`, `nextNormalSlot`, `teamHasOpenNormalSlot`, `totalPicksFilled`, `removeFromPool`, `placeInRoster`, `retractNormalPick`
- [ ] `draftEngine.ts` no longer defines these functions itself, no longer redefines `TOTAL_ROUNDS`, and imports the shared `TOTAL_ROUNDS` from `src/constants.ts` (directly or via `pickReducer.ts`)
- [ ] `PICK_PLAYER` case in `draftEngine.ts` delegates to `pickReducer.ts`
- [ ] `retractNormalPick` is exported and unit-reachable, but `INVOKE_SAVE` still uses its own inline filter for now (wired in ticket 03) — or, if simpler to do in one motion, `INVOKE_SAVE` is updated here too as long as ticket 03's scope shrinks accordingly and this is called out in this ticket's Comments
- [ ] `draftEngine.test.ts`, `reactions.test.ts`, `advanceSimulation.test.ts`, and `aiSimulator.test.ts` all pass unmodified
- [ ] No new tests added
