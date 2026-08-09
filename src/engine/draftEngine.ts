import type { Action, DraftState, PickRecord, Player, Team } from '../types'

const TOTAL_TEAMS = 12
const TOTAL_ROUNDS = 16

// ── Pure helpers ───────────────────────────────────────────────────────────

function removeFromPool(pool: Player[], player: Player): Player[] {
  return pool.filter(p => p.id !== player.id)
}

function placeInRoster(team: Team, round: number, player: Player): Team {
  const roster = [...team.roster]
  roster[round] = player
  return { ...team, roster }
}

/** Return the next { round, teamIndex } after a pick, or null if draft is done. */
function nextPick(
  round: number,
  teamIndex: number,
): { round: number; teamIndex: number } | null {
  if (teamIndex < TOTAL_TEAMS - 1) {
    return { round, teamIndex: teamIndex + 1 }
  }
  if (round < TOTAL_ROUNDS) {
    return { round: round + 1, teamIndex: 0 }
  }
  return null // draft over
}

/** Count how many roster slots (rounds 1–16) are filled across all teams. */
function totalPicksFilled(teams: Team[]): number {
  return teams.reduce((sum, team) => {
    return (
      sum +
      team.roster.slice(1).filter(slot => slot !== null).length
    )
  }, 0)
}

// ── Reaction helpers ───────────────────────────────────────────────────────

/** Check whether any team can save or pull back on a just-picked player.
 *  Returns an array of PendingPrompt in the order teams should be asked. */
function buildReactionQueue(
  state: DraftState,
  pickedPlayer: Player,
  pickingTeamIndex: number,
) {
  const queue: DraftState['reactionQueue'] = []

  for (let ti = 0; ti < state.teams.length; ti++) {
    if (ti === pickingTeamIndex) continue
    const team = state.teams[ti]!
    const ownsPlayer = team.previousYearRoster.some(p => p.id === pickedPlayer.id)
    if (!ownsPlayer) continue

    const hasRoomForReaction =
      team.lastAvailableRound >= state.currentPick.round

    // Save check: player must be saveable and team hasn't used save this draft
    const isSaveable =
      ownsPlayer &&
      !team.saveHistory.has(pickedPlayer.id) &&
      !team.saveUsedThisDraft &&
      hasRoomForReaction

    if (isSaveable) {
      queue.push({
        kind: 'save',
        pickingTeamIndex,
        reactingTeamIndex: ti,
        player: pickedPlayer,
      })
      // Save and pullback are mutually exclusive per player-pick; after push, continue
      continue
    }

    // Pullback check: any remaining previous-year player still in pool
    if (hasRoomForReaction) {
      const pullbackOptions = team.previousYearRoster.filter(
        p => state.availablePool.some(ap => ap.id === p.id) && p.id !== pickedPlayer.id,
      )
      if (pullbackOptions.length > 0) {
        queue.push({
          kind: 'pullback',
          pickingTeamIndex,
          reactingTeamIndex: ti,
          pickedPlayer,
          pullbackOptions,
        })
      }
    }
  }

  return queue
}

// ── Queue helpers ──────────────────────────────────────────────────────────

function dequeue(queue: DraftState['reactionQueue']): {
  head: DraftState['pendingPrompt']
  tail: DraftState['reactionQueue']
} {
  if (queue.length === 0) return { head: null, tail: [] }
  const [head, ...tail] = queue
  return { head: head!, tail }
}

// ── Engine ─────────────────────────────────────────────────────────────────

