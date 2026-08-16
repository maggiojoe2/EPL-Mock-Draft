# 03 — Save-target computation logging

**What to build:** Log every computation of a team's save target as its own `debugLog` entry, independent of whether a save/pullback decision actually results. `computeSaveTarget`/`computeSaveTargetWithMistake` are never cached — they're recomputed fresh at each call site (inside `selectPullbackCandidate`'s pullback-exclusion check, and when resolving an AI team's save prompt). Log each of those computations: which team, why it was computed (pullback-candidate exclusion vs. save-decision resolution), and the resulting target player. Viewing a team's entries in order lets you see its save target narrated at every point it was reconsidered, including whether it changed since the last computation for that team.

**Blocked by:** 01, 02 (touches the same `simulationOrchestrator.ts` call sites ticket 02 modifies — sequenced after it to avoid conflicting edits)

**Status:** ready-for-agent

- [ ] Every call to `computeSaveTarget` inside `selectPullbackCandidate` produces a `debugLog` entry recording the team, that it was computed for pullback-candidate exclusion, and the resulting target (or `null` if none)
- [ ] Every call to `computeSaveTargetWithMistake` when resolving an AI team's save prompt produces a `debugLog` entry recording the team, that it was computed for save-decision resolution, and the resulting target (or `null` if none)
- [ ] Entries are appended in the order the computations actually occur, interleaved correctly with the pick/reaction entries from tickets 01–02
- [ ] No change to `computeSaveTarget`/`computeSaveTargetWithMistake`'s existing behavior or return values — this ticket only observes and logs their calls, it doesn't alter save-target selection logic
- [ ] Entries appear in the existing live panel with no panel changes required
- [ ] Engine tests dispatch through `draftEngine(state, action)` (or the orchestrator's `ADVANCE_SIMULATION` entry point, matching existing `advanceSimulation.test.ts` conventions) and assert that a `debugLog` entry appears for each save-target computation, with the correct team, call-site purpose, and resulting target
- [ ] A test demonstrates two consecutive computations for the same team producing different logged targets is representable (even if today's rules make it rare in practice) — i.e. nothing in the logging mechanism assumes the target is stable
