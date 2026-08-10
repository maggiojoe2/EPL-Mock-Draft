Status: done

# Issue 08 — Default data infrastructure

## Goal

The app should load the 2026 league data automatically on startup, so new users land on a fully-populated setup screen without any uploads. Users can override at any time by uploading their own CSVs.

## Acceptance criteria

1. `/public/defaults/players.csv` and `/public/defaults/rosters.csv` exist with correct headers and placeholder data (copied from `test-data/` as a stand-in until issue-09 supplies the real files).
2. On `SetupScreen` mount, both files are fetched in parallel via `fetch()`.
3. On success, the parsed results populate `playerPool` and `teams` state via the existing parsers (`parsePlayerPoolCsv`, `parseRosterCsv`, `buildTeamsFromImport`) — no new parsing logic.
4. A banner is shown: *"Using default 2026 data — upload your own CSVs to override."*
5. When the user uploads their own player pool CSV, the banner disappears and custom data is used.
6. When the user uploads their own roster CSV, the banner disappears and custom data is used.
7. If either `fetch()` call fails (network error, file missing, parse yields 0 rows), the banner is NOT shown; instead a visible error message appears: *"Couldn't load default data. Please upload your own CSVs."* The upload inputs remain functional.
8. No changes to parser logic, draft engine, or `test-data/`.
9. All existing tests continue to pass.

## Technical notes

- Fetch both CSVs in parallel (`Promise.all`). If either fails, treat the whole load as failed (don't apply a half-loaded state).
- The load happens in a `useEffect` on mount in `SetupScreen`. Introduce a `defaultsStatus: 'loading' | 'loaded' | 'error' | 'overridden'` state field to drive the banner/error UI.
- The banner disappears (`'overridden'`) on the first custom upload of either file (player pool or roster), since rosters depend on the player pool anyway.
- Keep the placeholder CSVs structurally valid (correct headers, ≥1 data row each) so the parsers don't error out.

## Blocking edges

None — can be picked up immediately.
