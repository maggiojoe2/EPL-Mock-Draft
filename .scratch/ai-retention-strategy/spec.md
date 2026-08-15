Status: ready-for-agent

# AI Retention Strategy — Franchise, Save & Pullback — Spec

## Problem Statement

Simulated teams currently decide whether to franchise, save, or pull back a player using flat ADP-driven probability curves (`aiShouldReact`) and, for franchise selection, a uniform random pick among eligible players (`autoSelectFranchise`). This doesn't resemble how a real fantasy manager behaves: a real manager is trying to retain their two most valuable returning players by any means available (franchise, then save), and only pulls back an opposing pick when it's clearly worth spending a roster slot on. The current randomness means simulated teams sometimes let their best returning player walk for no reason, waste their once-per-draft save on a mediocre player, or pull back players that aren't actually better than what they'd otherwise get with that roster slot. This makes practice and watch mode drafts feel unrealistic and undermines their value as a planning/observation tool.

## Solution

Replace the franchise-selection, save-decision, and pullback-decision logic for simulated teams with a value-optimizing strategy driven by ADP (the existing value proxy used throughout the app):

- **Franchise selection** picks the team's best eligible player, with an exception when that leaves a franchise-eligible-but-permanently-unsaveable player unprotected — in which case the team franchises that player instead and relies on save for the other.
- **Save** is aimed at a specific, dynamically-recomputed target — the team's best not-yet-secured, still-saveable previous-year player — and is invoked automatically whenever that target is the player just picked by an opponent.
- **Pullback** is invoked whenever the team judges the pullback candidate to be worth more than the normal pick they'd otherwise get with the roster slot the pullback would consume.

All three decisions are deterministic rules with a small chance of a "near-miss" mistake (never a wild/bad choice — always a next-best alternative), so simulated drafts stay strategic without becoming perfectly predictable.

## User Stories

### Franchise selection

1. As a draft manager in practice or watch mode, I want each simulated team to franchise its single most valuable franchise-eligible player (lowest ADP), so that franchise selection reflects a rational manager rather than a coin flip.
2. As a draft manager, I want a simulated team with only one franchise-eligible player to franchise that player automatically, so that trivial cases don't require special-case reasoning.
3. As a draft manager, I want a simulated team with no franchise-eligible players to skip franchising entirely (as today), so that ineligible teams aren't forced into an invalid choice.
4. As a draft manager, I want a simulated team to recognize when its best eligible player and its overall most valuable returning player are different people, and franchise the eligible one while planning to save the other, so that the team doesn't waste its guaranteed franchise slot on a player it could otherwise retain via save.
5. As a draft manager, I want a simulated team whose two best franchise-eligible players are both viable candidates to franchise the one that can never be saved again (because it's in that team's save history), and target its save at the other, so that a player who has no other path to retention isn't left exposed.
6. As a draft manager, I want a simulated team to skip that swap when both of its top two franchise-eligible players are save-blocked, franchising the better of the two as normal, so that the swap only fires when it would actually help.
7. As a draft manager, I want the franchise swap to be confined to the top two franchise-eligible players only, so that the logic doesn't cascade into open-ended reasoning about a team's whole roster.
8. As a draft manager, I want occasional franchise-selection "mistakes" where the simulated team franchises its next-best eligible player instead of the optimal one, so that simulated franchise choices aren't perfectly predictable draft after draft.

### Save targeting

9. As a draft manager, I want each simulated team to identify its current save target — the highest-value player from its previous-year roster (excluding whoever it franchised) that it hasn't already saved in a past draft — so that its one-per-draft save is aimed at the right player.
10. As a draft manager, I want a simulated team's save target to be recomputed dynamically over the course of the draft (e.g. after a decline or a mistake, or once the target has been secured or lost), so that the save doesn't sit unused on a target that's no longer relevant.
11. As a draft manager, I want a simulated team to invoke its save automatically, without weighing it against the round it would cost, whenever an opponent picks its current save target, so that the team's most valuable retainable asset is essentially always retained when the opportunity arises.
12. As a draft manager, I want a simulated team to decline a save prompt for a previous-year player who isn't its current save target, and let that pick fall through to ordinary pullback evaluation instead, so that the scarce once-per-draft save isn't spent on a lesser player.
13. As a draft manager, I want occasional save-targeting "mistakes" where a simulated team's actual save target is its next-best saveable candidate rather than the optimal one, so that save behaviour isn't perfectly predictable draft after draft.
14. As a draft manager, I want a simulated team to end most drafts having used its save on some valuable player, rather than holding it unused, so that the "almost always use the save" behaviour emerges naturally rather than through an artificial deadline rule.

### Pullback

