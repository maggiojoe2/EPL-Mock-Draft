Status: ready-for-agent

# Collapse the duplicated slot-type derivation

## Problem Statement

As a developer maintaining the EPL Mock Drafter, I want the "what type of transaction filled this roster slot" logic to exist in exactly one place, so that fixing it in one caller can't silently leave the other caller wrong. Today `App.tsx` (`buildCellTypeMap`/`cellKey`) and `export/exportRosters.ts` (`buildSlotTypeMap`/`slotKey`) implement this near-line-for-line twice, including the same franchise-prefill fallback comment, and `SummaryScreen.tsx` already imports the `exportRosters.ts` copy — so the export module has become an accidental shared dependency for board-rendering logic with no seam boundary enforcing that role. Separately, `App.tsx` locally redefines `TOTAL_ROUNDS = 16` instead of importing the shared constant from `constants.ts`, risking drift on draft length.

## Solution

Extract the derivation into a new standalone module, `src/rosterSlotType.ts`, that exports `buildSlotTypeMap(teams, pickHistory)` and its key-encoder `slotKey(teamIndex, round)`. `App.tsx`, `SummaryScreen.tsx`, and `exportRosters.ts` all import from this module; the two duplicate implementations (`buildCellTypeMap`/`cellKey` in `App.tsx`, and the original `buildSlotTypeMap`/`slotKey` definitions in `exportRosters.ts`) are deleted. `App.tsx` also drops its local `TOTAL_ROUNDS = 16` and imports the constant from `constants.ts`. The "slot" vocabulary (already used by the CSV export's public `slot_type` column and by `SummaryScreen.tsx`) becomes the one canonical data-layer term; `App.tsx`'s "cell" terminology stays as-is at the presentation layer (CSS classes, board-specific naming) — this refactor converges the derivation function's name, not the UI's.

## User Stories

1. As a developer, I want one `buildSlotTypeMap` function, so that fixing a bug in how franchise pre-fills or save/pullback picks are typed only requires a change in one place.
2. As a developer, I want that function to live in a standalone module rather than inside `export/exportRosters.ts`, so that `App.tsx` (core board rendering) doesn't depend on a module scoped to the CSV-export concern for logic it needs regardless of export.
3. As a developer, I want the new module to import only from `types.ts` and `constants.ts`, so that it stays outside `src/engine/`'s existing seam (engine imports nothing from the UI/export/setup layers, and nothing outside engine imports back into it) without accidentally becoming a second thing engine would need to reach past.
4. As a developer, I want the non-obvious behavior of the franchise-prefill fallback's `!map.has` guard (it won't overwrite a `pickHistory`-sourced entry if a future change starts recording franchise placement there) documented once, in the merged function's docstring, so future readers don't have to reconstruct the reasoning from either of the two current copies.
5. As a developer, I want `App.tsx` to import `TOTAL_ROUNDS` from `constants.ts` instead of locally redefining it as `16`, so draft length can't silently diverge between the board view and the rest of the app.
6. As a developer, I want `slotKey`/`buildSlotTypeMap` exported from the new module so `SummaryScreen.tsx` can update its existing import path (`./export/exportRosters` → `./rosterSlotType`) without any change to its own behavior or its `summary-slot` CSS naming.
7. As a developer relying on the existing test suite, I want `exportRosters.test.ts`'s `buildCsvRows`/`toCsvString` tests to keep passing unmodified through this refactor, so the CSV output is verifiably unaffected.
8. As a developer, I want a new direct unit test for `buildSlotTypeMap` (previously untested directly in either location), so the shared derivation — the exact logic this issue is about protecting from drift — has its own coverage instead of relying solely on indirect exercise through `buildCsvRows`.
9. As a developer reading the project's domain glossary, I want `CONTEXT.md` to define "Slot" alongside the existing "Roster"/"Round"/"Pick" entries, so the term used in the CSV's public `slot_type` column and in this shared function has a documented meaning instead of being introduced silently by code.
10. As a developer, I want this refactor to produce no observable behavior change — the board's cell badges, the summary screen's slot badges, and the CSV export's `slot_type` column all render identically before and after.

## Implementation Decisions

### Module boundaries

