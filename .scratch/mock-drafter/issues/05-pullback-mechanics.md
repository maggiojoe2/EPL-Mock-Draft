# 05 — Pullback mechanics

**What to build:** Add the full pullback rule to the draft engine and UI. After every `PICK_PLAYER`, the engine checks whether the picked player is on any team's previous-year roster (separate from the save check — a player triggers either a save prompt or a pullback prompt, not both, since a player can only be on one team's previous-year roster). If the team has remaining pullback-eligible players (any previous-year players not yet pulled back), the engine sets `pendingPrompt` to a `PullbackPrompt`. In practice mode, the user chooses which previous-year player to claim or declines. The original pick stands; the pulled-back player fills `lastAvailableRound`. This can fire multiple times in one draft.

**Blocked by:** 03 — full draft board + ADP simulation.

**Status:** done

- [x] Engine checks for pullback eligibility after every `PICK_PLAYER`: the picked player must be in a team's previous-year roster, and that team must have at least one previous-year player remaining in the available pool (to pull back)
- [x] Engine produces `pendingPrompt: PullbackPrompt` when a pullback-eligible situation arises; draft does not advance until resolved
- [x] ~~A single pick cannot trigger both a save prompt and a pullback prompt~~ — corrected during implementation: only one *team* reacts per pick (the player can only be on one team's previous-year roster), but that team's single prompt may offer *both* actions — if their save is unused and the player is saveable, they can save, pull back a different previous-year player, or decline; save and pullback are not mutually exclusive choices. See Comments.
- [x] `INVOKE_PULLBACK { pullbackPlayer }` action: places `pullbackPlayer` in the reacting team's `roster[lastAvailableRound]`, removes `pullbackPlayer` from the available pool, decrements `lastAvailableRound`, leaves the original pick on the picking team's roster, clears `pendingPrompt`, advances `currentPick`
- [x] `DECLINE_PULLBACK` action: clears `pendingPrompt` and advances `currentPick` normally
- [x] A team may use pullback multiple times in one draft — once per eligible previous-year player that gets picked by an opponent
- [x] In practice mode, a pullback prompt modal appears listing all the user's remaining pullback-eligible players (previous-year players still in the available pool); user selects one or declines
- [x] AI teams (and user's team in watch mode) auto-decide: invoke pullback and select the highest-ADP remaining eligible player, with probability weighted by that player's ADP rank
- [x] Engine test: original pick stands — picking team retains the player
- [x] Engine test: pulled-back player lands in `lastAvailableRound`; `lastAvailableRound` decrements
- [x] Engine test: two pullbacks in one draft decrement `lastAvailableRound` twice
- [x] Engine test: team with no remaining pullback-eligible players in the pool does not produce a `PullbackPrompt`
- [x] Engine test: team that declines pullback can still pull back on a later pick

## Comments

The engine (`buildReactionQueue`, `INVOKE_PULLBACK`/`DECLINE_PULLBACK`), AI auto-decide, and the practice-mode `ReactionModal` pullback branch were already built (landed alongside issues 03/04, which share the reaction-queue infrastructure with saves). Two gaps remained for this ticket:

- **Bug fix:** `pullbackOptions` was unsorted, so the AI's "select the highest-ADP remaining eligible player" (`opts[0]`) and the practice-mode modal's option list were both in arbitrary (previous-year-roster) order rather than best-player-first. Fixed by sorting `pullbackOptions` ascending by `adp` in `buildReactionQueue`.
- **Missing test coverage:** added the two engine tests called out in this ticket that weren't yet present — "team with no remaining pullback-eligible players in the pool does not produce a `PullbackPrompt`" and "team that declines pullback can still pull back on a later pick" — plus one covering the ADP-sort fix.
- **Domain rule correction (caught in review):** the original AC ("a single pick cannot trigger both a save prompt and a pullback prompt") had been implemented literally — `buildReactionQueue` offered save *or* pullback, never both, for the same reaction. Confirmed with the user that the real rule is: a team with an unused save that owns the saveable picked player should be offered all three choices in one prompt — save it, pull back a different previous-year player, or decline. Fixed by adding `pullbackOptions` onto `SavePrompt`, relaxing `INVOKE_PULLBACK`'s guard to accept a `save`-kind prompt, extending the AI's `ADVANCE_SIMULATION` decision to fall back to pullback when it declines the save, and updating the practice-mode modal to show pullback options alongside the save button. `spec.md`'s "Reaction check on every pick" section is updated to match. "At most one team reacts per pick" still holds — only the prompt's *shape* changed, not which teams can react.
