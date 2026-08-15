import type { PickRecord, Player, Team } from "../types";
import { TOTAL_ROUNDS } from "../constants";

// ── Roster / pool helpers ────────────────────────────────────────────────

export function removeFromPool(pool: Player[], player: Player): Player[] {
  return pool.filter((p) => p.id !== player.id);
}

export function placeInRoster(
  team: Team,
  round: number,
  player: Player | null,
): Team {
  const roster = [...team.roster];
  roster[round] = player;
  return { ...team, roster };
}

// ── Pick sequencing ──────────────────────────────────────────────────────

/** Return the next { round, teamIndex } after a pick, or null if draft is done. */
export function nextPick(
  round: number,
  teamIndex: number,
  totalTeams: number,
): { round: number; teamIndex: number } | null {
  if (teamIndex < totalTeams - 1) {
    return { round, teamIndex: teamIndex + 1 };
  }
  if (round < TOTAL_ROUNDS) {
    return { round: round + 1, teamIndex: 0 };
  }
  return null; // draft over
}

/** Count how many roster slots (rounds 1–16) are filled across all teams. */
export function totalPicksFilled(teams: Team[]): number {
  return teams.reduce((sum, team) => {
    return sum + team.roster.slice(1).filter((slot) => slot !== null).length;
  }, 0);
}

/** Return true when the team has at least one unfilled slot >= fromRound. */
export function teamHasOpenNormalSlot(team: Team, fromRound: number): boolean {
  for (let r = fromRound; r <= TOTAL_ROUNDS; r++) {
    if (team.roster[r] === null) return true;
  }
  return false;
}

/** Advance the cursor via nextPick, skipping any team whose roster has no
 *  open normal slot at the landing round (e.g. a franchise team whose round-16
 *  slot is pre-filled and whose normal picks are already exhausted). Returns
 *  null once no team has any pick left to make — the draft is complete.
 *
 *  This is the single "find the next team+round with an open slot" primitive
 *  for the engine: the AI-turn skip check (currently inline in
 *  `draftEngine.ts`'s `ADVANCE_SIMULATION` case, moving to
 *  `simulationOrchestrator.ts` in a later extraction) is expected to call
 *  this instead of keeping its own loop. */
export function advanceCursor(
  round: number,
  teamIndex: number,
  teams: Team[],
): { round: number; teamIndex: number } | null {
  let next = nextPick(round, teamIndex, teams.length);
  while (next && !teamHasOpenNormalSlot(teams[next.teamIndex], next.round)) {
    next = nextPick(next.round, next.teamIndex, teams.length);
  }
  return next;
}

/** Return the first unfilled roster slot >= fromRound for the given team.
 *  Saves and pullbacks fill from the back; a normal pick must skip any such
 *  pre-filled slots so it never overwrites them. */
export function nextNormalSlot(team: Team, fromRound: number): number {
  for (let r = fromRound; r <= TOTAL_ROUNDS; r++) {
    if (team.roster[r] === null) return r;
  }
  // Should never happen in a well-formed draft: the engine only reaches here
  // if the team's roster is already full, but the draft would be complete.
  throw new Error(
    `No open normal slot for team "${team.name}" starting at round ${fromRound}`,
  );
}

/** A save blocks the original normal pick: drop the `pickType: "normal"`
 *  record matching this team/player from history so the save can re-home
 *  the player without the voided pick lingering behind it. */
export function retractNormalPick(
  pickHistory: PickRecord[],
  teamIndex: number,
  player: Player,
): PickRecord[] {
  return pickHistory.filter(
    (r) =>
      !(
        r.teamIndex === teamIndex &&
        r.player.id === player.id &&
        r.pickType === "normal"
      ),
  );
}
