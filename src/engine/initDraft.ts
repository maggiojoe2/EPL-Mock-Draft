import type { DraftMode, DraftState, Player, Team } from "../types";

/** Build the initial DraftState for a new draft session. */
export function initDraft(params: {
  mode: DraftMode;
  userTeamIndex: number | null;
  teams: Team[];
  availablePool: Player[];
}): DraftState {
  const { mode, userTeamIndex, availablePool } = params;

  // Pre-place franchise players in round 16 and remove from pool.
  // Sort ascending by ADP so the best available players appear at the top.
  let pool = [...availablePool].sort((a, b) => a.adp - b.adp);
  const teams = params.teams.map((team) => {
    const lastAvailableRound = team.franchisePlayer ? 15 : 16;
    if (!team.franchisePlayer) return { ...team, lastAvailableRound };
    pool = pool.filter((p) => p.id !== team.franchisePlayer!.id);
    const roster = [...team.roster];
    roster[16] = team.franchisePlayer;
    return { ...team, roster, lastAvailableRound };
  });

  return {
    mode,
    userTeamIndex,
    teams,
    availablePool: pool,
    currentPick: { round: 1, teamIndex: 0 },
    pickHistory: [],
    pendingPrompt: null,
    isDraftComplete: false,
    reactionQueue: [],
    debugLog: [],
  };
}
