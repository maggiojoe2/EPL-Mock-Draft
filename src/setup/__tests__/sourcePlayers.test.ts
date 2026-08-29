import { describe, it, expect } from "vitest";
import { normalizeSourceCsv } from "../sourcePlayers";

// ── Helpers ────────────────────────────────────────────────────────────────

const HEADER =
  'RK,TIERS,"PLAYER NAME",TEAM,"POS","BYE WEEK","UPSIDE ","BUST ","SOS SEASON","ECR VS. ADP"';

/** Build a minimal FantasyPros-export-shaped row. */
function row(
  overrides: Partial<{
    rk: string;
    name: string;
    team: string;
    pos: string;
  }> = {},
) {
  const {
    rk = "1",
    name = "Ja'Marr Chase",
    team = "CIN",
    pos = "WR1",
  } = overrides;
  return `${rk},1,${name},${team},${pos},7,1,2,10,+0.5`;
}

/** Repeat a row template with a distinct player name so row-count checks
 *  have real, distinguishable rows to count. */
function manyRows(count: number): string {
  return Array.from({ length: count }, (_, i) =>
    row({ rk: `${i + 2}`, name: `Player ${i}`, pos: "WR2" }),
  ).join("\n");
}

// ── normalizeSourceCsv ───────────────────────────────────────────────────

describe("normalizeSourceCsv", () => {
  it("returns a Player for each row, mapped from source columns", () => {
    const csv = `${HEADER}\n${row({ name: "Ja'Marr Chase", team: "CIN", rk: "1", pos: "WR1" })}\n${manyRows(299)}`;
    const { players, sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(true);
    const p = players.find((pl) => pl.name === "Ja'Marr Chase");
    expect(p).toMatchObject({
      name: "Ja'Marr Chase",
      position: "WR",
      nflTeam: "CIN",
      rank: 1,
    });
    expect(p!.id).toBeTruthy();
  });

  it.each([
    ["RB1", "RB"],
    ["WR2", "WR"],
    ["QB1", "QB"],
    ["DST", "DST"],
  ])("strips position-rank digits from POS (%s -> %s)", (pos, expected) => {
    const csv = `${HEADER}\n${row({ name: "Some Player", pos })}\n${manyRows(300)}`;
    const { players } = normalizeSourceCsv(csv);
    const p = players.find((pl) => pl.name === "Some Player");
    expect(p?.position).toBe(expected);
  });

  it("flags position codes outside the known set (after suffix-stripping)", () => {
    const csv = `${HEADER}\n${manyRows(300)}\n${row({ name: "Some LB", pos: "LB1" })}`;
    const { sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(false);
    expect(sanity.errors.some((e) => e.includes("LB"))).toBe(true);
  });

  it("flags too few rows against the minimum row count", () => {
    const csv = `${HEADER}\n${manyRows(5)}`;
    const { sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(false);
    expect(sanity.errors.some((e) => /minimum 300/.test(e))).toBe(true);
  });

  it("flags missing required columns", () => {
    const csv = `PLAYER NAME,POS,TEAM\nJa'Marr Chase,WR1,CIN`;
    const { players, sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(false);
    expect(sanity.errors.some((e) => /Missing required column/.test(e))).toBe(
      true,
    );
    expect(players).toHaveLength(0);
  });

  it("flags a required column that's present but blank on every row", () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      row({ rk: `${i + 1}`, name: `Player ${i}`, team: "" }),
    ).join("\n");
    const csv = `${HEADER}\n${rows}`;
    const { sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(false);
    expect(sanity.errors.some((e) => /present but empty.*TEAM/.test(e))).toBe(
      true,
    );
  });

  it("skips rows missing required field values", () => {
    const csv = `${HEADER}\n${manyRows(300)}\n${row({ name: "", team: "MISSING-NAME-ROW" })}`;
    const { players } = normalizeSourceCsv(csv);
    expect(players.some((p) => p.nflTeam === "MISSING-NAME-ROW")).toBe(false);
  });
});
