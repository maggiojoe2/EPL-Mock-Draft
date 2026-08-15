Status: ready-for-agent

# Deepen the draft engine

## Problem Statement

As a developer maintaining the EPL Mock Drafter's rule engine, I want `src/engine/draftEngine.ts` to stop being a 500-line dispatcher with no internal structure, so that a rule change (a new save variant, a tweak to AI behavior) lands in one named place instead of one more branch of an already-overloaded `switch`, and so that the "skip a team with no open slot" logic can't silently drift into two different implementations again.

## Solution

Split `draftEngine.ts` into five focused modules under `src/engine/` — one per sub-machine the reducer currently hides (pick sequencing, save resolution, pullback resolution, the reaction queue, and AI-turn orchestration) — while `draftEngine` itself keeps its exact public signature, `(DraftState, Action) → DraftState`, and stays the only thing imported from `src/engine/` by the rest of the app. No observable behavior changes; this is a pure internal deepening.

## User Stories

1. As a developer, I want the pick-sequencing logic (cursor advancement, slot-skipping, the "next open normal slot" scan) isolated in its own module, so that I can reason about how a normal pick lands without reading save/pullback/AI code.
2. As a developer, I want save resolution (retracting the blocked normal pick, re-homing the player, clearing the reaction queue) isolated in its own module, so that the "a save undoes a prior pick" protocol is named and findable in one place instead of inferred from a `pickHistory` filter.
3. As a developer, I want pullback resolution isolated in its own module, so that its rules (original pick stands, player fills the back slot, `lastAvailableRound` decrements) are visibly distinct from save's rules rather than interleaved in the same file.
4. As a developer, I want reaction-queue construction and draining (`buildReactionQueue`, `dequeue`, `resolveReaction`) isolated in its own module, so that "which team gets to react, and in what order" is one cohesive unit that both `PICK_PLAYER` and every reaction handler depend on rather than duplicate.
5. As a developer, I want AI-turn orchestration (`ADVANCE_SIMULATION`'s decision tree) isolated in its own module, so that "what does the AI do on its turn" reads as one coherent flow instead of being interleaved with the state-transition code it drives.
6. As a developer, I want exactly one "find the next team+round with an open slot" primitive, used by both the post-pick cursor advance and the AI-turn skip check, so that the two can no longer diverge the way `advanceCursor` and `ADVANCE_SIMULATION`'s inline loop did.
7. As a developer, I want the normal-pick retraction that a save performs (filtering `pickHistory` for the matching `pickType: "normal"` record and removing it) named as one explicit function, so the retraction protocol isn't just an inline filter a reader has to infer.
8. As a developer, I want `draftEngine.ts`'s local `TOTAL_ROUNDS = 16` replaced with the shared constant from `src/constants.ts`, so the draft length can't silently drift between this file and the rest of the app.
9. As a developer relying on the existing test suite, I want `draftEngine.test.ts`, `reactions.test.ts`, `advanceSimulation.test.ts`, and `aiSimulator.test.ts` to keep passing unmodified through every step of this refactor, so the refactor is verifiably behavior-preserving rather than a rewrite.
10. As a developer, I want each sub-machine extracted and landed as its own commit, in dependency order, so that a bisect or a review can isolate exactly which extraction (if any) introduced a regression.
11. As a developer, I want `App.tsx`'s import of `draftEngine` (and `initDraft.ts`'s / `aiSimulator.ts`'s existing external exports) to keep working unchanged, so that this refactor requires no changes outside `src/engine/`.

## Implementation Decisions

### Module boundaries

`src/engine/draftEngine.ts` is reduced to a thin `switch` over `Action["type"]` that delegates each case to a sub-module. Five new modules, all within `src/engine/`:

- **`reactionQueue.ts`** — owns `buildReactionQueue`, `dequeue`, and `resolveReaction` (the shared tail logic every reaction handler calls: dequeue the next prompt, advance the cursor once the queue is empty, detect draft completion). Extracted first — nothing else depends on it, and everything else depends on it.
- **`pickReducer.ts`** — owns the `PICK_PLAYER` case: `nextPick`, `advanceCursor`, `nextNormalSlot`, `teamHasOpenNormalSlot`, `totalPicksFilled`, and the new `retractNormalPick` helper (below). Imports the shared `TOTAL_ROUNDS` from `src/constants.ts` instead of redefining it.
- **`saveReducer.ts`** — owns `INVOKE_SAVE` and `DECLINE_SAVE`.
- **`pullbackReducer.ts`** — owns `INVOKE_PULLBACK` and `DECLINE_PULLBACK`.
- **`simulationOrchestrator.ts`** — owns the `ADVANCE_SIMULATION` decision tree: whether to auto-resolve a pending prompt (skipping the user's own reactions in practice mode), which candidate to save/pull back (`selectPullbackCandidate`, using `aiSimulator.ts`'s scoring functions), and the "skip teams with no open slot, then let the AI pick" flow for a team's own turn. This module continues to synthesize `Action` values and call the exported `draftEngine(state, action)` recursively — it does **not** call the other four sub-modules' functions directly. AI-driven state changes go through the exact same public action surface a human's UI dispatches through; this is treated as the seam working correctly, not a smell to remove.

`aiSimulator.ts` is unchanged — it remains a separate, already well-tested module of pure scoring functions (`computeFranchiseTarget`, `computeSaveTarget`, `computeSaveTargetWithMistake`, `computeExpectedAdp`, `shouldPullback`, `aiPickPlayer`, `isMistake`) that `simulationOrchestrator.ts` and `setupHelpers.ts` both call into, same as today.

Only `draftEngine` is exported for use outside `src/engine/`. The five new modules' functions are implementation details of the `draftEngine` seam, not part of its public interface — nothing outside `src/engine/` imports them directly.

### Unify "skip a full team" logic

`advanceCursor` (in `pickReducer.ts`) becomes the single primitive for "walk forward from a given round/team, skipping any team with no open normal slot at the landing round, until one is found or the draft is over." `simulationOrchestrator.ts`'s own-turn skip check calls this same primitive instead of the inline loop that previously duplicated it.

### Provisional pick retraction

`retractNormalPick(pickHistory, teamIndex, player): PickRecord[]` — a named function in `pickReducer.ts` that encapsulates the existing filter (drop the `pickType: "normal"` record matching `teamIndex` + `player.id`). `saveReducer.ts` calls this instead of inlining the filter itself. No change to `PickRecord`'s shape or to `types.ts` — this names the existing protocol, it doesn't introduce a new state representation.

### No schema changes

`DraftState`, `Team`, `PickRecord`, `Action`, `SavePrompt`/`PullbackPrompt` in `src/types.ts` are unchanged. This spec is a pure internal restructuring of `draftEngine.ts`; observable state shape and transitions are identical before and after.

## Testing Decisions

- No new tests are added. The four existing test files that exercise the engine — `src/engine/__tests__/draftEngine.test.ts`, `src/engine/__tests__/reactions.test.ts`, `src/engine/__tests__/advanceSimulation.test.ts`, `src/engine/__tests__/aiSimulator.test.ts` — must pass unmodified after every extraction step. They already test exclusively through the `draftEngine(state, action) → DraftState` seam (or, for `aiSimulator.test.ts`, through that module's own exported pure functions), never through internal helpers like `nextPick`, `buildReactionQueue`, or `resolveReaction` — this spec preserves that black-box discipline rather than introducing white-box tests of the new sub-modules' internals.
- If a given extraction step can't keep all four files green without editing the tests themselves, that's a signal the split point is wrong for that step, not that the tests need updating to match — stop and reconsider the boundary rather than adjusting test expectations.
- Prior art: this is the same "test the reducer, not its helpers" pattern the spec's original testing decisions already established for `draftEngine.ts`; this refactor extends that discipline across module boundaries instead of introducing a new one.

## Out of Scope

- Any change to draft rules, save/pullback mechanics, AI decision weighting, or franchise placement — this is a structural refactor only.
- Reifying "provisional pick" as a new type or state flag — considered and explicitly rejected (see Implementation Decisions); the retraction is named, not restructured.
- Collapsing `simulationOrchestrator.ts` and `aiSimulator.ts` into one module, or otherwise changing the AI-simulation module boundary — `aiSimulator.ts` stays as-is.
- The other 2026-08-15 architecture-review candidates — tracked separately, not part of this spec:
  - Candidate A — collapsing the duplicated cell-type derivation in `App.tsx`/`exportRosters.ts`.
  - Candidate C — decomposing `SetupScreen.tsx`.
  - Candidate D — extracting the simulation clock from `DraftView`.
  - Candidate E — deleting `initDraft.ts`'s dead demo-data generators.
- Any change to `App.tsx`, `SetupScreen.tsx`, `initDraft.ts`, or `aiSimulator.ts`'s public exports.

## Further Notes

This spec originated from the "Deepen the draft engine" candidate (candidate B) in the 2026-08-15 architecture review, and was settled via a `/grilling` session covering module shape, the provisional-pick naming, skip-logic unification, the AI-orchestration/seam boundary, testing philosophy, and rollout order. The review's other four candidates (A, C, D, E) are expected to become their own specs/tickets later, worked independently of this one.

Rollout is expected to proceed as five sequential commits, one per module extraction, in this dependency order: `reactionQueue.ts` → `pickReducer.ts` (including the `TOTAL_ROUNDS` fix) → `saveReducer.ts` → `pullbackReducer.ts` → `simulationOrchestrator.ts`, with the full test suite green after each.
