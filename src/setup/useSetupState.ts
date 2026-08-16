import { useCallback, useEffect, useState } from "react";
import { CSV_COLUMNS, parsePlayerPoolCsv, parseRosterCsv } from "./csvParser";
import { buildTeamsFromImport, autoSelectFranchise } from "./setupHelpers";
import { initDraft } from "../engine/initDraft";
import type { DraftMode, DraftState, Player, Team } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────

export type DefaultsStatus = "loading" | "loaded" | "error" | "overridden";

export type LoadDefaultsResult =
  | { status: "loaded"; players: Player[]; teams: Team[] }
  | { status: "error" }
  | { status: "cancelled" };

export type PlayerPoolImportResult =
  { ok: true; players: Player[] } | { ok: false; error: string };

export type RosterImportResult =
  { ok: true; teams: Team[] } | { ok: false; error: string };

// ── Pure state transforms (testable independent of rendering) ──────────────
//
// Everything below is a plain function on plain data — no React involved —
// so it's unit-testable without mounting a component. `useSetupState` is a
// thin wrapper that plugs these into useState/useEffect.

/**
 * Fetch and parse the bundled default player pool + rosters.
 *
 * `isCancelled` is polled after each await so a caller that has unmounted
 * (or otherwise lost interest) can discard the result without this function
 * needing to know about React at all.
 */
