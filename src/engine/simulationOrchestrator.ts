import type { Action, DraftState, LogEntry, Player, Team } from "../types";
import { TOTAL_ROUNDS } from "../constants";
import {
  aiPickPlayerWithNoise,
  bestByAdp,
  computeExpectedAdp,
  computeSaveTarget,
  computeSaveTargetWithMistake,
  shouldPullback,
} from "./aiSimulator";
import {
  advanceCursor,
  teamHasOpenNormalSlot,
  totalPicksFilled,
} from "./pickReducer";

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

/** Build the `debugLog` entry for a team skipped by `ADVANCE_SIMULATION`
 *  because it has no open normal slot at the landing round. */
function buildSkipLogEntry(
  seq: number,
  round: number,
  teamIndex: number,
): LogEntry {
  return { seq, type: "SKIP_TURN", round, teamIndex, reason: "no-open-slot" };
}

// ── Orchestration ────────────────────────────────────────────────────────

/** Drive the `ADVANCE_SIMULATION` decision tree: resolve any pending AI
 *  reaction (save/pullback/decline), skip teams with no open normal slot,
 *  and otherwise let the AI make its own-turn pick. Synthesizes `Action`
 *  values and dispatches them back through `draftEngine`, the exact same
 *  public action surface a human's UI dispatches through — this module
 *  never calls the other reducers' functions directly. */
export function advanceSimulation(
  state: DraftState,
  draftEngine: (state: DraftState, action: Action) => DraftState,
): DraftState {
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
  // franchise/save/pullback; a normal pick would throw or overwrite). Uses
  // `advanceCursor`, the single skip-a-full-team primitive shared with the
  // post-pick cursor advance in `pickReducer.ts`.
  const currentTeam = state.teams[teamIndex];
  if (!teamHasOpenNormalSlot(currentTeam, state.currentPick.round)) {
    // The current team is always the first skip; `advanceCursor`'s `onSkip`
    // reports any further teams it passes over while searching for a
    // landing spot, so every skipped turn in this single
    // `ADVANCE_SIMULATION` call gets its own chronologically-ordered entry.
    const skipped: { round: number; teamIndex: number }[] = [
      { round: state.currentPick.round, teamIndex },
    ];
    const next = advanceCursor(
      state.currentPick.round,
      teamIndex,
      state.teams,
      (round, teamIndex) => skipped.push({ round, teamIndex }),
    );
    const debugLog = [
      ...state.debugLog,
      ...skipped.map((s, i) =>
        buildSkipLogEntry(state.debugLog.length + i, s.round, s.teamIndex),
      ),
    ];
    if (!next)
      return {
        ...state,
        debugLog,
        isDraftComplete:
          totalPicksFilled(state.teams) === state.teams.length * TOTAL_ROUNDS,
      };
    return draftEngine(
      { ...state, debugLog, currentPick: next },
      { type: "ADVANCE_SIMULATION" },
    );
  }

  const result = aiPickPlayerWithNoise(state.availablePool);
  if (!result) return state;
  const optimalPlayer = bestByAdp(state.availablePool);
  return draftEngine(state, {
    type: "PICK_PLAYER",
    player: result.player,
    aiContext: { optimalPlayer, noise: result.noise },
  });
}
