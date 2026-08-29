# 06 — Rebuild `update-players` for the manual FantasyPros half-PPR export

**What to build:** A maintainer can hand-download the half-PPR rankings CSV from FantasyPros, run `npm run update-players -- <path-to-csv>`, and get `public/defaults/players.csv` regenerated from it — with sanity checks (row count, required columns, known position codes) and a roster-mismatch warning, refusing to overwrite the bundled file if the given data looks malformed. This supersedes ticket 02's implementation, which was built around fetching a full-PPR mirror over HTTP — a mechanism that's being removed, not extended.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `SOURCE_CSV_URL` and the dynastyprocess-mirror column parsing (`fp_page`/`ecr`/source `id` handling) are removed from the normalize module
- [x] The `fetch(SOURCE_CSV_URL)` call and its error handling are removed from `scripts/update-players.ts`
- [x] The normalize module is rewritten to parse the FantasyPros manual-export shape (`PLAYER NAME`, `TEAM`, `RK`, `POS` with position-rank digits stripped, e.g. `RB1`→`RB`; `TIERS`/`BYE WEEK`/`UPSIDE`/`BUST`/`SOS SEASON`/`ECR VS. ADP` ignored), still producing `Player[]` (id synthesized via existing `playerIdFromNamePos`, unchanged) plus sanity-check results
- [x] Sanity checks cover: minimum row count (~300), required columns (`PLAYER NAME`, `TEAM`, `RK`, `POS`) present/non-empty, position codes (after suffix-stripping) within QB/RB/WR/TE/K/DST
- [x] `scripts/update-players.ts` takes the CSV file path as a required CLI argument, erroring clearly and exiting non-zero if it's missing or the file can't be read
- [x] Running the script against a valid file normalizes it and — only if sanity checks pass — overwrites `public/defaults/players.csv`; on any sanity failure it exits non-zero with a clear message and leaves the file untouched
- [x] The roster-mismatch check (comparing `public/defaults/rosters.csv` names against the normalized data, warning not aborting) is preserved against the new shape
- [x] The script does not touch `test-data/players.csv` or `test-data/rosters.csv`
- [x] `src/setup/__tests__/sourcePlayers.test.ts` is rewritten for the new shape (raw FantasyPros-export-shaped CSV text in, `Player[]`/sanity-check results out, no mocking), including explicit cases for `POS` suffix-stripping — the existing dynastyprocess-shaped tests are removed, not left alongside
- [x] The script's doc-comment (and any doc-comment on the normalize module) records the exact FantasyPros page and scoring-format selection a maintainer must use before exporting, since the export filename doesn't encode scoring format

**Note:** supersedes ticket 02 — see `.scratch/player-rankings-refresh/spec.md` ("What changed and why") for the full rationale.
