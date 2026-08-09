# 04 — Save mechanics

**What to build:** Add the full save rule to the draft engine and UI. After every `PICK_PLAYER`, the engine checks whether the picked player is on any team's previous-year roster and is saveable (never previously saved by that team). If so, the engine sets `pendingPrompt` to a `SavePrompt`. In practice mode, if it's the user's team, they see a prompt to invoke or decline the save. For all other cases (AI team, or watch mode) the engine decides automatically based on player value. Invoking a save blocks the pick, places the player in the saving team's `lastAvailableRound` slot, decrements `lastAvailableRound`, and enforces the one-per-draft limit. Save history persists to `localStorage` so past saves are enforced in future sessions.

**Blocked by:** 03 — full draft board + ADP simulation.

**Status:** ready-for-agent

- [ ] Engine checks for save eligibility after every `PICK_PLAYER`: picked player must be in the reacting team's previous-year roster and must not appear in that team's `saveHistory`
- [ ] Engine produces `pendingPrompt: SavePrompt` when a saveable player is picked; draft does not advance until the prompt is resolved
- [ ] `INVOKE_SAVE` action: removes the player from the picking team's roster, places them in the saving team's `roster[lastAvailableRound]`, decrements `lastAvailableRound`, marks the save used for this draft, adds the player to `saveHistory`, clears `pendingPrompt`, then advances `currentPick`
- [ ] `DECLINE_SAVE` action: clears `pendingPrompt` and advances `currentPick` normally
- [ ] Engine enforces one save per draft: if the saving team has already used their save this draft, the eligibility check returns false
- [ ] Engine enforces lifetime save history: if the player appears in the team's `saveHistory` (from any past draft), they are not saveable
- [ ] In practice mode, a save prompt modal appears when the user's team has a saveable player picked; user chooses Invoke or Decline
- [ ] AI teams (and user's team in watch mode) auto-decide: invoke save with probability weighted by the player's ADP rank (better rank = higher probability)
- [ ] Save history is written to `localStorage` keyed by team name after each save; loaded on app start to pre-populate `saveHistory` for each team
- [ ] Engine test: save blocks the pick — picking team does not receive the player
- [ ] Engine test: saved player lands in `lastAvailableRound` slot; `lastAvailableRound` decrements
- [ ] Engine test: second save attempt in same draft is ineligible
- [ ] Engine test: player in `saveHistory` is ineligible even if never saved in current draft
- [ ] Engine test: `pendingPrompt` is set correctly after a pick that triggers save eligibility
