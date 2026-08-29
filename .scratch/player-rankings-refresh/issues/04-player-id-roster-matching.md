# 04 — Player-ID-based roster matching, end to end

**What to build:** Roster-to-pool matching survives minor name-formatting differences between refreshes. The player pool and `rosters.csv` both carry a stable `player_id` (the source's FantasyPros ID), matching prefers `player_id` when present and falls back to today's case-insensitive name match when it's absent (so user-uploaded CSVs without IDs keep working unchanged), and the existing shipped `rosters.csv` is backfilled once with real IDs so this is actually in effect for real data, not just testable via synthetic fixtures.

**Blocked by:** 02 — Shared normalize/validate module + `update-players` dev script

**Status:** wontfix

**Why:** The manually-downloaded FantasyPros export has no id column, so there's no stable source id to backfill into `rosters.csv` or prefer over name matching. Roster↔pool matching stays exactly as it is today (case-insensitive name match). See `.scratch/player-rankings-refresh/spec.md` ("What changed and why").

- [ ] `CSV_COLUMNS.roster` gains a `player_id` column alongside the existing `team_name, player_name, franchise_eligible, previously_saved`
- [ ] `Player.id` is populated from the source's `id` field when available (live/bundled data), retaining synthesized-ID fallback behavior for user-uploaded pools without an `id` column
- [ ] The roster↔pool matching logic (`buildTeamsFromImport` in `setupHelpers.ts`) looks up by `player_id` first when present on the roster row, falling back to the existing case-insensitive name match when absent
- [ ] Test coverage for the matching logic includes: id-present-and-matches, id-absent-falls-back-to-name-match (unchanged behavior), and id-present-but-unmatched
- [ ] A one-off migration script matches each existing `public/defaults/rosters.csv` row's `player_name` against current player-pool data and rewrites the file with `player_id` populated, reusing the same name-matching logic as the fallback path
- [ ] Rows the migration can't match are printed for manual review, not silently dropped or blocked
- [ ] The migration is a one-time script, not part of the recurring `update-players` flow — `player_id` values are expected to stay stable across future refreshes once backfilled
- [ ] `test-data/rosters.csv` is left untouched by the migration
- [ ] The refresh script's roster-mismatch check (from ticket 02) warns rather than aborts when a rostered player can't be matched, treating it as a diagnostic rather than a hard failure
