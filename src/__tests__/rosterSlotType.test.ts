import { describe, it, expect } from "vitest";
import { buildSlotTypeMap, slotKey } from "../rosterSlotType";
import type { PickRecord, Team, Player } from "../types";

// ── helpers ────────────────────────────────────────────────────────────────

function makePlayer(
  id: string,
  name: string,
  position: string,
  nflTeam: string,
): Player {
  return { id, name, position, nflTeam, adp: 1 };
}

function makeRoster(slots: (Player | null)[]): (Player | null)[] {
  // index 0 unused; slots[i] is round i (1-indexed)
  return [null, ...slots];
}

function emptySlots(count: number): (Player | null)[] {
  return new Array<Player | null>(count).fill(null);
}

function makeTeam(
  name: string,
  roster: (Player | null)[],
  franchisePlayer: Player | null = null,
): Team {
  return {
    name,
    roster,
    previousYearRoster: [],
    saveHistory: new Set(),
    franchisePlayer,
    franchiseEligibleIds: new Set(),
    saveUsedThisDraft: false,
    lastAvailableRound: 15,
  };
}

// ── buildSlotTypeMap ─────────────────────────────────────────────────────

describe("buildSlotTypeMap", () => {
  it("maps normal, save, and pullback picks sourced from pickHistory", () => {
    const p1 = makePlayer("p1", "Alice", "QB", "KC");
    const p2 = makePlayer("p2", "Bob", "RB", "DAL");
    const p3 = makePlayer("p3", "Cara", "WR", "SF");
    const team = makeTeam(
      "Eagles",
      makeRoster([p1, p2, p3, ...emptySlots(13)]),
    );

    const pickHistory: PickRecord[] = [
      { round: 1, teamIndex: 0, player: p1, pickType: "normal" },
      { round: 2, teamIndex: 0, player: p2, pickType: "save" },
      { round: 3, teamIndex: 0, player: p3, pickType: "pullback" },
    ];

    const map = buildSlotTypeMap([team], pickHistory);

    expect(map.get(slotKey(0, 1))).toBe("normal");
    expect(map.get(slotKey(0, 2))).toBe("save");
    expect(map.get(slotKey(0, 3))).toBe("pullback");
  });

  it("detects a franchise pre-fill with no corresponding pickHistory entry", () => {
    const fp = makePlayer("fp1", "CJ Stroud", "QB", "HOU");
    const team = makeTeam("Texans", makeRoster([...emptySlots(15), fp]), fp);

    const map = buildSlotTypeMap([team], []);

    expect(map.get(slotKey(0, 16))).toBe("franchise");
  });

  it("does not overwrite an existing pickHistory-sourced entry at the franchise slot", () => {
    const fp = makePlayer("fp1", "CJ Stroud", "QB", "HOU");
    const team = makeTeam("Texans", makeRoster([...emptySlots(15), fp]), fp);

    // Simulate a future world where franchise placement is recorded in
    // pickHistory under a different pickType — the fallback must not clobber it.
    const pickHistory: PickRecord[] = [
      { round: 16, teamIndex: 0, player: fp, pickType: "normal" },
    ];

    const map = buildSlotTypeMap([team], pickHistory);

    expect(map.get(slotKey(0, 16))).toBe("normal");
  });
});
