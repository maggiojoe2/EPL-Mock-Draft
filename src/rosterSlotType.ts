import { TOTAL_ROUNDS } from "./constants";
import type { PickRecord, Team } from "./types";

// ── slotKey ──────────────────────────────────────────────────────────────

/** Encode a (teamIndex, round) roster slot as a map key. */
export function slotKey(teamIndex: number, round: number): string {
  return `${teamIndex}-${round}`;
}

// ── buildSlotTypeMap ─────────────────────────────────────────────────────

/**
 * Build a lookup from `slotKey(teamIndex, round)` → pickType for every
 * filled roster slot.
 *
 * Normal / save / pullback picks are sourced from `pickHistory`. Franchise
 * pre-fills are placed by `initDraft` (not through `PICK_PLAYER`) so they
 * have no history entry — they're detected instead from each team's
 * `franchisePlayer` compared against `team.roster[TOTAL_ROUNDS]`. That
 * fallback is guarded by `!map.has(key)` so a future `pickHistory`-sourced
 * franchise entry would win over it rather than being overwritten.
 */
export function buildSlotTypeMap(
  teams: Team[],
  pickHistory: PickRecord[],
): Map<string, PickRecord["pickType"]> {
  const map = new Map<string, PickRecord["pickType"]>();

  for (const record of pickHistory) {
    map.set(slotKey(record.teamIndex, record.round), record.pickType);
  }

  for (let ti = 0; ti < teams.length; ti++) {
    const team = teams[ti];
    if (
      team.franchisePlayer &&
      team.roster[TOTAL_ROUNDS]?.id === team.franchisePlayer.id
    ) {
      const key = slotKey(ti, TOTAL_ROUNDS);
      if (!map.has(key)) map.set(key, "franchise");
    }
  }

  return map;
}
