# 06 — Skip logging doesn't fire on the real resolveReaction cursor-advance path

**What to build:** Ticket 04 wired `advanceCursor`'s `onSkip` callback into `simulationOrchestrator.ts`'s `ADVANCE_SIMULATION` handler only. But `advanceCursor` is also called — with no `onSkip` argument — from `reactionQueue.ts`'s `resolveReaction`, which runs after *every* `PICK_PLAYER`/`INVOKE_SAVE`/`DECLINE_SAVE`/`INVOKE_PULLBACK`/`DECLINE_PULLBACK` (via `pickReducer.ts`, `saveReducer.ts`, `pullbackReducer.ts`). That's the path that actually advances the cursor past full teams during normal play (e.g. the cursor rolling from round 15 into round 16 past a franchise-locked team). In a real draft, that's where teams get skipped — not the defensive `teamHasOpenNormalSlot` check at the top of `advanceSimulation`, which mostly only fires when `advanceSimulation` is invoked with a cursor some other path has already parked on a full team.

Net effect: ticket 04's tests pass (they construct `DraftState` directly with `currentPick` pre-set to a full team, bypassing `resolveReaction` entirely), but a real draft produces no `SKIP_TURN` log entries for the common case.

**What to build (fix):**
- Extend `resolveReaction` (in `reactionQueue.ts`) to pass an `onSkip` callback into its `advanceCursor` call, collecting skipped `{round, teamIndex}` stops the same way `simulationOrchestrator.ts` does, and append the corresponding `SKIP_TURN` entries to the returned `debugLog`.
- `resolveReaction`'s signature/return type will need to gain `debugLog` to its `Pick<DraftState, ...>` return type; its three call sites (`pickReducer.ts`'s `pickPlayer`, `saveReducer.ts`'s `declineSave`, `pullbackReducer.ts`'s equivalent) need to pass the *already-updated* `debugLog` (including that action's own new log entry) into the `state` argument they hand to `resolveReaction`, and let `resolveReaction`'s returned `debugLog` be the authoritative final value (it must come after any earlier `debugLog:` key in each reducer's returned object literal, not before).
- Consider hoisting `buildSkipLogEntry` out of `simulationOrchestrator.ts` into a shared location (e.g. `pickReducer.ts` alongside `buildPickLogEntry`) so both call sites use the same builder instead of two copies.

**Blocked by:** 04 (done), and should land after ticket 02's in-flight work on `reactionQueue.ts`'s callers settles, to avoid a merge collision — check `saveReducer.ts`/`pullbackReducer.ts`/`reactionQueue.ts` are stable before starting.

**Status:** resolved

- [x] A skip encountered by `resolveReaction`'s post-action cursor advance (not just `ADVANCE_SIMULATION`'s own top-level check) produces a `SKIP_TURN` `debugLog` entry, for both human and simulated actions
- [x] Skip entries from this path appear in correct chronological order relative to the action that triggered the cursor advance
- [x] Extend `advanceSimulation.test.ts` (or add a new test file) with a test that drives a full pick/reducer flow — not a hand-constructed `currentPick` — through a franchise-locked team's round-16 slot, asserting the resulting `debugLog` contains the `SKIP_TURN` entry
- [x] No change to the actual skip/cursor-advance logic itself — logging only

## Comments

Filed by `/implement 04` after `/code-review`'s spec sub-agent found the gap. See conversation for full analysis. Deliberately deferred rather than fixed immediately because `saveReducer.ts`, `pullbackReducer.ts`, `aiSimulator.ts`, `draftEngine.ts`, and `types.ts` were mid-edit, uncommitted, in a concurrent session working ticket 02 at the time this was filed — fixing this ticket touches three of the same files (`reactionQueue.ts`, `saveReducer.ts`, `pullbackReducer.ts`) and risked colliding with that in-flight work.

Resolved once ticket 02 landed (commit `562f118`) and the tree was clean. Fix: `resolveReaction` now passes an `onSkip` callback into `advanceCursor`, collecting skips and appending `SKIP_TURN` entries to the `debugLog` it returns; its four call sites (`pickPlayer`, `declineSave`, `invokePullback`, `declinePullback`) now feed their already-updated `debugLog` into the `state` handed to `resolveReaction` so nothing is dropped. `buildSkipLogEntry` was hoisted into a shared `skipLogEntry.ts`. Two new tests in `debugLog.test.ts` drive a real two-team draft (no hand-constructed `currentPick`) through a franchise-locked round-16 skip — one via a human `PICK_PLAYER`, one via `ADVANCE_SIMULATION` (aiContext) — confirming the fix covers both actors. `/code-review`'s two-axis review (standards + spec) came back clean after a Prettier pass; committed as `fc973b4`.
