import type {
  DraftState,
  LogEntry,
  PickAiContext,
  PickRecord,
  Player,
  Team,
} from "../types";
import { TOTAL_ROUNDS } from "../constants";
import { buildReactionQueue, resolveReaction } from "./reactionQueue";

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
 *  for the engine: the AI-turn skip check in `simulationOrchestrator.ts`'s
 *  `ADVANCE_SIMULATION` handling calls this instead of keeping its own
 *  loop. */
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

// ── Debug log ─────────────────────────────────────────────────────────────

/** Build the `debugLog` entry for a `PICK_PLAYER` action. Presence of
 *  `aiContext` — attached only by `advanceSimulation`, never by the UI — is
 *  what distinguishes a simulated pick from a human one; the reducer doesn't
 *  re-derive "ai"-ness from `state.mode`/`userTeamIndex` itself. */
function buildPickLogEntry(
  seq: number,
  round: number,
  teamIndex: number,
  player: Player,
  aiContext: PickAiContext | undefined,
): LogEntry {
  if (!aiContext) {
    return {
      seq,
      type: "PICK_PLAYER",
      round,
      teamIndex,
      actor: "user",
      player,
    };
  }
  const { optimalPlayer, noise } = aiContext;
  const diverged = optimalPlayer !== null && optimalPlayer.id !== player.id;
  return {
    seq,
    type: "PICK_PLAYER",
    round,
    teamIndex,
    actor: "ai",
    player,
    optimalPlayer: optimalPlayer ?? undefined,
    diverged,
    ...(diverged ? { noise } : {}),
  };
}

// ── PICK_PLAYER reducer ──────────────────────────────────────────────────

/** Handle a normal pick: place the player in the picking team's next open
 *  normal slot, remove them from the pool, record the pick, and build/drain
 *  any reactions the pick triggers. `aiContext` — present only when this
 *  action was synthesized by `advanceSimulation` — drives the optimal-
 *  comparison fields on the resulting debug-log entry. */
export function pickPlayer(
  state: DraftState,
  player: Player,
  aiContext?: PickAiContext,
): DraftState {
  const { round, teamIndex } = state.currentPick;
  const pickingTeam = state.teams[teamIndex];

  // Slot for this normal pick: scan forward past any pre-filled slots
  // (saves or pullbacks placed there earlier in the draft).
  const targetRound = nextNormalSlot(pickingTeam, round);
  const updatedTeam = placeInRoster(pickingTeam, targetRound, player);
  const teams = state.teams.map((t, i) => (i === teamIndex ? updatedTeam : t));

  const availablePool = removeFromPool(state.availablePool, player);

  const record: PickRecord = {
    round: targetRound,
    teamIndex,
    player,
    pickType: "normal",
  };
  const pickHistory = [...state.pickHistory, record];

  const logEntry = buildPickLogEntry(
    state.debugLog.length,
    targetRound,
    teamIndex,
    player,
    aiContext,
  );
  const debugLog = [...state.debugLog, logEntry];

  // Build any reaction prompts triggered by this pick.
  const reactionQueue = buildReactionQueue(
    { ...state, teams, availablePool },
    player,
    teamIndex,
  );

  return {
    ...state,
    teams,
    availablePool,
    pickHistory,
    debugLog,
    ...resolveReaction({ ...state, reactionQueue }, teams, advanceCursor),
  };
}
