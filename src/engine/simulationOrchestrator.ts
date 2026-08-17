import type {
  Action,
  DraftState,
  Player,
  ReactionAiContext,
  SaveTargetPurpose,
  Team,
} from "../types";
import { TOTAL_ROUNDS } from "../constants";
import {
  aiPickPlayerWithNoise,
  bestByAdp,
  computeExpectedAdp,
  computePullbackStepDecision,
  computeSaveDecision,
  computeSaveTarget,
} from "./aiSimulator";
import {
  advanceCursor,
  teamHasOpenNormalSlot,
  totalPicksFilled,
} from "./pickReducer";
import { buildSaveTargetLogEntry } from "./saveTargetLogEntry";
import { buildSkipLogEntry } from "./skipLogEntry";

// ── Pure helpers ───────────────────────────────────────────────────────────

/** A pullback prompt's full evaluation: the actual (mistake-affected)
 *  candidate to pull back, the deterministic (no-mistake) candidate that
 *  would have been chosen, and whether any mistake roll fired while
 *  evaluating candidates in order — independent of whether that roll ended
 *  up changing the outcome. */
export interface PullbackEvaluation {
  chosen: Player | null;
  optimal: Player | null;
  mistakeFired: boolean;
  /** The team's current save target, excluded from the candidates below —
   *  surfaced (rather than left as an internal-only computation) so the
   *  caller can log this `computeSaveTarget` call independently of the
   *  chosen/optimal pullback outcome it fed into. */
  saveTarget: Player | null;
}

/** Evaluates the pullback candidates (options are ADP-sorted, best first)
 *  against the round-cost value comparison, skipping the team's current save
 *  target — that player is handled entirely by the save branch and never
 *  independently evaluated for pullback in the same decision. `round` is the
 *  team's `lastAvailableRound` at the moment of the decision: the slot a
 *  pullback would consume. `chosen`/`optimal` are null when no candidate
 *  clears the bar (mistake-affected / deterministic, respectively). */
function evaluatePullbackDecision(
  options: Player[],
  team: Team,
  teamPositionInOrder: number,
  round: number,
  teamCount: number,
): PullbackEvaluation {
  const saveTarget = computeSaveTarget(team, team.franchisePlayer);
  const expectedAdp = computeExpectedAdp(round, teamPositionInOrder, teamCount);
  const candidates = options.filter((c) => c.id !== saveTarget?.id);

  let chosen: Player | null = null;
  let mistakeFired = false;
  for (const candidate of candidates) {
    const step = computePullbackStepDecision(candidate.adp, expectedAdp);
    if (step.mistakeFired) mistakeFired = true;
    if (step.result) {
      chosen = candidate;
      break;
    }
  }

  const optimal = candidates.find((c) => c.adp < expectedAdp) ?? null;

  return { chosen, optimal, mistakeFired, saveTarget };
}

/** Appends a `SAVE_TARGET_COMPUTED` entry onto `state.debugLog`, returning
 *  the updated state to dispatch through. Shared by every recompute site in
 *  `advanceSimulation` — AI save-prompt resolution and both pullback
 *  evaluations (the save-decline fallback and the standalone pullback
 *  prompt) — so the entry shape and round/team accounting stay identical
 *  regardless of why the target was recomputed. */
function logSaveTarget(
  state: DraftState,
  reactingTeamIndex: number,
  round: number,
  purpose: SaveTargetPurpose,
  target: Player | null,
): DraftState {
  const entry = buildSaveTargetLogEntry(
    state.debugLog.length,
    round,
    reactingTeamIndex,
    purpose,
    target,
  );
  return { ...state, debugLog: [...state.debugLog, entry] };
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
      const saveDecision = computeSaveDecision(
        reactingTeam,
        reactingTeam.franchisePlayer,
      );
      // Logged in its own entry, independent of what INVOKE_SAVE/
      // DECLINE_SAVE ends up recording — this narrates the save-target
      // recomputation itself, not just its effect on the reaction outcome.
      const stateAfterSaveTargetLog = logSaveTarget(
        state,
        prompt.reactingTeamIndex,
        reactingTeam.lastAvailableRound,
        "save-decision",
        saveDecision.target,
      );
      // The deterministic (no-mistake) comparison point for the log — kept
      // separate from `saveDecision.target` so a mistake that fires but
      // lands on the same target is still visible as "mistake fired".
      const optimalSaveTarget = computeSaveTarget(
        reactingTeam,
        reactingTeam.franchisePlayer,
      );
      const saveAiContext: ReactionAiContext = {
        optimalOutcome: optimalSaveTarget,
        mistakeFired: saveDecision.mistakeFired,
      };
      if (saveDecision.target && saveDecision.target.id === prompt.player.id) {
        return draftEngine(stateAfterSaveTargetLog, {
          type: "INVOKE_SAVE",
          player: prompt.player,
          aiContext: saveAiContext,
        });
      }
      // Save declined — fall back to a value-based pullback evaluation
      // before giving up entirely.
      const pullbackEval = evaluatePullbackDecision(
        prompt.pullbackOptions,
        reactingTeam,
        prompt.reactingTeamIndex + 1,
        reactingTeam.lastAvailableRound,
        state.teams.length,
      );
      const stateAfterPullbackLog = logSaveTarget(
        stateAfterSaveTargetLog,
        prompt.reactingTeamIndex,
        reactingTeam.lastAvailableRound,
        "pullback-exclusion",
        pullbackEval.saveTarget,
      );
      if (pullbackEval.chosen) {
        return draftEngine(stateAfterPullbackLog, {
          type: "INVOKE_PULLBACK",
          pullbackPlayer: pullbackEval.chosen,
          aiContext: {
            optimalOutcome: pullbackEval.optimal,
            mistakeFired: pullbackEval.mistakeFired,
          },
        });
      }
      return draftEngine(stateAfterPullbackLog, {
        type: "DECLINE_SAVE",
        aiContext: saveAiContext,
      });
    }
    // pullback
    const pullbackEval = evaluatePullbackDecision(
      prompt.pullbackOptions,
      reactingTeam,
      prompt.reactingTeamIndex + 1,
      reactingTeam.lastAvailableRound,
      state.teams.length,
    );
    const stateAfterPullbackLog = logSaveTarget(
      state,
      prompt.reactingTeamIndex,
      reactingTeam.lastAvailableRound,
      "pullback-exclusion",
      pullbackEval.saveTarget,
    );
    const pullbackAiContext: ReactionAiContext = {
      optimalOutcome: pullbackEval.optimal,
      mistakeFired: pullbackEval.mistakeFired,
    };
    if (pullbackEval.chosen) {
      return draftEngine(stateAfterPullbackLog, {
        type: "INVOKE_PULLBACK",
        pullbackPlayer: pullbackEval.chosen,
        aiContext: pullbackAiContext,
      });
    }
    return draftEngine(stateAfterPullbackLog, {
      type: "DECLINE_PULLBACK",
      aiContext: pullbackAiContext,
    });
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
