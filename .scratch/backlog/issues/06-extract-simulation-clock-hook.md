# Issue 06 — Extract the simulation clock into a tested hook

Status: needs-triage

Source: architecture review 2026-08-15, candidate D (Worth exploring / in-process)

## Problem

In `src/App.tsx` (`DraftView`), the mode-dependent delay tuning, the "don't advance on the
user's turn" guard, and the stale-dispatch ref guard around the AI-clock `useEffect` +
`setTimeout` are load-bearing but untested. `DraftView` has zero test coverage, and the
effect depends on the whole `state` object, so it re-runs on unrelated changes.

## Solution direction

Pull the scheduling into a `useSimulationClock(state, dispatch)` hook with a narrow
interface (mode, whose turn, dispatch), testable with fake timers independent of rendering
the board. `DraftView` would then render only.

Marked "worth exploring" rather than "strong" in the review — worth confirming scope/value
before committing to it.

## Comments
