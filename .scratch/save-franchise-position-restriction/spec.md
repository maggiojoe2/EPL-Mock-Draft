Status: ready-for-agent

# Save/franchise position restriction

## Problem Statement

A fantasy team can currently end up with both a saved player and a franchise
player at the same position — the app never checks position when offering or
resolving a save. That's an oversight: the league's own retention rules treat
franchise and save as two separate ways to lock in the same kind of positional
value, and they aren't supposed to stack at the same position. Right now
nothing in the save flow (`INVOKE_SAVE`, `computeSaveTarget`/
`computeSaveDecision`), the save-prompt UI, or the AI's franchise-selection
heuristic (`computeFranchiseTarget`) is aware of this restriction, so both
human and simulated teams can violate it without any signal that something
went wrong.

## Solution

A team's saved player may never share a `position` with that team's declared
franchise player. This is enforced everywhere a save can happen — the human
save prompt, the AI's autonomous save decision, and the AI's franchise-target
swap heuristic — not just in the UI. Pullback is untouched; this restriction
is specific to Save/Franchise player, per their `CONTEXT.md` definitions.

Franchise declaration always finishes during setup (`useSetupState.ts` /
`autoSelectFranchise`), before any draft action runs and before `initDraft.ts`
builds the `DraftState` — no draft action ever mutates `franchisePlayer`
afterward. So the restriction only needs to be enforced at save-decision
time; there is no "declare franchise after a save already happened" ordering
issue to handle.

When a team's only save option is blocked by this rule, the reaction prompt
falls back to the existing pullback-only pattern (the same fallback already
used when a team has used its one save, or the player is already in
`saveHistory`) — but unlike those existing silent fallbacks, this one
specifically explains why the save option is missing, so a user isn't left
guessing why a normally-saveable player didn't offer a save button.

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
5. As a user relying on the AI's franchise-selection logic, I want the
   franchise/save swap heuristic (`computeFranchiseTarget`) to correctly
   reason about the new position rule, so that it doesn't recommend a swap
   that can't actually free up a save (i.e. swapping between two
   same-position top candidates, where the position rule blocks whichever one
   isn't franchised either way).
6. As a maintainer reading `CONTEXT.md`, I want the Save and Franchise player
   glossary entries to state the position-exclusivity rule, so that the
   restriction is documented ubiquitous language, not tribal knowledge in the
   code.
7. As a developer extending the save/franchise/pullback engine later, I want
   a single shared predicate for "does this candidate share a position with
   this team's franchise player," so that the rule can't drift out of sync
   between the UI, the reaction-queue gating, and the AI decision logic.
8. As a user whose team has no franchise player declared (none eligible, or
   none selected), I want saves to behave exactly as they do today, so that
   the new restriction never fires when there's nothing for it to conflict
   with.

## Implementation Decisions

- **New shared predicate**: a single pure function (proposed home:
  `aiSimulator.ts`, alongside `computeFranchiseTarget`) answers "does this
  candidate player share a position with this team's franchise player?" —
  `franchisePlayer === null` always answers false. Every enforcement point
  below calls this one predicate; no enforcement point re-implements the
  position comparison independently.

- **`saveCandidates` (`aiSimulator.ts`)**: excludes candidates that share a
  position with `franchiseTarget`, in addition to the existing exact-id
  exclusion and `saveHistory` exclusion. This is the single choke point for
  the AI's actual save target, so the fix here propagates to:
  - `computeSaveTarget` / `computeSaveDecision` (the AI's real save
    decision — `advanceSimulation` in `simulationOrchestrator.ts`).
  - `evaluatePullbackDecision`'s internal `computeSaveTarget` call (used to
    exclude the team's current save target from pullback candidates) — no
    separate fix needed there, it inherits the corrected exclusion.

- **`computeFranchiseTarget`'s swap heuristic (`aiSimulator.ts`)**: its
  `naturalSaveTarget` computation (currently: best-ADP player excluding X's
  exact id) is extended to also exclude players sharing X's position, using
  the same shared predicate. No other change to the swap logic is needed —
  with this fix, `naturalSaveTarget` can never resolve to a same-position Y,
  so the existing `swap` condition (`yBlocked && !xBlocked &&
  naturalSaveTarget?.id === Y.id`) already stays `false` for a same-position
  X/Y pair, which is correct: swapping which of the two is franchised can't
  free up a save when the position rule blocks whichever one isn't
  franchised, regardless of which that is.

- **`buildReactionQueue` (`reactionQueue.ts`)**: the existing `isSaveable`
  computation (currently `!saveHistory.has(player.id) &&
  !saveUsedThisDraft`) gains a third condition: the picked player must not
  share a position with `team.franchisePlayer`. When this makes `isSaveable`
  false, the existing fallthrough to a pullback-only prompt (or no prompt, if
  `pullbackOptions` is also empty) applies unchanged — this is the same
  fallback path already used for the other two `isSaveable` conditions.

