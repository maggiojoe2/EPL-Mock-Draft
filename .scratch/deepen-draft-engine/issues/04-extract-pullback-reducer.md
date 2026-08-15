# 04 — Extract the pullback reducer module

**What to build:** Pull pullback resolution out of `draftEngine.ts` into its own module, `pullbackReducer.ts`, owning `INVOKE_PULLBACK` and `DECLINE_PULLBACK`. Uses `placeInRoster`/`removeFromPool` from `pickReducer.ts` (ticket 02) and `resolveReaction` from `reactionQueue.ts` (ticket 01). `draftEngine.ts`'s `INVOKE_PULLBACK`/`DECLINE_PULLBACK` cases delegate to this module. Independent of ticket 03 (save reducer) — this ticket doesn't touch or depend on save's code path.

**Blocked by:** 01, 02.

**Status:** ready-for-agent

- [ ] `pullbackReducer.ts` exists under `src/engine/` and exports the `INVOKE_PULLBACK`/`DECLINE_PULLBACK` handling logic
- [ ] `draftEngine.ts` no longer defines this logic itself — it imports and delegates to `pullbackReducer.ts`
- [ ] `draftEngine.test.ts`, `reactions.test.ts`, `advanceSimulation.test.ts`, and `aiSimulator.test.ts` all pass unmodified
- [ ] No new tests added
