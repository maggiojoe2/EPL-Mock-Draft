# Issue 01 — Decompose the setup screen into tested steps

Status: ready-for-agent

## Design (settled 2026-08-15, grilling session)

- `useSetupState()` hook owns: `playerPool`, `teams`, `mode`, `userTeamIndex`,
  `importError`, `defaultsStatus`; the default-data bootstrap effect (tested via
  `vi.stubGlobal("fetch", ...)`); all mutating actions as named functions
  (`removePlayerFromRoster`, `toggleFranchiseEligible`, `togglePreviouslySaved`,
  `addPlayerToRoster`, `moveTeam`, `setFranchisePlayer`, `handlePlayerPoolFile`,
  `handleRosterFile`, `setMode`, `setUserTeamIndex`) — no raw `setTeams`/`setPlayerPool`
  exposed; derived reads (`validationErrors`, `userTeam`, `userEligiblePlayers`,
  `hasImport`, `franchiseStepVisible`); `searchAvailablePlayers(teamIndex, query)`;
  `canStart` / `buildDraftState()`. The hook is side-effect-free — it does not call
  `onDraftStart` itself; `SetupScreen` does.
- `expandedTeam` / `playerSearch` stay local `useState` inside `RosterStep` — pure UI
  toggle state, not draft-setup state.
- New `CSV_COLUMNS` constant exported from `csvParser.ts` (single source of truth for
  the player-pool and roster column names), consumed by the hook's import-error
  messages and by `ImportStep`'s "Expected CSV column names" hint block.
- Five step components, flat in `src/setup/` (no subfolder, matching existing layout):
  `ImportStep`, `ModeStep`, `FranchiseStep`, `DraftOrderStep`, `RosterStep`. The
  start-draft footer stays inline in `SetupScreen.tsx`.
- Test surface for this issue is `useSetupState.test.ts` only — no component render
  tests (see ADR-0002). Coverage: bootstrap (success / non-ok fetch / empty-parse
  error / unmount-cancellation), CSV import (success + failure × 2 files), each
  roster-edit op, `moveTeam`'s 3-branch `userTeamIndex` bookkeeping, franchise
  declare, all 4 validation rules, `searchAvailablePlayers`, `canStart`/`buildDraftState`.
- Sequencing: commit 1 extracts + tests `useSetupState` behind the *unchanged*
  single-file render (proves behavior preservation before the mechanical split);
  commit 2 splits the JSX into the 5 step components.

## Comments
