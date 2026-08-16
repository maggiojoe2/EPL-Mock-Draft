import { describe, it, expect, vi } from "vitest";
import { draftEngine } from "../draftEngine";
import { makeDraftState, makePlayer, makeTeam } from "../testHelpers";
import type { DraftState, Player } from "../../types";

// ── Human reactions (dispatched directly, no aiContext) ─────────────────────

/** Build a DraftState with a pending save prompt for team 1 reacting to
 *  team 0's pick of `player`. */
function makeSavePromptState(player = makePlayer(0)): DraftState {
  const ownerTeam = makeTeam({
    name: "Owner",
    previousYearRoster: [player],
    saveHistory: new Set(),
    saveUsedThisDraft: false,
    lastAvailableRound: 15,
  });
  const teams = Array.from({ length: 12 }, (_, i) =>
    i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
  );
  const afterPick = draftEngine(
    makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } }),
    { type: "PICK_PLAYER", player },
  );
  return afterPick;
}

/** Build a DraftState with a pending standalone pullback prompt for team 1
 *  reacting to team 0's pick of a player it can't save. */
function makePullbackPromptState(
  pullbackPlayer = makePlayer(99),
): DraftState {
  const pickedPlayer = makePlayer(0);
  const ownerTeam = makeTeam({
    name: "Owner",
    previousYearRoster: [pickedPlayer, pullbackPlayer],
    saveHistory: new Set([pickedPlayer.id]), // not saveable — pullback only
    saveUsedThisDraft: false,
    lastAvailableRound: 15,
  });
  const teams = Array.from({ length: 12 }, (_, i) =>
    i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
  );
  const afterPick = draftEngine(
    makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        pullbackPlayer,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    }),
    { type: "PICK_PLAYER", player: pickedPlayer },
  );
  return afterPick;
}

describe("debugLog — human reactions", () => {
  it("INVOKE_SAVE records actor 'user' with the saved outcome and no optimal-comparison fields", () => {
    const player = makePlayer(0);
    const state = makeSavePromptState(player);
    const seqBefore = state.debugLog.length;

    const next = draftEngine(state, { type: "INVOKE_SAVE", player });

    const entry = next.debugLog[seqBefore];
    expect(entry).toEqual({
      seq: seqBefore,
      type: "INVOKE_SAVE",
      round: 15,
      teamIndex: 1,
      actor: "user",
      outcome: player,
    });
  });

  it("DECLINE_SAVE records actor 'user' with a null outcome and no optimal-comparison fields", () => {
    const player = makePlayer(0);
    const state = makeSavePromptState(player);
    const seqBefore = state.debugLog.length;

    const next = draftEngine(state, { type: "DECLINE_SAVE" });

    const entry = next.debugLog[seqBefore];
    expect(entry).toEqual({
      seq: seqBefore,
      type: "DECLINE_SAVE",
      round: 15,
      teamIndex: 1,
      actor: "user",
      outcome: null,
    });
  });

  it("INVOKE_PULLBACK records actor 'user' with the pulled-back outcome and no optimal-comparison fields", () => {
    const pullbackPlayer = makePlayer(99);
    const state = makePullbackPromptState(pullbackPlayer);
    const seqBefore = state.debugLog.length;

    const next = draftEngine(state, {
      type: "INVOKE_PULLBACK",
      pullbackPlayer,
    });

    const entry = next.debugLog[seqBefore];
    expect(entry).toEqual({
      seq: seqBefore,
      type: "INVOKE_PULLBACK",
      round: 15,
      teamIndex: 1,
      actor: "user",
      outcome: pullbackPlayer,
    });
  });

  it("DECLINE_PULLBACK records actor 'user' with a null outcome and no optimal-comparison fields", () => {
    const state = makePullbackPromptState();
    const seqBefore = state.debugLog.length;

    const next = draftEngine(state, { type: "DECLINE_PULLBACK" });

    const entry = next.debugLog[seqBefore];
    expect(entry).toEqual({
      seq: seqBefore,
      type: "DECLINE_PULLBACK",
      round: 15,
      teamIndex: 1,
      actor: "user",
      outcome: null,
    });
  });
});

// ── Simulated reactions (via ADVANCE_SIMULATION) ─────────────────────────────

/** Runs `fn` with Math.random pinned above the mistake-noise threshold, so
 *  every mistake roll in `fn` comes back false. */
function withoutMistakes<T>(fn: () => T): T {
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  try {
    return fn();
  } finally {
    randomSpy.mockRestore();
  }
}

