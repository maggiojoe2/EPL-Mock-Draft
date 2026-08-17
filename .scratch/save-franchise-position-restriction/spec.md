Status: ready-for-agent

# Save/franchise position restriction and value optimization

## Problem Statement

Two related problems in how simulated teams handle franchise/save retention:

1. **No position restriction.** A team's saved player and its franchise player can
   currently end up at the same position — the app never checks position when
   offering or resolving a save. Nothing in the save flow (`INVOKE_SAVE`,
   `computeSaveTarget`/`computeSaveDecision`), the save-prompt UI, or the AI's
   franchise-selection heuristic (`computeFranchiseTarget`) is aware of this
   restriction.
2. **The franchise-selection heuristic leaves value on the table even where
   positions aren't the issue.** `computeFranchiseTarget` only ever compares its
   top two franchise-eligible players (by ADP) — a fixed "swap X for Y" special
   case — and never considers a third candidate. Since a team can retain at most
   two players total through these mechanisms (one guaranteed franchise slot, one
   reactive save slot), the actual goal is simple: find the single best
   `(franchise, save)` pair the roster can support. A rank-3 (or lower) eligible
   candidate is sometimes the correct franchise choice — e.g. when both of the
   top two share a position with each other, or when a chain of save-blocked,
   same-position eligible players makes the top-2-only comparison miss a better
   trade further down the list — and the current heuristic structurally can't see
   past rank 2 to find it.

## Solution

Replace the ad hoc top-2 "swap" heuristic with a direct search: for every
franchise-eligible candidate, compute its best legal complementary save target
(excluding its own id, its position, and anyone in `saveHistory`), score each
resulting `(franchise, save)` pair by combined value, and pick the best-scoring
pair. Value is ADP-based, consistent with every other value judgment in the
codebase — lower ADP is better. A missing save target for a given franchise
candidate contributes no extra value to that pair's score (it's a foregone bonus,
not a penalty on the franchise pick itself).

