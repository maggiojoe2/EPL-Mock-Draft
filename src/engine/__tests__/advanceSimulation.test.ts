import { describe, it, expect, vi } from 'vitest'
import { draftEngine } from '../draftEngine'
import { makeDraftState, makePlayer, makeTeam } from '../testHelpers'
import type { Player } from '../../types'

// ── ADVANCE_SIMULATION ────────────────────────────────────────────────────────

describe('ADVANCE_SIMULATION', () => {
  // ── No-ops ────────────────────────────────────────────────────────────────

  it('returns unchanged state when isDraftComplete', () => {
    const state = makeDraftState({ isDraftComplete: true })
    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    expect(next).toBe(state)
  })

  it('returns unchanged state when it is the user team\'s turn in practice mode', () => {
    const state = makeDraftState({ mode: 'practice', userTeamIndex: 0, currentPick: { round: 1, teamIndex: 0 } })
    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    expect(next).toBe(state)
  })

  it('returns unchanged state when user\'s reaction prompt is pending in practice mode', () => {
    const player: Player = makePlayer(0)
    const userTeam = makeTeam({
      name: 'User',
      previousYearRoster: [player],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 0 ? userTeam : makeTeam({ name: `Team ${i}` }),
    )
    // State where user team (index 0) has a pending save prompt
    const state = makeDraftState({
      mode: 'practice',
      userTeamIndex: 0,
      teams,
      pendingPrompt: {
        kind: 'save',
        pickingTeamIndex: 1,
        reactingTeamIndex: 0, // user's team is reacting
        player,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 1 },
    })
    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    expect(next).toBe(state)
    expect(next.pendingPrompt).not.toBeNull()
  })

  // ── AI normal pick ────────────────────────────────────────────────────────

  it('in watch mode makes a pick and removes a player from the pool', () => {
    const state = makeDraftState({ mode: 'watch', userTeamIndex: null })
    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    expect(next.availablePool.length).toBe(state.availablePool.length - 1)
  })

  it('in practice mode advances an AI team\'s turn (not the user\'s)', () => {
    // User is team 0; team 1 is on the clock
    const state = makeDraftState({
      mode: 'practice',
      userTeamIndex: 0,
      currentPick: { round: 1, teamIndex: 1 },
    })
    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    // Pool should shrink (pick was made)
    expect(next.availablePool.length).toBe(state.availablePool.length - 1)
  })

  // ── AI pending-prompt resolution ──────────────────────────────────────────

  it('resolves a pending save prompt in watch mode (prompt becomes null)', () => {
    const player: Player = makePlayer(0)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [player],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      mode: 'watch',
      userTeamIndex: null,
      teams,
      pendingPrompt: {
        kind: 'save',
        pickingTeamIndex: 0,
        reactingTeamIndex: 1,
        player,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 0 },
    })

    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    expect(next.pendingPrompt).toBeNull()
  })

  it('resolves a pending save prompt for an AI team in practice mode (not user team)', () => {
    const player: Player = makePlayer(0)
    const ownerTeam = makeTeam({
      name: 'AI Owner',
      previousYearRoster: [player],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 2 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      mode: 'practice',
      userTeamIndex: 0,
      teams,
      pendingPrompt: {
        kind: 'save',
        pickingTeamIndex: 1,
        reactingTeamIndex: 2, // AI team is reacting
        player,
        pullbackOptions: [],
      },
      currentPick: { round: 1, teamIndex: 1 },
    })

    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    expect(next.pendingPrompt).toBeNull()
  })

  it('resolves a pending pullback prompt in watch mode (prompt becomes null)', () => {
    const pickedPlayer: Player = makePlayer(0)
    const pullbackOption: Player = makePlayer(99)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [pickedPlayer, pullbackOption],
      saveHistory: new Set([pickedPlayer.id]),
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      mode: 'watch',
      userTeamIndex: null,
      teams,
      pendingPrompt: {
        kind: 'pullback',
        pickingTeamIndex: 0,
        reactingTeamIndex: 1,
        pickedPlayer,
        pullbackOptions: [pullbackOption],
      },
      currentPick: { round: 1, teamIndex: 0 },
    })

    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    expect(next.pendingPrompt).toBeNull()
  })

  // ── AI save-or-pullback fallback ─────────────────────────────────────────

  it('AI falls back to pulling back the best option when it declines the save', () => {
    const player: Player = makePlayer(99) // high adp → low save-react probability
    const pullbackOption: Player = makePlayer(0) // low adp → high pullback-react probability
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [player, pullbackOption],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      mode: 'watch',
      userTeamIndex: null,
      teams,
      pendingPrompt: {
        kind: 'save',
        pickingTeamIndex: 0,
        reactingTeamIndex: 1,
        player,
        pullbackOptions: [pullbackOption],
      },
      currentPick: { round: 1, teamIndex: 0 },
    })

    // A single random() value that fails the save-react check (low prob, high
    // adp) but passes the pullback-react check (high prob, low adp).
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
      expect(next.teams[1]!.roster[15]).toEqual(pullbackOption)
      expect(next.teams[1]!.saveUsedThisDraft).toBe(false)
      expect(next.pendingPrompt).toBeNull()
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('AI declines entirely when neither the save nor the pullback clears the probability threshold', () => {
    const player: Player = makePlayer(99)
    const pullbackOption: Player = makePlayer(98) // also high adp → low probability
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [player, pullbackOption],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      mode: 'watch',
      userTeamIndex: null,
      teams,
      pendingPrompt: {
        kind: 'save',
        pickingTeamIndex: 0,
        reactingTeamIndex: 1,
        player,
        pullbackOptions: [pullbackOption],
      },
      currentPick: { round: 1, teamIndex: 0 },
    })

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
      expect(next.teams[1]!.roster[15]).toBeNull()
      expect(next.teams[1]!.saveUsedThisDraft).toBe(false)
      expect(next.teams[1]!.lastAvailableRound).toBe(15)
      expect(next.pendingPrompt).toBeNull()
    } finally {
      randomSpy.mockRestore()
    }
  })
})

