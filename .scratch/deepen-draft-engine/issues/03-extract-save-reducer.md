# 03 — Extract the save reducer module

**What to build:** Pull save resolution out of `draftEngine.ts` into its own module, `saveReducer.ts`, owning `INVOKE_SAVE` and `DECLINE_SAVE`. `INVOKE_SAVE` uses `retractNormalPick` and `placeInRoster` from `pickReducer.ts` (ticket 02) instead of an inline `pickHistory` filter; `DECLINE_SAVE` uses `resolveReaction` from `reactionQueue.ts` (ticket 01). `draftEngine.ts`'s `INVOKE_SAVE`/`DECLINE_SAVE` cases delegate to this module.

**Blocked by:** 01, 02.

**Status:** ready-for-human

- [x] `saveReducer.ts` exists under `src/engine/` and exports the `INVOKE_SAVE`/`DECLINE_SAVE` handling logic
- [x] `draftEngine.ts` no longer defines this logic itself — it imports and delegates to `saveReducer.ts`
- [x] The retraction of a blocked normal pick goes through `retractNormalPick` (ticket 02), not an inline filter
- [x] `draftEngine.test.ts`, `reactions.test.ts`, `advanceSimulation.test.ts`, and `aiSimulator.test.ts` all pass unmodified
- [x] No new tests added

## Comments

Implemented as `invokeSave(state)` / `declineSave(state)` in `saveReducer.ts`.
`invokeSave` reads the player from `state.pendingPrompt` rather than the
`INVOKE_SAVE` action — the original inline case never used `action.player`
either, since the prompt is the source of truth for which player is being
saved, so the function takes no action parameter at all. `INVOKE_SAVE` now
retracts the blocked normal pick via `retractNormalPick` (ticket 02) instead
of the inline `pickHistory` filter. `DECLINE_SAVE` is a straight extraction
calling `resolveReaction` (ticket 01) with `advanceCursor` (ticket 02).
`draftEngine.ts`'s two cases are now one-line delegations.

`npx tsc --noEmit`, `npx eslint src/engine/`, and the full `vitest run` suite
(118 tests, 7 files) all pass unmodified. `App.tsx` still only imports
`draftEngine` from `src/engine/`.

Marked `ready-for-human` for a merge decision.
