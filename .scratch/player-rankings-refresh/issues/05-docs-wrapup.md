# 05 — Docs wrap-up: glossary accuracy + close out issue 11

**What to build:** `CONTEXT.md`'s domain glossary accurately describes the final `rank`/ECR mechanism (what it is, half-PPR, manually-downloaded-export-plus-script sourcing, unchanged name-based roster matching) now that the whole feature is built, and the original backlog issue that prompted this work is closed with a pointer to what actually shipped.

**Blocked by:** 06 — Rebuild `update-players` for the manual FantasyPros half-PPR export

**Status:** ready-for-agent

- [ ] `CONTEXT.md`'s `rank`/ECR glossary entry describes what the field is, the half-PPR scoring format, and that it's sourced from a manually-downloaded FantasyPros export refreshed on demand via a maintainer-run script (no live fetch, no fallback banner)
- [ ] `CONTEXT.md`'s "Simulated team" entry (or equivalent) references `rank` instead of ADP
- [ ] `CONTEXT.md` does not claim `player_id`-based matching exists — roster↔pool matching is name-based only, unchanged from before this effort
- [ ] `.scratch/backlog/issues/11-adp-refresh-from-source.md` is updated with `Status: resolved` (or the tracker's equivalent closed state), with a pointer to `.scratch/player-rankings-refresh/spec.md`
