import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { draftEngine } from './engine/draftEngine'
import SetupScreen from './setup/SetupScreen'
import type { DraftState, PickRecord, Player } from './types'
import './App.css'

// ── Constants ─────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 16

// ── App (router) ───────────────────────────────────────────────────────────

export default function App() {
  const [draftState, setDraftState] = useState<DraftState | null>(null)

  if (!draftState) {
    return <SetupScreen onDraftStart={setDraftState} />
  }

  return <DraftView initialState={draftState} />
}

// ── DraftView ──────────────────────────────────────────────────────────────

function DraftView({ initialState }: { initialState: DraftState }) {
  const [state, dispatch] = useReducer(
    (s: DraftState, a: Parameters<typeof draftEngine>[1]) => draftEngine(s, a),
    initialState,
  )
  const simulatingRef = useRef(false)

  const { teams, currentPick, availablePool, isDraftComplete, pendingPrompt, mode, userTeamIndex } = state

  // In practice mode, stop the AI clock when it's the user's turn to pick or
  // when the user's team has a pending reaction that needs a decision.
  const isUserTurn =
    mode === 'practice' && !pendingPrompt && currentPick.teamIndex === userTeamIndex

  const isUserReactionPending =
    mode === 'practice' &&
    pendingPrompt !== null &&
    pendingPrompt.reactingTeamIndex === userTeamIndex

  // Auto-advance AI turns via ADVANCE_SIMULATION (engine handles AI logic).
  useEffect(() => {
    if (isDraftComplete) { simulatingRef.current = false; return }
    if (isUserTurn || isUserReactionPending) { simulatingRef.current = false; return }

    simulatingRef.current = true
    // Watch mode uses a longer delay so picks are readable; practice mode stays snappy.
    const delay = mode === 'watch' ? 500 : 120
    const id = setTimeout(() => {
      if (simulatingRef.current) dispatch({ type: 'ADVANCE_SIMULATION' })
    }, delay)
    return () => clearTimeout(id)
  }, [state, isUserTurn, isUserReactionPending, isDraftComplete, mode])

  // Previous-year player IDs for the user's team (used to highlight pool entries).
  const prevYearPlayerIds = useMemo(() => {
    if (userTeamIndex === null) return new Set<string>()
    const userTeam = teams[userTeamIndex]
    if (!userTeam) return new Set<string>()
    return new Set(userTeam.previousYearRoster.map(p => p.id))
  }, [teams, userTeamIndex])

  // Build a map of cell types from pickHistory + franchise pre-fills.
  const cellTypeMap = useMemo(
    () => buildCellTypeMap(teams, state.pickHistory),
    [teams, state.pickHistory],
  )

  return (
    <div className="app">
      <header className="app-header">
        <h1>EPL Mock Drafter</h1>
        <span className="status-badge">
          {isDraftComplete
            ? '✅ Draft Complete'
            : isUserReactionPending
              ? `⚡ Reaction — ${teams[pendingPrompt!.reactingTeamIndex]!.name}`
              : isUserTurn
                ? `🎯 Your pick — Round ${currentPick.round}`
                : `⏳ Round ${currentPick.round} · ${teams[currentPick.teamIndex]!.name}`}
        </span>
      </header>

      {isUserReactionPending && (
        <ReactionModal
          prompt={pendingPrompt}
          teams={teams}
          onInvokeSave={(player) => dispatch({ type: 'INVOKE_SAVE', player })}
          onDeclineSave={() => dispatch({ type: 'DECLINE_SAVE' })}
          onInvokePullback={(player) => dispatch({ type: 'INVOKE_PULLBACK', pullbackPlayer: player })}
          onDeclinePullback={() => dispatch({ type: 'DECLINE_PULLBACK' })}
        />
      )}

      <div className="main-layout">
        <section className="board-section">
          <DraftBoard
            teams={teams}
            currentPick={currentPick}
            totalRounds={TOTAL_ROUNDS}
            isDraftComplete={isDraftComplete}
            cellTypeMap={cellTypeMap}
            userTeamIndex={userTeamIndex}
          />
        </section>

        {!isDraftComplete && (
          <section className="pool-section">
            <h2>Available Players</h2>
            <PlayerList
              players={availablePool}
              isUserTurn={isUserTurn}
              prevYearPlayerIds={prevYearPlayerIds}
              onPick={(player) => dispatch({ type: 'PICK_PLAYER', player })}
            />
          </section>
        )}
      </div>
    </div>
  )
}

