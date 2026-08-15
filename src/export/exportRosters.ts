import { TOTAL_ROUNDS } from "../constants";
import type { PickRecord, Team } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CsvRow {
  team_name: string;
  round: number;
  player_name: string;
  position: string;
  nfl_team: string;
  slot_type: "normal" | "franchise" | "save" | "pullback";
}

/** Encode a (teamIndex, round) pair as a map key. */
export function slotKey(teamIndex: number, round: number): string {
  return `${teamIndex}-${round}`;
}

/**
 * Build a lookup from (teamIndex, round) → pickType.
 * Franchise pre-fills are not in pickHistory; they are detected from the
 * team's franchisePlayer field and placed in round TOTAL_ROUNDS.
 */
export function buildSlotTypeMap(
  teams: Team[],
  pickHistory: PickRecord[],
): Map<string, PickRecord["pickType"]> {
  const map = new Map<string, PickRecord["pickType"]>();

  for (const rec of pickHistory) {
    map.set(slotKey(rec.teamIndex, rec.round), rec.pickType);
  }

  // Franchise pre-fills are placed by initDraft (not through PICK_PLAYER) so
  // they have no history entry — detect them from the team's franchisePlayer.
  for (let ti = 0; ti < teams.length; ti++) {
    const team = teams[ti];
    if (
      team.franchisePlayer &&
      team.roster[TOTAL_ROUNDS]?.id === team.franchisePlayer.id
    ) {
      const key = slotKey(ti, TOTAL_ROUNDS);
      if (!map.has(key)) map.set(key, "franchise");
    }
  }

  return map;
}

// ── buildCsvRows ───────────────────────────────────────────────────────────

/**
 * Build one CsvRow per filled roster slot across all teams.
 * Rows are ordered by round ascending, then by teamIndex ascending.
 */
export function buildCsvRows(
  teams: Team[],
  pickHistory: PickRecord[],
): CsvRow[] {
  const typeMap = buildSlotTypeMap(teams, pickHistory);
  const rows: CsvRow[] = [];

  // Iterate round-major so output is ordered by round then team.
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    for (let ti = 0; ti < teams.length; ti++) {
      const team = teams[ti];
      const player = team.roster[round];
      if (!player) continue;

      const slot_type =
        (typeMap.get(slotKey(ti, round)) as CsvRow["slot_type"]) ?? "normal";

      rows.push({
        team_name: team.name,
        round,
        player_name: player.name,
        position: player.position,
        nfl_team: player.nflTeam,
        slot_type,
      });
    }
  }

  return rows;
}

// ── toCsvString ────────────────────────────────────────────────────────────

const HEADERS: (keyof CsvRow)[] = [
  "team_name",
  "round",
  "player_name",
  "position",
  "nfl_team",
  "slot_type",
];

/** Wrap a value in quotes if it contains a comma, double-quote, or newline. */
function escapeCsvValue(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Serialize an array of CsvRow objects to a CSV string with a header row. */
export function toCsvString(rows: CsvRow[]): string {
  const header = HEADERS.join(",");
  const dataLines = rows.map((row) =>
    HEADERS.map((key) => escapeCsvValue(row[key])).join(","),
  );
  return [header, ...dataLines].join("\n") + "\n";
}
