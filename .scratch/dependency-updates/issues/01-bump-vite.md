# 01 — Bump vite to v8

**What to build:** Update `vite` from `^6.3.5` to the latest v8 release. This is a major bump — read the v7 and v8 migration guides, apply any required config changes to `vite.config.ts`, and confirm dev server, build, and preview all still work.

**Status:** ready-for-agent

- [x] `vite` is on the latest v8.x in `package.json`/`package-lock.json`.
- [x] `npm run build` and `npm run dev` (smoke-checked) both succeed.
- [x] `vite.config.ts` updated for any breaking config changes called out in the migration guide.
- [x] `npm run typecheck`, `npm run lint`, and `npm test` all still pass.

## Comments

The spec's "no blocking edges" claim was wrong: `vitest@3.2.4` declares `vite: ^5.0.0 || ^6.0.0 || ^7.0.0-0` and `@vitejs/plugin-react@4.7.0` declares `vite: ^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0` — neither supports vite 8, and `@vitejs/plugin-react@6.x` in turn requires `vite: ^8.0.0`. Bumping vite alone hit an npm `ERESOLVE` peer conflict. Landed this ticket together with 03 (vitest → 4.1.10) and 04 (`@vitejs/plugin-react` → 6.0.5) in one pass so the peer graph resolves; see `spec.md` for the recorded edge. Ticket 02 (typescript) remains independent.

`vite.config.ts` needed no changes — the v7/v8 migration guide's breaking changes (Rolldown/Oxc option renames, `build.commonjsOptions`, plugin `moduleType`, etc.) don't touch anything this project's minimal config uses (`base`, `plugins: [react()]`, `test.environment`). Verified `npm run build`, `npm run dev`, and `npm run preview` all serve correctly, plus `npm run typecheck`, `npm run lint`, and `npm test` (118/118 passing).
