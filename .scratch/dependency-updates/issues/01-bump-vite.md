# 01 — Bump vite to v8

**What to build:** Update `vite` from `^6.3.5` to the latest v8 release. This is a major bump — read the v7 and v8 migration guides, apply any required config changes to `vite.config.ts`, and confirm dev server, build, and preview all still work.

**Status:** ready-for-agent

- [ ] `vite` is on the latest v8.x in `package.json`/`package-lock.json`.
- [ ] `npm run build` and `npm run dev` (smoke-checked) both succeed.
- [ ] `vite.config.ts` updated for any breaking config changes called out in the migration guide.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` all still pass.
