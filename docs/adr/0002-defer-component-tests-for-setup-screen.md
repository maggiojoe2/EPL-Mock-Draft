# Defer component-level tests when decomposing SetupScreen

`SetupScreen.tsx` was decomposed into a `useSetupState` hook plus five presentational
step components (see `.scratch/backlog/issues/05-decompose-setup-screen.md`). The hook
carries all the state and rules and is fully unit-tested; the step components and
`SetupScreen` itself remain untested at the render level. We considered introducing
RTL/jsdom to also cover rendering (file inputs, error banners, the franchise-declare
select, roster panel toggles) but rejected it for this issue — there was no existing
component-testing precedent in the repo, and adding one is a separate tooling decision
that shouldn't ride on a refactor. This is a deliberate scope call, not an oversight:
`SetupScreen`'s render tree has no test coverage even after this issue lands.

## Considered Options

- Add RTL + jsdom now and cover the step components' rendering — rejected as
  out-of-scope for this issue; no precedent to build on, and it would have doubled
  the size of the change for a concern the issue wasn't about.
