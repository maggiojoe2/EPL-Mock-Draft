import type { Action, DraftState, PickRecord, Team } from "../types";
import { advanceCursor, placeInRoster, removeFromPool } from "./pickReducer";
import { resolveReaction } from "./reactionQueue";
import { buildReactionLogEntry } from "./reactionLogEntry";

// ── Pullback resolution ─────────────────────────────────────────────────

/** A pullback leaves the original pick standing: the player fills the
 *  reacting team's back slot and `lastAvailableRound` decrements — unlike a
 *  save, no prior pick is retracted. Reachable from either prompt kind: a
 *  plain pullback prompt, or a save prompt where the team is choosing to
 *  pull back instead of saving. */
export function invokePullback(
  state: DraftState,
  action: Extract<Action, { type: "INVOKE_PULLBACK" }>,
): DraftState {
  if (
    !state.pendingPrompt ||
    (state.pendingPrompt.kind !== "pullback" &&
      state.pendingPrompt.kind !== "save")
  ) {
    return state;
  }
  const { reactingTeamIndex } = state.pendingPrompt;
  const { pullbackPlayer } = action;

  const reactingTeam = state.teams[reactingTeamIndex];
  const targetRound = reactingTeam.lastAvailableRound;

  const updatedTeam: Team = {
    ...placeInRoster(reactingTeam, targetRound, pullbackPlayer),
    lastAvailableRound: targetRound - 1,
  };
  const teams = state.teams.map((t, i) =>
    i === reactingTeamIndex ? updatedTeam : t,
  );
  const availablePool = removeFromPool(state.availablePool, pullbackPlayer);

  const record: PickRecord = {
    round: targetRound,
    teamIndex: reactingTeamIndex,
    player: pullbackPlayer,
    pickType: "pullback",
  };
  const pickHistory = [...state.pickHistory, record];

  const logEntry = buildReactionLogEntry(
    state.debugLog.length,
    "INVOKE_PULLBACK",
    targetRound,
    reactingTeamIndex,
    pullbackPlayer,
    action.aiContext,
  );
  const debugLog = [...state.debugLog, logEntry];

  return {
    ...state,
    teams,
    availablePool,
    pickHistory,
    ...resolveReaction({ ...state, debugLog }, teams, advanceCursor),
  };
}

export function declinePullback(
  state: DraftState,
  action: Extract<Action, { type: "DECLINE_PULLBACK" }>,
): DraftState {
  if (!state.pendingPrompt || state.pendingPrompt.kind !== "pullback")
    return state;
  const { reactingTeamIndex } = state.pendingPrompt;
  const reactingTeam = state.teams[reactingTeamIndex];

  const logEntry = buildReactionLogEntry(
    state.debugLog.length,
    "DECLINE_PULLBACK",
    reactingTeam.lastAvailableRound,
    reactingTeamIndex,
    null,
    action.aiContext,
  );
  const debugLog = [...state.debugLog, logEntry];

  return {
    ...state,
    ...resolveReaction({ ...state, debugLog }, state.teams, advanceCursor),
  };
}
