import type React from 'react'
import type { DraftState, PickRecord } from './types'
import { buildCsvRows, toCsvString } from './export/exportRosters'

// ── Constants ──────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 16

// ── Slot label config ──────────────────────────────────────────────────────

const SLOT_LABELS: Partial<Record<PickRecord['pickType'], React.ReactNode>> = {
  franchise: <span className="summary-badge summary-badge--fp">★ Franchise</span>,
  save:      <span className="summary-badge summary-badge--save">💾 Saved</span>,
  pullback:  <span className="summary-badge summary-badge--pb">↩ Pullback</span>,
}

// ── SummaryScreen ──────────────────────────────────────────────────────────

interface SummaryScreenProps {
  state: DraftState
  onBackToBoard: () => void
}

export default function SummaryScreen({ state, onBackToBoard }: SummaryScreenProps) {
  const { teams, pickHistory } = state
  const csvRows = buildCsvRows(teams, pickHistory)

  function handleExport() {
    const csv = toCsvString(csvRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'epl-draft-results.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  // Build a cellTypeMap for slot labels: (teamIndex, round) → pickType
  const typeMap = new Map<string, PickRecord['pickType']>()
  for (const rec of pickHistory) {
    typeMap.set(`${rec.teamIndex}-${rec.round}`, rec.pickType)
  }
  // Franchise pre-fills aren't in pickHistory
  for (let ti = 0; ti < teams.length; ti++) {
    const team = teams[ti]!
    if (team.franchisePlayer && team.roster[TOTAL_ROUNDS]?.id === team.franchisePlayer.id) {
      const key = `${ti}-${TOTAL_ROUNDS}`
      if (!typeMap.has(key)) typeMap.set(key, 'franchise')
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>EPL Mock Drafter</h1>
        <span className="status-badge">✅ Draft Complete</span>
        <div className="summary-header-actions">
          <button className="btn-secondary" onClick={onBackToBoard}>
            📋 View Board
          </button>
          <button className="btn-primary" onClick={handleExport}>
            ⬇ Export CSV
          </button>
        </div>
      </header>

      <div className="summary-body">
        <div className="summary-teams">
          {teams.map((team, ti) => (
            <div key={ti} className="summary-card">
              <div className="summary-card-header">{team.name}</div>
              <ol className="summary-roster" start={1}>
                {Array.from({ length: TOTAL_ROUNDS }, (_, ri) => {
                  const round = ri + 1
                  const player = team.roster[round]
                  const cellType = typeMap.get(`${ti}-${round}`)
                  const badge = cellType ? SLOT_LABELS[cellType] : null

                  return (
                    <li key={round} className={`summary-slot${cellType ? ` summary-slot--${cellType}` : ''}`}>
                      <span className="summary-round">{round}</span>
                      {player ? (
                        <span className="summary-player">
                          <span className="pos">{player.position}</span>
                          <span className="summary-name">{player.name}</span>
                          {badge}
                        </span>
                      ) : (
                        <span className="summary-empty">—</span>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
