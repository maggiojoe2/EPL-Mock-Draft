# 01 — Enforce save/franchise position restriction

**What to build:** A team's saved player may never share a `position` with
that team's declared franchise player. Add one shared predicate (proposed
home: `aiSimulator.ts`) answering "does this candidate share a position with
this team's franchise player?" (`franchisePlayer === null` → false), and wire
it into every place a save decision can happen:

- `saveCandidates` (`aiSimulator.ts`) — excludes same-position candidates,
  which propagates the fix into `computeSaveTarget`/`computeSaveDecision`
  (the AI's real save decision, called from `advanceSimulation` in
  `simulationOrchestrator.ts`) and into `evaluatePullbackDecision`'s internal
  `computeSaveTarget` call.
- `computeFranchiseTarget`'s swap heuristic — extend its `naturalSaveTarget`
  computation to also exclude same-position players (not just the exact
  franchise-candidate id), using the same predicate. No other change to the
  swap condition itself is needed.
- `buildReactionQueue` (`reactionQueue.ts`) — `isSaveable` gains a third
  condition (no position conflict), falling through to the existing
  pullback-only prompt pattern when it's false.
- `invokeSave` (`saveReducer.ts`) — defensive early-return guard using the
  same predicate, matching its existing `pendingPrompt.kind !== "save"`
  guard style.
- `ReactionModal` (`App.tsx`) — when a prompt is pullback-only because of a
  position conflict (re-derived at render time via the same predicate, no
  `types.ts` change), render: `"{reactingTeam.name} can't save
  {player.name} — {player.position} is already locked in by your franchise
  player, {franchisePlayer.name}."` in place of the Save button. Pullback
  options render unaffected below it.
- `CONTEXT.md` — add to **Save**: "A saved player may not share a position
  with the team's declared franchise player; if it does, the save option
  isn't offered (pullback is unaffected)." Add to **Franchise player**: "A
  team's franchise player and saved player can never share a position (see
  Save)."

No change to `FranchiseStep.tsx` or `setupHelpers.ts` — franchise
declaration always finishes during setup, before any save can occur.
Pullback itself is unrestricted by this rule.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Shared predicate exists in `aiSimulator.ts`, handles `franchisePlayer
      === null` as "no conflict."
- [ ] `saveCandidates` excludes same-position (different-id) candidates from
      the franchise target, in addition to the existing exact-id and
      `saveHistory` exclusions.
- [ ] `computeFranchiseTarget`'s `naturalSaveTarget` also excludes
      same-position players; a case where the top two eligible players (X,
      Y) share a position and Y is save-blocked results in no swap.
- [ ] `buildReactionQueue`'s `isSaveable` returns false when the picked
      player shares a position with `team.franchisePlayer`; the queue falls
      through to a pullback-only prompt (or no prompt, if no pullback
      options remain) exactly as it does for the existing `saveHistory`/
      `saveUsedThisDraft` blocks.
- [ ] `invokeSave` no-ops (returns state unchanged) if dispatched against a
      position-blocked save.
- [ ] `ReactionModal` shows the explanatory copy above whenever a prompt is
      pullback-only due to a position conflict; pullback options (if any)
      still render normally.
- [ ] A simulated team with a position-conflicting franchise player never
      dispatches `INVOKE_SAVE` for that player in `advanceSimulation`,
      falling through to the pullback evaluation instead.
- [ ] `CONTEXT.md`'s Save and Franchise player entries are updated with the
      wording above.
- [ ] New/updated tests: `aiSimulator.test.ts` (`computeSaveTarget`/
      `computeSaveDecision` same-position exclusion; `computeFranchiseTarget`
      no-swap-when-same-position case), `reactions.test.ts` (position-blocked
      save falls to pullback-only or no prompt; `INVOKE_SAVE` no-ops against
      a blocked state), `advanceSimulation.test.ts` (AI never invokes a
      position-blocked save). No component test added for the modal copy
      (consistent with `ReactionModal` being untested today, per ADR-0002's
      precedent).
