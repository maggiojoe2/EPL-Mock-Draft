# 05 — Pullback mechanics

**What to build:** Add the full pullback rule to the draft engine and UI. After every `PICK_PLAYER`, the engine checks whether the picked player is on any team's previous-year roster (separate from the save check — a player triggers either a save prompt or a pullback prompt, not both, since a player can only be on one team's previous-year roster). If the team has remaining pullback-eligible players (any previous-year players not yet pulled back), the engine sets `pendingPrompt` to a `PullbackPrompt`. In practice mode, the user chooses which previous-year player to claim or declines. The original pick stands; the pulled-back player fills `lastAvailableRound`. This can fire multiple times in one draft.

**Blocked by:** 03 — full draft board + ADP simulation.

**Status:** ready-for-agent

- [ ] Engine checks for pullback eligibility after every `PICK_PLAYER`: the picked player must be in a team's previous-year roster, and that team must have at least one previous-year player remaining in the available pool (to pull back)
- [ ] Engine produces `pendingPrompt: PullbackPrompt` when a pullback-eligible situation arises; draft does not advance until resolved
- [ ] A single pick cannot trigger both a save prompt and a pullback prompt — the player can only be on one team's previous-year roster, so at most one team reacts per pick
- [ ] `INVOKE_PULLBACK { pullbackPlayer }` action: places `pullbackPlayer` in the reacting team's `roster[lastAvailableRound]`, removes `pullbackPlayer` from the available pool, decrements `lastAvailableRound`, leaves the original pick on the picking team's roster, clears `pendingPrompt`, advances `currentPick`
- [ ] `DECLINE_PULLBACK` action: clears `pendingPrompt` and advances `currentPick` normally
- [ ] A team may use pullback multiple times in one draft — once per eligible previous-year player that gets picked by an opponent
- [ ] In practice mode, a pullback prompt modal appears listing all the user's remaining pullback-eligible players (previous-year players still in the available pool); user selects one or declines
- [ ] AI teams (and user's team in watch mode) auto-decide: invoke pullback and select the highest-ADP remaining eligible player, with probability weighted by that player's ADP rank
- [ ] Engine test: original pick stands — picking team retains the player
- [ ] Engine test: pulled-back player lands in `lastAvailableRound`; `lastAvailableRound` decrements
- [ ] Engine test: two pullbacks in one draft decrement `lastAvailableRound` twice
- [ ] Engine test: team with no remaining pullback-eligible players in the pool does not produce a `PullbackPrompt`
- [ ] Engine test: team that declines pullback can still pull back on a later pick
