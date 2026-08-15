# 01 — Extract the reaction queue module

**What to build:** Pull the reaction-queue machinery out of `draftEngine.ts` into its own module, `reactionQueue.ts`, owning `buildReactionQueue`, `dequeue`, and `resolveReaction` (the shared tail logic — dequeue the next prompt, advance the cursor once the queue is empty, detect draft completion — that every reaction handler calls). `draftEngine.ts`'s `PICK_PLAYER`, `DECLINE_SAVE`, `INVOKE_PULLBACK`, and `DECLINE_PULLBACK` cases call into this module instead of using inline/local versions. No behavior change — this is a pure extraction.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] `reactionQueue.ts` exists under `src/engine/` and exports `buildReactionQueue`, `dequeue`, `resolveReaction`
- [x] `draftEngine.ts` no longer defines these functions itself — it imports and delegates to `reactionQueue.ts`
- [x] `draftEngine.test.ts`, `reactions.test.ts`, `advanceSimulation.test.ts`, and `aiSimulator.test.ts` all pass unmodified
- [x] No new tests added — the extraction stays covered by the existing black-box `draftEngine(state, action)` tests
- [x] `draftEngine` remains the only export from `src/engine/` consumed outside `src/engine/` (verify `App.tsx` still only imports `draftEngine`)

## Comments

Implemented. `resolveReaction` takes `advanceCursor` as a parameter rather
than importing it, since `advanceCursor` still lives in `draftEngine.ts` at
this stage (it moves to `pickReducer.ts` in issue 02, which is when this
module can drop the parameter and import `advanceCursor` directly instead).
This avoids a circular import between `draftEngine.ts` and `reactionQueue.ts`
for this one step.

Code review (spec axis) caught that `PICK_PLAYER` was still hand-rolling the
dequeue/advance/complete tail logic inline instead of calling `resolveReaction`
— fixed to delegate via `...resolveReaction({ ...state, reactionQueue }, teams, advanceCursor)`,
so all four cases named in the ticket now go through the shared module.
`draftEngine.ts` no longer imports `dequeue` directly (unused after the fix).

Marked `ready-for-human` for a merge decision.
