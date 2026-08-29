import Papa from "papaparse";
import type { Player } from "../types";
import { playerIdFromNamePos } from "./csvParser";

// ── Source constants ─────────────────────────────────────────────────────
//
// `dynastyprocess/data`'s db_fpecr_latest.csv is a maintained, CORS-permissive
// mirror of FantasyPros Expert Consensus Ranking data (not FantasyPros
// directly — worth revisiting if this mirror ever lags or goes stale). It
// bundles many different ranking views (best-ball, dynasty, IDP, per-position
// cheat sheets, ...) into one file, one row per (player, view); the single
// `fp_page` value below is FantasyPros' "overall" PPR redraft cheat sheet —
// the one view with exactly one row per skill-position player, which is what
// this app wants as its flat `rank` field. (The dynastyprocess mirror doesn't
// separately label a half-PPR overall view — this is the closest analog.)

export const SOURCE_CSV_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv";

const OVERALL_FP_PAGE = "/nfl/rankings/ppr-cheatsheets.php";

const KNOWN_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DST"]);

const REQUIRED_SOURCE_COLUMNS = [
  "player",
  "id",
  "pos",
  "team",
  "ecr",
  "fp_page",
] as const;

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

// ── normalizeSourceCsv ───────────────────────────────────────────────────

/**
 * Parse the dynastyprocess `db_fpecr_latest.csv` shape into `Player[]`, plus
 * sanity-check results a caller (the `update-players` script, and eventually
 * the live in-app fetch) can use to decide whether the data is trustworthy
 * enough to use.
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
    if (row["fp_page"]?.trim() !== OVERALL_FP_PAGE) return [];

    const name = row["player"]?.trim() ?? "";
    const position = row["pos"]?.trim() ?? "";
    const nflTeam = row["team"]?.trim() ?? "";
    const rankRaw = row["ecr"]?.trim() ?? "";

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
