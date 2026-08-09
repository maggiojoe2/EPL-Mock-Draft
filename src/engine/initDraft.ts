import type { DraftState, Player, Team } from '../types'

/** Build the initial DraftState for a new draft session. */
export function initDraft(params: {
  mode: 'practice' | 'watch'
  userTeamIndex: number | null
  teams: Team[]
  availablePool: Player[]
}): DraftState {
  const { mode, userTeamIndex, availablePool } = params

  // Pre-place franchise players in round 16 and remove from pool
  let pool = [...availablePool]
  const teams = params.teams.map(team => {
    if (!team.franchisePlayer) return team
    pool = pool.filter(p => p.id !== team.franchisePlayer!.id)
    const roster = [...team.roster]
    roster[16] = team.franchisePlayer
    return { ...team, roster }
  })

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
  }
}

// ── Demo data ──────────────────────────────────────────────────────────────

/** Generate a dummy set of players for the vertical-slice demo. */
export function makeDemoPlayers(): Player[] {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  const nflTeams = ['KC', 'SF', 'DAL', 'PHI', 'BUF', 'MIA', 'BAL', 'CIN', 'LAR', 'SEA', 'MIN', 'GB']
  const names = [
    'Patrick Mahomes', 'Josh Allen', 'Lamar Jackson', 'Jalen Hurts', 'Joe Burrow',
    'Christian McCaffrey', 'Breece Hall', "D'Andre Swift", 'Saquon Barkley', 'Derrick Henry',
    'CeeDee Lamb', 'Justin Jefferson', 'Tyreek Hill', 'Davante Adams', 'Stefon Diggs',
    'Travis Kelce', 'Mark Andrews', 'TJ Hockenson', 'Sam LaPorta', 'Kyle Pitts',
    'Harrison Butker', 'Justin Tucker', 'Evan McPherson', 'Tyler Bass', 'Jake Elliott',
    'SF DEF', 'DAL DEF', 'BUF DEF', 'BAL DEF', 'NYJ DEF',
  ]

  const players: Player[] = []
  for (let i = 0; i < 200; i++) {
    players.push({
      id: `player-${i}`,
      name: names[i % names.length]! + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
      position: positions[i % positions.length]!,
      nflTeam: nflTeams[i % nflTeams.length]!,
      adp: i + 1,
    })
  }
  return players
}

/** Generate a dummy set of teams for the vertical-slice demo. */
export function makeDemoTeams(): Team[] {
  const names = [
    'The Iron Throne', 'Gridiron Gods', 'Blitz Kings', 'Red Zone Raiders',
    'End Zone Elites', 'Hail Mary Heroes', 'First Down Fury', 'Pocket Passers',
    'Screen Pass Kings', 'Gunslinger Gang', 'Touchdown Tyrants', 'Field Goal Factory',
  ]
  return names.map(name => ({
    name,
    roster: Array.from({ length: 17 }, () => null),
    previousYearRoster: [],
    saveHistory: new Set<string>(),
    franchisePlayer: null,
    franchiseEligibleIds: new Set<string>(),
    saveUsedThisDraft: false,
    lastAvailableRound: 15,
  }))
}
