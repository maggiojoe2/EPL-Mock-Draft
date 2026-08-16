# Architecture

The big-picture map of how this codebase fits together. For domain vocabulary
(what a "save", "pullback", or "franchise player" means) see `CONTEXT.md`; for
the reasoning behind specific structural decisions see `docs/adr/`.

## Module map

```
src/
  engine/     pure draft-simulation logic — no React, no DOM
  setup/      pre-draft screen: CSV import, team building, mode selection
  export/     end-of-draft CSV export
  types.ts    domain types shared across all three (Player, Team, DraftState, Action)
  constants.ts   league-shape constants (12 teams, 16 rounds)
  rosterSlotType.ts   derives each roster slot's pickType for display
  App.tsx     top-level router + the in-draft screen
  SummaryScreen.tsx   post-draft results screen
```

Dependency direction is one-way: `setup` and `App.tsx` depend on `engine`;
`engine` depends on nothing in `setup`, `export`, or the UI. `engine` is the
only module with non-trivial internal state-machine logic, which is why it's
kept free of React so it can be unit-tested directly (`engine/__tests__/`).

## How the three flows relate

```
setup/ (pre-draft)                 engine/ (the draft)          export/ (post-draft)
─────────────────────              ─────────────────────        ─────────────────────
CSV import (players + rosters),    initDraft() builds the        buildCsvRows() reads
or bundled public/defaults/*.csv   first DraftState, then         the final DraftState
  │                                draftEngine(state, action)    (teams + pickHistory)
  ▼                                dispatches picks, saves,      and writes one row
mode + franchise + draft order  ─▶ pullbacks, AI simulation   ─▶ per filled roster slot
```

1. **`setup/`** turns two CSVs (or the bundled `public/defaults/*.csv`) into a
   `Player[]` pool and `Team[]` rosters, then lets the user pick practice vs.
   watch mode, franchise players, and draft order. `useSetupState.ts` is the
   seam — it owns all of this as one hook; `SetupScreen.tsx` and its five step
   components (`ImportStep`, `ModeStep`, `FranchiseStep`, `DraftOrderStep`,
   `RosterStep`) are presentational only.
2. **`engine/initDraft`** takes the setup output and produces the first
   `DraftState`: it pre-fills franchise players into round 16 and removes them
   from the pool.
3. **`engine/draftEngine`** is a pure reducer (`(state, action) => state`)
   dispatched from `App.tsx`. It's a thin switch that delegates to one
   sub-reducer per action family — see below.
4. **`export/exportRosters`** reads the finished `DraftState` (specifically
   `teams` and `pickHistory`) and produces one CSV row per filled roster slot,
   tagged with its `slot_type` via `rosterSlotType.ts`.

## The draft engine

`draftEngine.ts` dispatches six action types, each handled by one of four
sub-modules:

| Action | Handler | File |
|---|---|---|
| `PICK_PLAYER` | `pickPlayer` | `pickReducer.ts` |
| `INVOKE_SAVE` / `DECLINE_SAVE` | `invokeSave` / `declineSave` | `saveReducer.ts` |
| `INVOKE_PULLBACK` / `DECLINE_PULLBACK` | `invokePullback` / `declinePullback` | `pullbackReducer.ts` |
| `ADVANCE_SIMULATION` | `advanceSimulation` | `simulationOrchestrator.ts` |

- **`pickReducer.ts`** owns the shared roster/pool primitives
  (`placeInRoster`, `removeFromPool`, `advanceCursor`, `retractNormalPick`)
  that the save and pullback reducers build on, plus `pickPlayer` itself,
  which also calls into `reactionQueue.ts` to check whether the pick opens a
  save/pullback opportunity for any other team.
- **`reactionQueue.ts`** builds and resolves the queue of pending
  save/pullback prompts a single pick can generate (more than one team may
  be able to react to the same pick; they're worked one at a time).
- **`saveReducer.ts`** / **`pullbackReducer.ts`** resolve a chosen reaction.
  A save *retracts* the original pick (the player moves to the reacting
  team); a pullback leaves the original pick standing and gives the
  reacting team a different player from their own previous-year roster.
- **`simulationOrchestrator.ts`** drives the AI teams forward when the human
  isn't picking (watch mode, or the non-user teams in practice mode),
  calling back into `draftEngine` for each simulated action so the same
  rules apply uniformly. `aiSimulator.ts` supplies the AI's decisions
  (ADP-with-noise picks, save/pullback value judgments).

`draftEngine` and its sub-reducers are all pure functions over `DraftState`;
`App.tsx`'s `DraftView` is the only place that wraps this in `useReducer` and
drives it from user interaction and a simulation-tick effect.

## Key decisions

- **ESLint + typescript-eslint + Prettier on defaults** — see
  [`docs/adr/0001`](adr/0001-eslint-typescript-eslint-prettier-defaults.md).
- **Component-level tests deferred for the setup screen** in favor of fully
  unit-testing `useSetupState` and leaving the five step components as thin,
  low-risk presentational wrappers — see
  [`docs/adr/0002`](adr/0002-defer-component-tests-for-setup-screen.md).
- **Engine kept framework-free**: every file under `engine/` is pure
  TypeScript with no React import, which is what makes `engine/__tests__/`
  able to test the full pick/save/pullback/simulation state machine without
  mounting any component.

## What to read next

- `CONTEXT.md` for domain vocabulary before reading any engine code.
- `src/types.ts` for the full shape of `DraftState`, `Team`, and the
  `Action` union — it's short and worth reading in full before the engine.
- `engine/__tests__/` for executable examples of save/pullback/franchise
  interactions, which are easier to follow as test cases than as prose.
