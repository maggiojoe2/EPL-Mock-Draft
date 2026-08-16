# Issue 01 — Drag and drop to re-order teams

Status: completed

## Problem

Would like to be able to drag and drop to re-order teams in the pre-draft Draft Order step.

Scope resolved via grilling session 2026-08-15: this applies to `DraftOrderStep.tsx`'s draft
order list only. No other list in the app is order-sensitive — the previous-year roster lists
in `RosterStep.tsx` are unordered sets (slot assignment is by round, handled elsewhere, not by
list position).

## Solution direction

Replace the ▲/▼ buttons in `DraftOrderStep.tsx` entirely with drag-and-drop + keyboard
reordering. No mobile/touch support required.

**Mouse**: drag any row to any position in one motion, dropping it anywhere in the list (not
just an adjacent swap). Use the native HTML5 Drag and Drop API (`draggable` + `dragover` +
`drop`) on the whole `.draft-order-item` row — no separate drag handle, since the row has no
other interactive content once the buttons are gone. Show an insertion line indicating where
the dragged row will land. No animated reflow of other rows — the list snaps to the new order
on drop.

**Keyboard**: focus a row, press ↑/↓ to move it one step immediately — same semantics as the
old buttons (no explicit "pick up/drop" phase, no Home/End). This is the accessible
replacement for the removed buttons, so it must be a direct behavioral swap-in.

**Accessibility**: add an `aria-live="polite"` region that announces moves for both the drag
and keyboard paths, e.g. "Arsenal moved to position 3 of 12".

**Implementation notes**:

- No new dependency — native HTML5 DnD API + hand-rolled keyboard handling stays within the
  project's existing minimal footprint (`papaparse` + `react` only). A library (`@dnd-kit`)
  was considered and rejected for this reason.
- Reuse the existing tested pure functions for the keyboard path: `withTeamsReordered` and
  `withUserTeamIndexAfterMove` in `src/setup/useSetupState.ts` already implement adjacent-swap
  reorder + `userTeamIndex` tracking — wire arrow-key events straight into `moveTeam`.
- Add a new pure function `withTeamsReorderedTo(teams, from, to)` for the free-drop mouse path
  (move, not swap), plus a generalized `userTeamIndex` tracker for arbitrary-distance moves
  (the existing `withUserTeamIndexAfterMove` only handles a ±1 swap). Unit-test these the same
  way as the existing reorder helpers in `useSetupState.test.ts`.
- `DraftOrderStep.tsx` stays presentational per
  [`docs/adr/0002`](../../../docs/adr/0002-defer-component-tests-for-setup-screen.md) — drag
  and keyboard event handlers call into actions exposed by `useSetupState`; all reorder logic
  lives in the pure, unit-tested functions above.

## Comments

2026-08-15: Scoped and specced via `/grill-with-docs` (grilling + domain-modeling session).
Decisions: draft-order list only; buttons replaced (not kept alongside); no mobile support
needed; arbitrary-position drops; native HTML5 DnD + hand-rolled keyboard reordering (no new
dependency); whole row draggable (no handle); insertion-line drop indicator; no reflow
animation; immediate-move keyboard semantics (no pick-up step); ARIA live-region announcements
for accessibility parity.

2026-08-15: Implemented via `/implement`. Added `withTeamsReorderedTo`, `withUserTeamIndexAfterMoveTo`,
and `dropGapToIndex` as pure, unit-tested functions in `useSetupState.ts`; wired keyboard ↑/↓
straight into the existing `moveTeam`. `DraftOrderStep.tsx` implements native HTML5 drag-and-drop
(whole-row draggable, insertion-line indicator, drop handling on the `<ol>` itself for the
below-last-row edge case) and calls only into hook actions — no reorder logic in the component.
`aria-live="polite"` region announces both drag and keyboard moves. Reviewed via `/code-review`
against this issue (Spec axis) and the Fowler smell baseline (Standards axis, no repo standards
docs exist); both flagged findings (gap→index math living in the component, undefined drop
behavior in blank space below the last row) were fixed before commit.
