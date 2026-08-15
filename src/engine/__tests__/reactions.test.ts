import { describe, it, expect } from "vitest";
import { draftEngine } from "../draftEngine";
import { makeDraftState, makePlayer, makeTeam } from "../testHelpers";
import type { DraftState } from "../../types";

// ── Shared save-scenario factory ───────────────────────────────────────────

/**
 * Build a DraftState where team 1 owns `player` and is eligible to save it.
 * Team 0 is currently on the clock (round 1, teamIndex 0).
 */
function makeSaveState(player = makePlayer(0), teamOverrides = {}): DraftState {
  const ownerTeam = makeTeam({
    name: "Owner",
    previousYearRoster: [player],
    saveHistory: new Set(),
    saveUsedThisDraft: false,
    lastAvailableRound: 15,
    ...teamOverrides,
  });
  const teams = Array.from({ length: 12 }, (_, i) =>
    i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
  );
  return makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } });
}

// ── Save mechanics ─────────────────────────────────────────────────────────

describe("save mechanics", () => {
  it("sets a save pendingPrompt when a saveable previous-year player is picked", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player);

    const next = draftEngine(state, { type: "PICK_PLAYER", player });

    expect(next.pendingPrompt).toMatchObject({
      kind: "save",
      pickingTeamIndex: 0,
      reactingTeamIndex: 1,
      player,
    });
  });

  it("INVOKE_SAVE places the player in lastAvailableRound of the reacting team", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player);
    const afterPick = draftEngine(state, { type: "PICK_PLAYER", player });
    const afterSave = draftEngine(afterPick, { type: "INVOKE_SAVE", player });

    expect(afterSave.teams[1].roster[15]).toEqual(player);
  });

  it("INVOKE_SAVE removes the player from the picking team's roster (save blocks the pick)", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player);
    const afterPick = draftEngine(state, { type: "PICK_PLAYER", player });
    // Sanity: picking team (0) has the player before the save
    expect(afterPick.teams[0].roster.some((p) => p?.id === player.id)).toBe(
      true,
    );

    const afterSave = draftEngine(afterPick, { type: "INVOKE_SAVE", player });
    // After save: picking team should NOT have the player
    expect(afterSave.teams[0].roster.every((p) => p?.id !== player.id)).toBe(
      true,
    );
  });

  it("INVOKE_SAVE removes the normal pick from pickHistory for the picking team", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player);
    const afterPick = draftEngine(state, { type: "PICK_PLAYER", player });
    const afterSave = draftEngine(afterPick, { type: "INVOKE_SAVE", player });

    // The only history entry should be the save (pickType 'save'), not a normal pick
    const normalPickEntry = afterSave.pickHistory.find(
      (r) =>
        r.teamIndex === 0 &&
        r.player.id === player.id &&
        r.pickType === "normal",
    );
    expect(normalPickEntry).toBeUndefined();
  });

  it("INVOKE_SAVE keeps the cursor at the picking team's position so they can pick again", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player);
    const afterPick = draftEngine(state, { type: "PICK_PLAYER", player });
    const afterSave = draftEngine(afterPick, { type: "INVOKE_SAVE", player });

    // Cursor must stay at round 1, team 0 — picker gets another turn
    expect(afterSave.currentPick).toEqual({ round: 1, teamIndex: 0 });
    expect(afterSave.pendingPrompt).toBeNull();
  });

  it("INVOKE_SAVE allows the picking team to successfully pick a different player next", () => {
    const savedPlayer = makePlayer(0);
    const nextPlayer = makePlayer(1);
    const state = makeSaveState(savedPlayer);
    const afterPick = draftEngine(state, {
      type: "PICK_PLAYER",
      player: savedPlayer,
    });
    const afterSave = draftEngine(afterPick, {
      type: "INVOKE_SAVE",
      player: savedPlayer,
    });
    // Picker tries again with nextPlayer
    const afterRetry = draftEngine(afterSave, {
      type: "PICK_PLAYER",
      player: nextPlayer,
    });

    expect(afterRetry.teams[0].roster[1]).toEqual(nextPlayer);
    expect(afterRetry.currentPick).toEqual({ round: 1, teamIndex: 1 }); // now advances
  });

  it("INVOKE_SAVE decrements lastAvailableRound from 15 to 14", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player);
    const afterPick = draftEngine(state, { type: "PICK_PLAYER", player });
    const afterSave = draftEngine(afterPick, { type: "INVOKE_SAVE", player });

    expect(afterSave.teams[1].lastAvailableRound).toBe(14);
    expect(afterSave.teams[1].saveUsedThisDraft).toBe(true);
  });

  it("INVOKE_SAVE marks saveUsedThisDraft on the reacting team", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player);
    const afterPick = draftEngine(state, { type: "PICK_PLAYER", player });
    const afterSave = draftEngine(afterPick, { type: "INVOKE_SAVE", player });

    expect(afterSave.teams[1].saveUsedThisDraft).toBe(true);
  });

  it("does not offer a save when the team already used their save this draft", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player, {
      saveUsedThisDraft: true,
      lastAvailableRound: 14,
    });
    const next = draftEngine(state, { type: "PICK_PLAYER", player });

    expect(next.pendingPrompt?.kind).not.toBe("save");
  });

  it("does not offer a save for a player in the team save history", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player, { saveHistory: new Set([player.id]) });
    const next = draftEngine(state, { type: "PICK_PLAYER", player });

    expect(next.pendingPrompt?.kind).not.toBe("save");
  });

  it("DECLINE_SAVE advances the pick cursor without saving", () => {
    const player = makePlayer(0);
    const state = makeSaveState(player);
    const afterPick = draftEngine(state, { type: "PICK_PLAYER", player });
    const afterDecline = draftEngine(afterPick, { type: "DECLINE_SAVE" });

    expect(afterDecline.pendingPrompt).toBeNull();
    expect(afterDecline.currentPick).toEqual({ round: 1, teamIndex: 1 });
    expect(afterDecline.teams[1].saveUsedThisDraft).toBe(false);
  });

  it("does not offer a save when lastAvailableRound <= currentRound", () => {
    const player = makePlayer(0);
    // lastAvailableRound (2) is not strictly greater than currentRound (3)
    const state = makeSaveState(player, { lastAvailableRound: 2 });
    const stateAtRound3 = { ...state, currentPick: { round: 3, teamIndex: 0 } };
    const next = draftEngine(stateAtRound3, { type: "PICK_PLAYER", player });

    expect(next.pendingPrompt).toBeNull();
  });
});

