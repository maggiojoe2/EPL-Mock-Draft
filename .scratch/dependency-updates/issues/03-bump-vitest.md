# 03 — Bump vitest to v4

**What to build:** Update `vitest` from `^3.2.4` to the latest v4 release. This is a major bump — read the migration guide, adjust `vite.config.ts`'s `test` block or any test helpers for breaking API changes, and confirm the full suite still passes.

**Status:** ready-for-agent

- [x] `vitest` is on the latest v4.x in `package.json`/`package-lock.json`.
- [x] `npm test` and `npm run test:watch` both work with no config errors.
- [x] Any breaking changes from the v4 migration guide are applied (matcher/API changes, config shape, etc.).
- [x] All 118 existing tests still pass.

## Comments

Landed together with 01 (vite → 8.2.1) and 04 (`@vitejs/plugin-react` → 6.0.5) — see `01-bump-vite.md`'s Comments for why (`vitest@3.2.4`'s peer range tops out at vite `^7.0.0-0`, so it couldn't sit alongside vite 8 on its own).

v4's breaking changes (`maxThreads`/`maxForks` → `maxWorkers`, narrower default test-file exclusions, `transformMode` → `viteEnvironment` for custom environments) don't touch this project's config — `vite.config.ts`'s `test` block is just `{ environment: "node" }`, and all test files live under `src/**/__tests__/`, not in a directory that v4's narrower exclusion list would newly pick up or drop. No config changes were needed. `npm test` (118/118) and `npm run test:watch` (boots and runs clean) both verified.
