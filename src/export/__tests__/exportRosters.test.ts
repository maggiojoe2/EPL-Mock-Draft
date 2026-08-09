import { describe, it, expect } from 'vitest'
import { buildCsvRows, toCsvString } from '../exportRosters'
import type { PickRecord, Team, Player } from '../../types'

// ── helpers ────────────────────────────────────────────────────────────────

function makePlayer(id: string, name: string, position: string, nflTeam: string): Player {
  return { id, name, position, nflTeam, adp: 1 }
}

function makeRoster(slots: (Player | null)[]): (Player | null)[] {
  // index 0 unused; slots[i] is round i (1-indexed)
  return [null, ...slots]
}

function makeTeam(name: string, roster: (Player | null)[], franchisePlayer: Player | null = null): Team {
  return {
    name,
    roster,
    previousYearRoster: [],
    saveHistory: new Set(),
    franchisePlayer,
    franchiseEligibleIds: new Set(),
    saveUsedThisDraft: false,
    lastAvailableRound: 15,
  }
}

// ── buildCsvRows ───────────────────────────────────────────────────────────

describe('buildCsvRows', () => {
  it('returns one row per filled slot per team', () => {
    const p1 = makePlayer('p1', 'Alice', 'QB', 'KC')
    const p2 = makePlayer('p2', 'Bob', 'RB', 'DAL')

    // Team with 2 rounds filled (out of 16 possible; rest null)
    const roster = makeRoster([p1, p2, ...Array(14).fill(null)])
    const team = makeTeam('Eagles', roster)

    const pickHistory: PickRecord[] = [
      { round: 1, teamIndex: 0, player: p1, pickType: 'normal' },
      { round: 2, teamIndex: 0, player: p2, pickType: 'normal' },
    ]

    const rows = buildCsvRows([team], pickHistory)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      team_name: 'Eagles',
      round: 1,
      player_name: 'Alice',
      position: 'QB',
      nfl_team: 'KC',
      slot_type: 'normal',
    })
    expect(rows[1]).toEqual({
      team_name: 'Eagles',
      round: 2,
      player_name: 'Bob',
      position: 'RB',
      nfl_team: 'DAL',
      slot_type: 'normal',
    })
  })

  it('labels franchise (round 16) slots as "franchise"', () => {
    const fp = makePlayer('fp1', 'CJ Stroud', 'QB', 'HOU')

    const roster = makeRoster([...Array(15).fill(null), fp])
    const team = makeTeam('Texans', roster, fp)

    // Franchise placement is NOT in pickHistory (pre-filled by initDraft)
    const rows = buildCsvRows([team], [])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ slot_type: 'franchise', player_name: 'CJ Stroud', round: 16 })
  })

  it('labels save slots as "save"', () => {
    const p = makePlayer('s1', 'Saved Sam', 'WR', 'PHI')

    const roster = makeRoster([...Array(14).fill(null), p, null])
    const team = makeTeam('Birds', roster)

    const pickHistory: PickRecord[] = [
      { round: 15, teamIndex: 0, player: p, pickType: 'save' },
    ]

    const rows = buildCsvRows([team], pickHistory)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ slot_type: 'save', round: 15 })
  })

  it('labels pullback slots as "pullback"', () => {
    const p = makePlayer('pb1', 'Pulled Pete', 'TE', 'LAR')

    const roster = makeRoster([...Array(14).fill(null), p, null])
    const team = makeTeam('Rams', roster)

    const pickHistory: PickRecord[] = [
      { round: 15, teamIndex: 0, player: p, pickType: 'pullback' },
    ]

    const rows = buildCsvRows([team], pickHistory)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ slot_type: 'pullback' })
  })

  it('omits unfilled slots', () => {
    // Only round 1 is filled, rounds 2–16 are null
    const p = makePlayer('x1', 'X', 'K', 'GB')
    const roster = makeRoster([p, ...Array(15).fill(null)])
    const team = makeTeam('Packers', roster)

    const pickHistory: PickRecord[] = [{ round: 1, teamIndex: 0, player: p, pickType: 'normal' }]

    const rows = buildCsvRows([team], pickHistory)
    expect(rows).toHaveLength(1)
  })

  it('handles multiple teams and assigns correct team names', () => {
    const p1 = makePlayer('a1', 'Team A Player', 'RB', 'NE')
    const p2 = makePlayer('b1', 'Team B Player', 'WR', 'MIA')

    const rosterA = makeRoster([p1, ...Array(15).fill(null)])
    const rosterB = makeRoster([p2, ...Array(15).fill(null)])

    const teamA = makeTeam('Patriots', rosterA)
    const teamB = makeTeam('Dolphins', rosterB)

    const pickHistory: PickRecord[] = [
      { round: 1, teamIndex: 0, player: p1, pickType: 'normal' },
      { round: 1, teamIndex: 1, player: p2, pickType: 'normal' },
    ]

    const rows = buildCsvRows([teamA, teamB], pickHistory)

    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.player_name === 'Team A Player')?.team_name).toBe('Patriots')
    expect(rows.find(r => r.player_name === 'Team B Player')?.team_name).toBe('Dolphins')
  })

  it('orders rows by round then teamIndex', () => {
    const p1 = makePlayer('r1', 'R1', 'QB', 'SF')
    const p2 = makePlayer('r2', 'R2', 'QB', 'SF')
    const p3 = makePlayer('r3', 'R3', 'QB', 'SF')

    const rosterA = makeRoster([p1, p3, ...Array(14).fill(null)])
    const rosterB = makeRoster([p2, ...Array(15).fill(null)])
    const teamA = makeTeam('49ers A', rosterA)
    const teamB = makeTeam('49ers B', rosterB)

    const pickHistory: PickRecord[] = [
      { round: 1, teamIndex: 0, player: p1, pickType: 'normal' },
      { round: 1, teamIndex: 1, player: p2, pickType: 'normal' },
      { round: 2, teamIndex: 0, player: p3, pickType: 'normal' },
    ]

    const rows = buildCsvRows([teamA, teamB], pickHistory)

    expect(rows.map(r => r.player_name)).toEqual(['R1', 'R2', 'R3'])
  })
})

// ── toCsvString ────────────────────────────────────────────────────────────

describe('toCsvString', () => {
  it('produces a header row plus one data row per entry', () => {
    const rows = [
      {
        team_name: 'Eagles',
        round: 1,
        player_name: 'Alice',
        position: 'QB',
        nfl_team: 'KC',
        slot_type: 'normal' as const,
      },
    ]

    const csv = toCsvString(rows)
    const lines = csv.trim().split('\n')

    expect(lines[0]).toBe('team_name,round,player_name,position,nfl_team,slot_type')
    expect(lines[1]).toBe('Eagles,1,Alice,QB,KC,normal')
  })

  it('escapes player names containing commas', () => {
    const rows = [
      {
        team_name: 'Eagles',
        round: 1,
        player_name: 'Last, First',
        position: 'QB',
        nfl_team: 'KC',
        slot_type: 'normal' as const,
      },
    ]

    const csv = toCsvString(rows)
    expect(csv).toContain('"Last, First"')
  })

  it('returns only the header when given an empty array', () => {
    const csv = toCsvString([])
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('team_name,round,player_name,position,nfl_team,slot_type')
  })
})
