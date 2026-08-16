import { describe, it, expect, vi } from "vitest";
import { draftEngine } from "../draftEngine";
import { makeDraftState, makePlayer } from "../testHelpers";

// ── PICK_PLAYER — human (dispatched directly, no aiContext) ────────────────

describe("debugLog — human PICK_PLAYER", () => {
  it("records a single entry with actor 'user' and no optimal-comparison fields", () => {
    const state = makeDraftState();
    const player = state.availablePool[0];
    const next = draftEngine(state, { type: "PICK_PLAYER", player });

    expect(next.debugLog).toHaveLength(1);
    expect(next.debugLog[0]).toEqual({
      seq: 0,
      type: "PICK_PLAYER",
      round: 1,
      teamIndex: 0,
      actor: "user",
      player,
    });
  });

  it("appends entries in dispatch order across multiple picks, never rewriting earlier ones", () => {
    let state = draftEngine(makeDraftState(), {
      type: "PICK_PLAYER",
      player: makeDraftState().availablePool[0],
    });
    const firstEntry = state.debugLog[0];

    const secondPlayer = state.availablePool[0];
    state = draftEngine(state, { type: "PICK_PLAYER", player: secondPlayer });

    expect(state.debugLog).toHaveLength(2);
    expect(state.debugLog[0]).toEqual(firstEntry);
    expect(state.debugLog[1]).toMatchObject({
      seq: 1,
      teamIndex: 1,
      player: secondPlayer,
    });
  });
});

// ── PICK_PLAYER — simulated (via ADVANCE_SIMULATION) ────────────────────────

describe("debugLog — simulated PICK_PLAYER", () => {
  it("records actor 'ai' with chosen === optimal and no divergence when noise doesn't move the ranking", () => {
    // Pinning Math.random to a constant whose v-component is 0.25 zeroes out
    // cos(2πv) for every gaussianNoise() draw, so every candidate's noise is
    // exactly 0 regardless of its u-component — the noisy ranking collapses
    // to the plain ADP ranking.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.25);
    try {
      const state = makeDraftState({ mode: "watch", userTeamIndex: null });
      const best = state.availablePool[0]; // lowest ADP
      const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });

      expect(next.debugLog).toHaveLength(1);
      const entry = next.debugLog[0];
      expect(entry).toMatchObject({
        type: "PICK_PLAYER",
        actor: "ai",
        player: best,
        optimalPlayer: best,
        diverged: false,
      });
      expect(entry).not.toHaveProperty("noise");
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("records the divergence and the noise value when noise flips the ranking", () => {
    const a = makePlayer(0); // adp 1 — best by ADP
    const b = makePlayer(1); // adp 2
    const state = makeDraftState({
      mode: "watch",
      userTeamIndex: null,
      availablePool: [a, b],
    });

    // gaussianNoise() draws (u, v) = (1 - random(), random()) per candidate,
    // scaled ×5 (σ = 5 ranks) before being added to ADP.
    // Player a: v=0.25 zeroes cos(2πv) → noise 0 → score stays at its ADP (1).
    // Player b: u≈0.8825, v=0.5 (cos=-1) → raw noise ≈ -0.5, scaled ≈ -2.5 →
    // score ≈ 2 - 2.5 = -0.5, beating a's score of 1 and flipping the winner
    // to the worse-ADP player.
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // a: u (irrelevant, cos will zero it out)
      .mockReturnValueOnce(0.25) // a: v
      .mockReturnValueOnce(0.1175) // b: u
      .mockReturnValueOnce(0.5); // b: v
    try {
      const next = draftEngine(state, { type: "ADVANCE_SIMULATION" });

      expect(next.debugLog).toHaveLength(1);
      const entry = next.debugLog[0];
      if (entry.type !== "PICK_PLAYER")
        throw new Error("expected a PICK_PLAYER entry");
      expect(entry.actor).toBe("ai");
      expect(entry.player).toEqual(b);
      expect(entry.optimalPlayer).toEqual(a);
      expect(entry.diverged).toBe(true);
      expect(entry.noise).toBeCloseTo(-2.5, 1);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
