import { describe, it, expect } from 'vitest'
import { draftEngine } from '../draftEngine'
import { makeDraftState, makePlayer, makeTeam } from '../testHelpers'

// ── Save mechanics ─────────────────────────────────────────────────────────

describe('save mechanics', () => {
  it('sets a save pendingPrompt when a saveable previous-year player is picked', () => {
    const player = makePlayer(0)
    // team 1 owns this player and has never saved them
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
    const state = makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } })

    const next = draftEngine(state, { type: 'PICK_PLAYER', player })

    expect(next.pendingPrompt).toMatchObject({
      kind: 'save',
      pickingTeamIndex: 0,
      reactingTeamIndex: 1,
      player,
    })
  })

  it('INVOKE_SAVE places the player in lastAvailableRound of the reacting team', () => {
    const player = makePlayer(0)
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
    const state = makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } })
    const afterPick = draftEngine(state, { type: 'PICK_PLAYER', player })
    const afterSave = draftEngine(afterPick, { type: 'INVOKE_SAVE', player })

    expect(afterSave.teams[1]!.roster[15]).toEqual(player)
  })

  it('INVOKE_SAVE decrements lastAvailableRound from 15 to 14', () => {
    const player = makePlayer(0)
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
    const state = makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } })
    const afterPick = draftEngine(state, { type: 'PICK_PLAYER', player })
    const afterSave = draftEngine(afterPick, { type: 'INVOKE_SAVE', player })

    expect(afterSave.teams[1]!.lastAvailableRound).toBe(14)
    expect(afterSave.teams[1]!.saveUsedThisDraft).toBe(true)
  })

  it('INVOKE_SAVE marks saveUsedThisDraft on the reacting team', () => {
    const player = makePlayer(0)
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
    const state = makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } })
    const afterPick = draftEngine(state, { type: 'PICK_PLAYER', player })
    const afterSave = draftEngine(afterPick, { type: 'INVOKE_SAVE', player })

    expect(afterSave.teams[1]!.saveUsedThisDraft).toBe(true)
  })

  it('does not offer a save when the team already used their save this draft', () => {
    const player = makePlayer(0)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [player],
      saveHistory: new Set(),
      saveUsedThisDraft: true, // already saved
      lastAvailableRound: 14,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } })
    const next = draftEngine(state, { type: 'PICK_PLAYER', player })

    // No save prompt — but may have pullback since no pullback options here either
    expect(next.pendingPrompt?.kind).not.toBe('save')
  })

  it('does not offer a save for a player in the team save history', () => {
    const player = makePlayer(0)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [player],
      saveHistory: new Set([player.id]), // previously saved
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } })
    const next = draftEngine(state, { type: 'PICK_PLAYER', player })

    expect(next.pendingPrompt?.kind).not.toBe('save')
  })

  it('DECLINE_SAVE advances the pick cursor without saving', () => {
    const player = makePlayer(0)
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
    const state = makeDraftState({ teams, currentPick: { round: 1, teamIndex: 0 } })
    const afterPick = draftEngine(state, { type: 'PICK_PLAYER', player })
    const afterDecline = draftEngine(afterPick, { type: 'DECLINE_SAVE' })

    expect(afterDecline.pendingPrompt).toBeNull()
    expect(afterDecline.currentPick).toEqual({ round: 1, teamIndex: 1 })
    expect(afterDecline.teams[1]!.saveUsedThisDraft).toBe(false)
  })

  it('does not offer a save when lastAvailableRound < currentRound', () => {
    const player = makePlayer(0)
    // Team has exhausted all their back slots
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [player],
      saveHistory: new Set(),
      saveUsedThisDraft: false,
      lastAvailableRound: 2, // current round is 3, so no room
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      teams,
      currentPick: { round: 3, teamIndex: 0 },
    })
    const next = draftEngine(state, { type: 'PICK_PLAYER', player })

    expect(next.pendingPrompt).toBeNull()
  })
})

// ── Pullback mechanics ─────────────────────────────────────────────────────

