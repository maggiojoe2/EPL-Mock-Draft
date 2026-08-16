# Issue 08 — Create architecture documentation

Status: completed

## Problem

There's no single place that lays out the system's architecture — the major modules, how
they fit together, and the reasoning behind key structural decisions. `CONTEXT.md` and
`docs/adr/` cover domain language and individual decisions, but nothing gives a
newcomer (human or agent) the big-picture map before they start reading code.

## Solution direction

Write an architecture doc (e.g. `docs/architecture.md`) covering:

- Top-level module/directory breakdown and responsibilities
- How the draft engine, UI, and data-import flows relate
- Key architectural decisions and pointers to the relevant `docs/adr/` entries
- Anything a new contributor would otherwise have to reconstruct by reading the whole
  codebase

## Comments

Completed 2026-08-15: added `docs/architecture.md` (commit 9dc09b4) covering
the module breakdown, how setup/engine/export relate, the draft engine's
sub-reducer structure, and pointers to `docs/adr/` for key decisions.
Typecheck clean, all 165 tests pass.
