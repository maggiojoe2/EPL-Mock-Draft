# 05 — Extract the simulation orchestrator module

**What to build:** Pull the AI-turn decision tree out of `draftEngine.ts` into its own module, `simulationOrchestrator.ts`, owning the `ADVANCE_SIMULATION` case: whether to auto-resolve a pending prompt (skipping the user's own reactions in practice mode), `selectPullbackCandidate` and the save/pullback-vs-decline decision (calling into `aiSimulator.ts`'s scoring functions, unchanged), and the "skip teams with no open slot, then let the AI pick" flow for a team's own turn — using `advanceCursor` from `pickReducer.ts` (ticket 02) as the single skip-a-full-team primitive, replacing the inline duplicate loop that previously lived in this case. This module continues to synthesize `Action` values and call the exported `draftEngine(state, action)` recursively, exactly as today — it does not call the other reducer modules' functions directly. After this ticket, `draftEngine.ts` is reduced to a thin `switch` that routes each action type to its module.

**Blocked by:** 01, 02, 03, 04 — dispatches synthesized actions through every case.

**Status:** ready-for-human

- [x] `simulationOrchestrator.ts` exists under `src/engine/` and exports the `ADVANCE_SIMULATION` handling logic
- [x] The inline "skip teams with no open slot" loop is gone; the orchestrator calls `advanceCursor` from `pickReducer.ts` instead
- [x] AI-driven state changes still go through `draftEngine(state, action)` (self-recursion via synthesized actions), not direct calls into `pickReducer.ts`/`saveReducer.ts`/`pullbackReducer.ts`
- [x] `draftEngine.ts` is reduced to a thin `switch` delegating every case to one of the five extracted modules — no reducer logic remains inline in `draftEngine.ts` itself (this also closed a gap left over from ticket 02: `PICK_PLAYER`'s body is now `pickPlayer()` in `pickReducer.ts`, not inline)
- [x] `draftEngine.test.ts`, `reactions.test.ts`, `advanceSimulation.test.ts`, and `aiSimulator.test.ts` all pass unmodified
- [x] No new tests added
- [x] `App.tsx` still only imports `draftEngine` from `src/engine/`; `aiSimulator.ts`'s and `initDraft.ts`'s public exports are untouched

## Comments

Code review (Standards + Spec axes) run against `1165746...HEAD`:
- Standards: 0 hard violations. One stale docstring in `pickReducer.ts` (pre-announcing this extraction as pending) — fixed. One mild move+behavior-swap in the same commit — accepted, the swap (`nextPick` loop → `advanceCursor`) is exactly what this ticket specced.
- Spec: caught that `PICK_PLAYER`'s case body was still inline in `draftEngine.ts`, missing this ticket's own checklist item ("no reducer logic remains inline in `draftEngine.ts`"). Fixed by extracting `pickPlayer()` into `pickReducer.ts`, matching the module boundary spec.md originally described for that file.