describe('pullback mechanics', () => {
  it('sets a pullback pendingPrompt when an opponent picks a previous-year player', () => {
    const pickedPlayer = makePlayer(0)
    const otherPrevPlayer = makePlayer(99)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [pickedPlayer, otherPrevPlayer],
      saveHistory: new Set([pickedPlayer.id]), // can't save this one
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      teams,
      availablePool: [pickedPlayer, otherPrevPlayer, ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1))],
      currentPick: { round: 1, teamIndex: 0 },
    })

    const next = draftEngine(state, { type: 'PICK_PLAYER', player: pickedPlayer })

    expect(next.pendingPrompt?.kind).toBe('pullback')
    const prompt = next.pendingPrompt!
    if (prompt.kind === 'pullback') {
      expect(prompt.reactingTeamIndex).toBe(1)
      expect(prompt.pickedPlayer).toEqual(pickedPlayer)
      expect(prompt.pullbackOptions).toContainEqual(otherPrevPlayer)
    }
  })

  it('INVOKE_PULLBACK places the pullback player in lastAvailableRound', () => {
    const pickedPlayer = makePlayer(0)
    const pullbackPlayer = makePlayer(99)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [pickedPlayer, pullbackPlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      teams,
      availablePool: [pickedPlayer, pullbackPlayer, ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1))],
      currentPick: { round: 1, teamIndex: 0 },
    })

    const afterPick = draftEngine(state, { type: 'PICK_PLAYER', player: pickedPlayer })
    const afterPullback = draftEngine(afterPick, { type: 'INVOKE_PULLBACK', pullbackPlayer })

    expect(afterPullback.teams[1]!.roster[15]).toEqual(pullbackPlayer)
    expect(afterPullback.teams[1]!.lastAvailableRound).toBe(14)
  })

  it('INVOKE_PULLBACK leaves the original pick standing (picking team keeps their player)', () => {
    const pickedPlayer = makePlayer(0)
    const pullbackPlayer = makePlayer(99)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [pickedPlayer, pullbackPlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      teams,
      availablePool: [pickedPlayer, pullbackPlayer, ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1))],
      currentPick: { round: 1, teamIndex: 0 },
    })

    const afterPick = draftEngine(state, { type: 'PICK_PLAYER', player: pickedPlayer })
    const afterPullback = draftEngine(afterPick, { type: 'INVOKE_PULLBACK', pullbackPlayer })

    // Picking team (team 0) keeps the original pick in round 1
    expect(afterPullback.teams[0]!.roster[1]).toEqual(pickedPlayer)
  })

  it('INVOKE_PULLBACK removes the pulled-back player from the available pool', () => {
    const pickedPlayer = makePlayer(0)
    const pullbackPlayer = makePlayer(99)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [pickedPlayer, pullbackPlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      teams,
      availablePool: [pickedPlayer, pullbackPlayer, ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1))],
      currentPick: { round: 1, teamIndex: 0 },
    })

    const afterPick = draftEngine(state, { type: 'PICK_PLAYER', player: pickedPlayer })
    const afterPullback = draftEngine(afterPick, { type: 'INVOKE_PULLBACK', pullbackPlayer })

    expect(afterPullback.availablePool.find(p => p.id === pullbackPlayer.id)).toBeUndefined()
  })

  it('multiple pullbacks in one draft decrement lastAvailableRound correctly', () => {
    const picked1 = makePlayer(0)
    const picked2 = makePlayer(1)
    const pullback1 = makePlayer(98)
    const pullback2 = makePlayer(99)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [picked1, picked2, pullback1, pullback2],
      saveHistory: new Set([picked1.id, picked2.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const pool = [picked1, picked2, pullback1, pullback2, ...Array.from({ length: 20 }, (_, i) => makePlayer(i + 2))]
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )

    let state = makeDraftState({
      teams,
      availablePool: pool,
      currentPick: { round: 1, teamIndex: 0 },
    })

    // First pick triggers pullback opportunity for team 1
    state = draftEngine(state, { type: 'PICK_PLAYER', player: picked1 })
    expect(state.pendingPrompt?.kind).toBe('pullback')
    state = draftEngine(state, { type: 'INVOKE_PULLBACK', pullbackPlayer: pullback1 })
    expect(state.teams[1]!.lastAvailableRound).toBe(14)

    // Second pick (from team 1 now) — advance past team 1's turn first (team 1 picks next)
    // Pick for team 1 (normal pick), then team 2 picks picked2 triggering another pullback
    state = draftEngine(state, { type: 'PICK_PLAYER', player: makePlayer(50) }) // team 1 picks
    state = draftEngine(state, { type: 'PICK_PLAYER', player: picked2 }) // team 2 picks prev-year player of team 1
    if (state.pendingPrompt?.kind === 'pullback') {
      state = draftEngine(state, { type: 'INVOKE_PULLBACK', pullbackPlayer: pullback2 })
    }
    expect(state.teams[1]!.lastAvailableRound).toBe(13)
  })

  it('DECLINE_PULLBACK advances pick cursor without filling any slot', () => {
    const pickedPlayer = makePlayer(0)
    const pullbackPlayer = makePlayer(99)
    const ownerTeam = makeTeam({
      name: 'Owner',
      previousYearRoster: [pickedPlayer, pullbackPlayer],
      saveHistory: new Set([pickedPlayer.id]),
      saveUsedThisDraft: false,
      lastAvailableRound: 15,
    })
    const teams = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? ownerTeam : makeTeam({ name: `Team ${i}` }),
    )
    const state = makeDraftState({
      teams,
      availablePool: [pickedPlayer, pullbackPlayer, ...Array.from({ length: 10 }, (_, i) => makePlayer(i + 1))],
      currentPick: { round: 1, teamIndex: 0 },
    })

    const afterPick = draftEngine(state, { type: 'PICK_PLAYER', player: pickedPlayer })
    const afterDecline = draftEngine(afterPick, { type: 'DECLINE_PULLBACK' })

    expect(afterDecline.pendingPrompt).toBeNull()
    expect(afterDecline.currentPick).toEqual({ round: 1, teamIndex: 1 })
    expect(afterDecline.teams[1]!.lastAvailableRound).toBe(15) // unchanged
  })
})
