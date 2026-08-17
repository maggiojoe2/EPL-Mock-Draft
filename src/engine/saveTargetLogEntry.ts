import type { LogEntry, Player, SaveTargetPurpose } from "../types";

// ── Debug log ─────────────────────────────────────────────────────────────

/** Build the `debugLog` entry for a single `computeSaveTarget`/
 *  `computeSaveTargetWithMistake` call, recording which team it was computed
 *  for, why (`purpose`), and the resulting target. Used by
 *  `simulationOrchestrator.ts` at both of its recompute sites — the
 *  pullback-candidate exclusion check and AI save-prompt resolution —
 *  so both produce identically shaped entries. */
export function buildSaveTargetLogEntry(
  seq: number,
  round: number,
  teamIndex: number,
  purpose: SaveTargetPurpose,
  target: Player | null,
): LogEntry {
  return {
    seq,
    type: "SAVE_TARGET_COMPUTED",
    round,
    teamIndex,
    purpose,
    target,
  };
}
