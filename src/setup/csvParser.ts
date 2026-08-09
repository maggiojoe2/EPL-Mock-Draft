import Papa from 'papaparse'
import type { Player } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface RosterRow {
  playerName: string
  franchiseEligible: boolean
  previouslySaved: boolean
}

/** Map from team name → that team's previous-year roster rows. */
export type RosterImport = Map<string, RosterRow[]>

// ── Helpers ────────────────────────────────────────────────────────────────

/** Derive a stable, human-readable player ID from name + position. */
export function playerIdFromNamePos(name: string, position: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug(name)}-${slug(position)}`
}

function parseBool(value: string | undefined): boolean {
  if (value === undefined) return false
  const v = value.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

// ── parsePlayerPoolCsv ─────────────────────────────────────────────────────

/**
 * Parse a FantasyPros-style player pool CSV.
 * Expected columns: name, position, nfl_team, adp
 */
export function parsePlayerPoolCsv(csvText: string): Player[] {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  return data.flatMap(row => {
    const name = row['name']?.trim() ?? ''
    const position = row['position']?.trim() ?? ''
    const nflTeam = row['nfl_team']?.trim() ?? ''
    const adpRaw = row['adp']?.trim() ?? ''

    if (!name || !position) return []

    const adp = adpRaw !== '' ? Number(adpRaw) : NaN

    return [{
      id: playerIdFromNamePos(name, position),
      name,
      position,
      nflTeam,
      adp: Number.isFinite(adp) ? adp : 9999,
    }]
  })
}

// ── parseRosterCsv ──────────────────────────────────────────────────────────

/**
 * Parse a team roster CSV.
 * Expected columns: team_name, player_name, franchise_eligible, previously_saved
 * Returns a Map keyed by team name.
 */
export function parseRosterCsv(csvText: string): RosterImport {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  const result: RosterImport = new Map()

  for (const row of data) {
    const teamName = row['team_name']?.trim() ?? ''
    const playerName = row['player_name']?.trim() ?? ''
    if (!teamName || !playerName) continue

    const entry: RosterRow = {
      playerName,
      franchiseEligible: parseBool(row['franchise_eligible']),
      previouslySaved: parseBool(row['previously_saved']),
    }

    const existing = result.get(teamName)
    if (existing) {
      existing.push(entry)
    } else {
      result.set(teamName, [entry])
    }
  }

  return result
}
