# Issue 09 — Enforce save/franchise position restriction

Status: needs-triage

## Problem

There's a missing rule: a team's saved player and its franchise player cannot occupy the
same position. This restriction isn't currently implemented anywhere in the save flow
(`INVOKE_SAVE` in `src/App.tsx`, `src/types.ts`) or the franchise-declaration flow
(`src/setup/FranchiseStep.tsx`, `src/setup/setupHelpers.ts`), so a team can end up with
both a saved player and a franchise player at the same position, which shouldn't be
allowed.

## Solution direction

- Determine where the check belongs: at save-invocation time (block/disallow saving a
  player whose position matches the team's declared `franchisePlayer.position`), and/or
  at franchise-declaration time if a save could happen first.
- Surface the restriction to the user (e.g. disable/hide the save prompt option, or show
  an explanation) rather than failing silently.
- Add the rule to `CONTEXT.md`'s **Save** / **Franchise player** definitions once
  implemented, since it's currently undocumented there too.

## Comments
