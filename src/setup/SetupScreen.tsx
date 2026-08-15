import { useCallback, useEffect, useState } from "react";
import { parsePlayerPoolCsv, parseRosterCsv } from "./csvParser";
import { buildTeamsFromImport, autoSelectFranchise } from "./setupHelpers";
import { initDraft } from "../engine/initDraft";
import type { DraftState, Player, Team } from "../types";

// ── Default-data status ────────────────────────────────────────────────────

type DefaultsStatus = "loading" | "loaded" | "error" | "overridden";

// ── Types ──────────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onDraftStart: (state: DraftState) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/** Immutably update teams[index] with a mapper function. */
function updateTeam(
  teams: Team[],
  index: number,
  mapper: (t: Team) => Team,
): Team[] {
  return teams.map((t, i) => (i === index ? mapper(t) : t));
}

// ── SetupScreen ────────────────────────────────────────────────────────────

export default function SetupScreen({ onDraftStart }: SetupScreenProps) {
  const [playerPool, setPlayerPool] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [mode, setMode] = useState<"practice" | "watch">("practice");
  const [userTeamIndex, setUserTeamIndex] = useState<number | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  /** Player search session: which team's panel is open + current query string. */
  const [playerSearch, setPlayerSearch] = useState<{
    teamIndex: number;
    query: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [defaultsStatus, setDefaultsStatus] =
    useState<DefaultsStatus>("loading");

  // ── Load default data on mount ───────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadDefaults() {
      try {
        const [playersResp, rostersResp] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}defaults/players.csv`),
          fetch(`${import.meta.env.BASE_URL}defaults/rosters.csv`),
        ]);

        if (!playersResp.ok || !rostersResp.ok) {
          if (!cancelled) setDefaultsStatus("error");
          return;
        }

        const [playersText, rostersText] = await Promise.all([
          playersResp.text(),
          rostersResp.text(),
        ]);

        const players = parsePlayerPoolCsv(playersText);
        const rosterImport = parseRosterCsv(rostersText);

        const totalRosterPlayers = [...rosterImport.values()].reduce(
          (n, rows) => n + rows.length,
          0,
        );
        if (players.length === 0 || totalRosterPlayers === 0) {
          if (!cancelled) setDefaultsStatus("error");
          return;
        }

        const defaultTeams = buildTeamsFromImport(rosterImport, players);

        if (!cancelled) {
          setPlayerPool(players);
          setTeams(defaultTeams);
          setDefaultsStatus("loaded");
        }
      } catch {
        if (!cancelled) setDefaultsStatus("error");
      }
    }

    void loadDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── CSV import handlers ──────────────────────────────────────────────────

  const handlePlayerPoolFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const players = parsePlayerPoolCsv(text);
        if (players.length === 0) {
          setImportError(
            "Player pool CSV produced no valid rows. Check column names: name, position, nfl_team, adp",
          );
          return;
        }
        setPlayerPool(players);
        setImportError(null);
        setDefaultsStatus("overridden");
      } catch {
        setImportError("Failed to read player pool file.");
      }
    },
    [],
  );

  const handleRosterFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const rosterImport = parseRosterCsv(text);
        if (rosterImport.size === 0) {
          setImportError(
            "Roster CSV produced no valid teams. Check column names: team_name, player_name, franchise_eligible, previously_saved",
          );
          return;
        }
        const newTeams = buildTeamsFromImport(rosterImport, playerPool);
        setTeams(newTeams);
        setUserTeamIndex(null);
        setImportError(null);
        setDefaultsStatus("overridden");
      } catch {
        setImportError("Failed to read roster file.");
      }
    },
    [playerPool],
  );

  // ── Roster editing ───────────────────────────────────────────────────────

  const removePlayerFromRoster = useCallback(
    (teamIndex: number, playerId: string) => {
      setTeams((prev) =>
        updateTeam(prev, teamIndex, (team) => {
          const previousYearRoster = team.previousYearRoster.filter(
            (p) => p.id !== playerId,
          );
          const franchiseEligibleIds = new Set(team.franchiseEligibleIds);
          const saveHistory = new Set(team.saveHistory);
          franchiseEligibleIds.delete(playerId);
          saveHistory.delete(playerId);
          // Clear franchise player if they were removed
          const franchisePlayer =
            team.franchisePlayer?.id === playerId ? null : team.franchisePlayer;
          return {
            ...team,
            previousYearRoster,
            franchiseEligibleIds,
            saveHistory,
            franchisePlayer,
          };
        }),
      );
    },
    [],
  );

  const toggleFranchiseEligible = useCallback(
    (teamIndex: number, playerId: string) => {
      setTeams((prev) =>
        updateTeam(prev, teamIndex, (team) => {
          const franchiseEligibleIds = new Set(team.franchiseEligibleIds);
          if (franchiseEligibleIds.has(playerId)) {
            franchiseEligibleIds.delete(playerId);
            // Clear franchise player if they were the declared one and are no longer eligible
            const franchisePlayer =
              team.franchisePlayer?.id === playerId
                ? null
                : team.franchisePlayer;
            return { ...team, franchiseEligibleIds, franchisePlayer };
          } else {
            franchiseEligibleIds.add(playerId);
            return { ...team, franchiseEligibleIds };
          }
        }),
      );
    },
    [],
  );

  const togglePreviouslySaved = useCallback(
    (teamIndex: number, playerId: string) => {
      setTeams((prev) =>
        updateTeam(prev, teamIndex, (team) => {
          const saveHistory = new Set(team.saveHistory);
          if (saveHistory.has(playerId)) {
            saveHistory.delete(playerId);
          } else {
            saveHistory.add(playerId);
          }
          return { ...team, saveHistory };
        }),
      );
    },
    [],
  );

  const addPlayerToRoster = useCallback((teamIndex: number, player: Player) => {
    setTeams((prev) =>
      updateTeam(prev, teamIndex, (team) => {
        if (team.previousYearRoster.some((p) => p.id === player.id))
          return team;
        return {
          ...team,
          previousYearRoster: [...team.previousYearRoster, player],
        };
      }),
    );
    setPlayerSearch(null);
  }, []);

  // ── Draft order reordering ───────────────────────────────────────────────

  const moveTeam = useCallback((index: number, direction: -1 | 1) => {
    setTeams((prev) => {
      const next = [...prev];
      const swapIndex = index + direction;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
    // Keep userTeamIndex tracking the same team after reorder
    setUserTeamIndex((prev) => {
      if (prev === null) return prev;
      if (prev === index) return index + direction;
      if (prev === index + direction) return index;
      return prev;
    });
  }, []);

  // ── Franchise player declaration ─────────────────────────────────────────

  const setFranchisePlayer = useCallback(
    (teamIndex: number, playerId: string) => {
      setTeams((prev) =>
        updateTeam(prev, teamIndex, (team) => {
          const player =
            team.previousYearRoster.find((p) => p.id === playerId) ?? null;
          return { ...team, franchisePlayer: player };
        }),
      );
    },
    [],
  );

  // ── Validation ───────────────────────────────────────────────────────────

  const userTeam = userTeamIndex !== null ? teams[userTeamIndex] : null;
  const userEligiblePlayers = userTeam
    ? userTeam.previousYearRoster.filter((p) =>
        userTeam.franchiseEligibleIds.has(p.id),
      )
    : [];

  const validationErrors: string[] = [];
  if (playerPool.length === 0)
    validationErrors.push("Import a player pool CSV first.");
  if (teams.length < 2)
    validationErrors.push("Import team rosters CSV (need at least 2 teams).");
  if (mode === "practice" && userTeamIndex === null) {
    validationErrors.push("Select your team for practice mode.");
  }
  if (
    mode === "practice" &&
    userTeam !== null &&
    userEligiblePlayers.length > 0 &&
    userTeam.franchisePlayer === null
  ) {
    validationErrors.push("Declare your franchise player before starting.");
  }

  // ── Start draft ───────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    const effectiveUserTeamIndex = mode === "practice" ? userTeamIndex : null;
    const teamsWithFranchise = autoSelectFranchise(
      teams,
      effectiveUserTeamIndex,
    );
    const state = initDraft({
      mode,
      userTeamIndex: effectiveUserTeamIndex,
      teams: teamsWithFranchise,
      availablePool: playerPool,
    });
    onDraftStart(state);
  }, [mode, userTeamIndex, teams, playerPool, onDraftStart]);

  // ── Filtered pool for "add player" search ────────────────────────────────

  const filteredPool =
    playerSearch !== null && playerSearch.query.length >= 2
      ? playerPool
          .filter(
            (p) =>
              p.name.toLowerCase().includes(playerSearch.query.toLowerCase()) &&
              !teams[playerSearch.teamIndex].previousYearRoster.some(
                (r) => r.id === p.id,
              ),
          )
          .slice(0, 10)
      : [];

  // ── Render ────────────────────────────────────────────────────────────────

  const hasImport = playerPool.length > 0 && teams.length > 0;
  const franchiseStepVisible = mode === "practice" && userTeamIndex !== null;

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
              onChange={(e) => void handlePlayerPoolFile(e)}
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
              onChange={(e) => void handleRosterFile(e)}
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
                      setFranchisePlayer(userTeamIndex, e.target.value)
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
                                    onClick={() => addPlayerToRoster(ti, p)}
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
          disabled={validationErrors.length > 0}
          onClick={handleStart}
        >
          🏈 Start Draft
        </button>
      </section>
    </div>
  );
}