// ── initDraft: pool is ADP-sorted ─────────────────────────────────────────────

describe('initDraft ADP sort', () => {
  it('available pool is sorted ascending by ADP after initDraft', async () => {
    const { initDraft } = await import('../initDraft')
    // Provide players in reverse ADP order
    const players = [
      makePlayer(9), // adp 10
      makePlayer(4), // adp 5
      makePlayer(0), // adp 1
      makePlayer(2), // adp 3
    ]
    const teams = Array.from({ length: 2 }, (_, i) => makeTeam({ name: `Team ${i}` }))
    const state = initDraft({ mode: 'watch', userTeamIndex: null, teams, availablePool: players })
    const adps = state.availablePool.map(p => p.adp)
    expect(adps).toEqual([...adps].sort((a, b) => a - b))
  })
})

// ── initDraft: lastAvailableRound for no-franchise teams ──────────────────────

describe('initDraft lastAvailableRound', () => {
  it('no-franchise team gets lastAvailableRound 16 (not the pre-init default of 15)', async () => {
    const { initDraft } = await import('../initDraft')
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(i))
    // Team with franchisePlayer: null and default pre-init lastAvailableRound: 15
    const team = makeTeam({ name: 'No Franchise', franchisePlayer: null, lastAvailableRound: 15 })
    const state = initDraft({ mode: 'watch', userTeamIndex: null, teams: [team], availablePool: players })
    expect(state.teams[0]!.lastAvailableRound).toBe(16)
  })

  it('franchise team retains lastAvailableRound 15 after initDraft', async () => {
    const { initDraft } = await import('../initDraft')
    const franchisePlayer = makePlayer(0)
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(i))
    const team = makeTeam({ name: 'Has Franchise', franchisePlayer, lastAvailableRound: 15 })
    const state = initDraft({ mode: 'watch', userTeamIndex: null, teams: [team], availablePool: players })
    expect(state.teams[0]!.lastAvailableRound).toBe(15)
  })
})

// ── ADVANCE_SIMULATION: skip full teams ───────────────────────────────────────

describe('ADVANCE_SIMULATION full-team skip', () => {
  it('skips a team whose roster is entirely filled — no pick is made, pool is unchanged', () => {
    // Single-team draft at round 16 with all 16 slots already filled (franchise in slot 16,
    // slots 1–15 filled by normal picks). After the skip, nextPick returns null so the engine
    // cannot recurse into another team — the pool must stay pristine.
    const franchisePlayer = makePlayer(200)
    const fullRoster: (Player | null)[] = Array.from({ length: 17 }, () => null)
    for (let r = 1; r <= 15; r++) {
      fullRoster[r] = makePlayer(r)
    }
    fullRoster[16] = franchisePlayer

    const fullTeam = makeTeam({ name: 'Full Team', roster: fullRoster, lastAvailableRound: 15 })
    const pool = Array.from({ length: 50 }, (_, i) => makePlayer(i + 100))

    // Single-team draft at round 16, teamIndex 0
    const state = makeDraftState({
      mode: 'watch',
      userTeamIndex: null,
      teams: [fullTeam],
      availablePool: pool,
      currentPick: { round: 16, teamIndex: 0 },
    })

    const next = draftEngine(state, { type: 'ADVANCE_SIMULATION' })
    // No pick was made — pool must be unchanged
    expect(next.availablePool.length).toBe(pool.length)
    // The full team's roster is still intact
    const filledSlotsAfter = next.teams[0]!.roster.slice(1).filter(s => s !== null).length
    expect(filledSlotsAfter).toBe(16)
  })

  it('draft completes when the last open slot on a no-franchise team is filled', () => {
    // One no-franchise team with slots 1–15 filled and slot 16 null
    const almostFullRoster: (ReturnType<typeof makePlayer> | null)[] = Array.from({ length: 17 }, () => null)
    for (let r = 1; r <= 15; r++) {
      almostFullRoster[r] = makePlayer(r)
    }
    // slot 16 is still null

    const noFranchiseTeam = makeTeam({
      name: 'No Franchise',
      roster: almostFullRoster,
      franchisePlayer: null,
      lastAvailableRound: 16,
    })
    const teams = [noFranchiseTeam]
    const finalPlayer = makePlayer(99)
    const pool = [finalPlayer]

    const state = makeDraftState({
      mode: 'watch',
      userTeamIndex: null,
      teams,
      availablePool: pool,
      currentPick: { round: 16, teamIndex: 0 },
    })

    const next = draftEngine(state, { type: 'PICK_PLAYER', player: finalPlayer })
    expect(next.isDraftComplete).toBe(true)
  })
})
