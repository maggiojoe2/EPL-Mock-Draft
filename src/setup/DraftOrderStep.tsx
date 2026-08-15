import type { Team } from "../types";

interface DraftOrderStepProps {
  stepNumber: number;
  teams: Team[];
  mode: "practice" | "watch";
  userTeamIndex: number | null;
  onMoveTeam: (index: number, direction: -1 | 1) => void;
}

export default function DraftOrderStep({
  stepNumber,
  teams,
  mode,
  userTeamIndex,
  onMoveTeam,
}: DraftOrderStepProps) {
  return (
    <section className="setup-section">
      <h2>{stepNumber} · Draft Order</h2>
      <p className="muted">Teams pick in this order every round (non-snake).</p>
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
                onClick={() => onMoveTeam(i, -1)}
                aria-label={`Move ${team.name} up`}
              >
                ▲
              </button>
              <button
                className="order-btn"
                disabled={i === teams.length - 1}
                onClick={() => onMoveTeam(i, 1)}
                aria-label={`Move ${team.name} down`}
              >
                ▼
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
