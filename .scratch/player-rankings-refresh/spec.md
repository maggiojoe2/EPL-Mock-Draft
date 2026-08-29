Status: ready-for-agent

# Refresh default player rankings from a source website — Spec (revision 2: manual half-PPR export)

## Revision note

This spec supersedes the original version of itself (preserved in git history). Tickets 01 and 02 were already implemented against the original plan (live URL fetch of a full-PPR mirror); this revision keeps 01's outcome (the `adp`→`rank` rename) but **reverses course on the data source and matching mechanism** tickets 02–04 were built or planned around. See "What changed and why" below.

## Problem Statement

`public/defaults/players.csv` ships a hand-maintained snapshot of player rankings that drives the app's default player pool and simulated-team pick behavior. There's no repeatable way to refresh it — someone has to hand-edit the CSV, so it goes stale as the offseason/season progresses. Separately, the field was mislabeled: what the app called ADP (Average Draft Position) didn't match what the data actually was (Expert Consensus Ranking). The originally implemented refresh mechanism (tickets 01–02) turned out to source full-PPR ECR data from a live-fetchable GitHub mirror — not the half-PPR scoring this league actually uses, and no equivalent live/fetchable half-PPR source exists (FantasyPros' half-PPR rankings pages render client-side with no CORS-open raw CSV/JSON endpoint, confirmed by this project's own source research).

## Solution

Keep the `rank` field (Expert Consensus Ranking, half-PPR) and its rename from `adp`, but source refreshes from a CSV a maintainer downloads by hand from FantasyPros' half-PPR rankings page, fed into an on-demand dev script (`npm run update-players <path-to-csv>`) that normalizes and validates it before regenerating the bundled `public/defaults/players.csv`. There is no live in-app fetch — the app continues to load only the bundled CSV (or a user-uploaded one), unchanged from before this whole effort started. Roster↔pool matching stays exactly as it is today (case-insensitive name match) — the manually-downloaded source has no stable id to match on, so the id-based-matching plan is dropped.

## What changed and why (from the original spec)

- **Data source**: was `dynastyprocess/data`'s `db_fpecr_latest.csv` fetched live over HTTP (full-PPR, not the scoring format this league needs). Now: FantasyPros' half-PPR rankings/draft page, exported to CSV by hand in the browser (`RK, TIERS, "PLAYER NAME", TEAM, "POS", "BYE WEEK", "UPSIDE ", "BUST ", "SOS SEASON", "ECR VS. ADP"` — one row per player already, `POS` glues position and position-rank together, e.g. `RB1`). No fetchable endpoint exists for this data; this is a hard constraint, not a preference.
- **Live in-app fetch (original ticket 03)**: dropped entirely. Not viable without a fetchable source. The setup screen keeps its pre-existing two-state banner (bundled default / user-uploaded) — no live/fallback distinction is added.
- **`player_id` / source-id-based matching (original ticket 04)**: dropped entirely. The manually-downloaded CSV has no id column, so there's no stable id to backfill into `rosters.csv` or to prefer over name matching. `buildTeamsFromImport`'s existing case-insensitive name match is unchanged, and no `player_id` column is added to `players.csv` or `rosters.csv`.
- **`update-players` script and normalize module (original ticket 02, already implemented)**: rebuilt. The normalize module now parses the FantasyPros manual-export column shape instead of the dynastyprocess mirror's shape, and the script takes the CSV's filesystem path as a required CLI argument instead of fetching a URL. The `SOURCE_CSV_URL` constant and the URL-fetch code path in both the module and the script are removed.
- **Backlog issue 11** ("Easy way to refresh default ADPs from a source website") closes as resolved against this revision. The manual-download step is accepted as the final answer for this project's scale (one maintainer, occasional refresh), not a stopgap — no follow-up automation issue is being tracked.
- **Ticket disposition**: tickets 03 and 04 are marked `wontfix` with a pointer to this revision. Ticket 02 is superseded by new tickets covering the rebuilt script/module (rather than being reopened in place), since it already shipped once against a now-abandoned mechanism.

## User Stories