// ── Save-or-pullback combined reaction ─────────────────────────────────────
// A team with an unused save that owns a saveable player can save it, pull
// back a different previous-year player instead, or decline outright.

describe("save-or-pullback combined reaction", () => {
  function makeCombinedState() {
    const pickedPlayer = makePlayer(0);
    const pullbackOption = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, pullbackOption],
      saveHistory: new Set(), // pickedPlayer is saveable
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        pullbackOption,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    });
    return { pickedPlayer, pullbackOption, state };
  }

  it("a save-eligible pick also carries pullbackOptions for the reacting team", () => {
    const { pickedPlayer, pullbackOption, state } = makeCombinedState();

    const next = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });

    expect(next.pendingPrompt).toMatchObject({ kind: "save" });
    if (next.pendingPrompt?.kind === "save") {
      expect(next.pendingPrompt.pullbackOptions).toContainEqual(pullbackOption);
    }
  });

  it("INVOKE_PULLBACK on a save-kind prompt pulls back the other player and leaves the original pick standing", () => {
    const { pickedPlayer, pullbackOption, state } = makeCombinedState();

    const afterPick = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });
    const afterPullback = draftEngine(afterPick, {
      type: "INVOKE_PULLBACK",
      pullbackPlayer: pullbackOption,
    });

    // Original pick stands with the picking team.
    expect(afterPullback.teams[0].roster[1]).toEqual(pickedPlayer);
    // Pulled-back player lands in the owner's lastAvailableRound slot.
    expect(afterPullback.teams[1].roster[15]).toEqual(pullbackOption);
    expect(afterPullback.teams[1].lastAvailableRound).toBe(14);
    // The save was not used — this was a pullback, not a save.
    expect(afterPullback.teams[1].saveUsedThisDraft).toBe(false);
    expect(afterPullback.pendingPrompt).toBeNull();
  });

  it("INVOKE_SAVE still works normally when pullbackOptions are also present", () => {
    const { pickedPlayer, state } = makeCombinedState();

    const afterPick = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });
    const afterSave = draftEngine(afterPick, {
      type: "INVOKE_SAVE",
      player: pickedPlayer,
    });

    expect(afterSave.teams[1].roster[15]).toEqual(pickedPlayer);
    expect(afterSave.teams[1].saveUsedThisDraft).toBe(true);
    // Picking team no longer has the player — the save blocked the pick.
    expect(
      afterSave.teams[0].roster.every((p) => p?.id !== pickedPlayer.id),
    ).toBe(true);
  });

  it("DECLINE_SAVE declines both options and advances the cursor normally", () => {
    const { pickedPlayer, state } = makeCombinedState();

    const afterPick = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });
    const afterDecline = draftEngine(afterPick, { type: "DECLINE_SAVE" });

    expect(afterDecline.pendingPrompt).toBeNull();
    expect(afterDecline.currentPick).toEqual({ round: 1, teamIndex: 1 });
    expect(afterDecline.teams[1].saveUsedThisDraft).toBe(false);
    expect(afterDecline.teams[1].lastAvailableRound).toBe(15);
  });

  it("declining a combined save-or-pullback prompt still leaves save and pullback available on a later pick", () => {
    const firstPlayer = makePlayer(0);
    const secondPlayer = makePlayer(1);
    const pullbackOption = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [firstPlayer, secondPlayer, pullbackOption],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const pool = [
      firstPlayer,
      secondPlayer,
      pullbackOption,
      ...Array.from({ length: 20 }, (_, i) => makePlayer(i + 2)),
    ];
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );

    let state = makeDraftState({
      teams,
      availablePool: pool,
      currentPick: { round: 1, teamIndex: 0 },
    });

    // First pick offers the combined choice; the team declines outright.
    state = draftEngine(state, { type: "PICK_PLAYER", player: firstPlayer });
    expect(state.pendingPrompt).toMatchObject({ kind: "save" });
    state = draftEngine(state, { type: "DECLINE_SAVE" });
    expect(state.teams[1].saveUsedThisDraft).toBe(false);

    // Team 1 picks normally, then team 2 picks the team's other previous-year
    // player — the team is still offered a combined prompt, and this time
    // chooses to pull back rather than save.
    state = draftEngine(state, { type: "PICK_PLAYER", player: makePlayer(50) });
    state = draftEngine(state, { type: "PICK_PLAYER", player: secondPlayer });
    expect(state.pendingPrompt).toMatchObject({ kind: "save" });

    state = draftEngine(state, {
      type: "INVOKE_PULLBACK",
      pullbackPlayer: pullbackOption,
    });

    expect(state.teams[1].roster[15]).toEqual(pullbackOption);
    expect(state.teams[1].lastAvailableRound).toBe(14);
    expect(state.teams[1].saveUsedThisDraft).toBe(false); // save is still unused
    // Both original picks stand with their picking teams.
    expect(state.teams[0].roster[1]).toEqual(firstPlayer);
  });
});

