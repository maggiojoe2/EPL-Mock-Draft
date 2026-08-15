import { useState } from "react";
import { useSetupState } from "./useSetupState";
import type { DraftState } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onDraftStart: (state: DraftState) => void;
}

// ── SetupScreen ────────────────────────────────────────────────────────────

export default function SetupScreen({ onDraftStart }: SetupScreenProps) {
  const {
    playerPool,
    teams,
    mode,
    userTeamIndex,
    importError,
    defaultsStatus,
    validationErrors,
    userTeam,
    userEligiblePlayers,
    hasImport,
    franchiseStepVisible,
    canStart,
    setMode,
    setUserTeamIndex,
    handlePlayerPoolFile,
    handleRosterFile,
    removePlayerFromRoster,
    toggleFranchiseEligible,
    togglePreviouslySaved,
    addPlayerToRoster,
    moveTeam,
    setFranchisePlayer,
    searchAvailablePlayers,
    buildDraftState,
  } = useSetupState();

  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  /** Player search session: which team's panel is open + current query string. */
  const [playerSearch, setPlayerSearch] = useState<{
    teamIndex: number;
    query: string;
  } | null>(null);

  const handleStart = () => {
    onDraftStart(buildDraftState());
  };

  const filteredPool = playerSearch
    ? searchAvailablePlayers(playerSearch.teamIndex, playerSearch.query)
    : [];

  return (
    <div className="setup-screen">
      <header className="setup-header">
        <h1>EPL Mock Drafter</h1>
        <p className="setup-subtitle">Pre-Draft Setup</p>
      </header>

      {/* ── Default data banners ── */}
      {defaultsStatus === "loaded" && (
        <p className="defaults-notice defaults-notice--info">
          ℹ️ Using default 2026 data — upload your own CSVs to override.
        </p>
      )}
      {defaultsStatus === "error" && (
        <p className="defaults-notice defaults-notice--error">
          ⚠ Couldn&apos;t load default data. Please upload your own CSVs.
        </p>
      )}

      {/* ── Step 1: Import CSVs ── */}
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
                if (file) void handlePlayerPoolFile(file);
              }}
            />
            <span className="file-status">
              {playerPool.length > 0
                ? `✓ ${playerPool.length} players`
                : "No file selected"}
            </span>
          </label>
          <label className="file-label">
            <span>Team Rosters CSV</span>
            <input
              type="file"
              accept=".csv"
              disabled={playerPool.length === 0}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleRosterFile(file);
              }}
            />
            <span className="file-status">
              {teams.length > 0
                ? `✓ ${teams.length} teams`
                : playerPool.length === 0
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
              <strong>Player pool:</strong>{" "}
              <code>name, position, nfl_team, adp</code>
            </p>
            <p>
              <strong>Rosters:</strong>{" "}
              <code>
                team_name, player_name, franchise_eligible, previously_saved
              </code>
            </p>
          </details>
        </div>
      </section>

      {hasImport && (
        <>
          {/* ── Step 2: Draft Mode & Team Selection ── */}
          <section className="setup-section">
            <h2>2 · Draft Mode</h2>
            <div className="mode-toggle">
              <label
                className={
                  mode === "practice" ? "mode-opt selected" : "mode-opt"
                }
              >
                <input
                  type="radio"
                  name="mode"
                  value="practice"
                  checked={mode === "practice"}
                  onChange={() => setMode("practice")}
                />
                🎯 Practice — control one team
              </label>
              <label
                className={mode === "watch" ? "mode-opt selected" : "mode-opt"}
              >
                <input
                  type="radio"
                  name="mode"
                  value="watch"
                  checked={mode === "watch"}
                  onChange={() => setMode("watch")}
                />
                👀 Watch — observe all 12 simulate
              </label>
            </div>

            {mode === "practice" && (
              <div className="team-select-row">
                <label htmlFor="team-select">Your team:</label>
                <select
                  id="team-select"
                  value={userTeamIndex ?? ""}
                  onChange={(e) =>
                    setUserTeamIndex(
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                >
                  <option value="">— select —</option>
                  {teams.map((t, i) => (
                    <option key={i} value={i}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {/* ── Step 3: Franchise Player (practice + team selected) ── */}
          {franchiseStepVisible && (
            <section className="setup-section">
              <h2>3 · Franchise Player</h2>
              {userEligiblePlayers.length === 0 ? (
                <p className="muted">
                  {userTeam!.name} has no franchise-eligible players — saves and
                  pullbacks will fill from round 16.
                </p>
              ) : (
                <div className="team-select-row">
                  <label htmlFor="franchise-select">
                    Declare your franchise player:
                  </label>
                  <select
                    id="franchise-select"
                    value={userTeam!.franchisePlayer?.id ?? ""}
                    onChange={(e) =>
                      setFranchisePlayer(userTeamIndex!, e.target.value)
                    }
                  >
                    <option value="">— select —</option>
                    {userEligiblePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.position}, {p.nflTeam})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          )}

          {/* ── Step 4: Draft Order ── */}
          <section className="setup-section">
            <h2>{franchiseStepVisible ? "4" : "3"} · Draft Order</h2>
            <p className="muted">
              Teams pick in this order every round (non-snake).
            </p>
            <ol className="draft-order-list">
              {teams.map((team, i) => (
                <li key={team.name} className="draft-order-item">
                  <span className="pick-num">#{i + 1}</span>
                  <span className="team-name-label">
                    {team.name}
                    {mode === "practice" && i === userTeamIndex && (
                      <span className="you-badge"> (you)</span>
                    )}
                  </span>
                  <div className="order-buttons">
                    <button
                      className="order-btn"
                      disabled={i === 0}
                      onClick={() => moveTeam(i, -1)}
                      aria-label={`Move ${team.name} up`}
                    >
                      ▲
                    </button>
                    <button
                      className="order-btn"
                      disabled={i === teams.length - 1}
                      onClick={() => moveTeam(i, 1)}
                      aria-label={`Move ${team.name} down`}
                    >
                      ▼
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Step 5: Team Rosters (collapsible) ── */}
          <section className="setup-section">
            <h2>{franchiseStepVisible ? "5" : "4"} · Team Rosters</h2>
            <p className="muted">
              Review and edit each team's previous-year roster before the draft.
            </p>
            <div className="roster-panels">
              {teams.map((team, ti) => (
                <div key={team.name} className="roster-panel">
                  <button
                    className="roster-panel-toggle"
                    onClick={() =>
                      setExpandedTeam(expandedTeam === ti ? null : ti)
                    }
                  >
                    <span>{team.name}</span>
                    <span className="roster-count">
                      {team.previousYearRoster.length} players
                    </span>
                    <span>{expandedTeam === ti ? "▲" : "▼"}</span>
                  </button>

                  {expandedTeam === ti && (
                    <div className="roster-panel-body">
                      <table className="roster-table">
                        <thead>
                          <tr>
                            <th>Player</th>
                            <th>Pos</th>
                            <th title="Franchise eligible">★ Franchise</th>
                            <th title="Previously saved">💾 Prev. Saved</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {team.previousYearRoster.map((player) => (
                            <tr key={player.id}>
                              <td>{player.name}</td>
                              <td>{player.position}</td>
                              <td className="center">
                                <input
                                  type="checkbox"
                                  checked={team.franchiseEligibleIds.has(
                                    player.id,
                                  )}
                                  onChange={() =>
                                    toggleFranchiseEligible(ti, player.id)
                                  }
                                />
                              </td>
                              <td className="center">
                                <input
                                  type="checkbox"
                                  checked={team.saveHistory.has(player.id)}
                                  onChange={() =>
                                    togglePreviouslySaved(ti, player.id)
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  className="remove-btn"
                                  onClick={() =>
                                    removePlayerFromRoster(ti, player.id)
                                  }
                                  aria-label={`Remove ${player.name}`}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Add player row */}
                      {playerSearch?.teamIndex === ti ? (
                        <div className="add-player-row">
                          <input
                            type="text"
                            className="add-player-input"
                            placeholder="Search player pool…"
                            value={playerSearch.query}
                            onChange={(e) =>
                              setPlayerSearch({
                                teamIndex: ti,
                                query: e.target.value,
                              })
                            }
                            autoFocus
                          />
                          <button
                            className="btn-secondary"
                            onClick={() => setPlayerSearch(null)}
                          >
                            Cancel
                          </button>
                          {filteredPool.length > 0 && (
                            <ul className="player-search-results">
                              {filteredPool.map((p) => (
                                <li key={p.id}>
                                  <button
                                    className="search-result-btn"
                                    onClick={() => {
                                      addPlayerToRoster(ti, p);
                                      setPlayerSearch(null);
                                    }}
                                  >
                                    {p.name} ({p.position}, {p.nflTeam}) — ADP #
                                    {p.adp}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <button
                          className="btn-secondary add-player-trigger"
                          onClick={() =>
                            setPlayerSearch({ teamIndex: ti, query: "" })
                          }
                        >
                          + Add player from pool
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Start Draft button ── */}
      <section className="setup-section setup-footer">
        {validationErrors.length > 0 && (
          <ul className="validation-errors">
            {validationErrors.map((err) => (
              <li key={err}>⚠ {err}</li>
            ))}
          </ul>
        )}
        <button
          className="btn-primary start-btn"
          disabled={!canStart}
          onClick={handleStart}
        >
          🏈 Start Draft
        </button>
      </section>
    </div>
  );
}
