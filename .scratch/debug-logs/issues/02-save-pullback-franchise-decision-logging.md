# 02 — Save/pullback/franchise decision logging

**What to build:** Extend `debugLog` to cover `INVOKE_SAVE`/`DECLINE_SAVE`/`INVOKE_PULLBACK`/`DECLINE_PULLBACK`, the same way ticket 01 covers `PICK_PLAYER`. Human reactions log actor + action only. Simulated reactions log chosen-vs-optimal (via `computeSaveTarget`/`computeFranchiseTarget`/the pullback decision's existing `optimal` local) and whether a mistake roll (`isMistake()`) fired — including the case where a mistake fires but the result happens to match the optimal choice anyway, so the roll itself is visible even when its effect isn't.

**Blocked by:** 01

**Status:** done

- [x] Every `INVOKE_SAVE`, `DECLINE_SAVE`, `INVOKE_PULLBACK`, and `DECLINE_PULLBACK` action produces exactly one `debugLog` entry, in dispatch order, following the same entry shape established in ticket 01 (sequence, round, team index, action type, actor)
- [x] Human reaction entries record actor + action + outcome only — no optimal-comparison fields
- [x] Simulated reaction entries additionally record: the chosen outcome, the deterministic optimal outcome (via the relevant non-mistake `aiSimulator.ts` function for that decision), whether they differ, and whether `isMistake()` fired for this decision
- [x] A mistake-roll that fires but doesn't change the outcome (mistake candidate happens to equal the optimal one) is still logged as "mistake fired," distinguishable from a clean no-mistake match
- [x] Entries appear in the existing live panel with no panel changes required (same list, more entry types)
- [x] Engine tests dispatch through `draftEngine(state, action)` and assert on `state.debugLog` for each of the four action types, covering both the "matched optimal" and "mistake fired" branches using the existing `Math.random`-pinning pattern
- [x] `pickHistory` and its existing consumers remain unmodified
