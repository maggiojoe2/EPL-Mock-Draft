# 01 — Franchise & save-target algorithm, wired into franchise selection

**What to build:** A shared, pure decision algorithm that computes a team's franchise target and current save target from ADP value — replacing the uniform-random franchise pick in `autoSelectFranchise` with a value-based one. Given a team's franchise-eligible players, previous-year roster, and save history, the algorithm:

1. Ranks franchise-eligible players by ADP; `X` = best, `Y` = second-best (if it exists).
2. Tentatively franchises `X`.
3. Computes `S` = the best-ADP player in the team's previous-year roster (excluding `X`) that isn't in the team's save history — this is a full-roster computation, not limited to the eligible pool, so a non-eligible player who outranks `Y` legitimately becomes the save target.
4. **Swap:** if `Y` exists, is save-blocked (in save history), and would otherwise have been the natural save target, and `X` is *not* save-blocked — swap so the team franchises `Y` instead and targets `X` for save. Otherwise (including when both `X` and `Y` are save-blocked) keep the tentative franchise-`X`/save-`S` assignment. The swap never looks past `X`/`Y` to a third candidate.
5. A team with zero franchise-eligible players has no franchise target; its save target is simply the best not-in-save-history player on its previous-year roster.

Also build the shared "mistake noise" helper this ticket's franchise selection uses, and that later tickets (save/pullback wiring) will reuse: a small, fixed probability that, on a given decision, the optimal choice is swapped for the next-best alternative rather than followed exactly — never a wild or bad choice, just a near-miss. For franchise selection specifically, a mistake means franchising the next-best eligible candidate instead of the algorithm's top choice.

Wire the franchise-target half of this algorithm into `autoSelectFranchise`, so simulated (non-user) teams now franchise via this logic instead of `Math.random()`. The save-target half should exist and be fully tested as a standalone function in this ticket, but does not need to be wired into the draft engine yet — that's ticket 02.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] A pure function computes the franchise target for a team per the algorithm above (steps 1–5), confined to the top two eligible players.
- [ ] A pure function computes the current save target for a team per the algorithm above, callable independently and reusable by future tickets.
- [ ] The save-blocked swap fires when `Y` is save-blocked and `X` is not; it does not fire when both are save-blocked (in that case the team franchises `X` as normal).
- [ ] A team with only one franchise-eligible player franchises that player with no swap logic invoked.
- [ ] A team with no franchise-eligible players has no franchise target, and its save target is the best not-previously-saved player on its previous-year roster.
- [ ] A shared mistake-noise helper exists with a fixed, non-configurable probability, and is applied to franchise selection so that on a "mistake" draw the next-best eligible candidate is franchised instead of the optimal one.
- [ ] `autoSelectFranchise` in `src/setup/setupHelpers.ts` calls the new franchise-target function instead of picking randomly; behaviour for the user's own team (skipped) is unchanged.
- [ ] New tests in `src/engine/__tests__/aiSimulator.test.ts` cover: single eligible player, multiple eligible players (best wins), no eligible players, the swap firing, the swap not firing when both top candidates are save-blocked, the swap never reaching a third candidate, save-target selection skipping save-blocked players and falling through to a non-eligible player when they outrank the eligible pool, and the mistake-noise substitution (using mocked `Math.random`, following the existing pattern in `advanceSimulation.test.ts`).
- [ ] `src/setup/__tests__/setupHelpers.test.ts` is updated so `autoSelectFranchise` tests assert the best-ADP eligible player is franchised, replacing any assertion that merely tolerates a random eligible player.
