import { describe, it, expect } from "vitest";
import { toDebugLogJson } from "../exportDebugLog";
import type { LogEntry, Player } from "../../types";

// ── helpers ────────────────────────────────────────────────────────────────

function makePlayer(id: string, name: string): Player {
  return { id, name, position: "MID", nflTeam: "ARS", adp: 1 };
}

describe("toDebugLogJson", () => {
  it("serializes an empty log to an empty JSON array", () => {
    expect(toDebugLogJson([])).toBe(JSON.stringify([], null, 2));
    expect(JSON.parse(toDebugLogJson([]))).toEqual([]);
  });

  it("serializes entries as a plain array, preserving shape and order", () => {
    const debugLog: LogEntry[] = [
      {
        seq: 0,
        type: "PICK_PLAYER",
        round: 1,
        teamIndex: 0,
        actor: "user",
        player: makePlayer("p1", "Alice"),
      },
      {
        seq: 1,
        type: "PICK_PLAYER",
        round: 1,
        teamIndex: 1,
        actor: "ai",
        player: makePlayer("p2", "Bob"),
        optimalPlayer: makePlayer("p3", "Carol"),
        diverged: true,
        noise: 0.42,
      },
    ];

    const json = toDebugLogJson(debugLog);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(debugLog);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    // Order preserved, no re-sorting or filtering.
    expect(parsed[0].seq).toBe(0);
    expect(parsed[1].seq).toBe(1);
  });

  it("does not mutate or drop fields present on the input entries", () => {
    const debugLog: LogEntry[] = [
      {
        seq: 5,
        type: "PICK_PLAYER",
        round: 3,
        teamIndex: 2,
        actor: "ai",
        player: makePlayer("p9", "Dana"),
        optimalPlayer: makePlayer("p9", "Dana"),
        diverged: false,
      },
    ];

    const parsed = JSON.parse(toDebugLogJson(debugLog));
    expect(parsed[0]).toEqual(debugLog[0]);
  });
});
