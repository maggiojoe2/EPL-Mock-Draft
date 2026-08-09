import type { Player, Team } from '../types'
import { ROSTER_SLOTS } from '../constants'
import type { RosterImport } from './csvParser'

// ── buildTeamsFromImport ───────────────────────────────────────────────────

/**
 * Build a Team[] from the imported roster map and the player pool.
 *
 * Roster players are matched to pool players by name (case-insensitive).
 * Unmatched names (retired/absent players) are silently skipped.
 *
 * @param rosterImport  Result of parseRosterCsv — team name → roster rows
 * @param playerPool    Full player pool (IDs are authoritative)
 */
export function buildTeamsFromImport(
  rosterImport: RosterImport,
  playerPool: Player[],
): Team[] {
  // Build a fast lookup: normalised name → Player
  const poolByName = new Map<string, Player>(
    playerPool.map(p => [p.name.toLowerCase(), p]),
  )

  return Array.from(rosterImport.entries()).map(([teamName, rows]) => {
    const previousYearRoster: Player[] = []
    const saveHistory = new Set<string>()
    const franchiseEligibleIds = new Set<string>()

    for (const row of rows) {
      const poolPlayer = poolByName.get(row.playerName.toLowerCase())
      if (!poolPlayer) continue // not in active pool; skip gracefully

      previousYearRoster.push(poolPlayer)
      if (row.previouslySaved) saveHistory.add(poolPlayer.id)
      if (row.franchiseEligible) franchiseEligibleIds.add(poolPlayer.id)
    }

    const team: Team = {
      name: teamName,
      roster: Array.from({ length: ROSTER_SLOTS }, () => null),
      previousYearRoster,
      saveHistory,
      franchisePlayer: null,
      franchiseEligibleIds,
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    }

    return team
  })
}

// ── autoSelectFranchise ────────────────────────────────────────────────────

/**
 * Auto-select franchise players for all teams that don't already have one.
 * The user's own team (userTeamIndex) is skipped — they declare their own.
 * Teams with no franchise-eligible previous-year players keep franchisePlayer = null.
 */
export function autoSelectFranchise(
  teams: Team[],
  userTeamIndex: number | null,
): Team[] {
  return teams.map((team, i) => {
    // Skip user team and teams that already have a franchise player set.
    if (i === userTeamIndex || team.franchisePlayer !== null) return team

    const eligible = team.previousYearRoster.filter(p =>
      team.franchiseEligibleIds.has(p.id),
    )

    if (eligible.length === 0) return team

    // Random selection from eligible players
    const pick = eligible[Math.floor(Math.random() * eligible.length)]!
    return { ...team, franchisePlayer: pick }
  })
}
