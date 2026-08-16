Status: ready-for-agent

# Debug logs

## Problem Statement

As someone running a mock draft (developer or end user), I want to see every action taken during a simulation — in order, and *why* it happened — so that a confusing or surprising draft result (an odd AI pick, an unexpected save/pullback) can be explained instead of shrugged off, without having to re-run the draft under a debugger. This is especially true when randomness caused the simulated team to deviate from the statistically optimal choice — right now that divergence happens silently inside `aiSimulator.ts`'s noise/mistake mechanics and leaves no trace anywhere in the app.

## Solution

Every action processed by the draft engine — a human's manual pick/save/pullback/decline, a simulated team's pick/save/pullback/decline, and the simulation's turn-skip decisions — is recorded, in order, as a structured log entry on the draft's own state. For simulated decisions, the entry captures not just what was chosen but what the deterministic "optimal" choice would have been, and whether/why the two diverged (including any mistake-noise value that caused the divergence). A toggleable panel lets you watch this log live during a draft; a JSON download (available both live and at draft end) lets you save the full log for later inspection. The log is scoped to the current draft only — it lives alongside `DraftState` and resets when a new draft starts, matching the app's existing (lack of) persistence model.

## User Stories

1. As a user watching a simulated draft, I want every pick — human or AI — recorded in one ordered log, so that I can trace the entire draft's sequence of decisions after the fact.
2. As a user, I want each log entry to say who/what made the decision (the user, or which simulated team), so that I can tell human choices apart from simulated ones at a glance.
3. As a user reviewing a simulated team's pick, I want to see which player was actually chosen and which player the deterministic best-by-ADP evaluation would have chosen, so that I can tell whether the pick was "optimal" or not.
4. As a user reviewing a simulated pick that wasn't optimal, I want the log to show the noise value that caused the deviation, so that I understand *why* the simulated team didn't take the best-ranked player.
5. As a user reviewing a simulated save/pullback/franchise decision, I want the same chosen-vs-optimal comparison as for picks, so that "the AI made a mistake here" is visible for every kind of simulated decision, not just the initial pick.
6. As a user, I want entries for simulated decisions that *did* match the optimal choice to also appear in the log (not just the mistakes), so that the log is a complete narrative of the draft rather than a list of only the surprising moments.
7. As a user, I want a log entry recorded even when a decision-authority mistake fires but happens to select the same player anyway (a no-op mistake), so that a below-the-surface "a mistake roll occurred" is still visible rather than being indistinguishable from a clean optimal pick.
8. As a user, I want a log entry when the simulation skips a team's turn because it has no open roster slot, so that gaps or ordering oddities in the draft are explained rather than silently invisible.
9. As a user, I want a manual (human) pick, save, pullback, or decline logged with the actor and the action only — no fabricated "optimality" score — so that the log doesn't pretend to explain a choice that had no algorithmic reasoning behind it.
10. As a user, I want to open a toggleable panel during the draft that shows the log so far, in chronological order, so that I can check what's happened without leaving the draft screen.
11. As a user, I want to close that panel and keep drafting without it disrupting the draft board, so that checking the log doesn't interrupt play.
12. As a user, I want to download the log as a JSON file at any point during the draft from within the panel, so that I can capture a partial log without waiting for the draft to finish.
13. As a user, I want to download the full log as a JSON file from the summary screen once the draft is complete, so that I have one authoritative export of the whole draft's reasoning, alongside the existing roster CSV export.
14. As a user, I want the log to reset when I start a new draft, so that an old draft's entries never bleed into a new one.
15. As a user, I don't need the log to survive a page reload mid-draft, since the draft itself doesn't survive a reload today either — losing both together is expected, not a bug.
16. As a developer, I want the log entries produced by the same reducer code that makes each decision (not reconstructed afterward from `pickHistory` or re-derived by the UI), so that the "why" in the log is guaranteed accurate to what the engine actually did.
17. As a developer, I want `pickHistory` (the existing final-roster-provenance record used by CSV export) left untouched, so that the new debug log doesn't risk destabilizing existing export/summary behavior.
18. As a developer, I want the log entry shape to be able to represent things `PickRecord` structurally cannot — declines, skips, mistake metadata — so that the log isn't artificially constrained to "things that filled a roster slot."
19. As a developer testing the engine, I want to dispatch actions through the existing `draftEngine(state, action)` seam and assert on the resulting `debugLog` array, so that debug-log tests follow the same black-box discipline as the rest of the engine's test suite.
20. As a developer, I want the AI's existing deterministic "optimal" computations (best-by-ADP ordering, the non-mistake save/franchise target functions, the `optimal` boolean already computed inside the pullback decision) reused as the source of truth for the log's optimal-vs-chosen comparison, rather than the log reimplementing its own separate notion of "optimal."

## Implementation Decisions

### New state: `debugLog`

`DraftState` gains a `debugLog: LogEntry[]` field, initialized to `[]` in `initDraft.ts`. It is appended to — never rewritten or filtered — by the reducer that handles each action: the pick reducer, the save reducer, the pullback reducer, and the simulation orchestrator (for turn-skip entries). This keeps `draftEngine`'s existing `(DraftState, Action) → DraftState` signature and purity intact; the log is just more state produced by the same transitions, not a side channel.

`debugLog` is a new, independent array — `PickRecord`/`pickHistory` are not extended or reused for this purpose. `pickHistory` continues to represent only final roster-slot outcomes for export/summary; `debugLog` represents the full decision narrative, including declines and skips that never touch `pickHistory` at all.

### `LogEntry` shape

