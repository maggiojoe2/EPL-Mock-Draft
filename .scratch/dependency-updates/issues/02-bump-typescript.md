# 02 — Bump typescript to v7

**What to build:** Update `typescript` from `~5.8.3` to the latest v7 release. This is a major bump — read the release notes for breaking changes, fix any new type errors it surfaces, and confirm the build/typecheck stay clean.

**Status:** ready-for-human

- [ ] `typescript` is on the latest v7.x in `package.json`/`package-lock.json`.
- [ ] `npm run typecheck` and `npm run build` succeed with no new errors or suppressions.
- [ ] `npm run lint` still passes (typescript-eslint's type-checked rules depend on the TS version).
- [ ] `npm test` still passes.

## Comments

Attempted the bump to `typescript@7.0.2` (latest stable). `npm install` only succeeds with an `ERESOLVE` override, and `npm run lint` then hard-fails at startup:

```
typescript-eslint does not support TS 7.0.
Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0 to run typescript-eslint using the TS 6 API.
See also https://github.com/typescript-eslint/typescript-eslint/issues/10940 for tracking typescript-eslint's support for TS >=7.1
```

Unlike the vite/vitest/`@vitejs/plugin-react` peer conflict (ticket 01), this one isn't fixable by bumping a sibling package in the same pass — `typescript-eslint@8.67.0` is the latest published version (checked `canary`/`rc-v8`/`latest` dist-tags too) and none of them support TS 7 yet; the fix has to land upstream in typescript-eslint. `npm run typecheck` alone was clean under TS 7 (bare `tsc -b` doesn't hit the same wall), but landing the bump would leave `npm run lint` broken, so reverted (`git checkout -- package.json package-lock.json && npm install`) and left `typescript` on `~5.8.3`.

Re-triaged to `ready-for-human`: this needs someone to decide whether to (a) wait on [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) and re-run this ticket once it's resolved, or (b) accept a workaround (e.g. running typescript-eslint against the bundled TS 6 API as their error message suggests) in the meantime. Not closing as `wontfix` since the blocker is external and likely temporary.

**Interim step landed instead:** bumped `typescript` from `~5.8.3` to `^6.0.3` — the latest version still inside typescript-eslint's supported peer range (`>=4.8.4 <6.1.0`). Clean `npm install` (no `ERESOLVE`), and `typecheck`, `lint`, `build`, and `test` (118/118) all pass with no code changes needed. This gets most of the way (5.8→6.0) without the v7 blocker; the remaining 6.0→7.0 jump stays blocked on typescript-eslint as described above.
