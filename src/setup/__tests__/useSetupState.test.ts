import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadDefaultData,
  parsePlayerPoolImport,
  parseRosterImport,
  withPlayerRemoved,
  withFranchiseEligibleToggled,
  withPreviouslySavedToggled,
  withPlayerAdded,
  withTeamsReordered,
  withUserTeamIndexAfterMove,
  withFranchisePlayerSet,
  computeValidationErrors,
  searchAvailablePlayers,
  buildDraftStateFrom,
} from "../useSetupState";
import type { Player, Team } from "../../types";

// ── Fixtures ───────────────────────────────────────────────────────────────

function makePlayer(name: string, position = "RB", adp = 1): Player {
  return {
    id: `${name.toLowerCase().replace(/\s+/g, "-")}-${position.toLowerCase()}`,
    name,
    position,
    nflTeam: "KC",
    adp,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    name: "Team A",
    roster: Array.from({ length: 17 }, () => null),
    previousYearRoster: [],
    saveHistory: new Set<string>(),
    franchisePlayer: null,
    franchiseEligibleIds: new Set<string>(),
    saveUsedThisDraft: false,
    lastAvailableRound: 15,
    ...overrides,
  };
}

const PLAYERS_CSV = `name,position,nfl_team,adp
Josh Allen,QB,BUF,1
Saquon Barkley,RB,PHI,2`;

const ROSTERS_CSV = `team_name,player_name,franchise_eligible,previously_saved
Team A,Josh Allen,false,false
Team B,Saquon Barkley,false,false`;

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── loadDefaultData ──────────────────────────────────────────────────────

describe("loadDefaultData", () => {
  it("returns loaded players and teams on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              url.includes("players") ? PLAYERS_CSV : ROSTERS_CSV,
            ),
        }),
      ),
    );

    const result = await loadDefaultData();
    expect(result.status).toBe("loaded");
    if (result.status === "loaded") {
      expect(result.players).toHaveLength(2);
      expect(result.teams).toHaveLength(2);
    }
  });

  it("returns error when a fetch response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, text: () => Promise.resolve("") }),
      ),
    );

    const result = await loadDefaultData();
    expect(result.status).toBe("error");
  });

  it("returns error when the CSVs parse to no usable data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, text: () => Promise.resolve("") }),
      ),
    );

    const result = await loadDefaultData();
    expect(result.status).toBe("error");
  });

  it("returns error when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );

    const result = await loadDefaultData();
    expect(result.status).toBe("error");
  });

  it("returns cancelled instead of loaded/error when the caller has lost interest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              url.includes("players") ? PLAYERS_CSV : ROSTERS_CSV,
            ),
        }),
      ),
    );

    const result = await loadDefaultData(() => true);
    expect(result.status).toBe("cancelled");
  });
});

// ── parsePlayerPoolImport / parseRosterImport ───────────────────────────────

describe("parsePlayerPoolImport", () => {
  it("returns ok with parsed players on success", () => {
    const result = parsePlayerPoolImport(PLAYERS_CSV);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.players).toHaveLength(2);
  });

  it("returns an error naming the expected columns when no rows parse", () => {
    const result = parsePlayerPoolImport("garbage,data\n1,2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("name, position, nfl_team, adp");
    }
  });
});

describe("parseRosterImport", () => {
  it("returns ok with built teams on success", () => {
    const pool = [makePlayer("Josh Allen", "QB"), makePlayer("Saquon Barkley")];
    const result = parseRosterImport(ROSTERS_CSV, pool);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.teams).toHaveLength(2);
  });

  it("returns an error naming the expected columns when no teams parse", () => {
    const result = parseRosterImport("garbage,data\n1,2", []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(
        "team_name, player_name, franchise_eligible, previously_saved",
      );
    }
  });
});

// ── Roster editing ops ───────────────────────────────────────────────────

describe("withPlayerRemoved", () => {
  it("removes the player from previousYearRoster", () => {
    const p = makePlayer("Josh Allen", "QB");
    const teams = [makeTeam({ previousYearRoster: [p] })];
    const [team] = withPlayerRemoved(teams, 0, p.id);
    expect(team.previousYearRoster).toHaveLength(0);
  });

  it("clears franchiseEligibleIds and saveHistory entries for the removed player", () => {
    const p = makePlayer("Josh Allen", "QB");
    const teams = [
      makeTeam({
        previousYearRoster: [p],
        franchiseEligibleIds: new Set([p.id]),
        saveHistory: new Set([p.id]),
      }),
    ];
    const [team] = withPlayerRemoved(teams, 0, p.id);
    expect(team.franchiseEligibleIds.has(p.id)).toBe(false);
    expect(team.saveHistory.has(p.id)).toBe(false);
  });

  it("clears franchisePlayer when the removed player was declared", () => {
    const p = makePlayer("Josh Allen", "QB");
    const teams = [makeTeam({ previousYearRoster: [p], franchisePlayer: p })];
    const [team] = withPlayerRemoved(teams, 0, p.id);
    expect(team.franchisePlayer).toBeNull();
  });

  it("leaves other teams untouched", () => {
    const p = makePlayer("Josh Allen", "QB");
    const teams = [
      makeTeam({ name: "A", previousYearRoster: [p] }),
      makeTeam({ name: "B" }),
    ];
    const result = withPlayerRemoved(teams, 0, p.id);
    expect(result[1]).toBe(teams[1]);
  });
});

