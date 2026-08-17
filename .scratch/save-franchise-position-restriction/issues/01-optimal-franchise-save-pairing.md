# 01 — Enforce save/franchise position restriction via optimal-pair selection

**What to build:** A team's saved player may never share a `position` with
that team's declared franchise player, and the AI's franchise selection
should find the single best `(franchise, save)` pair the roster can support
— not just compare its top two eligible players.

Add one shared predicate (proposed home: `aiSimulator.ts`) answering "does
this candidate share a position with this team's franchise player?"
(`franchisePlayer === null` → false), and wire it into:

- `saveCandidates` (`aiSimulator.ts`) — excludes same-position candidates, in
  addition to the existing exact-id and `saveHistory` exclusions. This
  propagates into `computeSaveTarget`/`computeSaveDecision` (the live save
  decision, called from `advanceSimulation`) and into
  `evaluatePullbackDecision`'s internal `computeSaveTarget` call.
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

**Replace `computeFranchiseTarget`'s top-2 swap heuristic entirely** with a
direct search over every franchise-eligible candidate:

1. For each eligible candidate `F` (no top-2 cap), compute its best legal
   save target: `saveCandidates(team, F)[0] ?? null`.
2. Score the pair by combined value — `value(F) + (saveTarget ?
   value(saveTarget) : 0)`, where `value` is a monotonically decreasing
   function of ADP (lower ADP → higher value; a missing save target
   contributes zero, not a penalty).
3. The candidate with the best-scoring pair is the deterministic franchise
   target. Ties broken toward the lower-ADP `F`.
4. Zero eligible candidates → no franchise target (unchanged). One eligible
   candidate → that candidate, trivially (unchanged).
5. Remove the old `xBlocked`/`yBlocked`/`naturalSaveTarget` swap machinery —
   fully subsumed by the general search.
6. Mistake noise: sort pairs descending by score; on a mistake draw, target
   the *second*-best pair's `F` instead of the best, falling back to the
   best when there's no second candidate.

No change to `FranchiseStep.tsx` or `setupHelpers.ts` beyond
`autoSelectFranchise` now calling the redesigned function — franchise
declaration always finishes during setup, before any save can occur, and the
user's own team's pick stays fully manual. Pullback itself is unrestricted
by the position rule.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Shared position predicate exists in `aiSimulator.ts`, handles
      `franchisePlayer === null` as "no conflict."
- [ ] `saveCandidates` excludes same-position (different-id) candidates from
      the franchise target, in addition to the existing exact-id and
      `saveHistory` exclusions.
- [ ] `computeFranchiseTarget` searches all franchise-eligible candidates
      (not just the top two), pairing each with `saveCandidates(team,
      F)[0]`, and selects the candidate whose pair has the best combined
      ADP-based value.
- [ ] A three-plus-candidate chain scenario (spanning save-history blocks
      and shared positions) where the optimal pair requires reaching past
      rank 2 is covered by a test, and the search finds it.
- [ ] A same-position top-2 pair still results in the better-ADP candidate
      being franchised (position caps retention to one of them regardless
      of which is chosen).
- [ ] A franchise candidate with no legal save target is still a valid,
      comparable choice (contributes zero save-side value, not excluded or
      erroring).
- [ ] Mistake noise substitutes the second-best pair's candidate for the
      franchise target on a mistake draw, falling back to the best pair
      when no second eligible candidate exists.
- [ ] `buildReactionQueue`'s `isSaveable` returns false when the picked
      player shares a position with `team.franchisePlayer`; the queue falls
      through to a pullback-only prompt (or no prompt) exactly as it does
      for the existing `saveHistory`/`saveUsedThisDraft` blocks.
- [ ] `invokeSave` no-ops if dispatched against a position-blocked save.
- [ ] `ReactionModal` shows the explanatory copy above whenever a prompt is
      pullback-only due to a position conflict; pullback options (if any)
      still render normally.
- [ ] A simulated team with a position-conflicting franchise player never
      dispatches `INVOKE_SAVE` for that player in `advanceSimulation`,
      falling through to the pullback evaluation instead.
- [ ] `CONTEXT.md`'s Save and Franchise player entries are updated with the
      wording above.
- [ ] `aiSimulator.test.ts`'s old top-2-swap-specific tests (including
      "never considers a third eligible candidate for the swap," which the
      redesign deliberately reverses) are rewritten around the new search;
      `setupHelpers.test.ts`'s `autoSelectFranchise` tests are reviewed
      against the redesigned function.
- [ ] `reactions.test.ts` and `advanceSimulation.test.ts` get position-block
      coverage (pullback-only fallback, `INVOKE_SAVE` no-op, AI never
      invoking a position-blocked save). No component test added for the
      modal copy (consistent with `ReactionModal` being untested today, per
      ADR-0002's precedent).
