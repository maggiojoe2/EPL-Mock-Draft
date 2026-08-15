# 03 — Pullback value rule, mistake noise, and cleanup

**What to build:** Replace the pullback branch's `aiShouldReact`-based decision with a genuine value comparison: pull back a candidate only when it's worth more than the normal pick the team would otherwise get with the roster slot the pullback would consume.

- Compute the "expected ADP" of the round-slot a pullback would consume as `(round - 1) * teamCount + teamPositionInOrder`, where `round` is the team's `lastAvailableRound` at the moment of the decision and `teamPositionInOrder` reflects the team's fixed position in the (non-snake) draft order.
- Pull back when `candidate.adp < expectedAdp`, subject to mistake noise nudging a small fraction of decisions to the wrong side of that threshold (never a wild misjudgement — a boundary-line near-miss, per ticket 01's shared mistake semantics, adapted here to a threshold nudge rather than a candidate substitution since pullback is a live accept/decline call).
- Apply this rule to every one of a team's remaining previous-year players who is **not** its current save target (per ticket 01's save-target function) — the save target is handled entirely by ticket 02's logic and should not also be independently evaluated for pullback.
- Once this branch no longer calls `aiShouldReact`, remove `aiShouldReact` from `src/engine/aiSimulator.ts` (it will have no remaining callers after this ticket).

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A pure function computes the expected ADP for a given round/team-position/team-count and returns whether a candidate should be pulled back, per the formula above.
- [ ] The `pullback` branch of `ADVANCE_SIMULATION` (both the standalone pullback prompt and the pullback-after-save-decline path) uses this function instead of `aiShouldReact`.
- [ ] The current save target (per ticket 01/02) is excluded from independent pullback evaluation within the same decision.
- [ ] Mistake noise occasionally flips the accept/decline outcome for a candidate near the threshold, without ever producing a decision far from the correct one.
- [ ] `aiShouldReact` is deleted from `src/engine/aiSimulator.ts` once no code references it.
- [ ] `src/engine/__tests__/aiSimulator.test.ts` gains tests for the pullback decision function: accept when candidate ADP beats expected round ADP, decline when it doesn't, boundary behaviour, and mistake-noise threshold nudging (mocked `Math.random`).
- [ ] `src/engine/__tests__/advanceSimulation.test.ts` and `src/engine/__tests__/reactions.test.ts` have their pullback-related assertions that currently pin the old ADP-probability behaviour rewritten to reflect the round-cost comparison, including a case showing the current save target is not separately evaluated for pullback.
