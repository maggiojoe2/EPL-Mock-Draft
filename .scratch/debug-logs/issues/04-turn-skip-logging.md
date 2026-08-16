# 04 — Turn-skip logging

**What to build:** Log an entry whenever `ADVANCE_SIMULATION` skips a team's turn because it has no open normal slot at the current round, so gaps/ordering oddities in a draft are explained in the log rather than silently invisible.

**Blocked by:** 01

**Status:** done (see follow-up ticket 06 for a gap found in review)

- [x] Every turn-skip (team has no open normal slot at the landing round) produces a `debugLog` entry recording which team was skipped, the round, and the reason (no open slot)
- [x] Skip entries appear in the log in the correct chronological position relative to pick/reaction entries
- [x] Entries appear in the existing live panel with no panel changes required
- [x] Engine tests extend the existing slot-skipping coverage in `advanceSimulation.test.ts` to assert a corresponding `debugLog` entry appears for each skip
- [x] No change to the actual skip logic itself — this is logging only, draft behavior is unchanged
