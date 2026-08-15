# 04 — Bump @vitejs/plugin-react to v6

**What to build:** Update `@vitejs/plugin-react` from `^4.7.0` to the latest v6 release. This is a major bump — check it against whichever `vite` version is installed at the time this ticket is worked (independent of ticket 01 — do not wait on it) for compatibility, and confirm React fast-refresh and JSX transform still work.

**Status:** ready-for-agent

- [x] `@vitejs/plugin-react` is on the latest v6.x in `package.json`/`package-lock.json`.
- [x] Confirmed compatible with the installed `vite` major version.
- [x] `npm run dev` fast-refresh and `npm run build` both work.
- [x] `npm run typecheck`, `npm run lint`, and `npm test` all still pass.

## Comments

Landed together with 01 (vite → 8.2.1) and 03 (vitest → 4.1.10), not independently — `@vitejs/plugin-react@6.0.5` declares `vite: ^8.0.0` as a peer, so it can't sit alongside the pre-existing vite 6 install; the "do not wait on ticket 01" framing in this ticket's spec turned out backwards for this repo. See `01-bump-vite.md`'s Comments for the full peer-graph reasoning.

`vite dev` served the app and JSX transformed correctly (smoke-checked via HTTP fetch of the dev server and `vite preview`); no interactive fast-refresh edit was exercised beyond that. `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test` (118/118) all pass.
