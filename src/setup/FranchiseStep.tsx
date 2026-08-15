import type { Player, Team } from "../types";

interface FranchiseStepProps {
  stepNumber: number;
  userTeam: Team;
  userTeamIndex: number;
  userEligiblePlayers: Player[];
  onSetFranchisePlayer: (teamIndex: number, playerId: string) => void;
}

export default function FranchiseStep({
  stepNumber,
  userTeam,
  userTeamIndex,
  userEligiblePlayers,
  onSetFranchisePlayer,
}: FranchiseStepProps) {
  return (
    <section className="setup-section">
      <h2>{stepNumber} · Franchise Player</h2>
      {userEligiblePlayers.length === 0 ? (
        <p className="muted">
          {userTeam.name} has no franchise-eligible players — saves and
          pullbacks will fill from round 16.
        </p>
      ) : (
        <div className="team-select-row">
          <label htmlFor="franchise-select">
            Declare your franchise player:
          </label>
          <select
            id="franchise-select"
            value={userTeam.franchisePlayer?.id ?? ""}
            onChange={(e) =>
              onSetFranchisePlayer(userTeamIndex, e.target.value)
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
  );
}
