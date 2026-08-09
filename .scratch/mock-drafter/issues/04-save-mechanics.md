# 04 — Save mechanics

**What to build:** Add the full save rule to the draft engine and UI. After every `PICK_PLAYER`, the engine checks whether the picked player is on any team's previous-year roster and is saveable (never previously saved by that team in the real league). If so, the engine sets `pendingPrompt` to a `SavePrompt`. In practice mode, if it's the user's team, they see a prompt to invoke or decline the save. For all other cases (AI team, or watch mode) the engine decides automatically based on player value. Invoking a save blocks the pick, places the player in the saving team's `lastAvailableRound` slot, decrements `lastAvailableRound`, and enforces the one-per-draft limit. Save history comes exclusively from the CSV's `previously_saved` column; mock-draft saves are session-only and never persisted.

**Blocked by:** 03 — full draft board + ADP simulation.

**Status:** done

- [x] Remove scaffolded localStorage infrastructure before building the engine:
  - Delete `loadSaveHistoryFromStorage` from `src/setup/storage.ts` — the whole file was scaffolding for this persistence path (`saveSaveHistoryToStorage` was also unused), so it was deleted outright rather than left with dead exports
  - Remove the `localHistory` parameter from `buildTeamsFromImport` in `src/setup/setupHelpers.ts`; initialise `saveHistory` as an empty `Set` and seed it only from `row.previouslySaved`
  - Remove the `loadSaveHistoryFromStorage` import and call from `src/setup/SetupScreen.tsx` (pass no third argument to `buildTeamsFromImport`)
  - Delete the "merges saveHistory from localStorage when available" test from `src/setup/__tests__/setupHelpers.test.ts`
- [x] Engine checks for save eligibility after every `PICK_PLAYER`: picked player must be in the reacting team's previous-year roster and must not appear in that team's `saveHistory` (populated from the CSV's `previously_saved` column only)
- [x] Engine produces `pendingPrompt: SavePrompt` when a saveable player is picked; draft does not advance until the prompt is resolved
- [x] `INVOKE_SAVE` action: removes the player from the picking team's roster, places them in the saving team's `roster[lastAvailableRound]`, decrements `lastAvailableRound`, sets `saveUsedThisDraft: true`, clears `pendingPrompt`, then advances `currentPick` — does NOT write to `saveHistory` or `localStorage`
- [x] `DECLINE_SAVE` action: clears `pendingPrompt` and advances `currentPick` normally
- [x] Engine enforces one save per draft: if the saving team has already used their save this draft (`saveUsedThisDraft: true`), the eligibility check returns false
- [x] Engine enforces real-league save history: if the player appears in the team's `saveHistory` (seeded from CSV `previously_saved`), they are not saveable — this check is CSV-only and is unaffected by mock-draft saves
- [x] In practice mode, a save prompt modal appears when the user's team has a saveable player picked; user chooses Invoke or Decline
- [x] AI teams (and user's team in watch mode) auto-decide: invoke save with probability weighted by the player's ADP rank (better rank = higher probability)
- [x] Engine test: save blocks the pick — picking team does not receive the player
- [x] Engine test: saved player lands in `lastAvailableRound` slot; `lastAvailableRound` decrements
- [x] Engine test: second save attempt in same draft is ineligible (`saveUsedThisDraft`)
- [x] Engine test: player in `saveHistory` (from CSV) is ineligible regardless of `saveUsedThisDraft`
- [x] Engine test: `pendingPrompt` is set correctly after a pick that triggers save eligibility

## Comments

The engine, `INVOKE_SAVE`/`DECLINE_SAVE` handling, AI auto-decide, and the practice-mode `ReactionModal` were already built (landed alongside issue 03). The only outstanding work for this ticket was ripping out the scaffolded `localStorage` save-history persistence per the revised spec (save history is CSV-only, mock-draft saves are session-only) — done, with `src/setup/storage.ts` deleted entirely since both of its exports were persistence scaffolding no longer wanted.
