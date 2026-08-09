// ── Core domain types ──────────────────────────────────────────────────────

export interface Player {
  id: string
  name: string
  position: string
  nflTeam: string
  adp: number
}

export interface PickRecord {
  round: number
  teamIndex: number
  player: Player
  /** 'normal' | 'save' | 'pullback' — how the slot was filled */
  pickType: 'normal' | 'save' | 'pullback' | 'franchise'
}

export interface Team {
  name: string
  /** roster[i] holds the player drafted into round i (1-indexed, so index 1–16).
   *  Index 0 is unused. */
  roster: (Player | null)[]
  /** Players this team held at the end of the prior season. */
  previousYearRoster: Player[]
  /** Set of player IDs that this team has ever saved (across all past drafts). */
  saveHistory: Set<string>
  /** The franchise player pre-declared for round 16. */
  franchisePlayer: Player | null
  /** Player IDs from previousYearRoster that are franchise-eligible. */
  franchiseEligibleIds: Set<string>
  /** Whether this team has already used their one save this draft. */
  saveUsedThisDraft: boolean
  /** Furthest-back open round available for saves/pullbacks (starts at 15). */
  lastAvailableRound: number
}

export type SavePrompt = {
  kind: 'save'
  /** The team that originally made the pick */
  pickingTeamIndex: number
  /** The team that may save (the owner of the previous-year player) */
  reactingTeamIndex: number
  player: Player
  /** Other previous-year players still in the pool the team could pull back
   *  instead of saving. A team with an unused save can save this player, pull
   *  back one of these, or decline — empty when no pullback options remain. */
  pullbackOptions: Player[]
}

export type PullbackPrompt = {
  kind: 'pullback'
  /** The team that originally made the pick */
  pickingTeamIndex: number
  /** The team that may pull back */
  reactingTeamIndex: number
  /** The player who was picked (stays with picking team) */
  pickedPlayer: Player
  /** Players from this team's previous-year roster still available to pull back */
  pullbackOptions: Player[]
}

export type PendingPrompt = SavePrompt | PullbackPrompt

export interface DraftState {
  mode: 'practice' | 'watch'
  /** null in watch mode */
  userTeamIndex: number | null
  teams: Team[]
  availablePool: Player[]
  currentPick: { round: number; teamIndex: number }
  pickHistory: PickRecord[]
  pendingPrompt: PendingPrompt | null
  isDraftComplete: boolean
  /** Ordered list of pending reactions to work through after a pick.
   *  Reactions are resolved one at a time; this queue lets the engine
   *  handle multiple teams having reactions to the same pick. */
  reactionQueue: PendingPrompt[]
}

// ── Actions ────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'PICK_PLAYER'; player: Player }
  | { type: 'INVOKE_SAVE'; player: Player }
  | { type: 'DECLINE_SAVE' }
  | { type: 'INVOKE_PULLBACK'; pullbackPlayer: Player }
  | { type: 'DECLINE_PULLBACK' }
  | { type: 'ADVANCE_SIMULATION' }
