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
    // Each team's 16 roster slots should all be filled (no saves in this run)
    for (const team of final.teams) {
      const filled = team.roster.slice(1).filter(s => s !== null)
      expect(filled).toHaveLength(16)
    }
  })

  // Regression: a franchise team's round-16 slot is pre-filled by initDraft.
  // Once its 15 normal rounds are also filled, its roster is "full" a round
  // early relative to the raw team/round cursor. The cursor used to land on
  // it anyway at round 16, and PICK_PLAYER would throw trying to find an
  // open slot — crashing the app instead of skipping to the next team.
  it('skips a franchise team whose normal rounds are already full instead of landing on it at round 16', () => {
    const franchisePlayer = makePlayer(999)
    // Rounds 1–14 filled, round 15 is the team's last open normal slot, round
    // 16 pre-filled by the franchise player (as initDraft does).
    const roster = Array.from({ length: 17 }, (_, r) => {
      if (r === 0 || r === 15) return null
      if (r === 16) return franchisePlayer
      return makePlayer(r)
    })
    const franchiseTeam = makeTeam({
      name: 'Franchise Team',
      roster,
      franchisePlayer,
      lastAvailableRound: 15,
    })
    const otherTeam = makeTeam({ name: 'Other Team' }) // fully open roster

    // Franchise team is on the clock for its final normal pick (round 15).
    const state = makeDraftState({
      teams: [otherTeam, franchiseTeam],
      currentPick: { round: 15, teamIndex: 1 },
      availablePool: [makePlayer(5001), makePlayer(5002)],
    })

    // Franchise team fills its last open slot (round 15) — now fully full.
    // Cursor would naively land on the franchise team again at round 16
    // (its only remaining "slot" is already occupied by the franchise pick).
    const afterFranchisePick = draftEngine(state, {
      type: 'PICK_PLAYER',
      player: state.availablePool[0]!,
    })
    expect(afterFranchisePick.currentPick).toEqual({ round: 16, teamIndex: 0 })

    // Other team makes its round-16 pick; the cursor must skip the now-full
    // franchise team instead of landing on it and throwing.
    const final = draftEngine(afterFranchisePick, {
      type: 'PICK_PLAYER',
      player: afterFranchisePick.availablePool[0]!,
    })
    expect(final.isDraftComplete).toBe(true)
  })

})
