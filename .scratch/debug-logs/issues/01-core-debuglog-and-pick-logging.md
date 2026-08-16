# 01 — Core debugLog + pick logging (human & AI) + live panel

**What to build:** Add a `debugLog` to the draft's state, log every `PICK_PLAYER` action (whether dispatched by the user or by a simulated team) to it in order, and let the user watch that log live via a toggleable panel on the draft screen. Human picks are logged as actor + action only. Simulated picks are logged with a chosen-vs-optimal comparison: what the simulated team actually picked, what the deterministic best-by-ADP pick would have been, whether they differ, and (when they do) the noise value that caused the divergence.

This is the tracer bullet for the whole debug-logs feature: after this ticket, running a draft and opening the panel shows every pick, in order, with the AI's reasoning visible.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `DraftState` has a `debugLog: LogEntry[]` field, initialized to `[]` when a new draft starts
- [ ] `debugLog` is append-only — existing entries are never rewritten or filtered by later actions
- [ ] Every `PICK_PLAYER` action (human-dispatched or simulated) produces exactly one `debugLog` entry, in dispatch order
- [ ] Each entry records at minimum: a sequence number, round, team index, action type, and actor (`"user"` vs `"ai"`)
- [ ] Human pick entries record actor + chosen player only — no optimal-comparison fields
- [ ] Simulated pick entries additionally record: the chosen player, the deterministic best-by-ADP player, whether they differ, and the Gaussian noise value applied when they do differ
- [ ] A toggleable panel on the draft screen renders `debugLog` as a plain chronological scrollable list; opening/closing it doesn't pause or otherwise affect the simulation clock
- [ ] `pickHistory` and its existing consumers (CSV export, summary screen) are unmodified
- [ ] New engine tests dispatch through the existing `draftEngine(state, action)` seam and assert on `state.debugLog` (entry count, order, actor, chosen-vs-optimal fields) — no test reaches into internal reducer helpers
- [ ] The existing `Math.random`-pinning pattern (see `aiSimulator.test.ts`) is reused to deterministically test both the "matched optimal" and "diverged from optimal" branches for a simulated pick
