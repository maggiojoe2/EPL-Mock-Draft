import { describe, it, expect, vi } from "vitest";
import { buildTeamsFromImport, autoSelectFranchise } from "../setupHelpers";
import type { Player } from "../../types";
import type { RosterImport } from "../csvParser";

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

// ── buildTeamsFromImport ───────────────────────────────────────────────────

describe("buildTeamsFromImport", () => {
  it("creates one Team per entry in the roster import", () => {
    const pool: Player[] = [
      makePlayer("Josh Allen", "QB", 1),
      makePlayer("Saquon Barkley", "RB", 2),
    ];
    const roster: RosterImport = new Map([
      [
        "Team A",
        [
          {
            playerName: "Josh Allen",
            franchiseEligible: false,
            previouslySaved: false,
          },
        ],
      ],
      [
        "Team B",
        [
          {
            playerName: "Saquon Barkley",
            franchiseEligible: false,
            previouslySaved: false,
          },
        ],
      ],
    ]);
    const teams = buildTeamsFromImport(roster, pool);
    expect(teams).toHaveLength(2);
  });

  it("populates previousYearRoster by matching player names to pool IDs", () => {
    const p = makePlayer("Travis Kelce", "TE", 3);
    const pool: Player[] = [p];
    const roster: RosterImport = new Map([
      [
        "Alpha",
        [
          {
            playerName: "Travis Kelce",
            franchiseEligible: false,
            previouslySaved: false,
          },
        ],
      ],
    ]);
    const [team] = buildTeamsFromImport(roster, pool);
    expect(team.previousYearRoster).toHaveLength(1);
    expect(team.previousYearRoster[0].id).toBe(p.id);
  });

  it("seeds saveHistory from previously_saved players", () => {
    const p = makePlayer("CeeDee Lamb", "WR", 4);
    const pool: Player[] = [p];
    const roster: RosterImport = new Map([
      [
        "Alpha",
        [
          {
            playerName: "CeeDee Lamb",
            franchiseEligible: false,
            previouslySaved: true,
          },
        ],
      ],
    ]);
    const [team] = buildTeamsFromImport(roster, pool);
    expect(team.saveHistory.has(p.id)).toBe(true);
  });

  it("does not seed saveHistory for non-saved players", () => {
    const p = makePlayer("Davante Adams", "WR", 5);
    const pool: Player[] = [p];
    const roster: RosterImport = new Map([
      [
        "Alpha",
        [
          {
            playerName: "Davante Adams",
            franchiseEligible: false,
            previouslySaved: false,
          },
        ],
      ],
    ]);
    const [team] = buildTeamsFromImport(roster, pool);
    expect(team.saveHistory.size).toBe(0);
  });

  it("initialises lastAvailableRound to 15", () => {
    const pool: Player[] = [makePlayer("Patrick Mahomes", "QB", 1)];
    const roster: RosterImport = new Map([["Team A", []]]);
    const [team] = buildTeamsFromImport(roster, pool);
    expect(team.lastAvailableRound).toBe(15);
  });

  it("initialises a 17-slot roster array (index 0 unused)", () => {
    const roster: RosterImport = new Map([["Team A", []]]);
    const [team] = buildTeamsFromImport(roster, []);
    expect(team.roster).toHaveLength(17);
    team.roster.forEach((slot) => expect(slot).toBeNull());
  });

  it("skips roster players not found in the pool (graceful)", () => {
    const pool: Player[] = [];
    const roster: RosterImport = new Map([
      [
        "Team A",
        [
          {
            playerName: "Retired Guy",
            franchiseEligible: false,
            previouslySaved: false,
          },
        ],
      ],
    ]);
    const [team] = buildTeamsFromImport(roster, pool);
    expect(team.previousYearRoster).toHaveLength(0);
  });

  it("preserves team order from the import map", () => {
    const roster: RosterImport = new Map([
      ["First", []],
      ["Second", []],
      ["Third", []],
    ]);
    const teams = buildTeamsFromImport(roster, []);
    expect(teams.map((t) => t.name)).toEqual(["First", "Second", "Third"]);
  });
});

// ── autoSelectFranchise ────────────────────────────────────────────────────

describe("autoSelectFranchise", () => {
  it("picks a franchise player for each team without one, from franchise-eligible players", () => {
    const eligible = makePlayer("Tyreek Hill", "WR", 7);
    const pool: Player[] = [eligible];
    const roster: RosterImport = new Map([
      [
        "Team A",
        [
          {
            playerName: "Tyreek Hill",
            franchiseEligible: true,
            previouslySaved: false,
          },
        ],
      ],
    ]);
    const teams = buildTeamsFromImport(roster, pool);
    // No user team — auto-select for everyone
    const result = autoSelectFranchise(teams, null);
    expect(result[0].franchisePlayer).not.toBeNull();
    expect(result[0].franchisePlayer!.id).toBe(eligible.id);
  });

  it("franchises the best-ADP eligible player when several are eligible", () => {
    const best = makePlayer("Best Guy", "RB", 2);
    const worse = makePlayer("Worse Guy", "WR", 9);
    const pool: Player[] = [best, worse];
    const roster: RosterImport = new Map([
      [
        "Team A",
        [
          {
            playerName: "Worse Guy",
            franchiseEligible: true,
            previouslySaved: false,
          },
          {
            playerName: "Best Guy",
            franchiseEligible: true,
            previouslySaved: false,
          },
        ],
      ],
    ]);
    const teams = buildTeamsFromImport(roster, pool);
    // Pin Math.random above the mistake-noise threshold so the optimal
    // (best-ADP) candidate is chosen deterministically.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const result = autoSelectFranchise(teams, null);
      expect(result[0].franchisePlayer!.id).toBe(best.id);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("does not override a franchise player already set", () => {
    const p1 = makePlayer("Player One", "QB", 1);
    const p2 = makePlayer("Player Two", "WR", 2);
    const pool: Player[] = [p1, p2];
    const roster: RosterImport = new Map([
      [
        "Team A",
        [
          {
            playerName: "Player One",
            franchiseEligible: true,
            previouslySaved: false,
          },
          {
            playerName: "Player Two",
            franchiseEligible: true,
            previouslySaved: false,
          },
        ],
      ],
    ]);
    const teams = buildTeamsFromImport(roster, pool);
    // Pre-set a franchise player
    const teamWithFranchise = [{ ...teams[0], franchisePlayer: p1 }];
    const result = autoSelectFranchise(teamWithFranchise, null);
    expect(result[0].franchisePlayer!.id).toBe(p1.id);
  });

  it("skips the user team (they declare their own franchise player)", () => {
    const eligible = makePlayer("Tyreek Hill", "WR", 7);
    const pool: Player[] = [eligible];
    const roster: RosterImport = new Map([
      [
        "Team A",
        [
          {
            playerName: "Tyreek Hill",
            franchiseEligible: true,
            previouslySaved: false,
          },
        ],
      ],
    ]);
    const teams = buildTeamsFromImport(roster, pool);
    // userTeamIndex 0 → Team A should NOT get auto-selected
    const result = autoSelectFranchise(teams, 0);
    expect(result[0].franchisePlayer).toBeNull();
  });

  it("leaves franchisePlayer null when team has no eligible players", () => {
    const roster: RosterImport = new Map([["Team A", []]]);
    const teams = buildTeamsFromImport(roster, []);
    const result = autoSelectFranchise(teams, null);
    expect(result[0].franchisePlayer).toBeNull();
  });
});