/** Runs `fn` with Math.random pinned below the mistake-noise threshold, so
 *  every mistake roll in `fn` comes back true. */
function withMistakes<T>(fn: () => T): T {
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
  try {
    return fn();
  } finally {
    randomSpy.mockRestore();
  }
}

describe("debugLog — simulated INVOKE_SAVE / DECLINE_SAVE", () => {
  it("records actor 'ai' with chosen === optimal and no divergence when no mistake fires", () => {
    const target: Player = makePlayer(0); // best ADP on the roster
    const other: Player = makePlayer(50);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [other, target],
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
        player: target,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = withoutMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    // Ticket 03: the save-target recomputation that resolved this prompt is
    // logged in its own entry, ahead of the reaction entry it fed into.
    expect(next.debugLog).toHaveLength(2);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "save-decision",
      target,
    });
    expect(next.debugLog[1]).toEqual({
      seq: 1,
      type: "INVOKE_SAVE",
      round: 15,
      teamIndex: 1,
      actor: "ai",
      outcome: target,
      optimalOutcome: target,
      diverged: false,
      mistakeFired: false,
    });
  });

  it("records mistakeFired even when the mistake substitution lands on the same (only) candidate — a no-op mistake", () => {
    const target: Player = makePlayer(0); // the team's only saveable candidate
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [target],
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
        player: target,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    // Force the mistake draw. With only one saveable candidate, the
    // substitution (candidates[1] ?? candidates[0]) still resolves to
    // `target` — the mistake fired but had no visible effect.
    const next = withMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    expect(next.debugLog).toHaveLength(2);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "save-decision",
      target,
    });
    expect(next.debugLog[1]).toEqual({
      seq: 1,
      type: "INVOKE_SAVE",
      round: 15,
      teamIndex: 1,
      actor: "ai",
      outcome: target,
      optimalOutcome: target,
      diverged: false,
      mistakeFired: true,
    });
  });

  it("DECLINE_SAVE records the divergence when the picked player isn't the save target and no pullback fires", () => {
    const trueTarget: Player = makePlayer(0);
    const player: Player = makePlayer(99);
    const pullbackOption: Player = makePlayer(250); // adp 251 — well above the round-15 expected ADP
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [player, trueTarget],
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
        player,
        pullbackOptions: [pullbackOption],
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = withoutMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    // Ticket 03: two save-target recomputations precede the reaction entry —
    // the initial save-decision resolution, then the pullback-fallback's own
    // exclusion check (both land on `trueTarget` here since it's the only
    // saveable candidate on this roster).
    expect(next.debugLog).toHaveLength(3);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "save-decision",
      target: trueTarget,
    });
    expect(next.debugLog[1]).toEqual({
      seq: 1,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "pullback-exclusion",
      target: trueTarget,
    });
    const entry = next.debugLog.find((e) => e.type === "DECLINE_SAVE");
    expect(entry).toEqual({
      seq: 2,
      type: "DECLINE_SAVE",
      round: 15,
      teamIndex: 1,
      actor: "ai",
      outcome: null,
      optimalOutcome: trueTarget,
      diverged: true,
      mistakeFired: false,
    });
  });

  it("DECLINE_SAVE records mistakeFired when the mistake substitution still doesn't match the picked player", () => {
    const target: Player = makePlayer(0); // best ADP — the algorithm's undisturbed top choice
    const mistakeCandidate: Player = makePlayer(1); // second-best — the mistake substitute
    const declinedPlayer: Player = makePlayer(2); // the player actually picked — matches neither
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [target, mistakeCandidate, declinedPlayer],
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
        pullbackOptions: [], // no pullback fallback available — declines outright
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = withMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    // Ticket 03: the mistake-affected save-decision resolution lands on
    // `mistakeCandidate` (the mistake substitute), while the pullback
    // fallback's exclusion check recomputes the target with no mistake
    // applied — `target`, the deterministic best-by-ADP candidate — so the
    // same team logs two different targets across the two computations.
    expect(next.debugLog).toHaveLength(3);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "save-decision",
      target: mistakeCandidate,
    });
    expect(next.debugLog[1]).toEqual({
      seq: 1,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "pullback-exclusion",
      target,
    });
    expect(next.debugLog[2]).toEqual({
      seq: 2,
      type: "DECLINE_SAVE",
      round: 15,
      teamIndex: 1,
      actor: "ai",
      outcome: null,
      optimalOutcome: target,
      diverged: true,
      mistakeFired: true,
    });
  });
});

