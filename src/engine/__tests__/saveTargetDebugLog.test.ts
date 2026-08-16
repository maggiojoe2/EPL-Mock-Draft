import { describe, it, expect, vi } from "vitest";
import { draftEngine } from "../draftEngine";
import { makeDraftState, makePlayer, makeTeam } from "../testHelpers";
import type { Player } from "../../types";

// ── SAVE_TARGET_COMPUTED (ticket 03) ─────────────────────────────────────
//
// `computeSaveTarget`/`computeSaveTargetWithMistake` are recomputed fresh at
// two `simulationOrchestrator.ts` call sites: the pullback-exclusion check
// inside a pullback evaluation, and AI save-prompt resolution. Each call is
// logged as its own entry, independent of whether a save/pullback action
// ultimately results. Coverage of the two "happy path" call sites already
// lives in `reactionDebugLog.test.ts` (interleaved with the reaction entries
// they feed into); this file covers the null-target edge case and the
// same-team-different-targets claim directly.

/** Runs `fn` with Math.random pinned above the mistake-noise threshold. */
function withoutMistakes<T>(fn: () => T): T {
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  try {
    return fn();
  } finally {
    randomSpy.mockRestore();
  }
}

/** Runs `fn` with Math.random pinned below the mistake-noise threshold. */
function withMistakes<T>(fn: () => T): T {
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
  try {
    return fn();
  } finally {
    randomSpy.mockRestore();
  }
}

describe("debugLog — SAVE_TARGET_COMPUTED", () => {
  it("logs a null target for save-decision resolution when the team has no saveable candidates", () => {
    const player: Player = makePlayer(0); // only previous-year player, and it's already save-blocked
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [player],
      saveHistory: new Set([player.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      mode: "watch",
      userTeamIndex: null,
      teams,
      pendingPrompt: {
        kind: "save",
        pickingTeamIndex: 0,
        reactingTeamIndex: 1,
        player,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = withoutMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    // No saveable candidate → declined, with a pullback-exclusion
    // recomputation (also null, same team, no candidates either) before it.
    expect(next.debugLog).toEqual([
      {
        seq: 0,
        type: "SAVE_TARGET_COMPUTED",
        round: 15,
        teamIndex: 1,
        purpose: "save-decision",
        target: null,
      },
      {
        seq: 1,
        type: "SAVE_TARGET_COMPUTED",
        round: 15,
        teamIndex: 1,
        purpose: "pullback-exclusion",
        target: null,
      },
      {
        seq: 2,
        type: "DECLINE_SAVE",
        round: 15,
        teamIndex: 1,
        actor: "ai",
        outcome: null,
        optimalOutcome: null,
        diverged: false,
        mistakeFired: false,
      },
    ]);
  });

  it("logs a null target for pullback-exclusion when the team has no saveable candidates", () => {
    const pickedPlayer: Player = makePlayer(0);
    const pullbackOption: Player = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, pullbackOption],
      // Both already save-blocked — nothing left for computeSaveTarget to find.
      saveHistory: new Set([pickedPlayer.id, pullbackOption.id]),
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      mode: "watch",
      userTeamIndex: null,
      teams,
      pendingPrompt: {
        kind: "pullback",
        pickingTeamIndex: 0,
        reactingTeamIndex: 1,
        pickedPlayer,
        pullbackOptions: [pullbackOption],
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = withoutMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    const entry = next.debugLog.find(
      (e) => e.type === "SAVE_TARGET_COMPUTED",
    );
    expect(entry).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "pullback-exclusion",
      target: null,
    });
  });

  it("logs two different targets for the same team across consecutive computations when a mistake substitution changes the result", () => {
    // The save-decision resolution (mistake-affected) and the immediately
    // following pullback-exclusion check (deterministic) recompute the same
    // team's save target moments apart. Nothing about the logging mechanism
    // assumes the two calls agree — a mistake roll on the first is enough to
    // make them diverge, which is exactly what's forced here.
    const best: Player = makePlayer(0); // deterministic top choice
    const secondBest: Player = makePlayer(1); // the mistake roll's substitute
    const declinedPlayer: Player = makePlayer(2); // matches neither — save declines
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [best, secondBest, declinedPlayer],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      mode: "watch",
      userTeamIndex: null,
      teams,
      pendingPrompt: {
        kind: "save",
        pickingTeamIndex: 0,
        reactingTeamIndex: 1,
        player: declinedPlayer,
        pullbackOptions: [], // no pullback fallback options offered
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = withMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    const saveTargetEntries = next.debugLog.filter(
      (e) => e.type === "SAVE_TARGET_COMPUTED",
    );
    expect(saveTargetEntries).toHaveLength(2);
    expect(saveTargetEntries[0]).toMatchObject({
      teamIndex: 1,
      purpose: "save-decision",
      target: secondBest, // mistake-affected substitute
    });
    expect(saveTargetEntries[1]).toMatchObject({
      teamIndex: 1,
      purpose: "pullback-exclusion",
      target: best, // deterministic — computeSaveTarget never rolls a mistake
    });
    // Same team, two computations, two different resulting targets.
    expect(saveTargetEntries[0].target).not.toEqual(saveTargetEntries[1].target);
  });

  it("appends entries in dispatch order, interleaved with the skip/pick/reaction entries around them", () => {
    // A full team ahead of an AI team with a pending pullback prompt: the
    // skip entry, the save-target computation, and the reaction entry must
    // all land in the order they actually occurred.
    const fullRoster: (Player | null)[] = Array.from(
      { length: 17 },
      () => null,
    );
    for (let r = 1; r <= 16; r++) fullRoster[r] = makePlayer(r);
    const fullTeam = makeTeam({
      name: "Full Team",
      roster: fullRoster,
      lastAvailableRound: 15,
    });

    const pickedPlayer: Player = makePlayer(200);
    const pullbackOption: Player = makePlayer(201);
    const reactingTeam = makeTeam({
      name: "Reacting Team",
      previousYearRoster: [pickedPlayer, pullbackOption],
      saveHistory: new Set([pickedPlayer.id]),
      lastAvailableRound: 15,
    });

    const teams = [fullTeam, reactingTeam];
    const state = makeDraftState({
      mode: "watch",
      userTeamIndex: null,
      teams,
      pendingPrompt: {
        kind: "pullback",
        pickingTeamIndex: 0,
        reactingTeamIndex: 1,
        pickedPlayer,
        pullbackOptions: [pullbackOption],
      },
      currentPick: { round: 16, teamIndex: 0 },
    });

    const next = withoutMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    // A pending prompt is resolved before any turn-skip check runs, so the
    // only entries here are the save-target computation and the reaction it
    // feeds into — in that order. (`pullbackOption` is the team's only
    // saveable candidate, so it's excluded from its own pullback candidacy
    // and the decision declines — the reaction *type* isn't this test's
    // point, the ordering is.)
    expect(next.debugLog.map((e) => e.type)).toEqual([
      "SAVE_TARGET_COMPUTED",
      "DECLINE_PULLBACK",
    ]);
    expect(next.debugLog.map((e) => e.seq)).toEqual([0, 1]);
  });
});
