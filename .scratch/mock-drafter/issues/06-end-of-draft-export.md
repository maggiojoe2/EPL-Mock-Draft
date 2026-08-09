# 06 — End of draft + export

**What to build:** Detect when the draft is complete and transition to a summary screen showing all 12 teams' final rosters. Provide a CSV export of all rosters. The draft is complete when all 192 pick slots across all 12 teams are filled (normal picks + franchise pre-placements + saves + pullbacks together account for all 16 slots per team).

**Blocked by:** 04 — save mechanics, 05 — pullback mechanics.

**Status:** ready-for-agent

- [ ] Engine marks the draft complete when every team's 16 roster slots are filled
- [ ] App transitions automatically from the draft board to a summary screen on completion
- [ ] Summary screen shows all 12 teams' rosters, one team per column or card, with player name and position for each slot
- [ ] Franchise player slot (round 16) is labelled as "Franchise" in the summary
- [ ] Save and pullback slots are labelled appropriately in the summary (e.g. "Saved", "Pullback")
- [ ] "Export CSV" button downloads a CSV with one row per pick: `team_name`, `round`, `player_name`, `position`, `nfl_team`, `slot_type` (normal / franchise / save / pullback)
- [ ] User can navigate back to the draft board from the summary screen to review the pick-by-pick board
