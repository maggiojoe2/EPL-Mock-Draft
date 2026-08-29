# Issue 11 — Easy way to refresh default ADPs from a source website

Status: resolved

**Resolved by:** `.scratch/player-rankings-refresh/spec.md` — shipped as a maintainer-run script (`npm run update-players`) against a manually-downloaded FantasyPros half-PPR export, not a fully-automated fetch. The manual-download step is accepted as final for this project's scale; no follow-up automation issue is being tracked.

## Problem

`public/defaults/players.csv` holds the default player pool with ADP values
(`name,position,nfl_team,adp`) that ships as the out-of-the-box draft board
(see `src/setup/csvParser.ts`, `src/setup/RosterStep.tsx`). Right now these
values get stale and there's no repeatable way to refresh them — someone has
to hand-edit the CSV. Fantasy ADP shifts throughout the offseason/season, so
this file needs to be easy to regenerate from a real source instead of
manually maintained.

## Solution direction

- Pick an ADP source that's easy to pull from programmatically (stable
  HTML table, CSV/JSON export, or public API) rather than one that requires
  heavy scraping/auth. Needs research/decision before implementation.
- Write a small script (e.g. `scripts/update-adp.ts` or similar) that fetches
  current ADP data from that source and regenerates
  `public/defaults/players.csv` in the existing `name,position,nfl_team,adp`
  format, preserving whatever normalization `csvParser.ts` expects
  (position codes, NFL team abbreviations).
- Should be runnable on demand (e.g. `npm run update-adp`) rather than fully
  automated/scheduled, unless a later ticket wants to cron it.
- Consider keeping `test-data/players.csv` separate/untouched — it's fixture
  data, not the shipped default.

## Comments
