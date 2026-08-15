# Dependency updates

`npm outdated` found 5 packages behind as of 2026-08-15. `papaparse` (5.5→5.6) was a safe minor and was bumped directly as part of the `chore/lint-deps-ci` repo-hygiene work. The remaining 4 are major bumps that need their own test/verify cycle each — tracked as independent tickets below rather than done in one pass.

## Issues

- `01-bump-vite.md` — vite 6→8
- `02-bump-typescript.md` — typescript 5→7
- `03-bump-vitest.md` — vitest 3→4
- `04-bump-vitejs-plugin-react.md` — @vitejs/plugin-react 4→6

No blocking edges between them — any can be picked up independently.

**Correction (2026-08-15):** This turned out to be wrong for 01/03/04. `vitest@3.2.4` and `@vitejs/plugin-react@4.7.0` both cap their `vite` peer range below v8, while `@vitejs/plugin-react@6.x` requires `vite: ^8.0.0` — so vite, vitest, and `@vitejs/plugin-react` had to be bumped together in one pass to keep the peer graph resolvable (npm `ERESOLVE` otherwise). Issues 01, 03, and 04 are now closed out as a single combined change; see their Comments sections. Issue 02 (typescript) remains genuinely independent.

**Update (2026-08-15):** Issue 02 (typescript → v7) is blocked, not done — `typescript-eslint@8.67.0` (latest) hard-refuses to run against TS 7 at all (not a peer-range warning, a thrown error), and no newer typescript-eslint release exists yet ([tracking issue](https://github.com/typescript-eslint/typescript-eslint/issues/10940)). Bump was attempted and reverted; `typescript` stays on `~5.8.3` until typescript-eslint catches up. See the ticket's Comments for details.
