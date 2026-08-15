import type { Action, DraftState, PickRecord, Player, Team } from "../types";
import { TOTAL_ROUNDS } from "../constants";
import {
  aiPickPlayer,
  computeExpectedAdp,
  computeSaveTarget,
  computeSaveTargetWithMistake,
  shouldPullback,
} from "./aiSimulator";
import {
  advanceCursor,
  nextNormalSlot,
  nextPick,
  placeInRoster,
  removeFromPool,
  teamHasOpenNormalSlot,
  totalPicksFilled,
} from "./pickReducer";
import { declinePullback, invokePullback } from "./pullbackReducer";
import { buildReactionQueue, resolveReaction } from "./reactionQueue";
import { declineSave, invokeSave } from "./saveReducer";

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Picks the first pullback candidate (options are ADP-sorted, best first)
 *  worth pulling back per the round-cost value comparison, skipping the
 *  team's current save target — that player is handled entirely by the save
 *  branch and never independently evaluated for pullback in the same
 *  decision. `round` is the team's `lastAvailableRound` at the moment of the
 *  decision: the slot a pullback would consume. Returns null when no
 *  candidate clears the bar. */
function selectPullbackCandidate(
  options: Player[],
  team: Team,
  teamPositionInOrder: number,
  round: number,
  teamCount: number,
): Player | null {
  const saveTarget = computeSaveTarget(team, team.franchisePlayer);
  const expectedAdp = computeExpectedAdp(round, teamPositionInOrder, teamCount);
  for (const candidate of options) {
    if (candidate.id === saveTarget?.id) continue;
    if (shouldPullback(candidate.adp, expectedAdp)) return candidate;
  }
  return null;
}

// ── Engine ─────────────────────────────────────────────────────────────────

export function draftEngine(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case "PICK_PLAYER": {
      const { player } = action;
      const { round, teamIndex } = state.currentPick;

      const pickingTeam = state.teams[teamIndex];

      // Slot for this normal pick: scan forward past any pre-filled slots
      // (saves or pullbacks placed there earlier in the draft).
      const targetRound = nextNormalSlot(pickingTeam, round);
      const updatedTeam = placeInRoster(pickingTeam, targetRound, player);
      const teams = state.teams.map((t, i) =>
        i === teamIndex ? updatedTeam : t,
      );

      const availablePool = removeFromPool(state.availablePool, player);

      const record: PickRecord = {
        round: targetRound,
        teamIndex,
        player,
        pickType: "normal",
      };
      const pickHistory = [...state.pickHistory, record];

      // Build any reaction prompts triggered by this pick
      const reactionQueue = buildReactionQueue(
        { ...state, teams, availablePool },
        player,
        teamIndex,
      );

      return {
        ...state,
        teams,
        availablePool,
        pickHistory,
        ...resolveReaction({ ...state, reactionQueue }, teams, advanceCursor),
      };
    }

    case "INVOKE_SAVE":
      return invokeSave(state);

    case "DECLINE_SAVE":
      return declineSave(state);

    case "INVOKE_PULLBACK":
      return invokePullback(state, action);

    case "DECLINE_PULLBACK":
      return declinePullback(state);

    case "ADVANCE_SIMULATION": {
      if (state.isDraftComplete) return state;

      if (state.pendingPrompt) {
        // Never auto-resolve a prompt the user must answer in practice mode.
        const isUserReaction =
          state.mode === "practice" &&
          state.userTeamIndex !== null &&
          state.pendingPrompt.reactingTeamIndex === state.userTeamIndex;
        if (isUserReaction) return state;

        // Resolve an AI team's reaction.
        const prompt = state.pendingPrompt;
        const reactingTeam = state.teams[prompt.reactingTeamIndex];
        if (prompt.kind === "save") {
          // Recomputed fresh (not cached) so it reflects the team's current
          // franchisePlayer and saveHistory rather than a value fixed at
          // draft start.
          const saveTarget = computeSaveTargetWithMistake(
            reactingTeam,
            reactingTeam.franchisePlayer,
          );
          if (saveTarget && saveTarget.id === prompt.player.id) {
            return draftEngine(state, {
              type: "INVOKE_SAVE",
              player: prompt.player,
            });
          }
          // Save declined — fall back to a value-based pullback evaluation
          // before giving up entirely.
          const pullbackTarget = selectPullbackCandidate(
            prompt.pullbackOptions,
            reactingTeam,
            prompt.reactingTeamIndex + 1,
            reactingTeam.lastAvailableRound,
            state.teams.length,
          );
          if (pullbackTarget) {
            return draftEngine(state, {
              type: "INVOKE_PULLBACK",
              pullbackPlayer: pullbackTarget,
            });
          }
          return draftEngine(state, { type: "DECLINE_SAVE" });
        }
        // pullback
        const pullbackTarget = selectPullbackCandidate(
          prompt.pullbackOptions,
          reactingTeam,
          prompt.reactingTeamIndex + 1,
          reactingTeam.lastAvailableRound,
          state.teams.length,
        );
        if (pullbackTarget) {
          return draftEngine(state, {
            type: "INVOKE_PULLBACK",
            pullbackPlayer: pullbackTarget,
          });
        }
        return draftEngine(state, { type: "DECLINE_PULLBACK" });
      }

      const { teamIndex } = state.currentPick;
      // Don't advance past the user's turn in practice mode.
      if (state.mode === "practice" && teamIndex === state.userTeamIndex)
        return state;

      // Skip teams with no open normal slots (their roster is already complete via
      // franchise/save/pullback; a normal pick would throw or overwrite).
      const currentTeam = state.teams[teamIndex];
      if (!teamHasOpenNormalSlot(currentTeam, state.currentPick.round)) {
        const next = nextPick(
          state.currentPick.round,
          teamIndex,
          state.teams.length,
        );
        if (!next)
          return {
            ...state,
            isDraftComplete:
              totalPicksFilled(state.teams) ===
              state.teams.length * TOTAL_ROUNDS,
          };
        return draftEngine(
          { ...state, currentPick: next },
          { type: "ADVANCE_SIMULATION" },
        );
      }

      const player = aiPickPlayer(state.availablePool);
      if (!player) return state;
      return draftEngine(state, { type: "PICK_PLAYER", player });
    }

    default:
      return state;
  }
}
