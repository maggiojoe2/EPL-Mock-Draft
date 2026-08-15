import { useState } from "react";
import type { Player, Team } from "../types";

interface RosterStepProps {
  stepNumber: number;
  teams: Team[];
  searchAvailablePlayers: (teamIndex: number, query: string) => Player[];
  onToggleFranchiseEligible: (teamIndex: number, playerId: string) => void;
  onTogglePreviouslySaved: (teamIndex: number, playerId: string) => void;
  onRemovePlayer: (teamIndex: number, playerId: string) => void;
  onAddPlayer: (teamIndex: number, player: Player) => void;
}

export default function RosterStep({
  stepNumber,
  teams,
  searchAvailablePlayers,
  onToggleFranchiseEligible,
  onTogglePreviouslySaved,
  onRemovePlayer,
  onAddPlayer,
}: RosterStepProps) {
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  /** Player search session: which team's panel is open + current query string. */
  const [playerSearch, setPlayerSearch] = useState<{
    teamIndex: number;
    query: string;
  } | null>(null);

  const filteredPool = playerSearch
    ? searchAvailablePlayers(playerSearch.teamIndex, playerSearch.query)
    : [];

  return (
    <section className="setup-section">
      <h2>{stepNumber} · Team Rosters</h2>
      <p className="muted">
        Review and edit each team's previous-year roster before the draft.
      </p>
      <div className="roster-panels">
        {teams.map((team, ti) => (
          <div key={team.name} className="roster-panel">
            <button
              className="roster-panel-toggle"
              onClick={() => setExpandedTeam(expandedTeam === ti ? null : ti)}
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
                            checked={team.franchiseEligibleIds.has(player.id)}
                            onChange={() =>
                              onToggleFranchiseEligible(ti, player.id)
                            }
                          />
                        </td>
                        <td className="center">
                          <input
                            type="checkbox"
                            checked={team.saveHistory.has(player.id)}
                            onChange={() =>
                              onTogglePreviouslySaved(ti, player.id)
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="remove-btn"
                            onClick={() => onRemovePlayer(ti, player.id)}
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
                                onAddPlayer(ti, p);
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
  );
}
