import { useSetupState } from "./useSetupState";
import ImportStep from "./ImportStep";
import ModeStep from "./ModeStep";
import FranchiseStep from "./FranchiseStep";
import DraftOrderStep from "./DraftOrderStep";
import RosterStep from "./RosterStep";
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

  const handleStart = () => {
    onDraftStart(buildDraftState());
  };

  const draftOrderStepNumber = franchiseStepVisible ? 4 : 3;
  const rosterStepNumber = franchiseStepVisible ? 5 : 4;

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

      <ImportStep
        playerPoolCount={playerPool.length}
        teamsCount={teams.length}
        importError={importError}
        onPlayerPoolFile={(file) => void handlePlayerPoolFile(file)}
        onRosterFile={(file) => void handleRosterFile(file)}
      />

      {hasImport && (
        <>
          <ModeStep
            mode={mode}
            teams={teams}
            userTeamIndex={userTeamIndex}
            onModeChange={setMode}
            onUserTeamIndexChange={setUserTeamIndex}
          />

          {franchiseStepVisible && (
            <FranchiseStep
              userTeam={userTeam!}
              userTeamIndex={userTeamIndex!}
              userEligiblePlayers={userEligiblePlayers}
              onSetFranchisePlayer={setFranchisePlayer}
            />
          )}

          <DraftOrderStep
            stepNumber={draftOrderStepNumber}
            teams={teams}
            mode={mode}
            userTeamIndex={userTeamIndex}
            onMoveTeam={moveTeam}
          />

          <RosterStep
            stepNumber={rosterStepNumber}
            teams={teams}
            searchAvailablePlayers={searchAvailablePlayers}
            onToggleFranchiseEligible={toggleFranchiseEligible}
            onTogglePreviouslySaved={togglePreviouslySaved}
            onRemovePlayer={removePlayerFromRoster}
            onAddPlayer={addPlayerToRoster}
          />
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
