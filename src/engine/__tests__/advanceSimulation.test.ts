import { describe, it, expect, vi } from 'vitest'
import { draftEngine } from '../draftEngine'
import { makeDraftState, makePlayer, makeTeam } from '../testHelpers'
import type { DraftState, Player } from '../../types'

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