describe("withFranchiseEligibleToggled", () => {
  it("adds the player id when not yet eligible", () => {
    const teams = [makeTeam()];
    const [team] = withFranchiseEligibleToggled(teams, 0, "p1");
    expect(team.franchiseEligibleIds.has("p1")).toBe(true);
  });

  it("removes the player id when already eligible", () => {
    const teams = [makeTeam({ franchiseEligibleIds: new Set(["p1"]) })];
    const [team] = withFranchiseEligibleToggled(teams, 0, "p1");
    expect(team.franchiseEligibleIds.has("p1")).toBe(false);
  });

  it("clears franchisePlayer when un-eligibling the declared player", () => {
    const p = makePlayer("Josh Allen", "QB");
    const teams = [
      makeTeam({ franchiseEligibleIds: new Set([p.id]), franchisePlayer: p }),
    ];
    const [team] = withFranchiseEligibleToggled(teams, 0, p.id);
    expect(team.franchisePlayer).toBeNull();
  });
});

describe("withPreviouslySavedToggled", () => {
  it("adds the player id when not yet saved", () => {
    const teams = [makeTeam()];
    const [team] = withPreviouslySavedToggled(teams, 0, "p1");
    expect(team.saveHistory.has("p1")).toBe(true);
  });

  it("removes the player id when already saved", () => {
    const teams = [makeTeam({ saveHistory: new Set(["p1"]) })];
    const [team] = withPreviouslySavedToggled(teams, 0, "p1");
    expect(team.saveHistory.has("p1")).toBe(false);
  });
});

describe("withPlayerAdded", () => {
  it("adds the player to previousYearRoster", () => {
    const p = makePlayer("New Guy");
    const teams = [makeTeam()];
    const [team] = withPlayerAdded(teams, 0, p);
    expect(team.previousYearRoster).toEqual([p]);
  });

  it("is a no-op when the player is already on the roster", () => {
    const p = makePlayer("Already Here");
    const teams = [makeTeam({ previousYearRoster: [p] })];
    const [team] = withPlayerAdded(teams, 0, p);
    expect(team.previousYearRoster).toHaveLength(1);
  });
});

// ── Draft-order reordering ───────────────────────────────────────────────

describe("withTeamsReordered", () => {
  it("swaps two adjacent teams", () => {
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const result = withTeamsReordered(teams, 0, 1);
    expect(result.map((t) => t.name)).toEqual(["B", "A"]);
  });

  it("is a no-op when moving out of bounds at the top", () => {
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const result = withTeamsReordered(teams, 0, -1);
    expect(result).toBe(teams);
  });

  it("is a no-op when moving out of bounds at the bottom", () => {
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const result = withTeamsReordered(teams, 1, 1);
    expect(result).toBe(teams);
  });
});

describe("withUserTeamIndexAfterMove", () => {
  it("returns null unchanged when there is no user team", () => {
    expect(withUserTeamIndexAfterMove(null, 0, 1)).toBeNull();
  });

  it("follows the user's team down when it was the one moved", () => {
    expect(withUserTeamIndexAfterMove(2, 2, 1)).toBe(3);
  });

  it("follows the user's team up when the other side of the swap", () => {
    expect(withUserTeamIndexAfterMove(3, 2, 1)).toBe(2);
  });

  it("leaves the user team index unchanged when unrelated to the swap", () => {
    expect(withUserTeamIndexAfterMove(5, 2, 1)).toBe(5);
  });
});

// ── Franchise player declaration ─────────────────────────────────────────

describe("withFranchisePlayerSet", () => {
  it("sets franchisePlayer to the matching roster player", () => {
    const p = makePlayer("Franchise Guy");
    const teams = [makeTeam({ previousYearRoster: [p] })];
    const [team] = withFranchisePlayerSet(teams, 0, p.id);
    expect(team.franchisePlayer).toEqual(p);
  });

  it("sets franchisePlayer to null when the id isn't on the roster", () => {
    const teams = [makeTeam()];
    const [team] = withFranchisePlayerSet(teams, 0, "missing-id");
    expect(team.franchisePlayer).toBeNull();
  });
});

