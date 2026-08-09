import type { DraftState, Player, Team } from '../types'

export function makePlayer(index: number): Player {
  return {
    id: `player-${index}`,
    name: `Player ${index}`,
    position: 'RB',
    nflTeam: 'NYG',
    adp: index + 1,
  }
}

export function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    name: overrides.name ?? 'Team',
    roster: overrides.roster ?? Array.from({ length: 17 }, () => null),
    previousYearRoster: overrides.previousYearRoster ?? [],
    saveHistory: overrides.saveHistory ?? new Set(),
    franchisePlayer: overrides.franchisePlayer ?? null,
    saveUsedThisDraft: overrides.saveUsedThisDraft ?? false,
    lastAvailableRound: overrides.lastAvailableRound ?? 15,
  }
}

/** Build a default DraftState with 12 teams and 200 available players. */
export function makeDraftState(overrides: Partial<DraftState> = {}): DraftState {
  const availablePool =
    overrides.availablePool ??
    Array.from({ length: 200 }, (_, i) => makePlayer(i))

  const teams =
    overrides.teams ??
    Array.from({ length: 12 }, (_, i) =>
      makeTeam({ name: `Team ${i + 1}` }),
    )

  return {
    mode: 'practice',
    userTeamIndex: 0,
    teams,
    availablePool,
    currentPick: { round: 1, teamIndex: 0 },
    pickHistory: [],
    pendingPrompt: null,
    isDraftComplete: false,
    reactionQueue: [],
    ...overrides,
  }
}
