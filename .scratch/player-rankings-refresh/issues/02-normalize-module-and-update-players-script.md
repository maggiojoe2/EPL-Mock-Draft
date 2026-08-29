# 02 — Shared normalize/validate module + `update-players` dev script

**What to build:** A maintainer can run `npm run update-players` to pull current player-ranking data from the live source and regenerate the bundled `public/defaults/players.csv`, with the fetch-and-normalize logic implemented once in a shared module (not duplicated later by the live in-app fetch in ticket 03). The script refuses to overwrite the bundled file if the fetched data looks malformed, so a source-format change can't silently ship broken defaults.

**Blocked by:** 01 — Rename `adp` to `rank` throughout the app

**Status:** ready-for-agent

- [ ] A pure, directly-testable normalize/validate module takes raw source CSV text (from `https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv`) and produces `Player[]` (`id`, `name`, `position`, `nflTeam`, `rank`) plus sanity-check results
- [ ] Sanity checks cover: minimum row count (~300), required columns present/non-empty, position codes within the known set (QB/RB/WR/TE/K/DST)
- [ ] `tsx` is added as a devDependency; a new `scripts/update-players.ts` is added and wired to `npm run update-players`
- [ ] Running the script fetches the source, normalizes it via the shared module, and — only if sanity checks pass — overwrites `public/defaults/players.csv`
- [ ] If the fetch fails or sanity checks fail, the script exits non-zero with a clear error message and leaves `public/defaults/players.csv` untouched
- [ ] The script does not touch `test-data/players.csv`
- [ ] The shared module is unit-tested the way `csvParser.test.ts` tests `parsePlayerPoolCsv`/`parseRosterCsv` — raw CSV text in, asserted `Player[]`/sanity-check results out, no mocking
