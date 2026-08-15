# 04 — Bump @vitejs/plugin-react to v6

**What to build:** Update `@vitejs/plugin-react` from `^4.7.0` to the latest v6 release. This is a major bump — check it against whichever `vite` version is installed at the time this ticket is worked (independent of ticket 01 — do not wait on it) for compatibility, and confirm React fast-refresh and JSX transform still work.

**Status:** ready-for-agent

- [ ] `@vitejs/plugin-react` is on the latest v6.x in `package.json`/`package-lock.json`.
- [ ] Confirmed compatible with the installed `vite` major version.
- [ ] `npm run dev` fast-refresh and `npm run build` both work.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` all still pass.
