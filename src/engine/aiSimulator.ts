import type { Player, Team } from "../types";

/** Gaussian noise via Box-Muller transform. */
function gaussianNoise(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface AiPickResult {
  player: Player;
  /** The σ-scaled noise (Gaussian draw × 5, in ADP-rank units) actually
   *  added to the winning player's ADP to produce its score — the same
   *  units as the score comparison itself, so the debug log's "why" for a
   *  divergence reads as the real rank shift rather than the pre-scale
   *  Gaussian draw. */
  noise: number;
}

/** AI picks the best available player by ADP with Gaussian noise (σ = 5 ranks),
 *  also returning the scaled noise that produced the winning score. Returns
 *  null if the pool is empty. */
export function aiPickPlayerWithNoise(pool: Player[]): AiPickResult | null {
  if (pool.length === 0) return null;
  const scored = pool.map((p) => {
    const noise = gaussianNoise() * 5;
    return { player: p, noise, score: p.adp + noise };
  });
  scored.sort((a, b) => a.score - b.score);
  return { player: scored[0].player, noise: scored[0].noise };
}

// ── Retention strategy (franchise / save / pullback) ───────────────────────

/** Fixed, non-configurable chance that a simulated team's franchise/save/
 *  pullback decision is a near-miss on the correct rule rather than the
 *  algorithmic optimum. Shared across all three decision points. */
export const MISTAKE_PROBABILITY = 0.08;

/** Draws whether the current decision is a "mistake" (near-miss, never a
 *  wild choice) per MISTAKE_PROBABILITY. */
export function isMistake(): boolean {
  return Math.random() < MISTAKE_PROBABILITY;
}

/** Best (lowest-ADP) player in the list, or null if empty. Reused as the
 *  deterministic "optimal" comparison point wherever noisy AI decisions need
 *  one — the debug log's pick entries included. */
export function bestByAdp(players: Player[]): Player | null {
  if (players.length === 0) return null;
  return players.reduce((best, p) => (p.adp < best.adp ? p : best));
}

type FranchiseTeam = Pick<
  Team,
  "previousYearRoster" | "franchiseEligibleIds" | "saveHistory"
>;

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
    .filter((p) => team.franchiseEligibleIds.has(p.id))
    .slice()
    .sort((a, b) => a.adp - b.adp);

  if (eligible.length === 0) return null;

  const X = eligible[0];
  const Y = eligible[1] ?? null;

  let target = X;
  if (Y) {
    const xBlocked = team.saveHistory.has(X.id);
    const yBlocked = team.saveHistory.has(Y.id);
    // The player who would naturally be targeted for save (excluding X),
    // ignoring save history — used to tell whether Y's absence from the
    // save target is actually *because* Y is save-blocked.
    const naturalSaveTarget = bestByAdp(
      team.previousYearRoster.filter((p) => p.id !== X.id),
    );
    const swap = yBlocked && !xBlocked && naturalSaveTarget?.id === Y.id;
    if (swap) target = Y;
  }

  // Mistake noise substitutes the next-best eligible candidate (by ADP) for
  // whichever player the algorithm above landed on — X normally, or Y when
  // the save-blocked swap fired. Note this is intentionally independent of
  // the swap's own top-two confinement: if the swap already promoted Y to
  // the franchise slot, a mistake here steps to the third-ranked eligible
  // player, not back to X (which is earmarked for save).
  if (isMistake()) {
    const idx = eligible.findIndex((p) => p.id === target.id);
    const mistakeTarget = eligible[idx + 1];
    if (mistakeTarget) return mistakeTarget;
  }

  return target;
}

type SaveTeam = Pick<Team, "previousYearRoster" | "saveHistory">;

/** Save-eligible candidates (excluding the franchise target and anyone
 *  already in save history), sorted ascending by ADP — best first. */
function saveCandidates(
  team: SaveTeam,
  franchiseTarget: Player | null,
): Player[] {
  return team.previousYearRoster
    .filter((p) => p.id !== franchiseTarget?.id && !team.saveHistory.has(p.id))
    .slice()
    .sort((a, b) => a.adp - b.adp);
}

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
  return saveCandidates(team, franchiseTarget)[0] ?? null;
}

/**
 * Computes a team's current save target with mistake noise applied: on a
 * mistake draw, the next-best saveable candidate (by ADP) stands in for the
 * algorithm's top choice for this one decision. Used at the point a save
 * decision is actually made, so it never gets baked into `computeSaveTarget`
 * itself (which stays deterministic for callers like the swap computation).
 */
export function computeSaveTargetWithMistake(
  team: SaveTeam,
  franchiseTarget: Player | null,
): Player | null {
  const candidates = saveCandidates(team, franchiseTarget);
  if (candidates.length === 0) return null;
  return isMistake() ? (candidates[1] ?? candidates[0]) : candidates[0];
}

/**
 * Expected ADP of the roster slot a pullback (or save) would consume — the
 * ADP rank a team drafting at its fixed non-snake position would expect from
 * a normal pick at that round: `(round - 1) * teamCount + teamPositionInOrder`.
 * `teamPositionInOrder` is 1-indexed.
 */
export function computeExpectedAdp(
  round: number,
  teamPositionInOrder: number,
  teamCount: number,
): number {
  return (round - 1) * teamCount + teamPositionInOrder;
}

/**
 * Whether a pullback candidate is worth more than the normal pick the team
 * would otherwise get with the roster slot the pullback would consume: true
 * when `candidateAdp` is better (lower) than `expectedAdp`. Subject to
 * mistake noise, which — since pullback is a live accept/decline call rather
 * than a choice among candidates — nudges the outcome to the wrong side of
 * the threshold for this one decision instead of substituting a candidate.
 */
export function shouldPullback(
  candidateAdp: number,
  expectedAdp: number,
): boolean {
  const optimal = candidateAdp < expectedAdp;
  return isMistake() ? !optimal : optimal;
}