This single search subsumes the position restriction (position is just one of
the search's exclusion filters, not a separate bolt-on) and replaces the top-2
limitation with an exhaustive one — since eligible-candidate counts are small
(a handful) and rosters are capped at 16 players, this is cheap and finds the
true best achievable pair, not an approximation.

Mistake noise still applies, generalized from a single-candidate substitution to
a pair substitution: on a mistake draw, the *second*-best pair (by the same
combined-value ranking) is franchised instead of the best one, falling back to
the best pair if no second candidate exists. The live, per-decision save mistake
(substituting the next-best saveable candidate when an actual save prompt is
being resolved) is unchanged — it already operates on `saveCandidates`, which
inherits the position fix directly and needs no further change once the
franchise target itself reflects the optimized pair.

Franchise declaration still always finishes during setup, before any draft
action runs — the search runs once, at that point, exactly where
`computeFranchiseTarget` runs today.

## User Stories

1. As a practice-mode user whose team's franchise player is a WR, I want the
   save prompt to not offer me a save when the picked player is also a WR, so
   that I can't accidentally violate the league's retention rules.
2. As a practice-mode user blocked from saving due to a position conflict, I
   want to see an explanation naming the conflicting position and my
   franchise player, so that I understand why the option is missing instead
   of assuming it's a bug.
3. As a practice-mode user blocked from saving by position, I want any
   pullback options I still have to remain fully available, so that the
   position restriction doesn't cost me an unrelated retention option.
4. As a user in watch mode (or a non-user team in practice mode), I want
   simulated teams to never save a player whose position matches their own
   franchise player, so that AI teams follow the same rule the human user
   does.
5. As a user relying on the AI's franchise-selection logic, I want it to
   consider every franchise-eligible candidate — not just the top two by
   ADP — when deciding what to franchise, so that a better achievable
   `(franchise, save)` pairing further down the eligible list isn't missed
   just because the comparison stopped at rank 2.
6. As a user, I want the AI's franchise/save selection to be judged by the
   combined value of what it actually ends up retaining (the pair, not the
   franchise pick in isolation), so that a slightly worse franchise choice
   that unlocks a much better save target is preferred over a marginally
   better franchise choice that leaves its best complementary save target
   blocked.
7. As a user watching simulated drafts, I want this optimization to still
   include occasional realistic mistakes (a near-miss pair rather than the
   true optimum), so that simulated teams read as competent, fallible
   managers rather than flawless optimizers.
8. As a maintainer reading `CONTEXT.md`, I want the Save and Franchise player
   glossary entries to state the position-exclusivity rule, so that the
   restriction is documented ubiquitous language, not tribal knowledge in the
   code.
9. As a developer extending the save/franchise/pullback engine later, I want
   a single shared predicate for "does this candidate share a position with
   this team's franchise player," so that the rule can't drift out of sync
   between the UI, the reaction-queue gating, and the AI decision logic.
10. As a user whose team has no franchise player declared (none eligible, or
    none selected), I want saves to behave exactly as they do today, so that
    the new restriction never fires when there's nothing for it to conflict
    with.
11. As a developer, I want the exhaustive pair search to degrade correctly
    when a franchise candidate has no legal save target at all (e.g. a small
    or thin previous-year roster), so that such a candidate is still a valid
    franchise choice — just without a save bonus — rather than being wrongly
    excluded or crashing the comparison.

## Implementation Decisions

- **New shared predicate**: a single pure function (proposed home:
  `aiSimulator.ts`) answers "does this candidate player share a position with
  this team's franchise player?" — `franchisePlayer === null` always answers
  false. Every enforcement point below calls this one predicate; no
  enforcement point re-implements the position comparison independently.

- **`saveCandidates` (`aiSimulator.ts`)**: excludes candidates that share a
  position with `franchiseTarget`, in addition to the existing exact-id
  exclusion and `saveHistory` exclusion. This is the single choke point for
  the AI's actual save target, so the fix here propagates to
  `computeSaveTarget`/`computeSaveDecision` (the live save decision) and to
  `evaluatePullbackDecision`'s internal `computeSaveTarget` call (used to
  exclude the team's current save target from pullback candidates) with no
  separate change needed there.

- **`computeFranchiseTarget` (`aiSimulator.ts`) — full redesign, replacing the
  top-2 swap heuristic:**
  1. Compute the full list of franchise-eligible players (no top-2 cap).
  2. For each eligible candidate `F`, compute its best complementary save
     target: `saveCandidates(team, F)[0] ?? null` — reusing the same,
     already-position-aware function used for the live save decision, so the
     pairing scored here is guaranteed to be exactly what the live save logic
     will actually produce once `F` is franchised.
  3. Score each pair by combined value: `value(F) + (saveTarget ?
     value(saveTarget) : 0)`, where `value(player)` is a monotonically
     decreasing function of ADP (lower ADP → higher value — e.g. `-adp`, or
     an equivalent inverse scale; exact formula is an implementation detail
     as long as "lower ADP ranks higher" holds and a missing save target adds
     zero, never a penalty).
  4. The candidate with the highest-scoring pair is the deterministic
     franchise target. Ties broken by lower ADP on `F` itself (prefer
     franchising the more valuable player outright when pair values tie).
  5. Zero eligible candidates → no franchise target (unchanged from today).
  6. One eligible candidate → that candidate, trivially (no comparison
     needed, matches today's single-candidate case).
  7. The `xBlocked`/`yBlocked`/`naturalSaveTarget` swap machinery is removed
     entirely — it's fully subsumed by the general search, since a
     save-blocked eligible player's own best-complementary-save-target
     computation already comes back with whatever it can legally support
     (or nothing), and the search naturally prefers whichever franchise
     choice yields the better pair.

  **Mistake noise**: sort all `(F, saveTarget(F))` pairs descending by the
  same combined-value score. On a mistake draw (`isMistake()`), the franchise
  target becomes the second-best pair's `F` instead of the best pair's `F`,
  falling back to the best pair if there's no second eligible candidate —
  directly generalizing the existing "next-best candidate" substitution from
  a flat list to a list of pairs.

- **`buildReactionQueue` (`reactionQueue.ts`)**: `isSaveable` gains a third
  condition — the picked player must not share a position with
  `team.franchisePlayer` — falling through to the existing pullback-only
  prompt pattern (or no prompt, if `pullbackOptions` is also empty) exactly
  as it does for the other two `isSaveable` conditions today.

- **`invokeSave` (`saveReducer.ts`)**: defensive early-return guard using the
  shared predicate, matching its existing `pendingPrompt.kind !== "save"`
  guard style. No live call path can currently reach `INVOKE_SAVE` with a
  position-blocked player once the above changes land, so this is
  defense-in-depth, not a reachable branch today.

- **`ReactionModal` (`App.tsx`)**: when the resolved prompt is pullback-only
  *because of* a position conflict — re-derived at render time via the shared
  predicate against `prompt.pickedPlayer`/`prompt.player` and
  `teams[prompt.reactingTeamIndex].franchisePlayer`, not a new field on
  `PendingPrompt` — render an explanatory line in place of where the Save
  button would have been:
  `"{reactingTeam.name} can't save {player.name} — {player.position} is
  already locked in by your franchise player, {franchisePlayer.name}."`
  Pullback options (if any) render below it exactly as today. No `types.ts`
  schema change: `SavePrompt`/`PullbackPrompt` are unchanged.

- **No changes** to `FranchiseStep.tsx` or `setupHelpers.ts` beyond the fact
  that `autoSelectFranchise` now calls the redesigned
  `computeFranchiseTarget` — franchise declaration always precedes every save
  in a draft, so there's no ordering case where a save could exist before
  franchise declaration finishes. The user's own team's franchise pick
  remains fully manual (`FranchiseStep`), unaffected by this optimization.

- **`CONTEXT.md`** — add to the **Save** definition: "A saved player may not
  share a position with the team's declared franchise player; if it does,
  the save option isn't offered (pullback is unaffected)." Add to
  **Franchise player**: "A team's franchise player and saved player can never
  share a position (see Save)." (This documents the league rule itself, not
  the AI's search algorithm — the algorithm is an implementation detail, not
  domain vocabulary.)

## Testing Decisions

Tests should assert observable behavior (resulting `DraftState`, resulting
`pendingPrompt`/`reactionQueue` shape, resulting `Player | null` from the
pure `aiSimulator.ts` functions, and rendered modal text) — never internal
call sequencing.

- **`aiSimulator.test.ts`**:
  - `computeFranchiseTarget`'s existing top-2-swap-specific tests are
    rewritten around the new search, since some of them assert behavior the
    redesign deliberately changes — most notably "never considers a third
    eligible candidate for the swap," which is no longer true by design and
    must be replaced with the opposite assertion.
  - New/updated cases: single eligible candidate (trivial, unchanged
    behavior); multiple eligible candidates where the best-ADP one is also
    the best pair (no surprises); a chain scenario (three-plus eligible
    candidates spanning save-history blocks and shared positions) where the
    optimal pair requires reaching past rank 2 — asserting the search finds
    it where the old top-2 heuristic would not; a same-position top-2 pair
    (confirming the franchise target is still the better-ADP of the two,
    since positions cap retention to one of them regardless of which is
    picked); a candidate with no legal save target at all (still a valid,
    comparable franchise choice, contributing zero save-side value); the
    mistake-noise pair substitution (using the existing `vi.spyOn(Math,
    'random')` pattern) landing on the second-best pair, and falling back to
    the best pair when there's no second eligible candidate.
  - `computeSaveTarget`/`computeSaveDecision`: add a case excluding a
    same-position (but different-id) candidate from the franchise target,
    alongside the existing exact-id and save-history exclusion cases.

- **`reactions.test.ts`** (prior art: `describe("save mechanics")`'s
  `makeSaveState` factory): add a case where the reacting team's
  `franchisePlayer` shares a position with the picked player — assert the
  resulting prompt is `kind: "pullback"` (or no prompt, when no pullback
  options exist), not `kind: "save"`, and that `INVOKE_SAVE` against a
  synthetically-constructed blocked state is a no-op.

- **`advanceSimulation.test.ts`**: add a case confirming a simulated team
  with a position-conflicting franchise player never dispatches `INVOKE_SAVE`
  for that player, falling through to the pullback evaluation instead.

- **`setupHelpers.test.ts`**: existing `autoSelectFranchise` tests are
  reviewed against the redesigned `computeFranchiseTarget` — any assertion
  that assumed the old top-2-only behavior is updated to reflect the full
  search.

- **App.tsx modal rendering**: no component test infrastructure currently
  exists for `App.tsx` (per ADR-0002's precedent for the setup screen) — skip
  a dedicated render test for the explanatory copy and rely on manual/`/run`
  verification, consistent with how the rest of `ReactionModal` is currently
  untested.

## Out of Scope

- Extending the position restriction to pullback (a team may still pull back
  a player sharing a position with its franchise player — only save is
  restricted).
- Any change to `FranchiseStep.tsx`'s user-facing franchise picker — the
  optimization applies only to simulated teams' automatic selection.
- Persisting or exporting the position-block reason or the pair-search
  scoring anywhere outside the in-session `ReactionModal`/decision logic
  (e.g. the debug log) — existing `ReactionLogEntry`/`SaveTargetLogEntry`
  shapes are unchanged.
- Any change to roster starter-slot position rules (QB/RB/WR/TE/FLEX/K/DEF)
  — this restriction and optimization are about the franchise/save pairing
  only, unrelated to `ROSTER_SLOTS` starter accounting.
- Extending the value-pairing search to also weigh pullback likelihood or any
  lookahead into how the rest of the draft might unfold — the search
  optimizes the franchise/save pairing given the team's roster and history as
  they stand at franchise-declaration time; it doesn't attempt to model or
  predict opponent behavior during the draft itself.
- Making `MISTAKE_PROBABILITY` configurable, or changing its value.

## Further Notes

This spec was scoped via a `/grill-with-docs` session and then substantially
widened mid-session, before any code was written: the initial scope was a
narrow position-only fix to the existing top-2 swap heuristic, but working
through the fix surfaced that the top-2 restriction itself was a deeper,
pre-existing source of missed value (a save-blocked/same-position chain
across three or more eligible candidates can hide a better pairing past rank
2). Since a team can retain at most two players through franchise+save (one
guaranteed slot, one reactive slot), the right framing turned out to be "find
the best achievable pair," which subsumes the position restriction as one
constraint of that search rather than a separate rule bolted onto a
heuristic. The feature directory/slug were kept as originally scoped
(`save-franchise-position-restriction`) since the position rule remains the
literal trigger for the work, even though the resulting fix is broader.
