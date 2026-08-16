import type { DraftState, LogEntry } from "./types";
import { toDebugLogJson } from "./export/exportDebugLog";
import { downloadFile } from "./export/downloadFile";

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
    downloadFile(
      toDebugLogJson(debugLog),
      "application/json;charset=utf-8;",
      "epl-draft-debug-log.json",
    );
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

const REACTION_VERB: Record<string, string> = {
  INVOKE_SAVE: "saved",
  DECLINE_SAVE: "declined the save on",
  INVOKE_PULLBACK: "pulled back",
  DECLINE_PULLBACK: "declined the pullback on",
};

function DebugLogEntryRow({
  entry,
  teams,
}: {
  entry: LogEntry;
  teams: DraftState["teams"];
}) {
  const teamName = teams[entry.teamIndex]?.name ?? `Team ${entry.teamIndex}`;

  switch (entry.type) {
    case "PICK_PLAYER": {
      const actorBadge = entry.actor === "user" ? "👤" : "🤖";
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
    }
    case "INVOKE_SAVE":
    case "DECLINE_SAVE":
    case "INVOKE_PULLBACK":
    case "DECLINE_PULLBACK": {
      const actorBadge = entry.actor === "user" ? "👤" : "🤖";
      const verb = REACTION_VERB[entry.type];
      return (
        <>
          <span className="debug-log-seq">#{entry.seq + 1}</span>
          <span className="debug-log-summary">
            {actorBadge} Round {entry.round} · <strong>{teamName}</strong>{" "}
            {verb}{" "}
            {entry.outcome ? (
              <strong>{entry.outcome.name}</strong>
            ) : (
              "nothing"
            )}
          </span>
          {entry.actor === "ai" && (
            <span
              className={`debug-log-detail${entry.diverged ? " debug-log-detail--diverged" : ""}`}
            >
              {entry.diverged
                ? `↪ Optimal choice would have been ${entry.optimalOutcome?.name ?? "nothing"}`
                : "✓ Matched optimal choice"}
              {entry.mistakeFired ? " (mistake roll fired)" : ""}
            </span>
          )}
        </>
      );
    }
    case "SKIP_TURN":
      return (
        <>
          <span className="debug-log-seq">#{entry.seq + 1}</span>
          <span className="debug-log-summary">
            ⏭️ Round {entry.round} · <strong>{teamName}</strong> skipped —
            no open slot
          </span>
        </>
      );
    case "SAVE_TARGET_COMPUTED": {
      const purposeLabel =
        entry.purpose === "save-decision"
          ? "resolving its save prompt"
          : "excluding it from pullback candidates";
      return (
        <>
          <span className="debug-log-seq">#{entry.seq + 1}</span>
          <span className="debug-log-summary">
            🎯 Round {entry.round} · <strong>{teamName}</strong>'s save
            target ({purposeLabel}):{" "}
            {entry.target ? (
              <strong>{entry.target.name}</strong>
            ) : (
              "none"
            )}
          </span>
        </>
      );
    }
    default:
      return null;
  }
}
