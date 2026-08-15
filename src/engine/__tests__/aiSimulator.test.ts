import { describe, it, expect, vi } from 'vitest'
import { computeFranchiseTarget, computeSaveTarget } from '../aiSimulator'
import type { Player } from '../../types'

// ── Fixtures ───────────────────────────────────────────────────────────────

function makePlayer(name: string, adp: number): Player {
  return {
    id: `${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    position: 'RB',
    nflTeam: 'KC',
    adp,
  }
}

/** Runs `fn` with Math.random pinned above the mistake-noise threshold, so
 *  the algorithm's optimal choice is returned deterministically. */
function withoutMistakes<T>(fn: () => T): T {
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
  try {
    return fn()
  } finally {
    randomSpy.mockRestore()
  }
}

// ── computeFranchiseTarget ──────────────────────────────────────────────────

describe('computeFranchiseTarget', () => {
  it('franchises the single eligible player, with no swap logic invoked', () => {
    const p = makePlayer('Only Guy', 5)
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [p],
        franchiseEligibleIds: new Set([p.id]),
        saveHistory: new Set(),
      }),
    )
    expect(target!.id).toBe(p.id)
  })

  it('franchises the best-ADP eligible player when several are eligible', () => {
    const best = makePlayer('Best', 2)
    const mid = makePlayer('Mid', 5)
    const worst = makePlayer('Worst', 9)
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [worst, best, mid],
        franchiseEligibleIds: new Set([best.id, mid.id, worst.id]),
        saveHistory: new Set(),
      }),
    )
    expect(target!.id).toBe(best.id)
  })

  it('returns null when there are no eligible players', () => {
    const p = makePlayer('Not Eligible', 1)
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [p],
        franchiseEligibleIds: new Set(),
        saveHistory: new Set(),
      }),
    )
    expect(target).toBeNull()
  })

  it('swaps to franchise Y when Y is save-blocked, would otherwise be the save target, and X is not blocked', () => {
    const x = makePlayer('X', 1) // best eligible
    const y = makePlayer('Y', 2) // second-best eligible, save-blocked
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [x, y],
        franchiseEligibleIds: new Set([x.id, y.id]),
        saveHistory: new Set([y.id]),
      }),
    )
    expect(target!.id).toBe(y.id)
  })

  it('does not swap when both X and Y are save-blocked (franchises X as normal)', () => {
    const x = makePlayer('X', 1)
    const y = makePlayer('Y', 2)
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [x, y],
        franchiseEligibleIds: new Set([x.id, y.id]),
        saveHistory: new Set([x.id, y.id]),
      }),
    )
    expect(target!.id).toBe(x.id)
  })

  it('does not swap when Y is save-blocked but a non-eligible player outranks Y (Y was never the natural save target)', () => {
    const x = makePlayer('X', 1)
    const y = makePlayer('Y', 3) // eligible, second-best, save-blocked
    const nonEligible = makePlayer('Better Non-Eligible', 2) // outranks Y, not save-blocked
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [x, y, nonEligible],
        franchiseEligibleIds: new Set([x.id, y.id]),
        saveHistory: new Set([y.id]),
      }),
    )
    // The natural save target excluding X is the non-eligible player, not Y,
    // so Y's absence isn't attributable to its block — no swap.
    expect(target!.id).toBe(x.id)
  })

  it('never considers a third eligible candidate for the swap', () => {
    const x = makePlayer('X', 1)
    const y = makePlayer('Y', 2) // save-blocked
    const z = makePlayer('Z', 3) // third-best eligible, not save-blocked
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [x, y, z],
        franchiseEligibleIds: new Set([x.id, y.id, z.id]),
        saveHistory: new Set([x.id, y.id]),
      }),
    )
    // Both X and Y are blocked, so no swap — and Z (third-ranked) is never
    // considered even though it isn't blocked.
    expect(target!.id).toBe(x.id)
  })

  it('applies mistake noise by franchising the next-best eligible candidate', () => {
    const best = makePlayer('Best', 1)
    const nextBest = makePlayer('Next Best', 2)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const target = computeFranchiseTarget({
        previousYearRoster: [best, nextBest],
        franchiseEligibleIds: new Set([best.id, nextBest.id]),
        saveHistory: new Set(),
      })
      expect(target!.id).toBe(nextBest.id)
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('applies mistake noise relative to the swapped target, stepping to the third-ranked eligible player (not back to X)', () => {
    const x = makePlayer('X', 1) // best eligible, earmarked for save after swap
    const y = makePlayer('Y', 2) // second-best eligible, save-blocked — swap target
    const z = makePlayer('Z', 3) // third-best eligible
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const target = computeFranchiseTarget({
        previousYearRoster: [x, y, z],
        franchiseEligibleIds: new Set([x.id, y.id, z.id]),
        saveHistory: new Set([y.id]),
      })
      expect(target!.id).toBe(z.id)
    } finally {
      randomSpy.mockRestore()
    }
  })
})

// ── computeSaveTarget ────────────────────────────────────────────────────────

describe('computeSaveTarget', () => {
  it('picks the best-ADP remaining player, excluding the franchise target', () => {
    const franchise = makePlayer('Franchise', 1)
    const best = makePlayer('Best Remaining', 2)
    const worse = makePlayer('Worse Remaining', 5)
    const target = computeSaveTarget(
      { previousYearRoster: [franchise, worse, best], saveHistory: new Set() },
      franchise,
    )
    expect(target!.id).toBe(best.id)
  })

  it('skips players already in save history', () => {
    const franchise = makePlayer('Franchise', 1)
    const blocked = makePlayer('Blocked', 2)
    const nextBest = makePlayer('Next Best', 3)
    const target = computeSaveTarget(
      {
        previousYearRoster: [franchise, blocked, nextBest],
        saveHistory: new Set([blocked.id]),
      },
      franchise,
    )
    expect(target!.id).toBe(nextBest.id)
  })

  it('falls through to a non-eligible player when it outranks the eligible pool', () => {
    // computeSaveTarget is roster-wide — eligibility is irrelevant to it.
    const franchise = makePlayer('Franchise', 1)
    const nonEligibleButBest = makePlayer('Non-Eligible Best', 2)
    const eligibleWorse = makePlayer('Eligible Worse', 4)
    const target = computeSaveTarget(
      {
        previousYearRoster: [franchise, eligibleWorse, nonEligibleButBest],
        saveHistory: new Set(),
      },
      franchise,
    )
    expect(target!.id).toBe(nonEligibleButBest.id)
  })

  it('returns null when no roster is left after excluding franchise target and save history', () => {
    const franchise = makePlayer('Franchise', 1)
    const blocked = makePlayer('Blocked', 2)
    const target = computeSaveTarget(
      { previousYearRoster: [franchise, blocked], saveHistory: new Set([blocked.id]) },
      franchise,
    )
    expect(target).toBeNull()
  })

  it('returns the best not-previously-saved roster player when there is no franchise target', () => {
    const p1 = makePlayer('P1', 3)
    const p2 = makePlayer('P2', 1)
    const target = computeSaveTarget(
      { previousYearRoster: [p1, p2], saveHistory: new Set() },
      null,
    )
    expect(target!.id).toBe(p2.id)
  })

  it('recomputes dynamically when the previous target is no longer valid (e.g. now saved)', () => {
    const franchise = makePlayer('Franchise', 1)
    const prevTarget = makePlayer('Previously Best', 2)
    const nextTarget = makePlayer('Now Best', 3)

    const before = computeSaveTarget(
      { previousYearRoster: [franchise, prevTarget, nextTarget], saveHistory: new Set() },
      franchise,
    )
    expect(before!.id).toBe(prevTarget.id)

    // prevTarget has since been saved — recomputing (fresh call) should
    // move on to the next-best candidate.
    const after = computeSaveTarget(
      {
        previousYearRoster: [franchise, prevTarget, nextTarget],
        saveHistory: new Set([prevTarget.id]),
      },
      franchise,
    )
    expect(after!.id).toBe(nextTarget.id)
  })
})
