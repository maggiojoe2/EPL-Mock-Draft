import type { Action, DraftState, PickRecord, Player, Team } from "../types";
import {
  aiPickPlayer,
  computeExpectedAdp,
  computeSaveTarget,
  computeSaveTargetWithMistake,
  shouldPullback,
} from "./aiSimulator";
import { buildReactionQueue, resolveReaction } from "./reactionQueue";

const TOTAL_ROUNDS = 16;

// ── Pure helpers ───────────────────────────────────────────────────────────

function removeFromPool(pool: Player[], player: Player): Player[] {
  return pool.filter((p) => p.id !== player.id);
}

function placeInRoster(team: Team, round: number, player: Player | null): Team {
  const roster = [...team.roster];
  roster[round] = player;
  return { ...team, roster };
}

/** Return the next { round, teamIndex } after a pick, or null if draft is done. */
function nextPick(
  round: number,
  teamIndex: number,
  totalTeams: number,
): { round: number; teamIndex: number } | null {
  if (teamIndex < totalTeams - 1) {
    return { round, teamIndex: teamIndex + 1 };
  }
  if (round < TOTAL_ROUNDS) {
    return { round: round + 1, teamIndex: 0 };
  }
  return null; // draft over
}

/** Count how many roster slots (rounds 1–16) are filled across all teams. */
function totalPicksFilled(teams: Team[]): number {
  return teams.reduce((sum, team) => {
    return sum + team.roster.slice(1).filter((slot) => slot !== null).length;
  }, 0);
}

/** Return true when the team has at least one unfilled slot >= fromRound. */
function teamHasOpenNormalSlot(team: Team, fromRound: number): boolean {
  for (let r = fromRound; r <= TOTAL_ROUNDS; r++) {
    if (team.roster[r] === null) return true;
  }
  return false;
}

/** Advance the cursor via nextPick, skipping any team whose roster has no
 *  open normal slot at the landing round (e.g. a franchise team whose round-16
 *  slot is pre-filled and whose normal picks are already exhausted). Returns
 *  null once no team has any pick left to make — the draft is complete. */
function advanceCursor(
  round: number,
  teamIndex: number,
  teams: Team[],
): { round: number; teamIndex: number } | null {
  let next = nextPick(round, teamIndex, teams.length);
  while (next && !teamHasOpenNormalSlot(teams[next.teamIndex], next.round)) {
    next = nextPick(next.round, next.teamIndex, teams.length);
  }
  return next;
}

/** Return the first unfilled roster slot >= fromRound for the given team.
 *  Saves and pullbacks fill from the back; a normal pick must skip any such
 *  pre-filled slots so it never overwrites them. */
function nextNormalSlot(team: Team, fromRound: number): number {
  for (let r = fromRound; r <= TOTAL_ROUNDS; r++) {
    if (team.roster[r] === null) return r;
  }
  // Should never happen in a well-formed draft: the engine only reaches here
  // if the team's roster is already full, but the draft would be complete.
  throw new Error(
    `No open normal slot for team "${team.name}" starting at round ${fromRound}`,
  );
}

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

    case "INVOKE_SAVE": {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== "save")
        return state;
      const { pickingTeamIndex, reactingTeamIndex, player } =
        state.pendingPrompt;

      // A save blocks the original pick: remove the player from the picking team's
      // roster and strip the normal pick record from history.
      const pickingTeam = state.teams[pickingTeamIndex];
      const blockedRound = pickingTeam.roster.findIndex(
        (p) => p?.id === player.id,
      );
      const unblockedPickingTeam = placeInRoster(
        pickingTeam,
        blockedRound,
        null,
      );

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
        ...state.pickHistory.filter(
          (r) =>
            !(
              r.teamIndex === pickingTeamIndex &&
              r.player.id === player.id &&
              r.pickType === "normal"
            ),
        ),
        {
          round: targetRound,
          teamIndex: reactingTeamIndex,
          player,
          pickType: "save" as const,
        },
      ];

      // The save blocks the pick — cursor stays at the picking team's position
      // so they can pick again. Clear remaining reactions (they all referenced
      // the now-blocked pick).
      return {
        ...state,
        teams,
        pickHistory,
        pendingPrompt: null,
        reactionQueue: [],
        currentPick: state.currentPick, // unchanged — picker tries again
        isDraftComplete: false,
      };
    }

    case "DECLINE_SAVE": {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== "save")
        return state;

      return {
        ...state,
        ...resolveReaction(state, state.teams, advanceCursor),
      };
    }

    case "INVOKE_PULLBACK": {
      // Reachable from either prompt kind: a plain pullback prompt, or a save
      // prompt where the team is choosing to pull back instead of saving.
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

      return {
        ...state,
        teams,
        availablePool,
        pickHistory,
        ...resolveReaction(state, teams, advanceCursor),
      };
    }

    case "DECLINE_PULLBACK": {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== "pullback")
        return state;

      return {
        ...state,
        ...resolveReaction(state, state.teams, advanceCursor),
      };
    }

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
