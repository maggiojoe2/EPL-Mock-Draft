# 02 — Save decisions driven by the computed save target

**What to build:** Rewire the `save` branch of `draftEngine`'s `ADVANCE_SIMULATION` case so a simulated team's save decision comes from the save-target function built in ticket 01, instead of `aiShouldReact`'s ADP-probability curve. When a save prompt fires for a simulated (non-user) team:

- Recompute the team's current save target fresh (per ticket 01's function — it's dynamic, not a value locked in before the draft).
- If the picked player matches that target, invoke the save automatically (subject to the mistake-noise helper substituting the next-best saveable candidate as the "actual" target on a mistake draw) — with **no** value-vs-round-cost comparison; a save-target match is invoked essentially unconditionally.
- If the picked player is not the current target, decline the save and let the existing control flow fall through to pullback handling for that prompt (pullback's own decision logic is still ticket 03's `aiShouldReact`-based placeholder at this point — only the save side of the branch changes in this ticket).

The existing structural flow (try save, then fall back toward pullback, then decline) stays intact; only what decides "should I invoke the save" changes.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The `save` branch of `ADVANCE_SIMULATION` recomputes the team's current save target (via ticket 01's function) rather than reading a value fixed before the draft.
- [ ] A simulated team invokes its save automatically whenever the picked player matches its current save target, without any value-vs-round-cost check.
- [ ] A simulated team declines the save when the picked player is not its current target, and the existing fallback to pullback handling for that prompt still occurs.
- [ ] Mistake noise (via ticket 01's shared helper) occasionally substitutes the next-best saveable candidate as the effective target for that one decision, rather than the algorithm's top choice.
- [ ] `aiShouldReact` is no longer called from the save branch (it may still be referenced by the pullback branch until ticket 03).
- [ ] `src/engine/__tests__/advanceSimulation.test.ts` and `src/engine/__tests__/reactions.test.ts` have their save-related assertions that currently pin the old ADP-probability behaviour rewritten to reflect target-match invocation, including a case proving the target is recomputed dynamically (e.g. after an earlier target was lost or secured) rather than fixed at draft start.
