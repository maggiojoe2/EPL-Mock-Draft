import { CSV_COLUMNS } from "./csvParser";

interface ImportStepProps {
  playerPoolCount: number;
  teamsCount: number;
  importError: string | null;
  onPlayerPoolFile: (file: File) => void;
  onRosterFile: (file: File) => void;
}

export default function ImportStep({
  playerPoolCount,
  teamsCount,
  importError,
  onPlayerPoolFile,
  onRosterFile,
}: ImportStepProps) {
  return (
    <section className="setup-section">
      <h2>1 · Import Data</h2>
      <div className="import-row">
        <label className="file-label">
          <span>Player Pool CSV</span>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPlayerPoolFile(file);
            }}
          />
          <span className="file-status">
            {playerPoolCount > 0
              ? `✓ ${playerPoolCount} players`
              : "No file selected"}
          </span>
        </label>
        <label className="file-label">
          <span>Team Rosters CSV</span>
          <input
            type="file"
            accept=".csv"
            disabled={playerPoolCount === 0}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onRosterFile(file);
            }}
          />
          <span className="file-status">
            {teamsCount > 0
              ? `✓ ${teamsCount} teams`
              : playerPoolCount === 0
                ? "Import player pool first"
                : "No file selected"}
          </span>
        </label>
      </div>
      {importError && <p className="import-error">⚠ {importError}</p>}
      <div className="csv-hint">
        <details>
          <summary>Expected CSV column names</summary>
          <p>
            <strong>Player pool:</strong> <code>{CSV_COLUMNS.playerPool}</code>
          </p>
          <p>
            <strong>Rosters:</strong> <code>{CSV_COLUMNS.roster}</code>
          </p>
        </details>
      </div>
    </section>
  );
}
