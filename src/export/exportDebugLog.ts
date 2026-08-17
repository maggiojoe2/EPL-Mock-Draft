import type { LogEntry } from "../types";

// ── toDebugLogJson ───────────────────────────────────────────────────────
//
// Serializes `debugLog` to a JSON string: a plain array of log entries in
// the same shape/order as the input, with no lossy transformation. This is
// the single serialization used by both the live panel's download (whatever
// the log contains at click time) and the summary screen's download (the
// complete end-of-draft log) — there is no separate "partial" vs "final"
// format.

export function toDebugLogJson(debugLog: LogEntry[]): string {
  return JSON.stringify(debugLog, null, 2);
}