- **`invokeSave` (`saveReducer.ts`)**: gains a defensive early-return guard
  using the same shared predicate, in the same style as its existing
  `!state.pendingPrompt || state.pendingPrompt.kind !== "save"` guard. No
  live call path can currently reach `INVOKE_SAVE` with a position-blocked
  player once the above changes land (the UI won't render the button; the AI
  won't synthesize the action), so this is defense-in-depth, not a reachable
  branch today.

- **`ReactionModal` (`App.tsx`)**: when the resolved prompt is pullback-only
  *because of* a position conflict — re-derived at render time via the same
  shared predicate against `prompt.pickedPlayer`/`prompt.player` and
  `teams[prompt.reactingTeamIndex].franchisePlayer`, not a new field on
  `PendingPrompt` — render an explanatory line in place of where the Save
  button would have been:
  `"{reactingTeam.name} can't save {player.name} — {player.position} is
  already locked in by your franchise player, {franchisePlayer.name}."`
  Pullback options (if any) render below it exactly as today. No `types.ts`
  schema change: `SavePrompt`/`PullbackPrompt` are unchanged, since the UI
  can recompute the "why" itself from data it already has.

- **No changes** to `FranchiseStep.tsx` or `setupHelpers.ts` — franchise
  declaration always precedes every save in a draft, so there's no ordering
  case where a save could exist before franchise declaration finishes.

- **`CONTEXT.md`** — add to the **Save** definition: "A saved player may not
  share a position with the team's declared franchise player; if it does,
  the save option isn't offered (pullback is unaffected)." Add to
  **Franchise player**: "A team's franchise player and saved player can never
  share a position (see Save)."

## Testing Decisions

Tests should assert observable behavior (resulting `DraftState`, resulting
`pendingPrompt`/`reactionQueue` shape, resulting `Player | null` from the
pure `aiSimulator.ts` functions, and rendered modal text) — never internal
call sequencing.

- **`aiSimulator.test.ts`** (prior art: existing `describe("computeSaveTarget"
  )` / `describe("computeFranchiseTarget")` blocks, e.g. "skips players
  already in save history" and "swaps to franchise Y when Y is save-blocked
  …"):
  - `computeSaveTarget`/`computeSaveDecision`: add a case excluding a
    same-position (but different-id) candidate from the franchise target,
    alongside the existing exact-id and save-history exclusion cases.
  - `computeFranchiseTarget`: add a case where X and Y (top-2 eligible) share
    a position and Y is save-blocked — assert no swap occurs (franchises X as
    normal), extending the existing "does not swap when …" cases.

- **`reactions.test.ts`** (prior art: `describe("save mechanics")`'s
  `makeSaveState` factory and its "sets a save pendingPrompt when a saveable
  previous-year player is picked" case): add a case where the reacting
  team's `franchisePlayer` shares a position with the picked player — assert
  the resulting prompt is `kind: "pullback"` (or no prompt, when no pullback
  options exist), not `kind: "save"`, and that `INVOKE_SAVE` against a
  synthetically-constructed blocked state is a no-op (mirrors the existing
  guard-clause tests for `pendingPrompt.kind !== "save"`).

- **`advanceSimulation.test.ts`**: add a case confirming a simulated team
  with a position-conflicting franchise player never dispatches `INVOKE_SAVE`
  for that player, falling through to the pullback evaluation instead —
  following the existing pattern for how AI save-vs-pullback fallthrough is
  tested there.

- **App.tsx modal rendering**: no component test infrastructure currently
  exists for `App.tsx` (per ADR-0002, component tests are deferred for the
  setup screen; the same appears true for the draft-play modals) — skip a
  dedicated render test for the explanatory copy and rely on manual/`/run`
  verification, consistent with how the rest of `ReactionModal` is currently
  untested.

## Out of Scope

- Extending the restriction to pullback (a team may still pull back a player
  sharing a position with its franchise player — only save is restricted).
- Any change to `FranchiseStep.tsx`, `setupHelpers.ts`, or the franchise
  declaration flow — declaration always precedes saves, so there's nothing to
  enforce there.
- Persisting or exporting the position-block reason anywhere outside the
  in-session `ReactionModal` (e.g. the debug log) — the existing
  `ReactionLogEntry`/`SaveTargetLogEntry` shapes are unchanged.
- Any change to roster starter-slot position rules (QB/RB/WR/TE/FLEX/K/DEF)
  — this restriction is about the franchise/save pairing only, unrelated to
  `ROSTER_SLOTS` starter accounting.

## Further Notes

This spec supersedes the unscoped stub at
`.scratch/backlog/issues/wontfix/09-save-franchise-position-restriction.md`
and was settled via a `/grill-with-docs` session covering scope (pullback
excluded), AI enforcement (required), the franchise-swap heuristic fix
(included now rather than deferred), and the explanatory-copy approach
(shown, not silent) — including the exact `CONTEXT.md` and modal copy drafts
reproduced above.