1. As a draft manager, I want the app's default player rankings to reflect half-PPR scoring, so that AI pick behavior and the displayed pool match how this league actually scores.
2. As a draft manager, I want the app to keep working exactly as it does today (bundled default data, or my own uploaded CSV), so that this change doesn't add any new runtime behavior or failure mode to the setup screen.
3. As a maintainer, I want to download the current half-PPR rankings from FantasyPros by hand and hand that file to a script, so that refreshing the bundled defaults doesn't require finding or maintaining a live-fetchable data source that doesn't exist for this scoring format.
4. As a maintainer, I want the refresh script to tell me exactly which FantasyPros page and scoring-format selection to use before exporting, so that I don't accidentally regenerate the bundled defaults from full-PPR or standard scoring data.
5. As a maintainer, I want the refresh script to require the downloaded CSV's path as an explicit argument, so that there's no hidden filename/location convention to remember or get wrong across machines or years.
6. As a maintainer, I want the refresh script to refuse to overwrite the bundled CSV if the given file looks malformed (too few rows, missing required columns, unrecognized position codes), so that a FantasyPros page/format change, or an accidental wrong-file argument, can't silently ship broken defaults.
7. As a maintainer, I want the refresh script to warn (not fail) when a rostered player's name no longer appears in the refreshed data, so that I can investigate without a plausible roster change (retirement, cut) blocking every refresh.
8. As a maintainer, I want the normalize/validate logic implemented once as a pure function shared by the script, so that the mapping from FantasyPros' export columns to the app's schema lives in one place.
9. As a maintainer, I want `test-data/players.csv` and `test-data/rosters.csv` left untouched by the refresh script, so that test fixtures stay stable regardless of source refreshes.
10. As a developer reading the domain docs, I want `CONTEXT.md`'s glossary to describe `rank`/ECR accurately (half-PPR, sourced from a manually-downloaded FantasyPros export, refreshed on demand), so that the docs don't describe a live-fetch mechanism that doesn't exist.
11. As a maintainer, I want roster↔pool matching to keep working exactly as it does today (case-insensitive name match), so that dropping the id-based-matching plan doesn't regress anything that currently works.

## Implementation Decisions