// ── buildCellTypeMap ───────────────────────────────────────────────────────

/** Encode a board cell as a map key. One place to change if the schema changes. */
function cellKey(teamIndex: number, round: number): string {
  return `${teamIndex}-${round}`
}

/** Return a map of `cellKey(ti, round)` → pickType for all filled cells. */
function buildCellTypeMap(
  teams: DraftState['teams'],
  pickHistory: PickRecord[],
): Map<string, PickRecord['pickType']> {
  const map = new Map<string, PickRecord['pickType']>()

  // Normal / save / pullback picks are in history.
  for (const record of pickHistory) {
    map.set(cellKey(record.teamIndex, record.round), record.pickType)
  }

  // Franchise pre-fills are placed by initDraft (not through PICK_PLAYER) so
  // they have no history entry — detect them from the team's franchisePlayer.
  // Note: if a future change records franchise placement in pickHistory, the
  // `!map.has` guard prevents this fallback from overwriting that entry.
  const franchiseRound = TOTAL_ROUNDS
  for (let ti = 0; ti < teams.length; ti++) {
    const team = teams[ti]!
    if (team.franchisePlayer && team.roster[franchiseRound]?.id === team.franchisePlayer.id) {
      const key = cellKey(ti, franchiseRound)
      if (!map.has(key)) map.set(key, 'franchise')
    }
  }

  return map
}

// ── Cell-type config ───────────────────────────────────────────────────────

/** One place to add a new pick type: css modifier + badge markup. */
const CELL_TYPE_CONFIG: Partial<Record<PickRecord['pickType'], { mod: string; badge: React.ReactNode }>> = {
  franchise: { mod: 'pick-cell--franchise', badge: <span className="chip-badge chip-badge--fp">★ FP</span> },
  save:      { mod: 'pick-cell--save',      badge: <span className="chip-badge chip-badge--save">💾</span> },
  pullback:  { mod: 'pick-cell--pullback',  badge: <span className="chip-badge chip-badge--pb">↩</span> },
}

// ── DraftBoard ─────────────────────────────────────────────────────────────

interface DraftBoardProps {
  teams: DraftState['teams']
  currentPick: DraftState['currentPick']
  totalRounds: number
  isDraftComplete: boolean
  cellTypeMap: Map<string, PickRecord['pickType']>
  userTeamIndex: number | null
}

