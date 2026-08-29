# 05 — Docs wrap-up: glossary accuracy + close out issue 11

**What to build:** `CONTEXT.md`'s domain glossary accurately describes the final `rank`/ECR mechanism (what it is, half-PPR, live-fetch-with-bundled-fallback sourcing, ID-based roster matching) now that the whole feature is built, and the original backlog issue that prompted this work is closed with a pointer to what actually shipped.

**Blocked by:** 03 — Live in-app fetch with fallback + freshness banner, 04 — Player-ID-based roster matching, end to end

**Status:** ready-for-agent

- [ ] `CONTEXT.md`'s `rank`/ECR glossary entry (formerly the ADP entry) describes what the field is, the half-PPR scoring format, and that it's sourced via a live fetch with a bundled fallback (not "sourced from a manually imported FantasyPros CSV export")
- [ ] `CONTEXT.md`'s "Simulated team" entry (or equivalent) is updated to reference `rank` instead of ADP
- [ ] `CONTEXT.md` notes that roster↔pool matching uses `player_id` when available, falling back to name matching
- [ ] `.scratch/backlog/issues/11-adp-refresh-from-source.md` is updated with a `Status:` reflecting it's resolved/superseded, with a pointer to `.scratch/player-rankings-refresh/spec.md`
