import type { LogEntry } from "../types";

// ── Debug log ─────────────────────────────────────────────────────────────

/** Build the `debugLog` entry for a team's turn skipped because it has no
 *  open normal slot at the landing round. Shared by `reactionQueue.ts`'s
 *  `resolveReaction` (the post-action cursor advance every pick/save/
 *  pullback/decline runs through — the path that actually skips full teams
 *  during normal play) and `simulationOrchestrator.ts`'s `ADVANCE_SIMULATION`
 *  handler (a defensive top-level check for a cursor already parked on a
 *  full team), so both sites produce identically shaped entries. */
export function buildSkipLogEntry(
  seq: number,
  round: number,
  teamIndex: number,
): LogEntry {
  return { seq, type: "SKIP_TURN", round, teamIndex, reason: "no-open-slot" };
}
