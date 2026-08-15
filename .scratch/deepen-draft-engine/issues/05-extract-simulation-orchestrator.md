# 05 — Extract the simulation orchestrator module

**What to build:** Pull the AI-turn decision tree out of `draftEngine.ts` into its own module, `simulationOrchestrator.ts`, owning the `ADVANCE_SIMULATION` case: whether to auto-resolve a pending prompt (skipping the user's own reactions in practice mode), `selectPullbackCandidate` and the save/pullback-vs-decline decision (calling into `aiSimulator.ts`'s scoring functions, unchanged), and the "skip teams with no open slot, then let the AI pick" flow for a team's own turn — using `advanceCursor` from `pickReducer.ts` (ticket 02) as the single skip-a-full-team primitive, replacing the inline duplicate loop that previously lived in this case. This module continues to synthesize `Action` values and call the exported `draftEngine(state, action)` recursively, exactly as today — it does not call the other reducer modules' functions directly. After this ticket, `draftEngine.ts` is reduced to a thin `switch` that routes each action type to its module.

**Blocked by:** 01, 02, 03, 04 — dispatches synthesized actions through every case.

**Status:** ready-for-agent

- [ ] `simulationOrchestrator.ts` exists under `src/engine/` and exports the `ADVANCE_SIMULATION` handling logic
- [ ] The inline "skip teams with no open slot" loop is gone; the orchestrator calls `advanceCursor` from `pickReducer.ts` instead
- [ ] AI-driven state changes still go through `draftEngine(state, action)` (self-recursion via synthesized actions), not direct calls into `pickReducer.ts`/`saveReducer.ts`/`pullbackReducer.ts`
- [ ] `draftEngine.ts` is reduced to a thin `switch` delegating every case to one of the five extracted modules — no reducer logic remains inline in `draftEngine.ts` itself
- [ ] `draftEngine.test.ts`, `reactions.test.ts`, `advanceSimulation.test.ts`, and `aiSimulator.test.ts` all pass unmodified
- [ ] No new tests added
- [ ] `App.tsx` still only imports `draftEngine` from `src/engine/`; `aiSimulator.ts`'s and `initDraft.ts`'s public exports are untouched
