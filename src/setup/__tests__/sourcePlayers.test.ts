import { describe, it, expect } from "vitest";
import { normalizeSourceCsv } from "../sourcePlayers";

// ── Helpers ────────────────────────────────────────────────────────────────

const HEADER =
  "fp_page,page_type,ecr_type,player,id,pos,team,ecr,sd,best,worst,bye";

const OVERALL_PAGE = "/nfl/rankings/ppr-cheatsheets.php";

/** Build a minimal source-shaped row, defaulting to the "overall" page. */
function row(
  overrides: Partial<{
    fpPage: string;
    player: string;
    id: string;
    pos: string;
    team: string;
    ecr: string;
  }> = {},
) {
  const {
    fpPage = OVERALL_PAGE,
    player = "Ja'Marr Chase",
    id = "18209",
    pos = "WR",
    team = "CIN",
    ecr = "1",
  } = overrides;
  return `${fpPage},redraft-overall,ro,${player},${id},${pos},${team},${ecr},0.5,1,2,7`;
}

/** Repeat a row template with a distinct player name so row-count checks
 *  have real, distinguishable rows to count. */
function manyOverallRows(count: number): string {
  return Array.from({ length: count }, (_, i) =>
    row({ player: `Player ${i}`, id: `${1000 + i}` }),
  ).join("\n");
}

// ── normalizeSourceCsv ───────────────────────────────────────────────────

describe("normalizeSourceCsv", () => {
  it("returns a Player for each overall-page row, mapped from source columns", () => {
    const csv = `${HEADER}\n${row({ player: "Ja'Marr Chase", pos: "WR", team: "CIN", ecr: "1" })}\n${manyOverallRows(299)}`;
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

  it("filters out rows from non-overall pages (e.g. positional cheat sheets)", () => {
    const csv = `${HEADER}
${manyOverallRows(300)}
/nfl/rankings/ppr-rb-cheatsheets.php,redraft-position,rp,Some RB,999,RB,KC,1,0,1,1,7`;
    const { players } = normalizeSourceCsv(csv);
    expect(players.some((p) => p.name === "Some RB")).toBe(false);
  });

  it("flags position codes outside the known set", () => {
    const csv = `${HEADER}\n${manyOverallRows(300)}\n${row({ player: "Some LB", pos: "LB", id: "5001" })}`;
    const { sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(false);
    expect(sanity.errors.some((e) => e.includes("LB"))).toBe(true);
  });

  it("flags too few rows against the minimum row count", () => {
    const csv = `${HEADER}\n${manyOverallRows(5)}`;
    const { sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(false);
    expect(sanity.errors.some((e) => /minimum 300/.test(e))).toBe(true);
  });

  it("flags missing required columns", () => {
    const csv = `player,pos,team\nJa'Marr Chase,WR,CIN`;
    const { players, sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(false);
    expect(sanity.errors.some((e) => /Missing required column/.test(e))).toBe(
      true,
    );
    expect(players).toHaveLength(0);
  });

  it("flags a required column that's present but blank on every row", () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      row({ player: `Player ${i}`, id: `${1000 + i}`, team: "" }),
    ).join("\n");
    const csv = `${HEADER}\n${rows}`;
    const { sanity } = normalizeSourceCsv(csv);
    expect(sanity.ok).toBe(false);
    expect(sanity.errors.some((e) => /present but empty.*team/.test(e))).toBe(
      true,
    );
  });

  it("skips rows missing required field values", () => {
    const csv = `${HEADER}\n${manyOverallRows(300)}\n${row({ player: "", team: "MISSING-NAME-ROW" })}`;
    const { players } = normalizeSourceCsv(csv);
    expect(players.some((p) => p.nflTeam === "MISSING-NAME-ROW")).toBe(false);
  });
});