- **New module `src/rosterSlotType.ts`** (flat `src/` root, alongside `constants.ts`/`types.ts` — not inside `src/engine/`, since this is a read-only derived view over `DraftState`, not a state transition, and not inside `src/export/`, since it's consumed by the board UI too). Exports:
  - `slotKey(teamIndex: number, round: number): string` — the `${teamIndex}-${round}` key encoder.
  - `buildSlotTypeMap(teams: Team[], pickHistory: PickRecord[]): Map<string, PickRecord["pickType"]>` — builds the map from `pickHistory` entries, then layers in franchise pre-fills detected via each team's `franchisePlayer` compared against `team.roster[TOTAL_ROUNDS]`, guarded by `!map.has(key)` so a future `pickHistory`-sourced franchise entry would win instead of being overwritten.
- **`src/export/exportRosters.ts`**: deletes its local `buildSlotTypeMap`/`slotKey` definitions, imports both from `../rosterSlotType`. `buildCsvRows`/`toCsvString`/`CsvRow` are otherwise unchanged.
- **`src/App.tsx`**: deletes `buildCellTypeMap`/`cellKey` and the local `TOTAL_ROUNDS = 16`; imports `buildSlotTypeMap`/`slotKey` from `./rosterSlotType` and `TOTAL_ROUNDS` from `./constants`. The `cellTypeMap` `useMemo` call site is updated to call `buildSlotTypeMap`; nothing else about `DraftView`'s render logic, `CELL_TYPE_CONFIG`, or CSS class names changes.
- **`src/SummaryScreen.tsx`**: updates its import of `buildSlotTypeMap`/`slotKey` from `./export/exportRosters` to `./rosterSlotType`. No other change.

### Seam boundary respected

`src/engine/*` currently imports only from `../types` and `../constants` (and other `engine/` files) — never from UI, export, or setup code — and nothing outside `engine/` imports engine's internals directly (only `draftEngine`'s public surface, per the existing `deepen-draft-engine` spec). `rosterSlotType.ts` preserves this: it imports only `types.ts`/`constants.ts`, is never imported by anything in `engine/`, and never imports from `engine/`.

### Terminology

"Slot" becomes the canonical name for the data-layer concept (function name, key-encoder name, glossary term), since it's already used by the CSV export's public `slot_type` column and by 2 of the 3 pre-refactor call sites. `App.tsx`'s "cell" terminology (CSS classes like `pick-cell`, `active-cell`) is presentation-layer naming and is explicitly out of scope for this refactor — see Out of Scope.

## Testing Decisions

- **Seam**: a single direct unit-test boundary at `buildSlotTypeMap` (new module, pure function of `(Team[], PickRecord[]) → Map<string, PickType>`). This is the one seam for this spec — no per-consumer test seam is added for `App.tsx`, `SummaryScreen.tsx`, or `exportRosters.ts`, since those remain thin call-throughs already exercised indirectly (`exportRosters.test.ts`'s `buildCsvRows` tests) or not directly tested today (`App.tsx`, `SummaryScreen.tsx` have no render-level tests currently, and this refactor doesn't change that).
- **What a good test covers here**: only `buildSlotTypeMap`'s external behavior — given a `teams`/`pickHistory` fixture, what `Map` comes out — not its internal loop structure. Cases: normal/save/pullback picks sourced from `pickHistory`; a franchise pre-fill detected via `team.roster[TOTAL_ROUNDS]`/`franchisePlayer` with no corresponding `pickHistory` entry; the `!map.has` guard not overwriting an existing `pickHistory`-sourced entry at the same key.
- **New test location**: `src/__tests__/rosterSlotType.test.ts` — starts the same per-directory `__tests__/` convention used by `engine/__tests__/`, `export/__tests__/`, `setup/__tests__/`, applied for the first time to a root-level module.
- **Prior art**: `src/export/__tests__/exportRosters.test.ts`'s existing fixture shape (constructing `Team`/`PickRecord` test data) is reused for the new test's fixtures.
- **Regression check**: `exportRosters.test.ts` must keep passing unmodified — it's the existing indirect coverage of the franchise-fallback and pickHistory-sourced paths through `buildCsvRows`.

## Out of Scope

- Reconciling "cell" vs "slot" naming in the presentation layer (CSS class names like `pick-cell`/`active-cell` in `App.tsx` vs `summary-slot` in `SummaryScreen.tsx`). Only the data-layer function/key-encoder name converges on "slot."
- Any change to `App.css` or the visual rendering of cell/slot badges.
- Any change to `CsvRow`'s `slot_type` union type or the CSV output format itself.
- Adding render-level/component tests for `App.tsx` or `SummaryScreen.tsx` — out of scope beyond the one new `buildSlotTypeMap` unit test.
- Any other duplication in the codebase not named in this spec.

## Further Notes

Originates from backlog issue `.scratch/backlog/issues/04-collapse-duplicate-cell-type-derivation.md` (architecture review 2026-08-15, candidate A). That issue's "extract one `buildSlotTypeMap`" direction is refined here: rather than picking whichever of the two existing implementations wins, both are deleted in favor of a new standalone module, specifically to fix the layering issue where `SummaryScreen.tsx` (UI) already depends on `exportRosters.ts` (export-scoped) for this logic.
