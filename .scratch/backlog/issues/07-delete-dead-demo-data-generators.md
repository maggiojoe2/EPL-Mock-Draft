# Issue 07 — Delete the dead demo-data generators

Status: needs-triage

Source: architecture review 2026-08-15, candidate E (Strong / dead code)

## Problem

`src/engine/initDraft.ts`'s `makeDemoPlayers` and `makeDemoTeams` (~90 lines) are leftover
vertical-slice scaffolding, unreferenced anywhere in `src/` including tests (confirmed by
grep at review time and re-confirmed 2026-08-15). Superseded by the CSV-import +
bundled-defaults flow.

## Solution direction

Delete both functions. `initDraft`'s real job is ~35 lines and clean.

Deletion test: removing it loses nothing — it's already unreachable. Free, zero-risk —
good candidate to knock out first, ahead of the others in this batch.

## Comments
