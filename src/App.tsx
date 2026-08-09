import { useCallback, useEffect, useReducer, useRef } from 'react'
import { draftEngine } from './engine/draftEngine'
import { initDraft, makeDemoPlayers, makeDemoTeams } from './engine/initDraft'
import type { DraftState, Player } from './types'
import './App.css'

// ── AI simulation ──────────────────────────────────────────────────────────

/** Gaussian noise via Box-Muller. */
function gaussianNoise(): number {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** AI picks the best available player by ADP with Gaussian noise (σ = 5 ranks). */
function aiPickPlayer(pool: Player[]): Player | null {
  if (pool.length === 0) return null
  const scored = pool.map(p => ({ player: p, score: p.adp + gaussianNoise() * 5 }))
  scored.sort((a, b) => a.score - b.score)
  return scored[0]!.player
}

/** AI reaction probability: higher for high-value players (low ADP). */
function aiShouldReact(playerAdp: number): boolean {
  const prob = Math.max(0.1, 1 - playerAdp / 100)
  return Math.random() < prob
}

// ── Reducer ────────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 16

const initialState: DraftState = initDraft({
  mode: 'practice',
  userTeamIndex: 0,
  teams: makeDemoTeams(),
  availablePool: makeDemoPlayers(),
})

// ── Component ──────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(
    (s: DraftState, a: Parameters<typeof draftEngine>[1]) => draftEngine(s, a),
    initialState,
  )
  const simulatingRef = useRef(false)

  /** Run the next AI step: resolve pending prompt or make the next pick. */
  const runAiStep = useCallback((s: DraftState) => {
    if (s.isDraftComplete) return
    if (s.pendingPrompt) {
      const { kind } = s.pendingPrompt
      if (kind === 'save') {
        if (aiShouldReact(s.pendingPrompt.player.adp)) {
          dispatch({ type: 'INVOKE_SAVE', player: s.pendingPrompt.player })
        } else {
          dispatch({ type: 'DECLINE_SAVE' })
        }
      } else {
        // pullback
        const opts = s.pendingPrompt.pullbackOptions
        if (opts.length > 0 && aiShouldReact(opts[0]!.adp)) {
          dispatch({ type: 'INVOKE_PULLBACK', pullbackPlayer: opts[0]! })
        } else {
          dispatch({ type: 'DECLINE_PULLBACK' })
        }
      }
      return
    }

    const { teamIndex } = s.currentPick
    if (s.userTeamIndex !== null && teamIndex === s.userTeamIndex) return // user's turn

    const player = aiPickPlayer(s.availablePool)
    if (player) dispatch({ type: 'PICK_PLAYER', player })
  }, [])

  // Auto-advance AI turns
  useEffect(() => {
    if (state.isDraftComplete) { simulatingRef.current = false; return }
    const isUserTurn =
      state.mode === 'practice' &&
      !state.pendingPrompt &&
      state.currentPick.teamIndex === state.userTeamIndex
    if (isUserTurn) { simulatingRef.current = false; return }

    simulatingRef.current = true
    const id = setTimeout(() => {
      if (simulatingRef.current) runAiStep(state)
    }, 120)
    return () => clearTimeout(id)
  }, [state, runAiStep])

  const { teams, currentPick, availablePool, isDraftComplete, pendingPrompt } = state
  const isUserTurn =
    state.mode === 'practice' &&
    !pendingPrompt &&
    currentPick.teamIndex === state.userTeamIndex

  return (
    <div className="app">
      <header className="app-header">
        <h1>EPL Mock Drafter</h1>
        <span className="status-badge">
          {isDraftComplete
            ? '✅ Draft Complete'
            : pendingPrompt
              ? `⚡ Reaction — ${teams[
                  pendingPrompt.kind === 'save'
                    ? pendingPrompt.reactingTeamIndex
                    : pendingPrompt.reactingTeamIndex
                ]!.name}`
              : isUserTurn
                ? `🎯 Your pick — Round ${currentPick.round}`
                : `⏳ Round ${currentPick.round} · ${teams[currentPick.teamIndex]!.name}`}
        </span>
      </header>

      {pendingPrompt && (
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
          />
        </section>

        {!isDraftComplete && (
          <section className="pool-section">
            <h2>Available Players</h2>
            <PlayerList
              players={availablePool}
              isUserTurn={isUserTurn}
              onPick={(player) => dispatch({ type: 'PICK_PLAYER', player })}
            />
          </section>
        )}
      </div>
    </div>
  )
}

// ── DraftBoard ─────────────────────────────────────────────────────────────

interface DraftBoardProps {
  teams: DraftState['teams']
  currentPick: DraftState['currentPick']
  totalRounds: number
  isDraftComplete: boolean
}

function DraftBoard({ teams, currentPick, totalRounds, isDraftComplete }: DraftBoardProps) {
  return (
    <div className="board-wrapper">
      <table className="draft-board">
        <thead>
          <tr>
            <th className="round-label">Rd</th>
            {teams.map((t, i) => (
              <th
                key={i}
                className={
                  !isDraftComplete && i === currentPick.teamIndex
                    ? 'team-header active-col'
                    : 'team-header'
                }
              >
                {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRounds }, (_, ri) => {
            const round = ri + 1
            return (
              <tr key={round}>
                <td className="round-label">{round}</td>
                {teams.map((team, ti) => {
                  const player = team.roster[round]
                  const isActive =
                    !isDraftComplete &&
                    currentPick.round === round &&
                    currentPick.teamIndex === ti
                  return (
                    <td key={ti} className={isActive ? 'pick-cell active-cell' : 'pick-cell'}>
                      {player ? (
                        <span className="player-chip">
                          <span className="pos">{player.position}</span>
                          {player.name}
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
  onPick: (player: Player) => void
}

function PlayerList({ players, isUserTurn, onPick }: PlayerListProps) {
  return (
    <ul className="player-list">
      {players.slice(0, 80).map(player => (
        <li key={player.id} className="player-row">
          <span className="adp">#{player.adp}</span>
          <span className="pos">{player.position}</span>
          <span className="name">{player.name}</span>
          <span className="nfl-team">{player.nflTeam}</span>
          {isUserTurn && (
            <button className="pick-btn" onClick={() => onPick(player)}>
              Draft
            </button>
          )}
        </li>
      ))}
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
