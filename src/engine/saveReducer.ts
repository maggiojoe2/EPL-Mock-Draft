import type { Action, DraftState, Team } from "../types";
import { advanceCursor, placeInRoster, retractNormalPick } from "./pickReducer";
import { resolveReaction } from "./reactionQueue";
import { buildReactionLogEntry } from "./reactionLogEntry";

// ── Save resolution ─────────────────────────────────────────────────────

/** A save undoes a prior pick: see the step-by-step breakdown inline below.
 *  The player is read from `state.pendingPrompt`, not the action, since the
 *  prompt is the source of truth for which player is being saved.
 *  `aiContext` — present only when `advanceSimulation` synthesized this
 *  action — drives the optimal-comparison fields on the resulting debug-log
 *  entry. */
export function invokeSave(
  state: DraftState,
  action: Extract<Action, { type: "INVOKE_SAVE" }>,
): DraftState {
  if (!state.pendingPrompt || state.pendingPrompt.kind !== "save") return state;
  const { pickingTeamIndex, reactingTeamIndex, player } = state.pendingPrompt;

  // A save blocks the original pick: remove the player from the picking team's
  // roster; the voided normal pick record is stripped from history below.
  const pickingTeam = state.teams[pickingTeamIndex];
  const blockedRound = pickingTeam.roster.findIndex((p) => p?.id === player.id);
  const unblockedPickingTeam = placeInRoster(pickingTeam, blockedRound, null);

  // Place the player in the saving team's back slot.
  const reactingTeam = state.teams[reactingTeamIndex];
  const targetRound = reactingTeam.lastAvailableRound;
  const updatedReactingTeam: Team = {
    ...placeInRoster(reactingTeam, targetRound, player),
    saveUsedThisDraft: true,
    lastAvailableRound: targetRound - 1,
  };

  const teams = state.teams.map((t, i) => {
    if (i === pickingTeamIndex) return unblockedPickingTeam;
    if (i === reactingTeamIndex) return updatedReactingTeam;
    return t;
  });

  // Drop the voided normal pick from history; add the save record.
  const pickHistory = [
    ...retractNormalPick(state.pickHistory, pickingTeamIndex, player),
    {
      round: targetRound,
      teamIndex: reactingTeamIndex,
      player,
      pickType: "save" as const,
    },
  ];

  const logEntry = buildReactionLogEntry(
    state.debugLog.length,
    "INVOKE_SAVE",
    targetRound,
    reactingTeamIndex,
    player,
    action.aiContext,
  );
  const debugLog = [...state.debugLog, logEntry];

  // The save blocks the pick — cursor stays at the picking team's position
  // so they can pick again. Clear remaining reactions (they all referenced
  // the now-blocked pick).
  return {
    ...state,
    teams,
    pickHistory,
    debugLog,
    pendingPrompt: null,
    reactionQueue: [],
    currentPick: state.currentPick, // unchanged — picker tries again
    isDraftComplete: false,
  };
}

export function declineSave(
  state: DraftState,
  action: Extract<Action, { type: "DECLINE_SAVE" }>,
): DraftState {
  if (!state.pendingPrompt || state.pendingPrompt.kind !== "save") return state;
  const { reactingTeamIndex } = state.pendingPrompt;
  const reactingTeam = state.teams[reactingTeamIndex];

  const logEntry = buildReactionLogEntry(
    state.debugLog.length,
    "DECLINE_SAVE",
    reactingTeam.lastAvailableRound,
    reactingTeamIndex,
    null,
    action.aiContext,
  );
  const debugLog = [...state.debugLog, logEntry];

  return {
    ...state,
    debugLog,
    ...resolveReaction(state, state.teams, advanceCursor),
  };
}
