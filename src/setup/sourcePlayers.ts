import Papa from "papaparse";
import type { Player } from "../types";
import { playerIdFromNamePos } from "./csvParser";

// ── Source ───────────────────────────────────────────────────────────────
//
// FantasyPros has no fetchable half-PPR endpoint (half-PPR rankings pages
// render client-side with no CORS-open raw CSV/JSON export — see
// `.scratch/player-rankings-refresh/adp-source-research.md`), so this data
// must be downloaded by hand before running `update-players`:
//
//   1. https://www.fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php
//   2. Confirm "Half PPR" scoring is selected (not Standard or PPR) — the
//      exported filename doesn't record which scoring format was used.
//   3. Click "Export" → CSV, and save the file locally.
//
// The export is already one row per player, with columns:
//   RK, TIERS, "PLAYER NAME", TEAM, "POS", "BYE WEEK", "UPSIDE ", "BUST ",
//   "SOS SEASON", "ECR VS. ADP"
// `POS` glues position and position-rank together (e.g. `RB1`). Only
// PLAYER NAME, TEAM, RK, and POS are used below — the rest are ignored.

const KNOWN_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DST"]);

const REQUIRED_SOURCE_COLUMNS = ["PLAYER NAME", "TEAM", "RK", "POS"] as const;

const MIN_PLAYER_ROWS = 300;

// ── Types ──────────────────────────────────────────────────────────────────

export interface SourceSanityCheck {
  ok: boolean;
  errors: string[];
}

export interface NormalizeSourceCsvResult {
  players: Player[];
  sanity: SourceSanityCheck;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Strip a `POS` column's trailing position-rank digits, e.g. `RB1` → `RB`. */
function stripPositionRank(pos: string): string {
  return pos.replace(/\d+$/, "");
}

// ── normalizeSourceCsv ───────────────────────────────────────────────────

/**
 * Parse a FantasyPros half-PPR rankings CSV export (manually downloaded —
 * see the source comment above) into `Player[]`, plus sanity-check results
 * the `update-players` script uses to decide whether the data is
 * trustworthy enough to overwrite the bundled defaults with.
 */
export function normalizeSourceCsv(csvText: string): NormalizeSourceCsvResult {
  const { data, meta } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = [];

  const fields = meta.fields ?? [];
  const missingColumns = REQUIRED_SOURCE_COLUMNS.filter(
    (col) => !fields.includes(col),
  );
  if (missingColumns.length > 0) {
    errors.push(`Missing required column(s): ${missingColumns.join(", ")}`);
    // Without the columns themselves there's nothing useful to extract.
    return { players: [], sanity: { ok: false, errors } };
  }

  // A required column can be present in the header yet blank on every row —
  // e.g. the source drops a field's values without renaming/removing the
  // column itself. Catch that here rather than relying solely on the
  // downstream row-count check to notice indirectly.
  const emptyColumns = REQUIRED_SOURCE_COLUMNS.filter(
    (col) => data.length > 0 && data.every((row) => !row[col]?.trim()),
  );
  if (emptyColumns.length > 0) {
    errors.push(
      `Required column(s) present but empty in every row: ${emptyColumns.join(", ")}`,
    );
  }

  const unrecognizedPositions = new Set<string>();

  const players: Player[] = data.flatMap((row) => {
    const name = row["PLAYER NAME"]?.trim() ?? "";
    const nflTeam = row["TEAM"]?.trim() ?? "";
    const rankRaw = row["RK"]?.trim() ?? "";
    const position = stripPositionRank(row["POS"]?.trim() ?? "");

    if (!name || !position || rankRaw === "") return [];

    if (!KNOWN_POSITIONS.has(position)) {
      unrecognizedPositions.add(position);
      return [];
    }

    const rank = Number(rankRaw);
    if (!Number.isFinite(rank)) return [];

    return [
      {
        id: playerIdFromNamePos(name, position),
        name,
        position,
        nflTeam,
        rank,
      },
    ];
  });

  if (unrecognizedPositions.size > 0) {
    errors.push(
      `Unrecognized position code(s): ${[...unrecognizedPositions].sort().join(", ")}`,
    );
  }

  if (players.length < MIN_PLAYER_ROWS) {
    errors.push(
      `Only ${players.length} player row(s) found (minimum ${MIN_PLAYER_ROWS} required)`,
    );
  }

  return { players, sanity: { ok: errors.length === 0, errors } };
}
