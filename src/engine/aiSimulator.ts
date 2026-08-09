import type { Player } from '../types'

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
