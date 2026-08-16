# Issue 10 — Add "manual" draft mode

Status: needs-triage

## Problem

`DraftMode` (`src/types.ts`) currently supports only `"practice"` (user picks for one
team, CPU picks for the rest) and `"watch"` (CPU picks for every team). There's no mode
where the user picks for every team themselves.

## Solution direction

- Add a third `DraftMode` value (e.g. `"manual"`) to `src/types.ts`.
- `ModeStep.tsx` (`src/setup/ModeStep.tsx`): add the new option to the mode picker.
- `DraftOrderStep.tsx`: the "which team are you" selector only applies to `practice`
  mode (`mode === "practice" && i === userTeamIndex`) — manual mode has no single user
  team, so this step likely needs to be skipped or reworked for `manual`.
- `App.tsx`: the pick-loop logic gated on `mode === "practice"` (whether to prompt vs.
  auto-pick, and the auto-pick delay keyed on `mode === "watch"`) needs a manual-mode
  branch that always prompts the user, for every team, with no CPU auto-picking.
- Check `useSetupState` / `SetupScreen.tsx` invariant notes referencing
  `mode === "practice" && userTeamIndex !== null` — manual mode likely needs
  `userTeamIndex` to be unused/null with different validation.

## Comments
