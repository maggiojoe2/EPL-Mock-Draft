import type {
  LogEntry,
  Player,
  ReactionActionType,
  ReactionAiContext,
} from "../types";

// ── Debug log ─────────────────────────────────────────────────────────────

/** Build the `debugLog` entry for a save/pullback reaction action
 *  (`INVOKE_SAVE`/`DECLINE_SAVE`/`INVOKE_PULLBACK`/`DECLINE_PULLBACK`).
 *  Shared by `saveReducer.ts` and `pullbackReducer.ts` so the entry shape
 *  stays identical across all four action types. Presence of `aiContext` —
 *  attached only by `advanceSimulation`, never by the UI — is what
 *  distinguishes a simulated reaction from a human one; the reducers don't
 *  re-derive "ai"-ness from `state.mode`/`userTeamIndex` themselves. */
export function buildReactionLogEntry(
  seq: number,
  type: ReactionActionType,
  round: number,
  teamIndex: number,
  outcome: Player | null,
  aiContext: ReactionAiContext | undefined,
): LogEntry {
  if (!aiContext) {
    return { seq, type, round, teamIndex, actor: "user", outcome };
  }
  const { optimalOutcome, mistakeFired } = aiContext;
  const diverged = (outcome?.id ?? null) !== (optimalOutcome?.id ?? null);
  return {
    seq,
    type,
    round,
    teamIndex,
    actor: "ai",
    outcome,
    optimalOutcome,
    diverged,
    mistakeFired,
  };
}