- **Data source**: FantasyPros' half-PPR rankings/draft export page (manual download only — no fetchable URL). The script and its doc-comment record the exact page and the scoring-format UI selection a maintainer must make before exporting, since the export filename itself doesn't encode scoring format.
- **Normalize/validate module**: one pure module (parallel to `csvParser.ts`'s existing parse functions) takes raw FantasyPros export CSV text and produces `Player[]` (`id`, `name`, `position`, `nflTeam`, `rank`) plus sanity-check results. `Player.id` continues to use the existing synthesized `playerIdFromNamePos(name, position)` — there is no source id to prefer over it.
  - Column mapping: `PLAYER NAME`→name, `TEAM`→nflTeam, `RK`→rank (numeric, ascending = better), `POS`→position after stripping the trailing position-rank digits (e.g. `RB1`→`RB`). `TIERS`, `BYE WEEK`, `UPSIDE`, `BUST`, `SOS SEASON`, `ECR VS. ADP` are ignored.
  - No page/view filtering is needed — unlike the dynastyprocess mirror, this export is already one row per player.
- **Dev script** (`npm run update-players -- <path-to-csv>`, rebuilding `scripts/update-players.ts`, keeping the existing `tsx` devDependency): reads the given file path, runs it through the normalize module, and — only if sanity checks pass — overwrites `public/defaults/players.csv`. Errors clearly and exits non-zero if the path argument is missing or the file doesn't exist. Manually/occasionally run by a developer; not scheduled or automated in CI.
- **No live in-app fetch**: the setup screen's data loading is unchanged from before this whole effort — it loads the bundled `public/defaults/players.csv`, or a user-uploaded CSV. No fetch-with-fallback banner logic is added.
- **Roster-mismatch check**: as part of the dev script's sanity pass, compare rostered player names in `public/defaults/rosters.csv` against the freshly normalized data and warn (not abort) on anything unmatched — a diagnostic aid for the maintainer, not a hard gate.
- **Fail-safe sanity checks** (before overwriting the committed CSV): abort with a non-zero exit and a clear error message, leaving the existing file untouched, if any of: the given path doesn't exist or can't be read, minimum row count (~300) isn't met, required columns (`PLAYER NAME`, `TEAM`, `RK`, `POS`) are missing or empty in every row, or position codes (after stripping position-rank digits) fall outside the known set (QB/RB/WR/TE/K/DST).
- **Player identity / matching logic** (`buildTeamsFromImport` in `src/setup/setupHelpers.ts`): unchanged — case-insensitive name match only. No `player_id` column is added to `CSV_COLUMNS.playerPool` or `CSV_COLUMNS.roster`.
- **Removals**: the `SOURCE_CSV_URL` constant, the dynastyprocess-mirror-shaped column parsing (`fp_page` filtering, `ecr`/`id` source columns), and any live-fetch code path in the normalize module and script are removed, since they described a mechanism this revision no longer uses.
- **`CONTEXT.md` glossary update**: the `rank` entry is confirmed/lightly adjusted to read "sourced from a FantasyPros CSV export, refreshed on demand via a maintainer-run script" (it already said "sourced from a FantasyPros CSV export" from ticket 01's provisional wording, which turns out to already match). No mention of live fetch, fallback, or id-based matching is added.
- **Tracker cleanup**: tickets 03 and 04 (live fetch, id-based matching) are set to `Status: wontfix` with a note pointing at this revision. Ticket 02 is left as a historical record of what was originally built; new tickets cover the rebuilt script/module. Backlog issue 11 is closed as resolved against this revision.

## Testing Decisions

- Good tests here assert on the pure, directly-testable normalize/validate logic and treat the script's file-read/file-write I/O as a thin, untested shell around it — consistent with how this repo already tests `csvParser.ts` and consistent with `docs/adr/0002-defer-component-tests-for-setup-screen.md`'s decision not to add component/rendering test infrastructure.
- **Normalize/validate module**: tested the way `src/setup/__tests__/csvParser.test.ts` tests `parsePlayerPoolCsv`/`parseRosterCsv`, and the way the existing (to-be-replaced) `src/setup/__tests__/sourcePlayers.test.ts` tests the current shape — feed it raw FantasyPros-export-shaped CSV text inline as a template literal, assert on the returned `Player[]` and on sanity-check results (row-count, missing/empty-column, unrecognized-position-code failures; roster-mismatch warnings). No mocking, no fixture files. `POS`-suffix-stripping (`RB1`→`RB`) gets explicit test cases.
- **Dev script**: not unit-tested directly (thin I/O wrapper around the tested normalize module); acceptable to verify manually when built, consistent with how the rest of this repo's fetch/file I/O shells aren't separately tested.
- **`buildTeamsFromImport`**: no new test cases needed — matching logic and its existing test coverage are unchanged.
- Prior art: `src/setup/__tests__/csvParser.test.ts`, `src/setup/__tests__/sourcePlayers.test.ts` (existing tests here get rewritten in place for the new column shape, not left describing the abandoned mechanism).

## Out of Scope

- Any live/automated fetch of half-PPR data — no such source exists; not being pursued further as part of this project.
- `player_id`/source-id-based roster matching — no source id exists in the manual export; dropped, not deferred.
- Any scoring format other than half-PPR.
- Scheduling/automating the refresh script (cron, CI) — it stays a manual, on-demand command requiring a manually-downloaded file.
- Changing `test-data/players.csv` / `test-data/rosters.csv` — these stay as-is, untouched by the refresh script.
- Any UI for triggering a manual "refresh now" from within the running app.
- A follow-up backlog issue to revisit automation later — explicitly not being tracked; if a fetchable half-PPR source ever appears, that's new work to scope from scratch.

## Further Notes

- Full source research for the original (abandoned) live-fetch approach is preserved at `.scratch/player-rankings-refresh/adp-source-research.md` for historical context — it documents why no CORS-permissive, no-auth, half-PPR-specific source exists, which is what motivated this revision.
- This spec supersedes the original version of `.scratch/player-rankings-refresh/spec.md`, and closes out backlog issue `.scratch/backlog/issues/11-adp-refresh-from-source.md`.
