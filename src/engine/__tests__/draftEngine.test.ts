import { describe, it, expect } from 'vitest'
import { draftEngine } from '../draftEngine'
import { makeDraftState, makePlayer, makeTeam } from '../testHelpers'
import type { DraftState } from '../../types'

// ── Helpers ────────────────────────────────────────────────────────────────

function pickAll(state: DraftState): DraftState {
  let s = state
  while (!s.isDraftComplete && !s.pendingPrompt) {
    const player = s.availablePool[0]
    if (!player) break
    s = draftEngine(s, { type: 'PICK_PLAYER', player })
  }
  return s
}

// ── Non-snake sequencing ───────────────────────────────────────────────────

describe('non-snake pick sequencing', () => {
  it('advances teamIndex from 0 to 1 after first pick', () => {
    const state = makeDraftState()
    const player = state.availablePool[0]!
    const next = draftEngine(state, { type: 'PICK_PLAYER', player })
    expect(next.currentPick).toEqual({ round: 1, teamIndex: 1 })
  })

  it('advances teamIndex from 11 to 0 and increments round', () => {
    const state = makeDraftState({ currentPick: { round: 1, teamIndex: 11 } })
    const player = state.availablePool[0]!
    const next = draftEngine(state, { type: 'PICK_PLAYER', player })
    expect(next.currentPick).toEqual({ round: 2, teamIndex: 0 })
  })

  it('wraps correctly through a full round (picks 1–12)', () => {
    let state = makeDraftState()
    for (let i = 0; i < 12; i++) {
      const player = state.availablePool[0]!
      state = draftEngine(state, { type: 'PICK_PLAYER', player })
    }
    expect(state.currentPick).toEqual({ round: 2, teamIndex: 0 })
  })

  it('never reverses direction between rounds (same order in round 2 as round 1)', () => {
    let state = makeDraftState()
    // Complete round 1
    for (let i = 0; i < 12; i++) {
      state = draftEngine(state, { type: 'PICK_PLAYER', player: state.availablePool[0]! })
    }
    expect(state.currentPick.teamIndex).toBe(0)
    // First pick of round 2 should advance to teamIndex 1 (same direction)
    state = draftEngine(state, { type: 'PICK_PLAYER', player: state.availablePool[0]! })
    expect(state.currentPick).toEqual({ round: 2, teamIndex: 1 })
  })
})

// ── PICK_PLAYER — pool and roster effects ──────────────────────────────────

describe('PICK_PLAYER effects', () => {
  it('removes the picked player from the available pool', () => {
    const state = makeDraftState()
    const player = state.availablePool[0]!
    const next = draftEngine(state, { type: 'PICK_PLAYER', player })
    expect(next.availablePool.find(p => p.id === player.id)).toBeUndefined()
  })

  it("places the player in the picking team's roster at the current round", () => {
    const state = makeDraftState()
    const player = state.availablePool[0]!
    const next = draftEngine(state, { type: 'PICK_PLAYER', player })
    // team 0 picked in round 1
    expect(next.teams[0]!.roster[1]).toEqual(player)
  })

  it('records the pick in pickHistory', () => {
    const state = makeDraftState()
    const player = state.availablePool[0]!
    const next = draftEngine(state, { type: 'PICK_PLAYER', player })
    expect(next.pickHistory).toHaveLength(1)
    expect(next.pickHistory[0]).toMatchObject({ round: 1, teamIndex: 0, player, pickType: 'normal' })
  })
})

// ── Draft completion ───────────────────────────────────────────────────────

describe('draft completion', () => {
  it('is not complete after 191 picks', () => {
    // Build a state with only 2 players left so we can stop 1 short
    const players = Array.from({ length: 192 }, (_, i) => makePlayer(i))
    // Pre-fill 190 picks: teams × rounds, leave last 2 empty
    const teams = Array.from({ length: 12 }, (_, ti) =>
      makeTeam({
        roster: Array.from({ length: 17 }, (_, ri) => {
          if (ri === 0) return null
          // rounds 1–15 for teams 0–9 are filled; team 10 round 16 not filled; team 11 round 16 not filled
          const pickNum = (ri - 1) * 12 + ti + 1
          if (pickNum <= 190) return players[pickNum - 1]!
          return null
        }),
      }),
    )
    const available = [players[190]!, players[191]!]
    const state = makeDraftState({
      teams,
      availablePool: available,
      currentPick: { round: 16, teamIndex: 10 },
      pickHistory: Array.from({ length: 190 }, (_, i) => ({
        round: Math.floor(i / 12) + 1,
        teamIndex: i % 12,
        player: players[i]!,
        pickType: 'normal' as const,
      })),
    })
    const next = draftEngine(state, { type: 'PICK_PLAYER', player: available[0]! })
    expect(next.isDraftComplete).toBe(false)
  })

  it('marks isDraftComplete after all 192 picks', () => {
    const players = Array.from({ length: 192 }, (_, i) => makePlayer(i))
    const teams = Array.from({ length: 12 }, (_, ti) =>
      makeTeam({
        roster: Array.from({ length: 17 }, (_, ri) => {
          if (ri === 0) return null
          const pickNum = (ri - 1) * 12 + ti + 1
          if (pickNum <= 191) return players[pickNum - 1]!
          return null
        }),
      }),
    )
    const state = makeDraftState({
      teams,
      availablePool: [players[191]!],
      currentPick: { round: 16, teamIndex: 11 },
      pickHistory: Array.from({ length: 191 }, (_, i) => ({
        round: Math.floor(i / 12) + 1,
        teamIndex: i % 12,
        player: players[i]!,
        pickType: 'normal' as const,
      })),
    })
    const next = draftEngine(state, { type: 'PICK_PLAYER', player: players[191]! })
    expect(next.isDraftComplete).toBe(true)
  })

  it('completes a full draft from round 1 pick 1', () => {
    const state = makeDraftState()
    const final = pickAll(state)
    expect(final.isDraftComplete).toBe(true)
    expect(final.pickHistory).toHaveLength(192)
    // Each team's 16 roster slots should all be filled
    for (const team of final.teams) {
      const filled = team.roster.slice(1).filter(s => s !== null)
      expect(filled).toHaveLength(16)
    }
  })
})
