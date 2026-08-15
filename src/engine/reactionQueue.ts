import type { DraftState, Player, Team } from "../types";

// ── Reaction helpers ───────────────────────────────────────────────────────

/** Check whether any team can save or pull back on a just-picked player.
 *  Returns an array of PendingPrompt in the order teams should be asked. */
export function buildReactionQueue(
  state: DraftState,
  pickedPlayer: Player,
  pickingTeamIndex: number,
) {
  const queue: DraftState["reactionQueue"] = [];

  for (let ti = 0; ti < state.teams.length; ti++) {
    if (ti === pickingTeamIndex) continue;
    const team = state.teams[ti];
    const ownsPlayer = team.previousYearRoster.some(
      (p) => p.id === pickedPlayer.id,
    );
    if (!ownsPlayer) continue;

    // A reaction is only allowed when the team still has a back-slot ahead of
    // the current round (strictly greater, to avoid filling a slot the cursor
    // will visit as a normal pick this same round).
    const hasRoomForReaction =
      team.lastAvailableRound > state.currentPick.round;

    if (!hasRoomForReaction) continue;

    // Save check: player must be saveable (never saved by this team in the
    // real league, per saveHistory) and the team hasn't used its one save
    // this draft yet.
    const isSaveable =
      !team.saveHistory.has(pickedPlayer.id) && !team.saveUsedThisDraft;

    // Pullback options: any other previous-year player still in the pool.
    // Sorted ascending by ADP so the AI's "highest-ADP" pick (opts[0]) and the
    // practice-mode modal both present the best remaining option first.
    const pullbackOptions = team.previousYearRoster
      .filter(
        (p) =>
          state.availablePool.some((ap) => ap.id === p.id) &&
          p.id !== pickedPlayer.id,
      )
      .sort((a, b) => a.adp - b.adp);

    if (isSaveable) {
      // A team with an unused save can save the picked player, pull back a
      // different previous-year player instead, or decline — all in one
      // reaction. Only one team reacts per pick (the player's sole owner),
      // so this is still a single queue entry.
      queue.push({
        kind: "save",
        pickingTeamIndex,
        reactingTeamIndex: ti,
        player: pickedPlayer,
        pullbackOptions,
      });
      continue;
    }

    // Save isn't available (already used, or this player was previously
    // saved) — offer pullback alone if any options remain.
    if (pullbackOptions.length > 0) {
      queue.push({
        kind: "pullback",
        pickingTeamIndex,
        reactingTeamIndex: ti,
        pickedPlayer,
        pullbackOptions,
      });
    }
  }

  return queue;
}

// ── Queue / completion helpers ─────────────────────────────────────────────

export function dequeue(queue: DraftState["reactionQueue"]): {
  head: DraftState["pendingPrompt"];
  tail: DraftState["reactionQueue"];
} {
  if (queue.length === 0) return { head: null, tail: [] };
  const [head, ...tail] = queue;
  return { head: head, tail };
}

/** Shared tail logic for every reaction handler: dequeue next prompt, advance
 *  the pick cursor when all reactions are resolved, and check for completion.
 *  `advanceCursor` is passed in rather than owned here — it stays defined
 *  alongside pick-sequencing until that logic is extracted in its own
 *  module. */
export function resolveReaction(
  state: DraftState,
  teams: DraftState["teams"],
  advanceCursor: (
    round: number,
    teamIndex: number,
    teams: Team[],
  ) => { round: number; teamIndex: number } | null,
): Pick<
  DraftState,
  "currentPick" | "pendingPrompt" | "reactionQueue" | "isDraftComplete"
> {
  const { head: pendingPrompt, tail: reactionQueue } = dequeue(
    state.reactionQueue,
  );

  const { round, teamIndex } = state.currentPick;
  const next =
    pendingPrompt === null ? advanceCursor(round, teamIndex, teams) : null;

  const isDraftComplete =
    pendingPrompt === null && reactionQueue.length === 0 && next === null;

  return {
    currentPick: next ?? state.currentPick,
    pendingPrompt,
    reactionQueue,
    isDraftComplete,
  };
}
