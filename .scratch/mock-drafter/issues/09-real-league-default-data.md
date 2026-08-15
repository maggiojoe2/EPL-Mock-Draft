Status: closed

# Issue 09 — Real 2026 league data for defaults

## Goal

Replace the placeholder CSVs added in issue-08 with the actual 2026 EPL league data: a real player pool with ADP projections and the real team rosters.

## What the human needs to do

1. Export your player pool spreadsheet as CSV (or paste its contents into chat).
2. Export your rosters spreadsheet as CSV (or paste its contents into chat).
3. Attach both files (or paste both) in a new chat message and say "ready to convert".

The agent will then convert them to the required schema and commit the updated files to `/public/defaults/`.

## Target schemas

**Player pool** — `/public/defaults/players.csv`:
```
name,position,nfl_team,adp
```

**Rosters** — `/public/defaults/rosters.csv`:
```
team_name,player_name,franchise_eligible,previously_saved
```
- `franchise_eligible`: `true`/`false`
- `previously_saved`: `true`/`false`

## Acceptance criteria

1. `/public/defaults/players.csv` contains the real 2026 player pool with accurate ADP values, ≥100 players.
2. `/public/defaults/rosters.csv` contains all 12 real EPL team rosters.
3. The app loads and runs a full draft simulation without errors using the new default data.
4. All existing tests continue to pass.

## Blocking edges

Blocked by: 08 (placeholder files must exist before real data replaces them)
