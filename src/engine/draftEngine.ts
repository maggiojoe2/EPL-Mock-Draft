import type { Action, DraftState, PickRecord, Player, Team } from '../types'
import { aiPickPlayer, aiShouldReact } from './aiSimulator'

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
  totalTeams: number,
): { round: number; teamIndex: number } | null {
  if (teamIndex < totalTeams - 1) {
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

/** Return the first unfilled roster slot >= fromRound for the given team.
 *  Saves and pullbacks fill from the back; a normal pick must skip any such
 *  pre-filled slots so it never overwrites them. */
function nextNormalSlot(team: Team, fromRound: number): number {
  for (let r = fromRound; r <= TOTAL_ROUNDS; r++) {
    if (team.roster[r] === null) return r
  }
  // Should never happen in a well-formed draft: the engine only reaches here
  // if the team's roster is already full, but the draft would be complete.
  throw new Error(`No open normal slot for team "${team.name}" starting at round ${fromRound}`)
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

    // A reaction is only allowed when the team still has a back-slot ahead of
    // the current round (strictly greater, to avoid filling a slot the cursor
    // will visit as a normal pick this same round).
    const hasRoomForReaction =
      team.lastAvailableRound > state.currentPick.round

    // Save check: player must be saveable and team hasn't used save this draft
    const isSaveable =
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
      // Save and pullback are mutually exclusive per player-pick
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

// ── Queue / completion helpers ─────────────────────────────────────────────

function dequeue(queue: DraftState['reactionQueue']): {
  head: DraftState['pendingPrompt']
  tail: DraftState['reactionQueue']
} {
  if (queue.length === 0) return { head: null, tail: [] }
  const [head, ...tail] = queue
  return { head: head!, tail }
}

/** Shared tail logic for every reaction handler: dequeue next prompt, advance
 *  the pick cursor when all reactions are resolved, and check for completion. */
function resolveReaction(
  state: DraftState,
  teams: DraftState['teams'],
): Pick<DraftState, 'currentPick' | 'pendingPrompt' | 'reactionQueue' | 'isDraftComplete'> {
  const { head: pendingPrompt, tail: reactionQueue } = dequeue(state.reactionQueue)

  const { round, teamIndex } = state.currentPick
  const next = pendingPrompt === null ? nextPick(round, teamIndex, teams.length) : null

  const totalFilled = totalPicksFilled(teams)
  const isDraftComplete =
    pendingPrompt === null &&
    reactionQueue.length === 0 &&
    totalFilled === teams.length * TOTAL_ROUNDS

  return {
    currentPick: next ?? state.currentPick,
    pendingPrompt,
    reactionQueue,
    isDraftComplete,
  }
}

// ── Engine ─────────────────────────────────────────────────────────────────

export function draftEngine(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case 'PICK_PLAYER': {
      const { player } = action
      const { round, teamIndex } = state.currentPick

      const pickingTeam = state.teams[teamIndex]!

      // Slot for this normal pick: scan forward past any pre-filled slots
      // (saves or pullbacks placed there earlier in the draft).
      const targetRound = nextNormalSlot(pickingTeam, round)
      const updatedTeam = placeInRoster(pickingTeam, targetRound, player)
      const teams = state.teams.map((t, i) => (i === teamIndex ? updatedTeam : t))

      const availablePool = removeFromPool(state.availablePool, player)

      const record: PickRecord = {
        round: targetRound,
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

      const { head: pendingPrompt, tail: remainingQueue } = dequeue(reactionQueue)

      const totalFilled = totalPicksFilled(teams)
      const isDraftComplete =
        reactionQueue.length === 0 && totalFilled === teams.length * TOTAL_ROUNDS

      const next = reactionQueue.length === 0 ? nextPick(round, teamIndex, teams.length) : null

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
      const { pickingTeamIndex, reactingTeamIndex, player } = state.pendingPrompt

      // A save blocks the original pick: remove the player from the picking team's
      // roster and strip the normal pick record from history.
      const pickingTeam = state.teams[pickingTeamIndex]!
      const blockedRound = pickingTeam.roster.findIndex(p => p?.id === player.id)
      const unblockedPickingTeam = placeInRoster(pickingTeam, blockedRound, null)

      // Place the player in the saving team's back slot.
      const reactingTeam = state.teams[reactingTeamIndex]!
      const targetRound = reactingTeam.lastAvailableRound
      const updatedReactingTeam: Team = {
        ...placeInRoster(reactingTeam, targetRound, player),
        saveUsedThisDraft: true,
        lastAvailableRound: targetRound - 1,
      }

      const teams = state.teams.map((t, i) => {
        if (i === pickingTeamIndex) return unblockedPickingTeam
        if (i === reactingTeamIndex) return updatedReactingTeam
        return t
      })

      // Drop the voided normal pick from history; add the save record.
      const pickHistory = [
        ...state.pickHistory.filter(
          r => !(r.teamIndex === pickingTeamIndex && r.player.id === player.id && r.pickType === 'normal'),
        ),
        { round: targetRound, teamIndex: reactingTeamIndex, player, pickType: 'save' as const },
      ]

      // The save blocks the pick — cursor stays at the picking team's position
      // so they can pick again. Clear remaining reactions (they all referenced
      // the now-blocked pick).
      return {
        ...state,
        teams,
        pickHistory,
        pendingPrompt: null,
        reactionQueue: [],
        currentPick: state.currentPick, // unchanged — picker tries again
        isDraftComplete: false,
      }
    }

    case 'DECLINE_SAVE': {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== 'save') return state

      return {
        ...state,
        ...resolveReaction(state, state.teams),
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

      return {
        ...state,
        teams,
        availablePool,
        pickHistory,
        ...resolveReaction(state, teams),
      }
    }

    case 'DECLINE_PULLBACK': {
      if (!state.pendingPrompt || state.pendingPrompt.kind !== 'pullback') return state

      return {
        ...state,
        ...resolveReaction(state, state.teams),
      }
    }

    case 'ADVANCE_SIMULATION': {
      if (state.isDraftComplete) return state

      if (state.pendingPrompt) {
        // Never auto-resolve a prompt the user must answer in practice mode.
        const isUserReaction =
          state.mode === 'practice' &&
          state.userTeamIndex !== null &&
          state.pendingPrompt.reactingTeamIndex === state.userTeamIndex
        if (isUserReaction) return state

        // Resolve an AI team's reaction.
        const prompt = state.pendingPrompt
        if (prompt.kind === 'save') {
          if (aiShouldReact(prompt.player.adp)) {
            return draftEngine(state, { type: 'INVOKE_SAVE', player: prompt.player })
          }
          return draftEngine(state, { type: 'DECLINE_SAVE' })
        }
        // pullback
        const opts = prompt.pullbackOptions
        if (opts.length > 0 && aiShouldReact(opts[0]!.adp)) {
          return draftEngine(state, { type: 'INVOKE_PULLBACK', pullbackPlayer: opts[0]! })
        }
        return draftEngine(state, { type: 'DECLINE_PULLBACK' })
      }

      const { teamIndex } = state.currentPick
      // Don't advance past the user's turn in practice mode.
      if (state.mode === 'practice' && teamIndex === state.userTeamIndex) return state

      const player = aiPickPlayer(state.availablePool)
      if (!player) return state
      return draftEngine(state, { type: 'PICK_PLAYER', player })
    }

    default:
      return state
  }
}
