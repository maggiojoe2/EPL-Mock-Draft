# 03 — Live in-app fetch with fallback + freshness banner

**What to build:** Loading the setup screen fetches current player-ranking data directly from the live source in the browser (reusing the shared normalize module from ticket 02), so draft managers see up-to-date rankings without any manual import. If the live fetch fails for any reason, the app silently falls back to the bundled `public/defaults/players.csv` exactly as it does today. The existing "using default data" banner is updated to tell the user which of live, fallback, or user-uploaded data is actually in play.

**Blocked by:** 02 — Shared normalize/validate module + `update-players` dev script

**Status:** wontfix

**Why:** The data source changed from a live-fetchable full-PPR mirror to a manually-downloaded half-PPR export (FantasyPros' half-PPR rankings pages render client-side with no CORS-open raw CSV/JSON endpoint — confirmed in `.scratch/player-rankings-refresh/adp-source-research.md`). No fetchable half-PPR source exists, so live in-app fetch isn't viable. The app keeps its pre-existing two-state banner (bundled default / user-uploaded). See `.scratch/player-rankings-refresh/spec.md` ("What changed and why").

- [ ] On setup-screen mount, the app fetches the live source CSV directly (no caching/TTL — fresh fetch every load) and normalizes it via the shared module from ticket 02
- [ ] On any failure (network error, non-ok response, malformed/unexpected shape), the app falls back to fetching the bundled `public/defaults/players.csv`, matching today's existing fallback behavior
- [ ] The setup screen's banner distinguishes three states: live data loaded, fallback-to-bundled used, and user-uploaded CSV in use (unchanged from today)
- [ ] User-uploaded CSV overrides continue to work exactly as they do today, unaffected by the live-fetch path
