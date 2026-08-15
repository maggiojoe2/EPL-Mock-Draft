import { describe, it, expect, vi } from "vitest";
import { draftEngine } from "../draftEngine";
import { makeDraftState, makePlayer, makeTeam } from "../testHelpers";
import type { Player } from "../../types";

// ── ADVANCE_SIMULATION ────────────────────────────────────────────────────────

describe("ADVANCE_SIMULATION", () => {
  // ── No-ops ────────────────────────────────────────────────────────────────

  it("returns unchanged state when isDraftComplete", () => {
    const state = makeDraftState({ isDraftComplete: true });
    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    expect(next).toBe(state);
  });

  it("returns unchanged state when it is the user team's turn in practice mode", () => {
    const state = makeDraftState({
      mode: "practice",
      userTeamIndex: 0,
      currentPick: { round: 1, teamIndex: 0 },
    });
    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    expect(next).toBe(state);
  });

  it("returns unchanged state when user's reaction prompt is pending in practice mode", () => {
    const player: Player = makePlayer(0);
    const userTeam = makeTeam({
      name: "User",
      previousYearRoster: [player],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 0 ? userTeam : makeTeam({ name: `Team ${i}` }),
    );
    // State where user team (index 0) has a pending save prompt
    const state = makeDraftState({
      mode: "practice",
      userTeamIndex: 0,
      teams,
      pendingPrompt: {
        kind: "save",
        pickingTeamIndex: 1,
        reactingTeamIndex: 0, // user's team is reacting
        player,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 1 },
    });
    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    expect(next).toBe(state);
    expect(next.pendingPrompt).not.toBeNull();
  });

  // ── AI normal pick ────────────────────────────────────────────────────────

  it("in watch mode makes a pick and removes a player from the pool", () => {
    const state = makeDraftState({ mode: "watch", userTeamIndex: null });
    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    expect(next.availablePool.length).toBe(state.availablePool.length - 1);
  });

  it("in practice mode advances an AI team's turn (not the user's)", () => {
    // User is team 0; team 1 is on the clock
    const state = makeDraftState({
      mode: "practice",
      userTeamIndex: 0,
      currentPick: { round: 1, teamIndex: 1 },
    });
    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    // Pool should shrink (pick was made)
    expect(next.availablePool.length).toBe(state.availablePool.length - 1);
  });

  // ── AI pending-prompt resolution ──────────────────────────────────────────

  it("resolves a pending save prompt in watch mode (prompt becomes null)", () => {
    const player: Player = makePlayer(0);
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

    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    expect(next.pendingPrompt).toBeNull();
  });

  it("resolves a pending save prompt for an AI team in practice mode (not user team)", () => {
    const player: Player = makePlayer(0);
    const ownerTeam = makeTeam({
      name: "AI Owner",
      previousYearRoster: [player],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 2 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      mode: "practice",
      userTeamIndex: 0,
      teams,
      pendingPrompt: {
        kind: "save",
        pickingTeamIndex: 1,
        reactingTeamIndex: 2, // AI team is reacting
        player,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 1 },
    });

    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    expect(next.pendingPrompt).toBeNull();
  });

  it("resolves a pending pullback prompt in watch mode (prompt becomes null)", () => {
    const pickedPlayer: Player = makePlayer(0);
    const pullbackOption: Player = makePlayer(99);
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

    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    expect(next.pendingPrompt).toBeNull();
  });

  // ── AI pullback decision (standalone prompt): round-cost value rule ──────

  it("a standalone pullback prompt pulls back a candidate whose ADP beats the expected round ADP", () => {
    const pickedPlayer: Player = makePlayer(0); // already saved previously — this pick can't be saved again
    const saveTargetPlayer: Player = makePlayer(1); // best remaining ADP — the current save target, not offered here
    const pullbackOption: Player = makePlayer(49); // adp 50, well under the round-15 expected ADP of 170
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

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
      expect(next.teams[1].roster[15]).toEqual(pullbackOption);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("a standalone pullback prompt declines when no candidate beats the expected round ADP", () => {
    const pickedPlayer: Player = makePlayer(0);
    const pullbackOption: Player = makePlayer(250); // adp 251, well over the round-15 expected ADP of 170
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

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
      expect(next.teams[1].roster[15]).toBeNull();
    } finally {
      randomSpy.mockRestore();
    }
  });

  // ── AI save decision: target-match, not probability ──────────────────────
  //
  // The save branch runs no ADP-probability check; it invokes the save iff
  // the picked player matches the team's current save target (via
  // computeSaveTargetWithMistake). The *fallback* to pullback, once a save
  // is declined, uses the round-cost value comparison (shouldPullback).

  /** Runs `fn` with Math.random pinned above the mistake-noise threshold, so
   *  the save target is the algorithm's undisturbed top choice. */
  function withoutMistakes<T>(fn: () => T): T {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      return fn();
    } finally {
      randomSpy.mockRestore();
    }
  }

  it("invokes the save automatically when the picked player matches the current save target", () => {
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
    expect(next.teams[1].roster[15]).toEqual(target);
    expect(next.teams[1].saveUsedThisDraft).toBe(true);
    expect(next.pendingPrompt).toBeNull();
  });

  it("AI falls back to pulling back a value-positive candidate when the picked player is not the save target", () => {
    const trueTarget: Player = makePlayer(0); // best ADP → the real save target, excluded from pullback
    const otherCandidate: Player = makePlayer(49); // adp 50 — clears the round-cost bar, not the save target
    const player: Player = makePlayer(99); // the (worse) player actually picked
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [player, trueTarget, otherCandidate],
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
        // ADP-sorted, best first — trueTarget precedes otherCandidate, but
        // trueTarget is the save target and must be skipped for pullback.
        pullbackOptions: [trueTarget, otherCandidate],
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    // The save target (trueTarget) doesn't match the picked player, so the
    // save is declined; the fallback to pullback now runs the round-cost
    // value comparison. Team 1 at round 15 with 12 teams has an expected ADP
    // of (15-1)*12+2 = 170, comfortably above otherCandidate's 50, so it's
    // worth pulling back. Random pinned above the mistake threshold so the
    // undisturbed rule applies.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    let next;
    try {
      next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    } finally {
      randomSpy.mockRestore();
    }
    expect(next.teams[1].roster[15]).toEqual(otherCandidate);
    expect(next.teams[1].saveUsedThisDraft).toBe(false);
    expect(next.pendingPrompt).toBeNull();
  });

  it("does not independently evaluate the current save target for pullback (declines when it is the only option)", () => {
    const trueTarget: Player = makePlayer(0); // best ADP → the save target, and the only pullback option
    const player: Player = makePlayer(99);
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
        pullbackOptions: [trueTarget],
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
      // trueTarget's ADP (1) would easily clear the round-cost bar, but it's
      // the current save target and must not be pulled back in this decision.
      expect(next.teams[1].roster[15]).toBeNull();
      expect(next.teams[1].saveUsedThisDraft).toBe(false);
      expect(next.teams[1].lastAvailableRound).toBe(15);
      expect(next.pendingPrompt).toBeNull();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("AI declines entirely when the picked player is not the save target and no pullback candidate clears the value bar", () => {
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

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
      expect(next.teams[1].roster[15]).toBeNull();
      expect(next.teams[1].saveUsedThisDraft).toBe(false);
      expect(next.teams[1].lastAvailableRound).toBe(15);
      expect(next.pendingPrompt).toBeNull();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("mistake noise substitutes the next-best saveable candidate as the effective save target", () => {
    const best: Player = makePlayer(0); // best ADP — the algorithm's undisturbed top choice
    const nextBest: Player = makePlayer(1); // second-best — the mistake substitute, and what's picked
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [best, nextBest],
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
        player: nextBest,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 0 },
    });

    // Force the mistake draw so the effective target becomes nextBest
    // instead of best — the picked player (nextBest) then matches and the
    // save fires, which would not happen on an undisturbed decision.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
      expect(next.teams[1].roster[15]).toEqual(nextBest);
      expect(next.teams[1].saveUsedThisDraft).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("recomputes the save target fresh rather than reusing a value fixed before the draft", () => {
    const target: Player = makePlayer(0); // best ADP on the roster
    const other: Player = makePlayer(50);
    const basePrompt = {
      kind: "save" as const,
      pickingTeamIndex: 0,
      reactingTeamIndex: 1,
      player: target,
      pullbackOptions: [],
    };

    // Before: target has not yet been secured elsewhere — the save fires.
    const freshTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [other, target],
      saveHistory: new Set(),
      franchisePlayer: null,
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const before = withoutMistakes(() =>
      draftEngine(
        makeDraftState({
          mode: "watch",
          userTeamIndex: null,
          teams: Array.from({ length: 12 }, (_, i) =>
            i === 1 ? freshTeam : makeTeam({ name: `Team ${i}` }),
          ),
          pendingPrompt: basePrompt,
          currentPick: { round: 1, teamIndex: 0 },
        }),
        { type: "ADVANCE_SIMULATION" },
      ),
    );
    expect(before.teams[1].roster[15]).toEqual(target);

    // After: the team's franchisePlayer is now `target` — it's already
    // secured, so a fresh computeSaveTarget call excludes it and the same
    // picked player (target) no longer matches the (recomputed) target.
    const securedTeam = { ...freshTeam, franchisePlayer: target };
    const after = withoutMistakes(() =>
      draftEngine(
        makeDraftState({
          mode: "watch",
          userTeamIndex: null,
          teams: Array.from({ length: 12 }, (_, i) =>
            i === 1 ? securedTeam : makeTeam({ name: `Team ${i}` }),
          ),
          pendingPrompt: basePrompt,
          currentPick: { round: 1, teamIndex: 0 },
        }),
        { type: "ADVANCE_SIMULATION" },
      ),
    );
    expect(after.teams[1].roster[15]).toBeNull();
  });
});

// ── initDraft: pool is ADP-sorted ─────────────────────────────────────────────

describe("initDraft ADP sort", () => {
  it("available pool is sorted ascending by ADP after initDraft", async () => {
    const { initDraft } = await import("../initDraft");
    // Provide players in reverse ADP order
    const players = [
      makePlayer(9), // adp 10
      makePlayer(4), // adp 5
      makePlayer(0), // adp 1
      makePlayer(2), // adp 3
    ];
    const teams = Array.from({ length: 2 }, (_, i) =>
      makeTeam({ name: `Team ${i}` }),
    );
    const state = initDraft({
      mode: "watch",
      userTeamIndex: null,
      teams,
      availablePool: players,
    });
    const adps = state.availablePool.map((p) => p.adp);
    expect(adps).toEqual([...adps].sort((a, b) => a - b));
  });
});

// ── initDraft: lastAvailableRound for no-franchise teams ──────────────────────

describe("initDraft lastAvailableRound", () => {
  it("no-franchise team gets lastAvailableRound 16 (not the pre-init default of 15)", async () => {
    const { initDraft } = await import("../initDraft");
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(i));
    // Team with franchisePlayer: null and default pre-init lastAvailableRound: 15
    const team = makeTeam({
      name: "No Franchise",
      franchisePlayer: null,
      lastAvailableRound: 15,
    });
    const state = initDraft({
      mode: "watch",
      userTeamIndex: null,
      teams: [team],
      availablePool: players,
    });
    expect(state.teams[0].lastAvailableRound).toBe(16);
  });

  it("franchise team retains lastAvailableRound 15 after initDraft", async () => {
    const { initDraft } = await import("../initDraft");
    const franchisePlayer = makePlayer(0);
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(i));
    const team = makeTeam({
      name: "Has Franchise",
      franchisePlayer,
      lastAvailableRound: 15,
    });
    const state = initDraft({
      mode: "watch",
      userTeamIndex: null,
      teams: [team],
      availablePool: players,
    });
    expect(state.teams[0].lastAvailableRound).toBe(15);
  });
});

// ── ADVANCE_SIMULATION: skip full teams ───────────────────────────────────────

describe("ADVANCE_SIMULATION full-team skip", () => {
  it("skips a team whose roster is entirely filled — no pick is made, pool is unchanged", () => {
    // Single-team draft at round 16 with all 16 slots already filled (franchise in slot 16,
    // slots 1–15 filled by normal picks). After the skip, nextPick returns null so the engine
    // cannot recurse into another team — the pool must stay pristine.
    const franchisePlayer = makePlayer(200);
    const fullRoster: (Player | null)[] = Array.from(
      { length: 17 },
      () => null,
    );
    for (let r = 1; r <= 15; r++) {
      fullRoster[r] = makePlayer(r);
    }
    fullRoster[16] = franchisePlayer;

    const fullTeam = makeTeam({
      name: "Full Team",
      roster: fullRoster,
      lastAvailableRound: 15,
    });
    const pool = Array.from({ length: 50 }, (_, i) => makePlayer(i + 100));

    // Single-team draft at round 16, teamIndex 0
    const state = makeDraftState({
      mode: "watch",
      userTeamIndex: null,
      teams: [fullTeam],
      availablePool: pool,
      currentPick: { round: 16, teamIndex: 0 },
    });

    const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });
    // No pick was made — pool must be unchanged
    expect(next.availablePool.length).toBe(pool.length);
    // The full team's roster is still intact
    const filledSlotsAfter = next.teams[0].roster
      .slice(1)
      .filter((s) => s !== null).length;
    expect(filledSlotsAfter).toBe(16);
  });

  it("draft completes when the last open slot on a no-franchise team is filled", () => {
    // One no-franchise team with slots 1–15 filled and slot 16 null
    const almostFullRoster: (ReturnType<typeof makePlayer> | null)[] =
      Array.from({ length: 17 }, () => null);
    for (let r = 1; r <= 15; r++) {
      almostFullRoster[r] = makePlayer(r);
    }
    // slot 16 is still null

    const noFranchiseTeam = makeTeam({
      name: "No Franchise",
      roster: almostFullRoster,
      franchisePlayer: null,
      lastAvailableRound: 16,
    });
    const teams = [noFranchiseTeam];
    const finalPlayer = makePlayer(99);
    const pool = [finalPlayer];

    const state = makeDraftState({
      mode: "watch",
      userTeamIndex: null,
      teams,
      availablePool: pool,
      currentPick: { round: 16, teamIndex: 0 },
    });

    const next = draftEngine(state, {
      type: "PICK_PLAYER",
      player: finalPlayer,
    });
    expect(next.isDraftComplete).toBe(true);
  });
});
