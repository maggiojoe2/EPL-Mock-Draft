import type React from "react";
import { TOTAL_ROUNDS } from "./constants";
import type { DraftState, PickRecord } from "./types";
import { buildCsvRows, toCsvString } from "./export/exportRosters";
import { toDebugLogJson } from "./export/exportDebugLog";
import { buildSlotTypeMap, slotKey } from "./rosterSlotType";

// ── Slot label config ──────────────────────────────────────────────────────

const SLOT_LABELS: Partial<Record<PickRecord["pickType"], React.ReactNode>> = {
  franchise: (
    <span className="summary-badge summary-badge--fp">★ Franchise</span>
  ),
  save: <span className="summary-badge summary-badge--save">💾 Saved</span>,
  pullback: <span className="summary-badge summary-badge--pb">↩ Pullback</span>,
};

// ── SummaryScreen ──────────────────────────────────────────────────────────

interface SummaryScreenProps {
  state: DraftState;
  onBackToBoard: () => void;
}

export default function SummaryScreen({
  state,
  onBackToBoard,
}: SummaryScreenProps) {
  const { teams, pickHistory, debugLog } = state;
  const typeMap = buildSlotTypeMap(teams, pickHistory);

  function handleExport() {
    const csv = toCsvString(buildCsvRows(teams, pickHistory));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "epl-draft-results.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportLog() {
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
    <div className="app">
      <header className="app-header">
        <h1>EPL Mock Drafter</h1>
        <span className="status-badge">✅ Draft Complete</span>
        <div className="summary-header-actions">
          <button className="btn-secondary" onClick={onBackToBoard}>
            📋 View Board
          </button>
          <button className="btn-primary" onClick={handleExport}>
            ⬇ Export CSV
          </button>
          <button className="btn-secondary" onClick={handleExportLog}>
            🪵 Export Debug Log
          </button>
        </div>
      </header>

      <div className="summary-body">
        <div className="summary-teams">
          {teams.map((team, ti) => (
            <div key={team.name} className="summary-card">
              <div className="summary-card-header">{team.name}</div>
              <ol className="summary-roster" start={1}>
                {Array.from({ length: TOTAL_ROUNDS }, (_, ri) => {
                  const round = ri + 1;
                  const player = team.roster[round];
                  const cellType = typeMap.get(slotKey(ti, round));
                  const badge = cellType ? SLOT_LABELS[cellType] : null;

                  return (
                    <li
                      key={round}
                      className={`summary-slot${cellType ? ` summary-slot--${cellType}` : ""}`}
                    >
                      <span className="summary-round">{round}</span>
                      {player ? (
                        <span className="summary-player">
                          <span className="pos">{player.position}</span>
                          <span className="summary-name">{player.name}</span>
                          {badge}
                        </span>
                      ) : (
                        <span className="summary-empty">—</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
