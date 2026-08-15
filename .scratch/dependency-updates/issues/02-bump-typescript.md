# 02 — Bump typescript to v7

**What to build:** Update `typescript` from `~5.8.3` to the latest v7 release. This is a major bump — read the release notes for breaking changes, fix any new type errors it surfaces, and confirm the build/typecheck stay clean.

**Status:** ready-for-agent

- [ ] `typescript` is on the latest v7.x in `package.json`/`package-lock.json`.
- [ ] `npm run typecheck` and `npm run build` succeed with no new errors or suppressions.
- [ ] `npm run lint` still passes (typescript-eslint's type-checked rules depend on the TS version).
- [ ] `npm test` still passes.