Each entry records, at minimum: a sequence number, the round and team index it occurred at, the action type (mirroring the existing `Action["type"]` union, plus a `SKIP_TURN`-style kind for no-open-slot skips), and the actor (`"user"` or `"ai"`, i.e. whether this team's turn was human-controlled or simulated for this decision).

For simulated (`"ai"`) decisions that produce a pick/save/pullback outcome, the entry additionally records: the chosen player/outcome, the deterministic optimal player/outcome (as already computed by `aiSimulator.ts`'s non-mistake functions — best-by-ADP ordering for picks, `computeSaveTarget`/`computeFranchiseTarget` for saves/franchise, the `optimal` boolean already local to the pullback decision), whether the two diverged, and — when they diverged — the noise or mistake value responsible (the Gaussian noise magnitude for picks, or the fact that `isMistake()` fired for save/pullback/franchise substitutions). This applies uniformly whenever a mistake roll occurs, even in the rare case its result happens to coincide with the optimal choice anyway — the roll itself is logged, not just its visible effect.

For `"user"` (human) decisions, the entry records actor + action + outcome only — no optimal-comparison fields are populated, since there's no algorithmic reasoning to report.

For skip entries, the entry records which team was skipped and why (no open normal slot at that round).

### Surfacing "optimal" to the log

`aiSimulator.ts`'s existing pure functions already separate the deterministic optimum from the noisy actual decision (e.g. a best-by-ADP ordering distinct from the noise-perturbed score used to pick; `computeSaveTarget` distinct from `computeSaveTargetWithMistake`; the `optimal` local variable inside the pullback mistake check). The reducers/orchestrator that call these functions call both the deterministic and (where applicable) noisy variants and pass both results into the log entry they construct, rather than the log trying to re-derive "optimal" independently after the fact.

### UI: toggleable log panel

A new panel component renders `draftState.debugLog` as a plain chronological scrollable list (no filtering/search in this iteration). It's toggled open/closed via a button on the live draft screen; opening it doesn't pause or otherwise affect the simulation clock. The panel includes its own "download log" action (see below).

### JSON download

A JSON-export function serializes the current `debugLog` array to a downloadable `.json` file. It's wired to two entry points: the button inside the log panel (usable at any time, produces whatever the log contains so far) and a new button on `SummaryScreen` alongside the existing roster CSV export (produces the complete end-of-draft log). Both call the same underlying export function — there is no separate "partial" vs "final" export format, just the same serialization run at two different points in the draft's lifecycle.

### No new persistence

`debugLog` lives only in the in-memory `DraftState` for the current draft, exactly like every other field on `DraftState` today. It does not use `localStorage` or any other persistence mechanism; a reload loses the log along with the rest of the draft, consistent with current app behavior. Multi-draft log history is not part of this spec.

## Testing Decisions

- Tests exercise the engine exclusively through the existing `draftEngine(state, action) → DraftState` seam — dispatch an action, assert on the resulting `state.debugLog` (entry count, order, actor, chosen-vs-optimal fields, mistake flags) — mirroring the black-box discipline already established in `draftEngine.test.ts`, `reactions.test.ts`, and `advanceSimulation.test.ts`. No test asserts on internal reducer helpers or log-construction functions directly.
- The existing `Math.random`-pinning pattern from `aiSimulator.test.ts` (pinning above/below the mistake threshold to make simulated decisions deterministic) is reused to test both branches of the chosen-vs-optimal comparison: a pinned "no mistake" run asserting the log shows chosen === optimal, and a pinned "mistake" run asserting the log shows the divergence and the associated noise/mistake metadata.
- Skip-turn logging is tested the same way `advanceSimulation.test.ts` already tests slot-skipping today, extended to assert a corresponding `debugLog` entry appears.
- The existing test fixture helpers (`makeDraftState`, `makePlayer`, `makeTeam` in `testHelpers.ts`) are extended as needed rather than duplicated.
- Following the precedent set in ADR 0002 (skip component tests for thin/presentational layers, test the logic-bearing modules directly), the log panel component and the JSON-export button wiring are not component-tested; the log *content* is tested at the engine seam, and the export function's serialization (given a `debugLog` array, does it produce the expected JSON) is tested as a plain unit function.

## Out of Scope

- Any persistence beyond the current draft's in-memory lifetime (no `localStorage`, no cross-draft log history/revisit). Explicitly deferred.
- Filtering or searching within the log panel (by team, action type, or "mistakes only"). Deferred to a later iteration if needed.
- Computing or displaying an "optimality" score for human/manual decisions. Explicitly rejected — human choices are logged as actor + action only.
- Extending `PickRecord`/`pickHistory` with debug fields. Explicitly rejected in favor of a separate `debugLog` array.
- A plain-text or human-readable rendered export format. JSON is the only download format for this iteration.
- Any change to draft rules, AI decision weighting, the `MISTAKE_PROBABILITY` constant, or simulation outcomes. This is purely observational logging — the simulation behaves identically with or without the log.
- Manual-mode draft support (tracked separately in `.scratch/backlog/issues/10-manual-mode.md`) — this spec's logging applies uniformly to whatever action-dispatch flows already exist, but manual-mode-specific work is out of scope here.

## Further Notes

This spec supersedes the unscoped stub at `.scratch/backlog/issues/03-debug-logs.md` and was settled via a `/grilling` session covering audience, persistence scope, log content/tone, UI placement, retention, and the debugLog/pickHistory relationship. Key facts that shaped the design: human and simulated actions already flow through the identical `Action` union and `draftEngine` entry point today, which is what makes a single log seam sufficient to cover both uniformly; and `aiSimulator.ts` already computes deterministic "optimal" values alongside its noisy actual decisions, which is what makes the chosen-vs-optimal comparison a matter of surfacing existing computation rather than inventing new evaluation logic.