15. As a draft manager, I want a simulated team to compare a pullback candidate's value against the value it would expect from a normal pick at the round the pullback would consume, so that pullbacks reflect a genuine cost/benefit judgement rather than a flat probability.
16. As a draft manager, I want the "value of a normal pick at that round" to be computed from the team's fixed draft-order position and the league size (since the draft order is non-snake and repeats every round), expressed as an expected ADP for that slot, so that the comparison is grounded in the same ADP scale used everywhere else.
17. As a draft manager, I want a simulated team to pull back a candidate whenever that candidate's ADP is better (lower) than the expected ADP of the round-slot it would consume, so that pullbacks are taken whenever they're a clear value upgrade.
18. As a draft manager, I want this pullback rule to apply to every one of a team's remaining previous-year players who isn't the team's current save target, so that a team's 3rd-best, 4th-best, etc. returning players are still protected when it's clearly worthwhile.
19. As a draft manager, I want occasional pullback "mistakes" — a rare wrong-side-of-the-threshold decision (declining a pullback that was worth taking, or taking one that wasn't quite) — so that pullback behaviour isn't perfectly predictable draft after draft.

### Cross-cutting

20. As a draft manager, I want the mistake-noise behaviour to mean the same thing across franchise, save, and pullback — a near-miss on the correct rule, never a wild or clearly-bad choice — so that simulated teams still read as competent, realistic managers even when they don't hit the exact optimum.
21. As a draft manager, I want this new decision logic to apply only to simulated teams' automatic behaviour (watch mode, and the 11 AI teams in practice mode), so that the user's own team retains full manual control over its franchise, save, and pullback decisions.

## Implementation Decisions

- **New pure decision functions in `src/engine/aiSimulator.ts`**, replacing `aiShouldReact` (removed) and the random branch in `autoSelectFranchise` (removed from `src/setup/setupHelpers.ts`, delegated to a shared function instead). `aiPickPlayer` is unchanged — this spec only touches franchise/save/pullback decisions, not normal ADP-based picking.
  - **Franchise target selection**: given a team's franchise-eligible players and its previous-year roster/save history, returns the player (if any) to franchise, applying the "best eligible, unless save-blocked-swap applies" rule (Implementation Decisions below spell out the algorithm precisely). Confined to the top two franchise-eligible players by ADP — never considers a third candidate.
  - **Save target computation**: given a team's previous-year roster, its franchise target (if any), and its save history, returns the player (if any) the team is currently targeting to save — the best-ADP player in `previousYearRoster`, excluding the franchise target, that is not in `saveHistory`. Called fresh each time a save decision is needed (no persisted "locked-in" target), which is what makes it dynamically recomputed per user story 10.
  - **Pullback decision**: given a pullback candidate's ADP and an "expected ADP for the round-slot that would be consumed," returns whether to pull back. The expected ADP is computed from the team's fixed position in the (non-snake) draft order and the league size: `expectedAdp = (round - 1) * teamCount + teamPositionInOrder`, where `round` is the team's `lastAvailableRound` at the moment of the decision (the slot the pullback/save would fill). Pull back when `candidate.adp < expectedAdp`, subject to mistake noise.

- **Full franchise/save targeting algorithm** (drives both the franchise-selection function and the save-target function, so they stay consistent with each other):
  1. Let `E` = the team's franchise-eligible players sorted ascending by ADP. If `E` is empty, there is no franchise target; the save target is simply the best not-saveable-excluded player in `previousYearRoster`.
  2. Let `X` = `E[0]` (best eligible), `Y` = `E[1]` if it exists (second-best eligible).
  3. Tentative franchise target = `X`.
  4. Compute `S` = the best-ADP player in `previousYearRoster`, excluding `X`, that is not in `saveHistory`. This is a full-roster computation, not limited to `E` — a non-eligible player better than `Y` legitimately outranks `Y` as the save target.
  5. **Swap condition**: if `S` is not `Y` because `Y` is save-blocked (i.e. `Y` exists, is in `saveHistory`, and would otherwise have been the natural save target), and `X` is not itself save-blocked, then swap: franchise target becomes `Y`, save target becomes `X`. Otherwise (including when both `X` and `Y` are save-blocked) keep the tentative assignment: franchise target `X`, save target `S`.
  6. This swap only ever considers `X` and `Y` — no cascading to a third-ranked eligible player.

- **Mistake noise**: a shared, small probability (exact value an implementation-time constant, not user-configurable) that on each decision, the "correct" pick per the algorithm above is swapped for the next-best alternative rather than being followed exactly:
  - Franchise/save targeting: the mistake substitutes the next-best eligible/saveable candidate in place of the top choice.
  - Pullback: the mistake nudges the accept/decline outcome to the wrong side of the `candidate.adp < expectedAdp` threshold for that one decision, rather than substituting a different candidate (pullback is a live per-event accept/decline call, not a selection among candidates).

- **Wiring changes**:
  - `src/setup/setupHelpers.ts` — `autoSelectFranchise` calls the new franchise-target function instead of `Math.random()`-based selection. Behaviour for the user's own team (skipped) is unchanged.
  - `src/engine/draftEngine.ts` — the `ADVANCE_SIMULATION` case's `save`/`pullback` branches call the new save-target and pullback-decision functions instead of `aiShouldReact`. The existing control flow (try save first, fall back to pullback, then decline) is preserved structurally, but the accept/decline decisions themselves now come from the new functions. Save acceptance no longer runs the pullback-style value comparison (user story 11) — it's target-match-or-not, full stop.
  - `aiShouldReact` is removed once nothing references it; `gaussianNoise`/`aiPickPlayer` are untouched.

- **Scope boundary**: this spec touches only the franchise/save/pullback decision logic for simulated teams. It does not change `aiPickPlayer`'s normal-pick ADP+Gaussian-noise algorithm, the practice-mode UI/prompts for the user's own team, the reaction-queue construction (`buildReactionQueue`), or the roster/slot-filling mechanics (`INVOKE_SAVE`/`INVOKE_PULLBACK`/`lastAvailableRound` handling) in `draftEngine.ts`.

## Testing Decisions

- Tests should assert observable behaviour (which player gets franchised/saved/pulled-back, or the accept/decline outcome) rather than internal implementation details — consistent with the rest of the engine test suite.
- **New file `src/engine/__tests__/aiSimulator.test.ts`** covering the new pure functions directly with plain `Player`/`Team`-shaped fixtures, no `DraftState` required:
  - Franchise target selection: single eligible player, multiple eligible players (best wins), no eligible players, the save-blocked swap firing, the swap not firing when both top candidates are save-blocked, the swap never reaching past the top two.
  - Save target computation: best-remaining-player selection excluding the franchise target, skipping save-blocked players, falling through to a non-eligible player when they outrank the eligible pool, dynamic recomputation after the previous target is no longer valid.
  - Pullback decision: accept when candidate ADP beats expected round ADP, decline when it doesn't, at the boundary.
  - Mistake noise: seeded/mocked randomness proving the near-miss substitution behaves as specified (next-best candidate, or threshold nudge for pullback) — following the existing `vi.spyOn(Math, 'random')` pattern already used in `advanceSimulation.test.ts`.
- **`src/setup/__tests__/setupHelpers.test.ts`** gets updated/added cases for `autoSelectFranchise` confirming it now delegates to the new franchise-target function (e.g. asserting the best-ADP eligible player wins rather than accepting any random eligible player, replacing the current test's tolerance for randomness).
- **`src/engine/__tests__/advanceSimulation.test.ts`** and **`src/engine/__tests__/reactions.test.ts`** get their existing probability-based assertions (e.g. tests that rely on `aiShouldReact`'s ADP-vs-probability curve) rewritten to reflect the new deterministic rules — these are pinned-behavior tests for the old algorithm and will need real changes, not just additions.
- Prior art: `advanceSimulation.test.ts`'s existing use of `vi.spyOn(Math, 'random').mockReturnValue(...)` to force specific branches is the established pattern for testing probabilistic AI behaviour in this codebase and should be reused for mistake-noise tests.

## Out of Scope

- Changing the value metric away from ADP (e.g. a separate player-rating system) — explicitly deferred, ADP is reused as-is.
- Any change to `aiPickPlayer`'s normal draft-pick algorithm.
- Any change to the practice-mode UI or the user's own team's franchise/save/pullback decisions — those remain fully manual.
- A forward-looking simulation of the rest of the draft to estimate pullback value (considered and rejected in favor of the round-position formula above).
- An explicit "use the save before the draft ends no matter what" safety-net rule — the spec relies on the round-slot cost mechanic and dynamic retargeting to produce that behaviour naturally.
- Making the mistake-noise probability user-configurable.
- Extending the franchise/save swap logic beyond a team's top two franchise-eligible players.

## Further Notes

This spec was produced from an interactive design session (`/ask-matt` → `/grilling`) that worked through several non-obvious edge cases — most notably that "best two players" only cleanly maps to "franchise + save" when both candidates are franchise-eligible, and that a player's save-blocked history can force a swap of which of the two gets the guaranteed (franchise) slot versus the reactive (save) slot. Implementers should treat the "Full franchise/save targeting algorithm" section above as the authoritative source, not the prose summary in the Solution section.

The round-slot cost mechanic (`lastAvailableRound` counting down from 16, competing with normal picks counting up from round 1) already existed in the codebase before this spec; this spec is the first feature to make an AI decision actually depend on it.