// ── Pullback mechanics ─────────────────────────────────────────────────────

describe("pullback mechanics", () => {
  it("sets a pullback pendingPrompt when an opponent picks a previous-year player", () => {
    const pickedPlayer = makePlayer(0);
    const otherPrevPlayer = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, otherPrevPlayer],
      saveHistory: new Set([pickedPlayer.id]), // can't save this one
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        otherPrevPlayer,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });

    expect(next.pendingPrompt?.kind).toBe("pullback");
    const prompt = next.pendingPrompt!;
    if (prompt.kind === "pullback") {
      expect(prompt.reactingTeamIndex).toBe(1);
      expect(prompt.pickedPlayer).toEqual(pickedPlayer);
      expect(prompt.pullbackOptions).toContainEqual(otherPrevPlayer);
    }
  });

  it("pullbackOptions are sorted ascending by ADP (best player first)", () => {
    const pickedPlayer = makePlayer(0);
    const worseOption = makePlayer(50); // higher adp = worse
    const betterOption = makePlayer(10); // lower adp = better
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, worseOption, betterOption],
      saveHistory: new Set([pickedPlayer.id]),
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        worseOption,
        betterOption,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 60)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });

    expect(next.pendingPrompt?.kind).toBe("pullback");
    if (next.pendingPrompt?.kind === "pullback") {
      expect(next.pendingPrompt.pullbackOptions.map((p) => p.id)).toEqual([
        betterOption.id,
        worseOption.id,
      ]);
    }
  });

  it("INVOKE_PULLBACK places the pullback player in lastAvailableRound", () => {
    const pickedPlayer = makePlayer(0);
    const pullbackPlayer = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, pullbackPlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        pullbackPlayer,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    });

    const afterPick = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });
    const afterPullback = draftEngine(afterPick, {
      type: "INVOKE_PULLBACK",
      pullbackPlayer,
    });

    expect(afterPullback.teams[1].roster[15]).toEqual(pullbackPlayer);
    expect(afterPullback.teams[1].lastAvailableRound).toBe(14);
  });

  it("INVOKE_PULLBACK leaves the original pick standing (picking team keeps their player)", () => {
    const pickedPlayer = makePlayer(0);
    const pullbackPlayer = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, pullbackPlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        pullbackPlayer,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    });

    const afterPick = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });
    const afterPullback = draftEngine(afterPick, {
      type: "INVOKE_PULLBACK",
      pullbackPlayer,
    });

    // Picking team (team 0) keeps the original pick in round 1
    expect(afterPullback.teams[0].roster[1]).toEqual(pickedPlayer);
  });

  it("INVOKE_PULLBACK removes the pulled-back player from the available pool", () => {
    const pickedPlayer = makePlayer(0);
    const pullbackPlayer = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, pullbackPlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        pullbackPlayer,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    });

    const afterPick = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });
    const afterPullback = draftEngine(afterPick, {
      type: "INVOKE_PULLBACK",
      pullbackPlayer,
    });

    expect(
      afterPullback.availablePool.find((p) => p.id === pullbackPlayer.id),
    ).toBeUndefined();
  });

  it("multiple pullbacks in one draft decrement lastAvailableRound correctly", () => {
    const picked1 = makePlayer(0);
    const picked2 = makePlayer(1);
    const pullback1 = makePlayer(98);
    const pullback2 = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [picked1, picked2, pullback1, pullback2],
      saveHistory: new Set([picked1.id, picked2.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const pool = [
      picked1,
      picked2,
      pullback1,
      pullback2,
      ...Array.from({ length: 20 }, (_, i) => makePlayer(i + 2)),
    ];
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );

    let state = makeDraftState({
      teams,
      availablePool: pool,
      currentPick: { round: 1, teamIndex: 0 },
    });

    // First pick triggers pullback opportunity for team 1
    state = draftEngine(state, { type: "PICK_PLAYER", player: picked1 });
    expect(state.pendingPrompt?.kind).toBe("pullback");
    state = draftEngine(state, {
      type: "INVOKE_PULLBACK",
      pullbackPlayer: pullback1,
    });
    expect(state.teams[1].lastAvailableRound).toBe(14);

    // Second pick (from team 1 now) — advance past team 1's turn first (team 1 picks next)
    // Pick for team 1 (normal pick), then team 2 picks picked2 triggering another pullback
    state = draftEngine(state, { type: "PICK_PLAYER", player: makePlayer(50) }); // team 1 picks
    state = draftEngine(state, { type: "PICK_PLAYER", player: picked2 }); // team 2 picks prev-year player of team 1
    if (state.pendingPrompt?.kind === "pullback") {
      state = draftEngine(state, {
        type: "INVOKE_PULLBACK",
        pullbackPlayer: pullback2,
      });
    }
    expect(state.teams[1].lastAvailableRound).toBe(13);
  });

  it("does not offer a pullback when the team has no remaining eligible players in the pool", () => {
    const pickedPlayer = makePlayer(0);
    const alreadyGonePlayer = makePlayer(99); // in previousYearRoster but not in availablePool
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, alreadyGonePlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    // Note: alreadyGonePlayer is deliberately excluded from availablePool.
    const state = makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    });

    const next = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });

    expect(next.pendingPrompt).toBeNull();
  });

  it("a team that declines a pullback can still pull back on a later pick", () => {
    const picked1 = makePlayer(0);
    const picked2 = makePlayer(1);
    const pullback1 = makePlayer(98);
    const pullback2 = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [picked1, picked2, pullback1, pullback2],
      saveHistory: new Set([picked1.id, picked2.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const pool = [
      picked1,
      picked2,
      pullback1,
      pullback2,
      ...Array.from({ length: 20 }, (_, i) => makePlayer(i + 2)),
    ];
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );

    let state = makeDraftState({
      teams,
      availablePool: pool,
      currentPick: { round: 1, teamIndex: 0 },
    });

    // First pick triggers a pullback opportunity for team 1, which declines.
    state = draftEngine(state, { type: "PICK_PLAYER", player: picked1 });
    expect(state.pendingPrompt?.kind).toBe("pullback");
    state = draftEngine(state, { type: "DECLINE_PULLBACK" });
    expect(state.teams[1].lastAvailableRound).toBe(15); // unchanged by the decline

    // Team 1 picks normally, then team 2 picks team 1's other previous-year
    // player — team 1 can still pull back even though it declined earlier.
    state = draftEngine(state, { type: "PICK_PLAYER", player: makePlayer(50) });
    state = draftEngine(state, { type: "PICK_PLAYER", player: picked2 });
    expect(state.pendingPrompt?.kind).toBe("pullback");

    state = draftEngine(state, {
      type: "INVOKE_PULLBACK",
      pullbackPlayer: pullback2,
    });
    expect(state.teams[1].roster[15]).toEqual(pullback2);
    expect(state.teams[1].lastAvailableRound).toBe(14);
  });

  it("DECLINE_PULLBACK advances pick cursor without filling any slot", () => {
    const pickedPlayer = makePlayer(0);
    const pullbackPlayer = makePlayer(99);
    const ownerTeam = makeTeam({
      name: "Owner",
      previousYearRoster: [pickedPlayer, pullbackPlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    });
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    );
    const state = makeDraftState({
      teams,
      availablePool: [
        pickedPlayer,
        pullbackPlayer,
        ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1)),
      ],
      currentPick: { round: 1, teamIndex: 0 },
    });

    const afterPick = draftEngine(state, {
      type: "PICK_PLAYER",
      player: pickedPlayer,
    });
    const afterDecline = draftEngine(afterPick, { type: "DECLINE_PULLBACK" });

    expect(afterDecline.pendingPrompt).toBeNull();
    expect(afterDecline.currentPick).toEqual({ round: 1, teamIndex: 1 });
    expect(afterDecline.teams[1].lastAvailableRound).toBe(15); // unchanged
  });
});