// ── Validation ───────────────────────────────────────────────────────────

describe("computeValidationErrors", () => {
  it("requires a player pool", () => {
    const errors = computeValidationErrors([], [], "watch", null);
    expect(errors).toContain("Import a player pool CSV first.");
  });

  it("requires at least 2 teams", () => {
    const pool = [makePlayer("A")];
    const errors = computeValidationErrors(pool, [makeTeam()], "watch", null);
    expect(errors).toContain(
      "Import team rosters CSV (need at least 2 teams).",
    );
  });

  it("requires a selected team in practice mode", () => {
    const pool = [makePlayer("A")];
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const errors = computeValidationErrors(pool, teams, "practice", null);
    expect(errors).toContain("Select your team for practice mode.");
  });

  it("does not require a selected team in watch mode", () => {
    const pool = [makePlayer("A")];
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const errors = computeValidationErrors(pool, teams, "watch", null);
    expect(errors).not.toContain("Select your team for practice mode.");
  });

  it("requires a declared franchise player when the user team has eligible players", () => {
    const p = makePlayer("Eligible Guy");
    const pool = [p];
    const userTeam = makeTeam({
      name: "A",
      previousYearRoster: [p],
      franchiseEligibleIds: new Set([p.id]),
    });
    const teams = [userTeam, makeTeam({ name: "B" })];
    const errors = computeValidationErrors(pool, teams, "practice", 0);
    expect(errors).toContain("Declare your franchise player before starting.");
  });

  it("does not require a franchise declaration when no eligible players exist", () => {
    const pool = [makePlayer("A")];
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const errors = computeValidationErrors(pool, teams, "practice", 0);
    expect(errors).not.toContain(
      "Declare your franchise player before starting.",
    );
  });

  it("returns no errors when every rule is satisfied", () => {
    const pool = [makePlayer("A")];
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const errors = computeValidationErrors(pool, teams, "watch", null);
    expect(errors).toEqual([]);
  });
});

// ── searchAvailablePlayers ─────────────────────────────────────────────────

describe("searchAvailablePlayers", () => {
  it("returns nothing for queries under 2 characters", () => {
    const pool = [makePlayer("Josh Allen")];
    const teams = [makeTeam()];
    expect(searchAvailablePlayers(pool, teams, 0, "j")).toEqual([]);
  });

  it("matches by case-insensitive substring of the player name", () => {
    const p = makePlayer("Josh Allen");
    const pool = [p, makePlayer("Saquon Barkley")];
    const teams = [makeTeam()];
    const result = searchAvailablePlayers(pool, teams, 0, "josh");
    expect(result.map((r) => r.id)).toEqual([p.id]);
  });

  it("excludes players already on the target team's roster", () => {
    const p = makePlayer("Josh Allen");
    const pool = [p];
    const teams = [makeTeam({ previousYearRoster: [p] })];
    expect(searchAvailablePlayers(pool, teams, 0, "josh")).toEqual([]);
  });

  it("caps results at 10", () => {
    const pool = Array.from({ length: 15 }, (_, i) =>
      makePlayer(`Match Guy ${i}`),
    );
    const teams = [makeTeam()];
    expect(searchAvailablePlayers(pool, teams, 0, "match")).toHaveLength(10);
  });
});

// ── buildDraftStateFrom ────────────────────────────────────────────────────

describe("buildDraftStateFrom", () => {
  it("nulls out userTeamIndex in watch mode", () => {
    const pool = [makePlayer("A")];
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const state = buildDraftStateFrom("watch", 0, teams, pool);
    expect(state.userTeamIndex).toBeNull();
  });

  it("keeps userTeamIndex in practice mode", () => {
    const pool = [makePlayer("A")];
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const state = buildDraftStateFrom("practice", 1, teams, pool);
    expect(state.userTeamIndex).toBe(1);
  });

  it("auto-selects franchise players for non-user teams", () => {
    const eligible = makePlayer("Eligible Guy");
    const pool = [eligible];
    const teams = [
      makeTeam({
        name: "A",
        previousYearRoster: [eligible],
        franchiseEligibleIds: new Set([eligible.id]),
      }),
      makeTeam({ name: "B" }),
    ];
    const state = buildDraftStateFrom("watch", null, teams, pool);
    expect(state.teams[0].franchisePlayer).not.toBeNull();
  });

  it("produces a DraftState ready to start round 1", () => {
    const pool = [makePlayer("A")];
    const teams = [makeTeam({ name: "A" }), makeTeam({ name: "B" })];
    const state = buildDraftStateFrom("watch", null, teams, pool);
    expect(state.currentPick).toEqual({ round: 1, teamIndex: 0 });
    expect(state.isDraftComplete).toBe(false);
  });
});