export function draftEngine(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case 'PICK_PLAYER': {
      const { player } = action
      const { round, teamIndex } = state.currentPick

      // Place player in picking team's roster
      const updatedTeam = placeInRoster(state.teams[teamIndex]!, round, player)
      const teams = state.teams.map((t, i) => (i === teamIndex ? updatedTeam : t))

      const availablePool = removeFromPool(state.availablePool, player)

      const record: PickRecord = {
        round,
        teamIndex,
        player,
        pickType: 'normal',
      }
      const pickHistory = [...state.pickHistory, record]

      // Build any reaction prompts triggered by this pick
      const reactionQueue = buildReactionQueue(
        { ...state, teams, availablePool },
        player,
        teamIndex,
      )

      // Determine if there's an immediate pending prompt
      const { head: pendingPrompt, tail: remainingQueue } = dequeue(reactionQueue)

      // If no reactions, advance the pick cursor
      const totalFilled = totalPicksFilled(teams)
      const isDraftComplete =
        reactionQueue.length === 0 && totalFilled === TOTAL_TEAMS * TOTAL_ROUNDS

      const next = reactionQueue.length === 0 ? nextPick(round, teamIndex) : null

      return {
        ...state,
        teams,
        availablePool,
        pickHistory,
        currentPick: next ?? { round, teamIndex },
        pendingPrompt: pendingPrompt ?? null,
        reactionQueue: remainingQueue,
        isDraftComplete,
      }
    }

    case 'INVOKE_SAVE': {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== 'save') return state
      const { reactingTeamIndex, player } = state.pendingPrompt

      const reactingTeam = state.teams[reactingTeamIndex]!
      const targetRound = reactingTeam.lastAvailableRound

      const updatedTeam: Team = {
        ...placeInRoster(reactingTeam, targetRound, player),
        saveUsedThisDraft: true,
        lastAvailableRound: targetRound - 1,
      }
      const teams = state.teams.map((t, i) => (i === reactingTeamIndex ? updatedTeam : t))

      const record: PickRecord = {
        round: targetRound,
        teamIndex: reactingTeamIndex,
        player,
        pickType: 'save',
      }
      const pickHistory = [...state.pickHistory, record]

      // Dequeue next reaction
      const { head: pendingPrompt, tail: remainingQueue } = dequeue(state.reactionQueue)

      const { round, teamIndex } = state.currentPick
      const totalFilled = totalPicksFilled(teams)
      const isDraftComplete =
        remainingQueue.length === 0 && pendingPrompt === null && totalFilled === TOTAL_TEAMS * TOTAL_ROUNDS

      const next = pendingPrompt === null ? nextPick(round, teamIndex) : null

      return {
        ...state,
        teams,
        pickHistory,
        currentPick: next ?? state.currentPick,
        pendingPrompt,
        reactionQueue: remainingQueue,
        isDraftComplete,
      }
    }

    case 'DECLINE_SAVE': {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== 'save') return state

      // Dequeue next reaction (may be a pullback on the same pick)
      const { head: pendingPrompt, tail: remainingQueue } = dequeue(state.reactionQueue)

      const { round, teamIndex } = state.currentPick
      const next = pendingPrompt === null ? nextPick(round, teamIndex) : null

      const totalFilled = totalPicksFilled(state.teams)
      const isDraftComplete =
        pendingPrompt === null && remainingQueue.length === 0 && totalFilled === TOTAL_TEAMS * TOTAL_ROUNDS

      return {
        ...state,
        currentPick: next ?? state.currentPick,
        pendingPrompt,
        reactionQueue: remainingQueue,
        isDraftComplete,
      }
    }

    case 'INVOKE_PULLBACK': {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== 'pullback') return state
      const { reactingTeamIndex } = state.pendingPrompt
      const { pullbackPlayer } = action

      const reactingTeam = state.teams[reactingTeamIndex]!
      const targetRound = reactingTeam.lastAvailableRound

      const updatedTeam: Team = {
        ...placeInRoster(reactingTeam, targetRound, pullbackPlayer),
        lastAvailableRound: targetRound - 1,
      }
      const teams = state.teams.map((t, i) => (i === reactingTeamIndex ? updatedTeam : t))
      const availablePool = removeFromPool(state.availablePool, pullbackPlayer)

      const record: PickRecord = {
        round: targetRound,
        teamIndex: reactingTeamIndex,
        player: pullbackPlayer,
        pickType: 'pullback',
      }
      const pickHistory = [...state.pickHistory, record]

      const { head: pendingPrompt, tail: remainingQueue } = dequeue(state.reactionQueue)

      const { round, teamIndex } = state.currentPick
      const totalFilled = totalPicksFilled(teams)
      const isDraftComplete =
        pendingPrompt === null && remainingQueue.length === 0 && totalFilled === TOTAL_TEAMS * TOTAL_ROUNDS

      const next = pendingPrompt === null ? nextPick(round, teamIndex) : null

      return {
        ...state,
        teams,
        availablePool,
        pickHistory,
        currentPick: next ?? state.currentPick,
        pendingPrompt,
        reactionQueue: remainingQueue,
        isDraftComplete,
      }
    }

    case 'DECLINE_PULLBACK': {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== 'pullback') return state

      const { head: pendingPrompt, tail: remainingQueue } = dequeue(state.reactionQueue)

      const { round, teamIndex } = state.currentPick
      const next = pendingPrompt === null ? nextPick(round, teamIndex) : null

      const totalFilled = totalPicksFilled(state.teams)
      const isDraftComplete =
        pendingPrompt === null && remainingQueue.length === 0 && totalFilled === TOTAL_TEAMS * TOTAL_ROUNDS

      return {
        ...state,
        currentPick: next ?? state.currentPick,
        pendingPrompt,
        reactionQueue: remainingQueue,
        isDraftComplete,
      }
    }

    case 'ADVANCE_SIMULATION':
      // Handled by the UI layer / simulation runner; engine is a no-op here.
      return state

    default:
      return state
  }
}