describe("debugLog — simulated INVOKE_PULLBACK / DECLINE_PULLBACK", () => {
  it("records actor 'ai' with chosen === optimal and no divergence when no mistake fires", () => {
    const pickedPlayer: Player = makePlayer(0); // already saved previously
    const saveTargetPlayer: Player = makePlayer(1); // best remaining ADP — excluded, not offered here
    const pullbackOption: Player = makePlayer(49); // adp 50, well under round-15 expected ADP of 170
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, saveTargetPlayer, pullbackOption],
      saveHistory: new Set([pickedPlayer.id]),
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

    // Ticket 03: the pullback-exclusion save-target computation precedes
    // the reaction entry.
    expect(next.debugLog).toHaveLength(2);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "pullback-exclusion",
      target: saveTargetPlayer,
    });
    expect(next.debugLog[1]).toEqual({
      seq: 1,
      type: "INVOKE_PULLBACK",
      round: 15,
      teamIndex: 1,
      actor: "ai",
      outcome: pullbackOption,
      optimalOutcome: pullbackOption,
      diverged: false,
      mistakeFired: false,
    });
  });

  it("records the divergence and mistakeFired when a mistake flips a below-bar candidate to accepted", () => {
    const pickedPlayer: Player = makePlayer(0);
    const saveTargetPlayer: Player = makePlayer(1); // distinct save target, excluded from pullback candidates
    const pullbackOption: Player = makePlayer(250); // adp 251 — well above expected ADP; pure evaluation rejects
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, saveTargetPlayer, pullbackOption],
      saveHistory: new Set([pickedPlayer.id]),
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

    const next = withMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    expect(next.debugLog).toHaveLength(2);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "pullback-exclusion",
      target: saveTargetPlayer,
    });
    expect(next.debugLog[1]).toEqual({
      seq: 1,
      type: "INVOKE_PULLBACK",
      round: 15,
      teamIndex: 1,
      actor: "ai",
      outcome: pullbackOption,
      optimalOutcome: null,
      diverged: true,
      mistakeFired: true,
    });
  });

  it("DECLINE_PULLBACK records chosen === optimal (both null) when no candidate clears the bar and no mistake fires", () => {
    const pickedPlayer: Player = makePlayer(0);
    const pullbackOption: Player = makePlayer(250); // adp 251 — well above the round-15 expected ADP
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, pullbackOption],
      saveHistory: new Set([pickedPlayer.id]),
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

    // The team's only saveable candidate is `pullbackOption` itself, so the
    // exclusion check's logged target *is* the offered pullback option —
    // which is exactly why it's filtered out of the candidate list below.
    expect(next.debugLog).toHaveLength(2);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "pullback-exclusion",
      target: pullbackOption,
    });
    expect(next.debugLog[1]).toEqual({
      seq: 1,
      type: "DECLINE_PULLBACK",
      round: 15,
      teamIndex: 1,
      actor: "ai",
      outcome: null,
      optimalOutcome: null,
      diverged: false,
      mistakeFired: false,
    });
  });

  it("DECLINE_PULLBACK records mistakeFired and the divergence when a mistake rejects a candidate that clears the bar", () => {
    const pickedPlayer: Player = makePlayer(0);
    const saveTargetPlayer: Player = makePlayer(1); // distinct save target, excluded from pullback candidates
    const pullbackOption: Player = makePlayer(49); // adp 50, well under round-15 expected ADP of 170 — pure evaluation accepts
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, saveTargetPlayer, pullbackOption],
      saveHistory: new Set([pickedPlayer.id]),
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

    // Every mistake roll fires, flipping the only candidate's otherwise-clear
    // accept into a reject — the decision declines despite a candidate that
    // would have cleared the bar.
    const next = withMistakes(() =>
      draftEngine(state, { type: "ADVANCE_SIMULATION" }),
    );

    expect(next.debugLog).toHaveLength(2);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "SAVE_TARGET_COMPUTED",
      round: 15,
      teamIndex: 1,
      purpose: "pullback-exclusion",
      target: saveTargetPlayer,
    });
    expect(next.debugLog[1]).toEqual({
      seq: 1,
      type: "DECLINE_PULLBACK",
      round: 15,
      teamIndex: 1,
      actor: "ai",
      outcome: null,
      optimalOutcome: pullbackOption,
      diverged: true,
      mistakeFired: true,
    });
  });
});
