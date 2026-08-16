import type { DraftState, LogEntry } from "./types";
import { toDebugLogJson } from "./export/exportDebugLog";

// ── DebugLogPanel ────────────────────────────────────────────────────────
//
// Renders `draftState.debugLog` as a plain chronological scrollable list.
// Toggled open/closed by the caller; rendering it has no effect on the
// simulation clock. Per ADR 0002's precedent (skip component tests for
// thin/presentational layers), this component itself isn't unit-tested —
// the log's content is covered at the engine seam that produces it.

interface DebugLogPanelProps {
  debugLog: LogEntry[];
  teams: DraftState["teams"];
  onClose: () => void;
}

export default function DebugLogPanel({
  debugLog,
  teams,
  onClose,
}: DebugLogPanelProps) {
  function handleDownload() {
    const json = toDebugLogJson(debugLog);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "epl-draft-debug-log.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="debug-log-panel">
      <div className="debug-log-header">
        <h3>🪵 Debug Log</h3>
        <button className="btn-secondary" onClick={handleDownload}>
          ⬇ Download JSON
        </button>
        <button className="btn-secondary" onClick={onClose}>
          ✕ Close
        </button>
      </div>
      <ol className="debug-log-list">
        {debugLog.length === 0 && (
          <li className="debug-log-empty">No entries yet.</li>
        )}
        {debugLog.map((entry) => (
          <li key={entry.seq} className="debug-log-entry">
            <DebugLogEntryRow entry={entry} teams={teams} />
          </li>
        ))}
      </ol>
    </aside>
  );
}

// ── Entry rendering ──────────────────────────────────────────────────────

function DebugLogEntryRow({
  entry,
  teams,
}: {
  entry: LogEntry;
  teams: DraftState["teams"];
}) {
  const teamName = teams[entry.teamIndex]?.name ?? `Team ${entry.teamIndex}`;
  const actorBadge = entry.actor === "user" ? "👤" : "🤖";

  switch (entry.type) {
    case "PICK_PLAYER":
      return (
        <>
          <span className="debug-log-seq">#{entry.seq + 1}</span>
          <span className="debug-log-summary">
            {actorBadge} Round {entry.round} · <strong>{teamName}</strong>{" "}
            picked <strong>{entry.player.name}</strong> (ADP {entry.player.adp})
          </span>
          {entry.actor === "ai" && entry.optimalPlayer && (
            <span
              className={`debug-log-detail${entry.diverged ? " debug-log-detail--diverged" : ""}`}
            >
              {entry.diverged
                ? `↪ Best-by-ADP would have been ${entry.optimalPlayer.name} (noise ${entry.noise?.toFixed(2)})`
                : "✓ Matched best-by-ADP"}
            </span>
          )}
        </>
      );
    default:
      return null;
  }
}
