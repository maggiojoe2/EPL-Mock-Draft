# Dependency updates

`npm outdated` found 5 packages behind as of 2026-08-15. `papaparse` (5.5→5.6) was a safe minor and was bumped directly as part of the `chore/lint-deps-ci` repo-hygiene work. The remaining 4 are major bumps that need their own test/verify cycle each — tracked as independent tickets below rather than done in one pass.

## Issues

- `01-bump-vite.md` — vite 6→8
- `02-bump-typescript.md` — typescript 5→7
- `03-bump-vitest.md` — vitest 3→4
- `04-bump-vitejs-plugin-react.md` — @vitejs/plugin-react 4→6

No blocking edges between them — any can be picked up independently.
