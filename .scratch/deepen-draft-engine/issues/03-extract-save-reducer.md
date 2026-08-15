# 03 — Extract the save reducer module

**What to build:** Pull save resolution out of `draftEngine.ts` into its own module, `saveReducer.ts`, owning `INVOKE_SAVE` and `DECLINE_SAVE`. `INVOKE_SAVE` uses `retractNormalPick` and `placeInRoster` from `pickReducer.ts` (ticket 02) instead of an inline `pickHistory` filter; `DECLINE_SAVE` uses `resolveReaction` from `reactionQueue.ts` (ticket 01). `draftEngine.ts`'s `INVOKE_SAVE`/`DECLINE_SAVE` cases delegate to this module.

**Blocked by:** 01, 02.

**Status:** ready-for-agent

- [ ] `saveReducer.ts` exists under `src/engine/` and exports the `INVOKE_SAVE`/`DECLINE_SAVE` handling logic
- [ ] `draftEngine.ts` no longer defines this logic itself — it imports and delegates to `saveReducer.ts`
- [ ] The retraction of a blocked normal pick goes through `retractNormalPick` (ticket 02), not an inline filter
- [ ] `draftEngine.test.ts`, `reactions.test.ts`, `advanceSimulation.test.ts`, and `aiSimulator.test.ts` all pass unmodified
- [ ] No new tests added
