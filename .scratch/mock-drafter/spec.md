Status: ready-for-agent

# EPL Mock Drafter — Spec

## Problem Statement

The EPL fantasy football league runs its annual NFL player draft on paper, with a set of custom rules that differ significantly from a standard snake draft. Managers have no way to practice or simulate the draft beforehand, making it hard to prepare pick strategy, understand how saves and pullbacks will play out, or observe how a full simulated draft unfolds.

## Solution

A locally-run web app (React + Vite, opened in a browser) that simulates the EPL league's custom draft. The user can practice as one team against 11 simulated opponents, or watch all 12 teams simulate automatically. The app enforces all custom rules — non-snake order, franchise players, saves, and pullbacks — and exports the final rosters as CSV.

## User Stories

### Setup

1. As a draft manager, I want to import the player pool from a CSV file (name, position, NFL team, ADP rank), so that I have an accurate set of draftable players without manual entry.
2. As a draft manager, I want to import each fantasy team's previous-year roster from a CSV file (team name, player name, franchise_eligible flag, save_history flag), so that save/pullback eligibility and franchise eligibility are correctly initialised.
3. As a draft manager, I want to edit each team's imported roster in-app before the draft starts, so that I can correct mistakes without re-importing the whole file.
4. As a draft manager, I want to declare my franchise player from my franchise-eligible pool before the draft begins, so that round 16 is correctly reserved for them.
5. As a draft manager, I want to set the draft order based on last year's standings, so that the simulation reflects the real pick sequence.
6. As a draft manager, I want to manually reorder the draft order before the draft starts, so that I can adjust for any changes.
7. As a draft manager, I want the app to simulate franchise player declarations for all 11 other teams automatically before the draft begins, so that I don't have to enter their pre-draft decisions.
8. As a draft manager, I want to choose between practice mode (I play one team) and watch mode (all 12 simulated), so that I can either practise or observe.
9. As a draft manager, I want to select which team I control in practice mode, so that I can simulate from any seat.

### The Draft — Core Flow

10. As a draft manager, I want to see a draft board showing all 12 teams × 16 rounds, so that I always know the full state of the draft.
11. As a draft manager, I want to see the available player pool sorted by ADP rank, so that I know which players are most valuable and still available.
12. As a draft manager, I want my previous-year players highlighted in the available pool, so that I can easily spot save and pullback opportunities.
13. As a draft manager, I want to see the current pick (round and team) clearly indicated on the board, so that I always know whose turn it is.
14. As a draft manager, I want round 16 of each team to display their franchise player from the start, so that it's clear those slots are reserved.
15. As a draft manager in practice mode, I want to select a player from the available pool on my turn, so that I can make my pick.
16. As a draft manager in watch mode, I want the draft to advance automatically through all picks without any input from me, so that I can observe how a full draft unfolds.
17. As a draft manager, I want simulated teams to pick players based on ADP rank with some randomness, so that the simulation feels realistic but not deterministic.

### Saves

18. As a draft manager in practice mode, I want to be prompted when an opponent picks one of my saveable previous-year players, so that I don't miss a save opportunity.
19. As a draft manager in practice mode, I want to choose whether to invoke my save or decline it when prompted, so that I retain full control of my one-per-draft save.
20. As a draft manager, I want the saved player to fill my furthest-back open round (starting at round 15, then 14, 13, etc.), so that the correct slot is reserved.
21. As a draft manager, I want the app to enforce that I can only save once per draft, so that the rule is correctly applied.
22. As a draft manager, I want the app to enforce that a player I have previously saved in a past draft cannot be saved again by my team, so that the lifetime save rule is respected.
23. As a draft manager, I want the real-league save history recorded in the roster CSV's `previously_saved` column to be enforced, so that players saved in actual past drafts cannot be saved again by the same team.
24. As a draft manager, I want simulated teams to decide whether to save eligible players automatically, weighted by the player's ADP value, so that AI save behaviour feels realistic.

### Pullbacks

25. As a draft manager in practice mode, I want to be prompted when an opponent picks any of my previous-year players, so that I don't miss a pullback opportunity.
26. As a draft manager in practice mode, I want to choose which of my remaining previous-year players to pull back, or to decline the pullback entirely, so that I have full control of the decision.
27. As a draft manager, I want the pulled-back player to fill my furthest-back open round, so that the correct slot is reserved.
28. As a draft manager, I want the original pick to stand when I pull back — the picking team keeps their player — so that the pullback rule is correctly applied.
29. As a draft manager, I want to be able to pull back multiple times in the same draft (once per eligible ex-player picked), so that the unlimited pullback rule is respected.
30. As a draft manager, I want simulated teams to decide whether to pull back automatically, weighted by the pulled-back player's ADP value, so that AI pullback behaviour feels realistic.

### Last Available Round

31. As a draft manager, I want the app to automatically track my last available round (counting back from round 15), so that saves and pullbacks always land in the correct slot.
32. As a draft manager, I want the draft board to clearly show which of my round slots are reserved by saves, pullbacks, and my franchise player, so that I can see how many normal picks I have left.

### End of Draft

