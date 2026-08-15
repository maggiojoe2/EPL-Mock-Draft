import type { Team } from "../types";

interface ModeStepProps {
  mode: "practice" | "watch";
  teams: Team[];
  userTeamIndex: number | null;
  onModeChange: (mode: "practice" | "watch") => void;
  onUserTeamIndexChange: (index: number | null) => void;
}

export default function ModeStep({
  mode,
  teams,
  userTeamIndex,
  onModeChange,
  onUserTeamIndexChange,
}: ModeStepProps) {
  return (
    <section className="setup-section">
      <h2>2 · Draft Mode</h2>
      <div className="mode-toggle">
        <label
          className={mode === "practice" ? "mode-opt selected" : "mode-opt"}
        >
          <input
            type="radio"
            name="mode"
            value="practice"
            checked={mode === "practice"}
            onChange={() => onModeChange("practice")}
          />
          🎯 Practice — control one team
        </label>
        <label className={mode === "watch" ? "mode-opt selected" : "mode-opt"}>
          <input
            type="radio"
            name="mode"
            value="watch"
            checked={mode === "watch"}
            onChange={() => onModeChange("watch")}
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
              onUserTeamIndexChange(
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
  );
}