export async function loadDefaultData(
  isCancelled: () => boolean = () => false,
): Promise<LoadDefaultsResult> {
  try {
    const [playersResp, rostersResp] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}defaults/players.csv`),
      fetch(`${import.meta.env.BASE_URL}defaults/rosters.csv`),
    ]);

    if (!playersResp.ok || !rostersResp.ok) {
      return isCancelled() ? { status: "cancelled" } : { status: "error" };
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
      return isCancelled() ? { status: "cancelled" } : { status: "error" };
    }

    const teams = buildTeamsFromImport(rosterImport, players);
    return isCancelled()
      ? { status: "cancelled" }
      : { status: "loaded", players, teams };
  } catch {
    return isCancelled() ? { status: "cancelled" } : { status: "error" };
  }
}

/** Parse a user-supplied player pool CSV, producing an error message on failure. */
export function parsePlayerPoolImport(text: string): PlayerPoolImportResult {
  const players = parsePlayerPoolCsv(text);
  if (players.length === 0) {
    return {
      ok: false,
      error: `Player pool CSV produced no valid rows. Check column names: ${CSV_COLUMNS.playerPool}`,
    };
  }
  return { ok: true, players };
}

/** Parse a user-supplied roster CSV against the current player pool. */
export function parseRosterImport(
  text: string,
  playerPool: Player[],
): RosterImportResult {
  const rosterImport = parseRosterCsv(text);
  if (rosterImport.size === 0) {
    return {
      ok: false,
      error: `Roster CSV produced no valid teams. Check column names: ${CSV_COLUMNS.roster}`,
    };
  }
  return { ok: true, teams: buildTeamsFromImport(rosterImport, playerPool) };
}

/** Immutably update teams[index] with a mapper function. */
function updateTeam(
  teams: Team[],
  index: number,
  mapper: (t: Team) => Team,
): Team[] {
  return teams.map((t, i) => (i === index ? mapper(t) : t));
}

export function withPlayerRemoved(
  teams: Team[],
  teamIndex: number,
  playerId: string,
): Team[] {
  return updateTeam(teams, teamIndex, (team) => {
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
  });
}

export function withFranchiseEligibleToggled(
  teams: Team[],
  teamIndex: number,
  playerId: string,
): Team[] {
  return updateTeam(teams, teamIndex, (team) => {
    const franchiseEligibleIds = new Set(team.franchiseEligibleIds);
    if (franchiseEligibleIds.has(playerId)) {
      franchiseEligibleIds.delete(playerId);
      // Clear franchise player if they were the declared one and are no longer eligible
      const franchisePlayer =
        team.franchisePlayer?.id === playerId ? null : team.franchisePlayer;
      return { ...team, franchiseEligibleIds, franchisePlayer };
    }
    franchiseEligibleIds.add(playerId);
    return { ...team, franchiseEligibleIds };
  });
}

export function withPreviouslySavedToggled(
  teams: Team[],
  teamIndex: number,
  playerId: string,
): Team[] {
  return updateTeam(teams, teamIndex, (team) => {
    const saveHistory = new Set(team.saveHistory);
    if (saveHistory.has(playerId)) {
      saveHistory.delete(playerId);
    } else {
      saveHistory.add(playerId);
    }
    return { ...team, saveHistory };
  });
}

export function withPlayerAdded(
  teams: Team[],
  teamIndex: number,
  player: Player,
): Team[] {
  return updateTeam(teams, teamIndex, (team) => {
    if (team.previousYearRoster.some((p) => p.id === player.id)) return team;
    return {
      ...team,
      previousYearRoster: [...team.previousYearRoster, player],
    };
  });
}

export function withTeamsReordered(
  teams: Team[],
  index: number,
  direction: -1 | 1,
): Team[] {
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= teams.length) return teams;
  const next = [...teams];
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

/** Keep userTeamIndex tracking the same team after a moveTeam reorder. */
export function withUserTeamIndexAfterMove(
  userTeamIndex: number | null,
  index: number,
  direction: -1 | 1,
): number | null {
  if (userTeamIndex === null) return userTeamIndex;
  if (userTeamIndex === index) return index + direction;
  if (userTeamIndex === index + direction) return index;
  return userTeamIndex;
}

/** Move teams[from] to index `to` (arbitrary distance), shifting the teams
 *  in between rather than swapping — the free-drop drag-and-drop path. */
export function withTeamsReorderedTo(
  teams: Team[],
  from: number,
  to: number,
): Team[] {
  if (
    from < 0 ||
    from >= teams.length ||
    to < 0 ||
    to >= teams.length ||
    from === to
  ) {
    return teams;
  }
  const next = [...teams];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Convert a drag-and-drop "gap" index (0..teams.length, gap i meaning "the
 *  slot before row i") into the target index withTeamsReorderedTo expects,
 *  accounting for the dragged row itself being removed before re-insertion. */
export function dropGapToIndex(gap: number, from: number): number {
  return gap > from ? gap - 1 : gap;
}

/** Keep userTeamIndex tracking the same team after a withTeamsReorderedTo move. */
export function withUserTeamIndexAfterMoveTo(
  userTeamIndex: number | null,
  from: number,
  to: number,
): number | null {
  if (userTeamIndex === null || from === to) return userTeamIndex;
  if (userTeamIndex === from) return to;
  if (from < to && userTeamIndex > from && userTeamIndex <= to) {
    return userTeamIndex - 1;
  }
  if (to < from && userTeamIndex >= to && userTeamIndex < from) {
    return userTeamIndex + 1;
  }
  return userTeamIndex;
}

export function withFranchisePlayerSet(
  teams: Team[],
  teamIndex: number,
  playerId: string,
): Team[] {
  return updateTeam(teams, teamIndex, (team) => {
    const player =
      team.previousYearRoster.find((p) => p.id === playerId) ?? null;
    return { ...team, franchisePlayer: player };
  });
}

export function computeValidationErrors(
  playerPool: Player[],
  teams: Team[],
  mode: DraftMode,
  userTeamIndex: number | null,
): string[] {
  const errors: string[] = [];
  if (playerPool.length === 0) errors.push("Import a player pool CSV first.");
  if (teams.length < 2)
    errors.push("Import team rosters CSV (need at least 2 teams).");
  if (mode === "practice" && userTeamIndex === null) {
    errors.push("Select your team for practice mode.");
  }

  const userTeam =
    userTeamIndex !== null ? (teams[userTeamIndex] ?? null) : null;
  const userEligiblePlayers = userTeam
    ? userTeam.previousYearRoster.filter((p) =>
        userTeam.franchiseEligibleIds.has(p.id),
      )
    : [];
  if (
    mode === "practice" &&
    userTeam !== null &&
    userEligiblePlayers.length > 0 &&
    userTeam.franchisePlayer === null
  ) {
    errors.push("Declare your franchise player before starting.");
  }

  return errors;
}

/** Player-pool matches for the "add player from pool" search, excluding
 *  players already on the target team's roster. Empty until 2+ characters. */
export function searchAvailablePlayers(
  playerPool: Player[],
  teams: Team[],
  teamIndex: number,
  query: string,
): Player[] {
  if (query.length < 2) return [];
  const team = teams[teamIndex];
  if (!team) return [];
  return playerPool
    .filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) &&
        !team.previousYearRoster.some((r) => r.id === p.id),
    )
    .slice(0, 10);
}

export function buildDraftStateFrom(
  mode: DraftMode,
  userTeamIndex: number | null,
  teams: Team[],
  playerPool: Player[],
): DraftState {
  const effectiveUserTeamIndex = mode === "practice" ? userTeamIndex : null;
  const teamsWithFranchise = autoSelectFranchise(teams, effectiveUserTeamIndex);
  return initDraft({
    mode,
    userTeamIndex: effectiveUserTeamIndex,
    teams: teamsWithFranchise,
    availablePool: playerPool,
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ── useSetupState ────────────────────────────────────────────────────────
//
// Owns all draft-setup state and rules. Side-effect-free with respect to
// starting the draft — it does not call onDraftStart itself; SetupScreen
// reads canStart/buildDraftState() and does that.

export function useSetupState() {
  const [playerPool, setPlayerPool] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [mode, setMode] = useState<DraftMode>("practice");
  const [userTeamIndex, setUserTeamIndex] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [defaultsStatus, setDefaultsStatus] =
    useState<DefaultsStatus>("loading");

  // ── Load default data on mount ───────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    void loadDefaultData(() => cancelled).then((result) => {
      if (result.status === "cancelled") return;
      if (result.status === "error") {
        setDefaultsStatus("error");
        return;
      }
      setPlayerPool(result.players);
      setTeams(result.teams);
      setDefaultsStatus("loaded");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── CSV import handlers ──────────────────────────────────────────────────

  const handlePlayerPoolFile = useCallback(async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const result = parsePlayerPoolImport(text);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      setPlayerPool(result.players);
      setImportError(null);
      setDefaultsStatus("overridden");
    } catch {
      setImportError("Failed to read player pool file.");
    }
  }, []);

  const handleRosterFile = useCallback(
    async (file: File) => {
      try {
        const text = await readFileAsText(file);
        const result = parseRosterImport(text, playerPool);
        if (!result.ok) {
          setImportError(result.error);
          return;
        }
        setTeams(result.teams);
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
      setTeams((prev) => withPlayerRemoved(prev, teamIndex, playerId));
    },
    [],
  );

  const toggleFranchiseEligible = useCallback(
    (teamIndex: number, playerId: string) => {
      setTeams((prev) =>
        withFranchiseEligibleToggled(prev, teamIndex, playerId),
      );
    },
    [],
  );

  const togglePreviouslySaved = useCallback(
    (teamIndex: number, playerId: string) => {
      setTeams((prev) => withPreviouslySavedToggled(prev, teamIndex, playerId));
    },
    [],
  );

  const addPlayerToRoster = useCallback((teamIndex: number, player: Player) => {
    setTeams((prev) => withPlayerAdded(prev, teamIndex, player));
  }, []);

  // ── Draft order reordering ───────────────────────────────────────────────

  const moveTeam = useCallback((index: number, direction: -1 | 1) => {
    setTeams((prev) => withTeamsReordered(prev, index, direction));
    setUserTeamIndex((prev) =>
      withUserTeamIndexAfterMove(prev, index, direction),
    );
  }, []);

  const moveTeamTo = useCallback((from: number, to: number) => {
    setTeams((prev) => withTeamsReorderedTo(prev, from, to));
    setUserTeamIndex((prev) => withUserTeamIndexAfterMoveTo(prev, from, to));
  }, []);

  // ── Franchise player declaration ─────────────────────────────────────────

  const setFranchisePlayer = useCallback(
    (teamIndex: number, playerId: string) => {
      setTeams((prev) => withFranchisePlayerSet(prev, teamIndex, playerId));
    },
    [],
  );

  // ── Derived reads ─────────────────────────────────────────────────────────

  const userTeam =
    userTeamIndex !== null ? (teams[userTeamIndex] ?? null) : null;
  const userEligiblePlayers = userTeam
    ? userTeam.previousYearRoster.filter((p) =>
        userTeam.franchiseEligibleIds.has(p.id),
      )
    : [];

  const validationErrors = computeValidationErrors(
    playerPool,
    teams,
    mode,
    userTeamIndex,
  );
  const hasImport = playerPool.length > 0 && teams.length > 0;
  const franchiseStepVisible = mode === "practice" && userTeamIndex !== null;
  const canStart = validationErrors.length === 0;

  const searchAvailablePlayersBound = useCallback(
    (teamIndex: number, query: string) =>
      searchAvailablePlayers(playerPool, teams, teamIndex, query),
    [playerPool, teams],
  );

  const buildDraftState = useCallback(
    () => buildDraftStateFrom(mode, userTeamIndex, teams, playerPool),
    [mode, userTeamIndex, teams, playerPool],
  );

  return {
    // State
    playerPool,
    teams,
    mode,
    userTeamIndex,
    importError,
    defaultsStatus,
    // Derived reads
    validationErrors,
    userTeam,
    userEligiblePlayers,
    hasImport,
    franchiseStepVisible,
    canStart,
    // Actions
    setMode,
    setUserTeamIndex,
    handlePlayerPoolFile,
    handleRosterFile,
    removePlayerFromRoster,
    toggleFranchiseEligible,
    togglePreviouslySaved,
    addPlayerToRoster,
    moveTeam,
    moveTeamTo,
    setFranchisePlayer,
    searchAvailablePlayers: searchAvailablePlayersBound,
    buildDraftState,
  };
}
