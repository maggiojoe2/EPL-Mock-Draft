import type { Player, Team } from '../types'

/** Gaussian noise via Box-Muller transform. */
function gaussianNoise(): number {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** AI picks the best available player by ADP with Gaussian noise (σ = 5 ranks).
 *  Returns null if the pool is empty. */
export function aiPickPlayer(pool: Player[]): Player | null {
  if (pool.length === 0) return null
  const scored = pool.map(p => ({ player: p, score: p.adp + gaussianNoise() * 5 }))
  scored.sort((a, b) => a.score - b.score)
  return scored[0]!.player
}

/** AI reaction probability: higher for high-value players (low ADP rank).
 *  adp = 1 → ~99% chance to react; adp = 100 → ~10% chance. */
export function aiShouldReact(playerAdp: number): boolean {
  const prob = Math.max(0.1, 1 - playerAdp / 100)
  return Math.random() < prob
}

// ── Retention strategy (franchise / save / pullback) ───────────────────────

/** Fixed, non-configurable chance that a simulated team's franchise/save/
 *  pullback decision is a near-miss on the correct rule rather than the
 *  algorithmic optimum. Shared across all three decision points. */
export const MISTAKE_PROBABILITY = 0.08

/** Draws whether the current decision is a "mistake" (near-miss, never a
 *  wild choice) per MISTAKE_PROBABILITY. */
export function isMistake(): boolean {
  return Math.random() < MISTAKE_PROBABILITY
}

/** Best (lowest-ADP) player in the list, or null if empty. */
function bestByAdp(players: Player[]): Player | null {
  if (players.length === 0) return null
  return players.reduce((best, p) => (p.adp < best.adp ? p : best))
}

type FranchiseTeam = Pick<Team, 'previousYearRoster' | 'franchiseEligibleIds' | 'saveHistory'>

/**
 * Computes a team's franchise target: its best franchise-eligible player,
 * unless doing so would leave a save-blocked eligible player unprotected —
 * in which case the two swap (franchise the save-blocked one, save the
 * other). Confined to the top two eligible players by ADP; never considers
 * a third candidate. Subject to mistake noise (near-miss substitution).
 *
 * Returns null when the team has no franchise-eligible players.
 */
export function computeFranchiseTarget(team: FranchiseTeam): Player | null {
  const eligible = team.previousYearRoster
    .filter(p => team.franchiseEligibleIds.has(p.id))
    .slice()
    .sort((a, b) => a.adp - b.adp)

  if (eligible.length === 0) return null

  const X = eligible[0]!
  const Y = eligible[1] ?? null

  let target = X
  if (Y) {
    const xBlocked = team.saveHistory.has(X.id)
    const yBlocked = team.saveHistory.has(Y.id)
    // The player who would naturally be targeted for save (excluding X),
    // ignoring save history — used to tell whether Y's absence from the
    // save target is actually *because* Y is save-blocked.
    const naturalSaveTarget = bestByAdp(
      team.previousYearRoster.filter(p => p.id !== X.id),
    )
    const swap = yBlocked && !xBlocked && naturalSaveTarget?.id === Y.id
    if (swap) target = Y
  }

  // Mistake noise substitutes the next-best eligible candidate (by ADP) for
  // whichever player the algorithm above landed on — X normally, or Y when
  // the save-blocked swap fired. Note this is intentionally independent of
  // the swap's own top-two confinement: if the swap already promoted Y to
  // the franchise slot, a mistake here steps to the third-ranked eligible
  // player, not back to X (which is earmarked for save).
  if (isMistake()) {
    const idx = eligible.findIndex(p => p.id === target.id)
    const mistakeTarget = eligible[idx + 1]
    if (mistakeTarget) return mistakeTarget
  }

  return target
}

type SaveTeam = Pick<Team, 'previousYearRoster' | 'saveHistory'>

/**
 * Computes a team's current save target: the best-ADP player on its
 * previous-year roster, excluding the given franchise target, that isn't
 * already in its save history. Pure and stateless, so callers get dynamic
 * recomputation for free by calling it fresh whenever a save decision is
 * needed.
 *
 * `franchiseTarget` should be the team's actual (already-resolved) franchise
 * target — including any save-blocked swap from computeFranchiseTarget — so
 * the exclusion lines up with the full algorithm.
 *
 * Returns null when no such player exists.
 */
export function computeSaveTarget(
  team: SaveTeam,
  franchiseTarget: Player | null,
): Player | null {
  const candidates = team.previousYearRoster.filter(
    p => p.id !== franchiseTarget?.id && !team.saveHistory.has(p.id),
  )
  return bestByAdp(candidates)
}
