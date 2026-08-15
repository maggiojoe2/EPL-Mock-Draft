# Decompose the setup screen into tested steps

Source: architecture review 2026-08-15, candidate C (Strong / in-process); scoped into
its own feature directory after a grilling session settled the design (see
`issues/01-decompose-setup-screen.md`).

## Problem

`src/setup/SetupScreen.tsx` is one ~350-line component covering seven concerns:
default-data bootstrap (`useEffect`), CSV import handlers with inline schema strings,
roster editing callbacks, draft-order reorder + index bookkeeping, franchise
declaration, and render-time validation. No test file touches this component at all.

The expected-CSV-column-names knowledge is duplicated three times (two inline strings,
one JSX hint block) with no shared source of truth.

## Solution direction

Pull the state and rules into a `useSetupState` hook testable independent of
rendering, keep one shared column-name constant, and split the JSX into one component
per step (`ImportStep`, `ModeStep`, `FranchiseStep`, `DraftOrderStep`, `RosterStep`) so
each step's interface is only what it actually needs, not the whole setup state.

Gains: a tested seam that doesn't require rendering; CSV schema defined once, read
three places; interface per step shrinks to its own concern.

See ADR-0002 (`docs/adr/0002-defer-component-tests-for-setup-screen.md`) for the
related decision to scope this to hook-level tests only, no component render tests.
