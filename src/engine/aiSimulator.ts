import type { Player, Team } from "../types";

/** Gaussian noise via Box-Muller transform. */
function gaussianNoise(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface AiPickResult {
  player: Player;
  /** The σ-scaled noise (Gaussian draw × 5, in rank units) actually
   *  added to the winning player's rank to produce its score — the same
   *  units as the score comparison itself, so the debug log's "why" for a
   *  divergence reads as the real rank shift rather than the pre-scale
   *  Gaussian draw. */
  noise: number;
}

/** AI picks the best available player by rank with Gaussian noise (σ = 5 ranks),
 *  also returning the scaled noise that produced the winning score. Returns
 *  null if the pool is empty. */
export function aiPickPlayerWithNoise(pool: Player[]): AiPickResult | null {
  if (pool.length === 0) return null;
  const scored = pool.map((p) => {
    const noise = gaussianNoise() * 5;
    return { player: p, noise, score: p.rank + noise };
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

/** Best (lowest-rank) player in the list, or null if empty. Reused as the
 *  deterministic "optimal" comparison point wherever noisy AI decisions need
 *  one — the debug log's pick entries included. */
export function bestByRank(players: Player[]): Player | null {
  if (players.length === 0) return null;
  return players.reduce((best, p) => (p.rank < best.rank ? p : best));
}

/** Whether `candidate` shares a `position` with `team`'s declared franchise
 *  player — the rule that a saved player may never occupy the same position
 *  as the franchise player. `franchisePlayer === null` (no franchise player
 *  declared yet, or none eligible) always reads as "no conflict." Shared by
 *  every save-eligibility check (live save decisions, the reaction queue,
 *  `invokeSave`'s guard, and the modal's render-time re-derivation) so the
 *  rule can't drift between call sites. */
export function conflictsWithFranchisePosition(
  team: Pick<Team, "franchisePlayer">,
  candidate: Player,
): boolean {
  return (
    team.franchisePlayer !== null &&
    candidate.position === team.franchisePlayer.position
  );
}

/** Why `candidate` isn't offered as a save to `team` when it's the sole
 *  reaction option a pullback-only prompt renders — one reason per
 *  eligibility check in `buildReactionQueue`'s `isSaveable`, checked in the
 *  same order (`saveHistory`, then `saveUsedThisDraft`, then franchise
 *  position) so the two never drift. `null` when the player would in fact
 *  be saveable (the caller only reaches for this when it already isn't). */
export type SaveIneligibleReason =
  "already-used" | "previously-saved" | "franchise-position";

type SaveEligibilityTeam = Pick<
  Team,
  "saveHistory" | "saveUsedThisDraft" | "franchisePlayer"
>;

export function saveIneligibleReason(
  team: SaveEligibilityTeam,
  candidate: Player,
): SaveIneligibleReason | null {
  if (team.saveHistory.has(candidate.id)) return "previously-saved";
  if (team.saveUsedThisDraft) return "already-used";
  if (conflictsWithFranchisePosition(team, candidate))
    return "franchise-position";
  return null;
}

type FranchiseTeam = Pick<
  Team,
  "previousYearRoster" | "franchiseEligibleIds" | "saveHistory"
>;

/** A monotonically decreasing function of rank — lower rank (better player)
 *  scores higher. Only ever used to compare pairs against each other, so its
 *  absolute scale doesn't matter, only that it's decreasing in rank. */
function rankValue(rank: number): number {
  return -rank;
}

type SaveTeam = Pick<Team, "previousYearRoster" | "saveHistory">;

/** Save-eligible candidates for `franchiseTarget` (excluding it and anyone
 *  already in save history), further excluding anyone who shares a position
 *  with `franchiseTarget` (a save may never double up the franchise slot's
 *  position). Sorted ascending by rank — best first. */
function saveCandidates(
  team: SaveTeam,
  franchiseTarget: Player | null,
): Player[] {
  return team.previousYearRoster
    .filter(
      (p) =>
        p.id !== franchiseTarget?.id &&
        !team.saveHistory.has(p.id) &&
        !conflictsWithFranchisePosition(
          { franchisePlayer: franchiseTarget },
          p,
        ),
    )
    .slice()
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Computes a team's franchise target by searching every franchise-eligible
 * candidate `F` for the one whose best legal save target (`saveCandidates(team,
 * F)[0]`) pairs with it for the highest combined rank-based value — not just
 * comparing the top two eligible players. A candidate with no legal save
 * target is still comparable (contributes zero save-side value, not a
 * penalty). Ties go to the lower-rank `F`. Subject to mistake noise: on a
 * mistake draw, the second-best pair's `F` stands in for the best, falling
 * back to the best when there's no second eligible candidate.
 *
 * Returns null when the team has no franchise-eligible players.
 */
export function computeFranchiseTarget(team: FranchiseTeam): Player | null {
  const eligible = team.previousYearRoster
    .filter((p) => team.franchiseEligibleIds.has(p.id))
    .slice()
    .sort((a, b) => a.rank - b.rank);

  if (eligible.length === 0) return null;

  const pairs = eligible
    .map((F) => {
      const saveTarget = saveCandidates(team, F)[0] ?? null;
      const score =
        rankValue(F.rank) + (saveTarget ? rankValue(saveTarget.rank) : 0);
      return { F, score };
    })
    .sort((a, b) => b.score - a.score || a.F.rank - b.F.rank);

  // Mistake noise substitutes the second-best pair's franchise candidate for
  // the best, falling back to the best when there's no second candidate.
  if (isMistake() && pairs[1]) return pairs[1].F;

  return pairs[0].F;
}

/**
 * Computes a team's current save target: the best-rank player on its
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

/** A save-target computation's mistake-affected result, alongside whether
 *  the `isMistake()` roll that produced it actually fired — surfaced
 *  separately from the resulting `target` so callers (the debug log, in
 *  particular) can tell "a mistake fired but happened to land on the same
 *  target anyway" apart from "no mistake fired". */
export interface SaveDecision {
  target: Player | null;
  mistakeFired: boolean;
}

/**
 * Computes a team's current save target with mistake noise applied: on a
 * mistake draw, the next-best saveable candidate (by rank) stands in for the
 * algorithm's top choice for this one decision. Used at the point a save
 * decision is actually made, so it never gets baked into `computeSaveTarget`
 * itself (which stays deterministic for callers like the swap computation).
 * Returns the mistake roll's outcome alongside the target so callers don't
 * need a second, redundant `isMistake()` draw to know whether it fired.
 */
export function computeSaveDecision(
  team: SaveTeam,
  franchiseTarget: Player | null,
): SaveDecision {
  const candidates = saveCandidates(team, franchiseTarget);
  if (candidates.length === 0) return { target: null, mistakeFired: false };
  const mistakeFired = isMistake();
  return {
    target: mistakeFired ? (candidates[1] ?? candidates[0]) : candidates[0],
    mistakeFired,
  };
}

/** Thin wrapper over `computeSaveDecision` for callers that only need the
 *  resulting target, not whether the mistake roll fired. */
export function computeSaveTargetWithMistake(
  team: SaveTeam,
  franchiseTarget: Player | null,
): Player | null {
  return computeSaveDecision(team, franchiseTarget).target;
}

/**
 * Expected rank of the roster slot a pullback (or save) would consume — the
 * rank a team drafting at its fixed non-snake position would expect from
 * a normal pick at that round: `(round - 1) * teamCount + teamPositionInOrder`.
 * `teamPositionInOrder` is 1-indexed.
 */
export function computeExpectedRank(
  round: number,
  teamPositionInOrder: number,
  teamCount: number,
): number {
  return (round - 1) * teamCount + teamPositionInOrder;
}

/** A single pullback accept/decline call's mistake-affected result,
 *  alongside whether the `isMistake()` roll that produced it fired. */
export interface PullbackStepDecision {
  result: boolean;
  mistakeFired: boolean;
}

/**
 * Whether a pullback candidate is worth more than the normal pick the team
 * would otherwise get with the roster slot the pullback would consume: true
 * when `candidateRank` is better (lower) than `expectedRank`. Subject to
 * mistake noise, which — since pullback is a live accept/decline call rather
 * than a choice among candidates — nudges the outcome to the wrong side of
 * the threshold for this one decision instead of substituting a candidate.
 * Returns the mistake roll's outcome alongside the result so callers don't
 * need a second, redundant `isMistake()` draw to know whether it fired.
 */
export function computePullbackStepDecision(
  candidateRank: number,
  expectedRank: number,
): PullbackStepDecision {
  const optimal = candidateRank < expectedRank;
  const mistakeFired = isMistake();
  return { result: mistakeFired ? !optimal : optimal, mistakeFired };
}

/** Thin wrapper over `computePullbackStepDecision` for callers that only
 *  need the resulting accept/decline call, not whether the mistake roll
 *  fired. */
export function shouldPullback(
  candidateRank: number,
  expectedRank: number,
): boolean {
  return computePullbackStepDecision(candidateRank, expectedRank).result;
}
