import { describe, it, expect } from "vitest";
import { parsePlayerPoolCsv, parseRosterCsv } from "../csvParser";

// ── parsePlayerPoolCsv ─────────────────────────────────────────────────────

describe("parsePlayerPoolCsv", () => {
  it("returns a Player for each data row", () => {
    const csv = `name,position,nfl_team,adp
Patrick Mahomes,QB,KC,1
Justin Jefferson,WR,MIN,2`;
    const players = parsePlayerPoolCsv(csv);
    expect(players).toHaveLength(2);
  });

  it("maps columns to Player fields", () => {
    const csv = `name,position,nfl_team,adp
Travis Kelce,TE,KC,3`;
    const [p] = parsePlayerPoolCsv(csv);
    expect(p.name).toBe("Travis Kelce");
    expect(p.position).toBe("TE");
    expect(p.nflTeam).toBe("KC");
    expect(p.adp).toBe(3);
  });

  it("generates stable IDs based on name+position", () => {
    const csv = `name,position,nfl_team,adp
CeeDee Lamb,WR,DAL,4`;
    const [p1] = parsePlayerPoolCsv(csv);
    const [p2] = parsePlayerPoolCsv(csv);
    expect(p1.id).toBe(p2.id);
    expect(p1.id).toBeTruthy();
  });

  it("IDs are unique across different players", () => {
    const csv = `name,position,nfl_team,adp
Saquon Barkley,RB,PHI,5
Derrick Henry,RB,DAL,6`;
    const [p1, p2] = parsePlayerPoolCsv(csv);
    expect(p1.id).not.toBe(p2.id);
  });

  it("treats non-numeric adp as 9999", () => {
    const csv = `name,position,nfl_team,adp
Unknown Player,WR,FA,`;
    const [p] = parsePlayerPoolCsv(csv);
    expect(p.adp).toBe(9999);
  });

  it("skips rows missing required fields", () => {
    const csv = `name,position,nfl_team,adp
,RB,KC,7
Valid Player,RB,SF,8`;
    const players = parsePlayerPoolCsv(csv);
    expect(players).toHaveLength(1);
    expect(players[0].name).toBe("Valid Player");
  });

  it("handles Windows-style line endings", () => {
    const csv = `name,position,nfl_team,adp\r\nJosh Allen,QB,BUF,2`;
    const players = parsePlayerPoolCsv(csv);
    expect(players).toHaveLength(1);
    expect(players[0].name).toBe("Josh Allen");
  });
});

// ── parseRosterCsv ──────────────────────────────────────────────────────────

describe("parseRosterCsv", () => {
  it("groups rows by team_name", () => {
    const csv = `team_name,player_name,franchise_eligible,previously_saved
The Kings,Patrick Mahomes,true,false
The Kings,Travis Kelce,false,true
The Rivals,Saquon Barkley,false,false`;
    const result = parseRosterCsv(csv);
    expect(result.size).toBe(2);
    expect(result.get("The Kings")).toHaveLength(2);
    expect(result.get("The Rivals")).toHaveLength(1);
  });

  it("parses franchise_eligible as boolean", () => {
    const csv = `team_name,player_name,franchise_eligible,previously_saved
Alpha,Josh Allen,true,false
Alpha,Stefon Diggs,false,false`;
    const rows = parseRosterCsv(csv).get("Alpha")!;
    expect(rows[0].franchiseEligible).toBe(true);
    expect(rows[1].franchiseEligible).toBe(false);
  });

  it("parses previously_saved as boolean", () => {
    const csv = `team_name,player_name,franchise_eligible,previously_saved
Alpha,Josh Allen,false,true
Alpha,Stefon Diggs,false,false`;
    const rows = parseRosterCsv(csv).get("Alpha")!;
    expect(rows[0].previouslySaved).toBe(true);
    expect(rows[1].previouslySaved).toBe(false);
  });

  it("skips rows missing team_name or player_name", () => {
    const csv = `team_name,player_name,franchise_eligible,previously_saved
,Josh Allen,false,false
Bravo,CeeDee Lamb,false,false`;
    const result = parseRosterCsv(csv);
    expect(result.size).toBe(1);
  });

  it("accepts 1 / 0 in addition to true / false", () => {
    const csv = `team_name,player_name,franchise_eligible,previously_saved
Alpha,Josh Allen,1,0`;
    const rows = parseRosterCsv(csv).get("Alpha")!;
    expect(rows[0].franchiseEligible).toBe(true);
    expect(rows[0].previouslySaved).toBe(false);
  });
});
