# 03 — Bump vitest to v4

**What to build:** Update `vitest` from `^3.2.4` to the latest v4 release. This is a major bump — read the migration guide, adjust `vite.config.ts`'s `test` block or any test helpers for breaking API changes, and confirm the full suite still passes.

**Status:** ready-for-agent

- [ ] `vitest` is on the latest v4.x in `package.json`/`package-lock.json`.
- [ ] `npm test` and `npm run test:watch` both work with no config errors.
- [ ] Any breaking changes from the v4 migration guide are applied (matcher/API changes, config shape, etc.).
- [ ] All 118 existing tests still pass.
