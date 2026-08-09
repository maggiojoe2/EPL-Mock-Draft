# 01 — Scaffold + draft engine skeleton

**What to build:** Set up the React + Vite project with TypeScript. Define all core domain types (`Player`, `Team`, `DraftState`, `Action`). Implement non-snake pick sequencing in a pure draft engine reducer — given a `DraftState` and an `Action`, it returns a new `DraftState`. Wire up a minimal UI: a 12×16 draft board and a player list with hardcoded dummy data. Clicking a player on your turn makes a pick; AI teams auto-pick randomly between your turns. Tests cover the sequencing rules. The goal is a bare-bones but complete vertical slice: all layers present, draft runs from pick 1 to pick 192.

**Blocked by:** None — can start immediately.

**Status:** done

- [ ] React + Vite + TypeScript project initialised, runs locally with `npm run dev`
- [ ] Vitest (or equivalent) configured, `npm test` passes
- [ ] Core types defined: `Player`, `Team`, `DraftState`, `Action`, `PickRecord`
- [ ] Draft engine reducer implemented as a pure function `(DraftState, Action) => DraftState`
- [ ] `PICK_PLAYER` action removes the player from the available pool, places them in the picking team's next normal roster slot, and advances `currentPick` to the next team in non-snake order
- [ ] After pick 12 in a round, `currentPick` advances to round + 1, team index 0 (wraps, never reverses)
- [ ] After all 192 pick slots are filled, the engine marks the draft complete
- [ ] Minimal draft board UI renders a 12-column × 16-row grid; filled slots show the player name
- [ ] Current pick is visually indicated on the board
- [ ] Available player list renders below (or beside) the board, sorted by insertion order for now (ADP ordering comes in ticket 03)
- [ ] In practice mode the user's team turn is active; clicking a player in the list dispatches `PICK_PLAYER`
- [ ] AI teams auto-pick a random available player immediately on their turn
- [ ] Engine tests: non-snake sequencing wraps correctly after round end; pick advances team index 0→11 then resets; draft completes after 192 picks
