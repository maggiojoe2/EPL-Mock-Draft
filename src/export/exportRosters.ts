import type { PickRecord, Team } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CsvRow {
  team_name: string
  round: number
  player_name: string
  position: string
  nfl_team: string
  slot_type: 'normal' | 'franchise' | 'save' | 'pullback'
}

// ── buildCsvRows ───────────────────────────────────────────────────────────

const FRANCHISE_ROUND = 16

/**
 * Build one CsvRow per filled roster slot across all teams.
 *
 * Slot type resolution:
 *  - Round 16 player matching the team's franchisePlayer → 'franchise'
 *  - A record in pickHistory for that (teamIndex, round) → pickHistory's pickType
 *  - Otherwise → 'normal' (fallback for any slot not in history)
 *
 * Rows are ordered by round ascending, then by teamIndex ascending.
 */
export function buildCsvRows(teams: Team[], pickHistory: PickRecord[]): CsvRow[] {
  // Build a fast lookup: (teamIndex, round) → pickType
  const typeMap = new Map<string, PickRecord['pickType']>()
  for (const rec of pickHistory) {
    typeMap.set(`${rec.teamIndex}-${rec.round}`, rec.pickType)
  }

  const rows: CsvRow[] = []

  // Iterate round-major so output is ordered by round then team.
  for (let round = 1; round <= FRANCHISE_ROUND; round++) {
    for (let ti = 0; ti < teams.length; ti++) {
      const team = teams[ti]!
      const player = team.roster[round]
      if (!player) continue

      // Determine slot type.
      let slot_type: CsvRow['slot_type']
      if (
        round === FRANCHISE_ROUND &&
        team.franchisePlayer !== null &&
        team.franchisePlayer.id === player.id
      ) {
        slot_type = 'franchise'
      } else {
        slot_type = (typeMap.get(`${ti}-${round}`) as CsvRow['slot_type']) ?? 'normal'
      }

      rows.push({
        team_name: team.name,
        round,
        player_name: player.name,
        position: player.position,
        nfl_team: player.nflTeam,
        slot_type,
      })
    }
  }

  return rows
}

// ── toCsvString ────────────────────────────────────────────────────────────

const HEADERS: (keyof CsvRow)[] = [
  'team_name',
  'round',
  'player_name',
  'position',
  'nfl_team',
  'slot_type',
]

/** Wrap a value in quotes if it contains a comma, double-quote, or newline. */
function escapeCsvValue(value: string | number): string {
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Serialize an array of CsvRow objects to a CSV string with a header row. */
export function toCsvString(rows: CsvRow[]): string {
  const header = HEADERS.join(',')
  const dataLines = rows.map(row =>
    HEADERS.map(key => escapeCsvValue(row[key])).join(','),
  )
  return [header, ...dataLines].join('\n') + '\n'
}
