# 02 — CSV import + pre-draft setup

**What to build:** Add a pre-draft setup screen that replaces the hardcoded dummy data. The user imports the player pool from a CSV and each team's previous-year roster from a CSV (using Papa Parse). They can edit any team's roster in-app after import. They declare their own franchise player from their eligible pool. The app auto-simulates franchise player declarations for all other teams. The user sets or reorders the draft order. On confirming setup, franchise players are pre-placed in each team's round 16 slot and the draft starts with real data.

**Blocked by:** 01 — scaffold + draft engine skeleton.

**Status:** ready-for-agent

- [ ] Pre-draft setup screen is the app's entry point (shown before the draft board)
- [ ] Player pool CSV upload accepted; parsed columns: `name`, `position`, `nfl_team`, `adp`
- [ ] Team roster CSV upload accepted; parsed columns: `team_name`, `player_name`, `franchise_eligible`, `previously_saved`
- [ ] Teams and their rosters are displayed after import; each team's roster is editable in-app (add/remove players, toggle flags) without re-importing
- [ ] User selects their team from the imported team list
- [ ] User declares their franchise player by choosing from their franchise-eligible previous-year players
- [ ] App auto-selects franchise players for all other teams from their respective eligible pools (random selection among eligible players)
- [ ] Draft order is displayed as a ranked list; user can drag or reorder manually
- [ ] On draft start, each team's franchise player is pre-placed in their round 16 roster slot and removed from the available pool
- [ ] `lastAvailableRound` initialises to 15 for all teams
- [ ] Teams with no franchise-eligible players are handled gracefully (round 16 left empty)
- [ ] Setup screen validates that required data is present before allowing draft start