function DraftBoard({
  teams,
  currentPick,
  totalRounds,
  isDraftComplete,
  cellTypeMap,
  userTeamIndex,
}: DraftBoardProps) {
  return (
    <div className="board-wrapper">
      <table className="draft-board">
        <thead>
          <tr>
            <th className="round-label">Rd</th>
            {teams.map((t, i) => {
              const isActive = !isDraftComplete && i === currentPick.teamIndex
              const isUser = i === userTeamIndex
              const cls = [
                'team-header',
                isActive ? 'active-col' : '',
                isUser ? 'user-col' : '',
              ].filter(Boolean).join(' ')
              return (
                <th key={i} className={cls}>
                  {t.name}
                  {isUser && <span className="you-badge"> (you)</span>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRounds }, (_, ri) => {
            const round = ri + 1
            const isActiveRound = !isDraftComplete && round === currentPick.round
            return (
              <tr key={round} className={isActiveRound ? 'active-row' : ''}>
                <td className="round-label">{round}</td>
                {teams.map((team, ti) => {
                  const player = team.roster[round]
                  const isActive = isActiveRound && currentPick.teamIndex === ti
                  const cellType = cellTypeMap.get(cellKey(ti, round))
                  const typeConfig = cellType ? CELL_TYPE_CONFIG[cellType] : undefined

                  const cellClass = [
                    'pick-cell',
                    isActive ? 'active-cell' : '',
                    typeConfig?.mod ?? '',
                  ].filter(Boolean).join(' ')

                  return (
                    <td key={ti} className={cellClass}>
                      {player ? (
                        <span className="player-chip">
                          <span className="pos">{player.position}</span>
                          {player.name}
                          {typeConfig?.badge}
                        </span>
                      ) : isActive ? (
                        <span className="on-clock">on the clock</span>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── PlayerList ─────────────────────────────────────────────────────────────

interface PlayerListProps {
  players: Player[]
  isUserTurn: boolean
  prevYearPlayerIds: Set<string>
  onPick: (player: Player) => void
}

function PlayerList({ players, isUserTurn, prevYearPlayerIds, onPick }: PlayerListProps) {
  return (
    <ul className="player-list">
      {players.slice(0, 80).map(player => {
        const isPrevYear = prevYearPlayerIds.has(player.id)
        return (
          <li
            key={player.id}
            className={`player-row${isPrevYear ? ' player-row--prev-year' : ''}`}
            title={isPrevYear ? 'Previous-year player' : undefined}
          >
            <span className="adp">#{player.adp}</span>
            <span className="pos">{player.position}</span>
            <span className="name">{player.name}</span>
            <span className="nfl-team">{player.nflTeam}</span>
            {isPrevYear && <span className="prev-year-badge">★</span>}
            {isUserTurn && (
              <button className="pick-btn" onClick={() => onPick(player)}>
                Draft
              </button>
            )}
          </li>
        )
      })}
      {players.length > 80 && (
        <li className="more-players">+{players.length - 80} more players…</li>
      )}
    </ul>
  )
}

// ── ReactionModal ──────────────────────────────────────────────────────────

interface ReactionModalProps {
  prompt: NonNullable<DraftState['pendingPrompt']>
  teams: DraftState['teams']
  onInvokeSave: (player: Player) => void
  onDeclineSave: () => void
  onInvokePullback: (player: Player) => void
  onDeclinePullback: () => void
}

function ReactionModal({
  prompt,
  teams,
  onInvokeSave,
  onDeclineSave,
  onInvokePullback,
  onDeclinePullback,
}: ReactionModalProps) {
  const reactingTeam = teams[prompt.reactingTeamIndex]!
  const pickingTeam = teams[prompt.pickingTeamIndex]!

  if (prompt.kind === 'save') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>💾 Save Opportunity</h3>
          <p>
            <strong>{pickingTeam.name}</strong> just picked{' '}
            <strong>{prompt.player.name}</strong> — a previous-year player on your roster.
          </p>
          <p>
            <strong>{reactingTeam.name}</strong>: use your one-per-draft save to keep them?
          </p>
          <div className="modal-actions">
            <button className="btn-primary" onClick={() => onInvokeSave(prompt.player)}>
              ✅ Save {prompt.player.name}
            </button>
          </div>
          {prompt.pullbackOptions.length > 0 && (
            <>
              <p>Or pull back a different previous-year player instead?</p>
              <ul className="pullback-options">
                {prompt.pullbackOptions.map(p => (
                  <li key={p.id}>
                    <button className="btn-primary" onClick={() => onInvokePullback(p)}>
                      ↩️ Pull back {p.name} ({p.position})
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onDeclineSave}>
              ❌ Decline
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>↩️ Pullback Opportunity</h3>
        <p>
          <strong>{pickingTeam.name}</strong> picked <strong>{prompt.pickedPlayer.name}</strong>{' '}
          from your previous-year roster. That pick stands.
        </p>
        <p>Pull back a different previous-year player instead?</p>
        <ul className="pullback-options">
          {prompt.pullbackOptions.map(p => (
            <li key={p.id}>
              <button className="btn-primary" onClick={() => onInvokePullback(p)}>
                ↩️ Pull back {p.name} ({p.position})
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onDeclinePullback}>
            ❌ Decline
          </button>
        </div>
      </div>
    </div>
  )
}