33. As a draft manager, I want to see all 12 teams' completed rosters on a summary screen at the end of the draft, so that I can review the outcome.
34. As a draft manager, I want to export all 12 rosters to a CSV file, so that I can share or record the results.

## Implementation Decisions

### Architecture: pure draft engine + thin UI

The entire rule system lives in a **draft engine** — a pure state machine with the signature `(DraftState, Action) → DraftState`. The React UI layer dispatches actions and renders state; it contains no business logic. This is the single seam across the application.

### Draft state shape (key fields)

- `mode: 'practice' | 'watch'`
- `userTeamIndex: number | null`
- `teams: Team[]` — each holding: roster slots (indexed 1–16), previousYearRoster, saveHistory, franchisePlayer, lastAvailableRound (starts at 15, decrements on each save/pullback)
- `availablePool: Player[]` — sorted by ADP, filtered as players are picked
- `currentPick: { round: number, teamIndex: number }`
- `pickHistory: PickRecord[]`
- `pendingPrompt: SavePrompt | PullbackPrompt | null` — non-null when the UI needs user input before the draft can advance

### Actions

- `PICK_PLAYER { player }` — normal pick; advances current pick
- `INVOKE_SAVE { player }` — user blocks a pick and claims the player
- `DECLINE_SAVE` — user passes on save opportunity
- `INVOKE_PULLBACK { pullbackPlayer }` — user claims a different ex-player
- `DECLINE_PULLBACK` — user passes on pullback opportunity
- `ADVANCE_SIMULATION` — triggers next AI pick (used in watch mode and between user turns in practice mode)

### Franchise player placement

Round 16 of each team is pre-filled at draft start with their franchise player. The franchise player is never in the available pool. `lastAvailableRound` initialises to 15 for all teams.

### Save/pullback slot filling

When a save or pullback fires, the player is placed in `team.roster[lastAvailableRound]`, then `lastAvailableRound` is decremented by 1. The engine enforces that `lastAvailableRound` never goes below `currentRound` (i.e., you cannot fill a round that has already passed).

### Reaction check on every pick

After each `PICK_PLAYER` action, the engine checks whether the picked player is on any team's previous-year roster. If so, and the team has a valid save or pullback available, the engine produces the appropriate `pendingPrompt`. In practice mode the prompt is presented to the user if it's their team; otherwise the AI decides. In watch mode the AI always decides.

### AI simulation

AI picks the highest-ADP available player with Gaussian noise applied to ranking. AI save/pullback probability is a function of the player's ADP rank (higher rank = higher probability of acting). The exact weight curve is an implementation detail left to the developer.

### Data import

Player pool CSV columns: `name`, `position`, `nfl_team`, `adp`.
Team roster CSV columns: `team_name`, `player_name`, `franchise_eligible`, `previously_saved`.
Parsing handled client-side (Papa Parse). No server required.

### Persistence

Save history is sourced exclusively from the roster CSV's `previously_saved` column and is never written to `localStorage` by the app. When a real-league save happens, the user updates the CSV manually and re-imports it next session. Mock-draft saves are session-only: they enforce the one-save-per-draft limit (`saveUsedThisDraft`) within the running session but are forgotten when the session ends. All other state is in-memory and lost on page reload (draft resume is out of scope for v1).

### Tech stack

React + Vite, runs locally in the browser via `npm run dev`. No backend. No authentication.

## Testing Decisions

**What makes a good test:** Test only the draft engine's external behaviour — given a `DraftState` and an `Action`, assert the resulting `DraftState`. Never test internal helper functions or React component internals. The engine is pure, so tests need no mocks or async handling.

**What to test:**
- Non-snake pick sequencing (correct team and round advance after each pick)
- Franchise player pre-placement (round 16 filled, never in available pool)
- `lastAvailableRound` decrement on save and pullback
- Save blocks the pick (player leaves available pool, lands in correct slot, opponent does not receive player)
- Save eligibility enforcement (once-per-draft, lifetime save history)
- Pullback leaves original pick standing, claims different ex-player into correct slot
- Multiple pullbacks in one draft decrement `lastAvailableRound` correctly
- `pendingPrompt` is set correctly after a pick that triggers a reaction
- Draft completes when all 192 picks are filled (including franchise, saves, pullbacks)

**Prior art:** None — greenfield. Establish the pattern in the first ticket.

## Out of Scope

- Draft resume / save-and-continue across sessions
- Undo
- ESPN API integration (rosters and standings are entered manually or via CSV)
- Franchise eligibility auto-detection (flagged manually in roster CSV)
- Multi-user real-time drafting
- Mobile layout optimisation
- Any ADP source other than a manually imported FantasyPros CSV

## Further Notes

- "EPL" is the league name, not a reference to soccer. All players are NFL players.
- ADP data should be sourced from a FantasyPros free CSV export before each draft season.
- The app is primarily for solo practice; sharing with league-mates is a future concern.
- Draft order wraps in the same direction every round — there is no snake reversal.
- Round 16 is always the franchise player. Saves/pullbacks count back from round 15. If a team uses enough saves/pullbacks to exhaust all slots above the current round, no further saves/pullbacks can land (engine enforces this silently by declining AI reactions; user should be informed).
