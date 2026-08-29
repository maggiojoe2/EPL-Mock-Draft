#!/usr/bin/env tsx
/**
 * Regenerates `public/defaults/players.csv` from a manually-downloaded
 * FantasyPros half-PPR rankings export.
 *
 * FantasyPros has no fetchable half-PPR endpoint, so a maintainer must
 * download the CSV by hand first — see the source comment atop
 * `../src/setup/sourcePlayers.ts` for exactly which page, scoring-format
 * selection, and export button to use — then run:
 *
 *   npm run update-players -- <path-to-downloaded-csv>
 *
 * Run on demand by a maintainer — not scheduled or run in CI. Refuses to
 * overwrite the bundled file if the given data fails sanity checks (too
 * few rows, missing columns, unrecognized position codes), so a wrong
 * file or a FantasyPros format change can't silently ship broken defaults.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { normalizeSourceCsv } from "../src/setup/sourcePlayers.ts";
import { CSV_COLUMNS, parseRosterCsv } from "../src/setup/csvParser.ts";
import type { Player } from "../src/types.ts";

const OUTPUT_PATH = fileURLToPath(
  new URL("../public/defaults/players.csv", import.meta.url),
);
const ROSTERS_PATH = fileURLToPath(
  new URL("../public/defaults/rosters.csv", import.meta.url),
);

/** Warn (not abort) on rostered players who no longer appear in the
 *  refreshed data — a diagnostic aid for the maintainer, not a hard gate,
 *  since a name falling out could just as easily be a real roster change
 *  (retirement, cut) as a data problem. */
function warnOnRosterMismatches(players: Pick<Player, "name">[]): void {
  let rosterText: string;
  try {
    rosterText = readFileSync(ROSTERS_PATH, "utf-8");
  } catch (err) {
    console.warn(
      `Could not read ${ROSTERS_PATH} for roster-mismatch check: ${(err as Error).message}`,
    );
    return;
  }

  const rosters = parseRosterCsv(rosterText);
  const knownNames = new Set(players.map((p) => p.name.toLowerCase()));

  const unmatched = new Set<string>();
  for (const rows of rosters.values()) {
    for (const row of rows) {
      if (!knownNames.has(row.playerName.toLowerCase())) {
        unmatched.add(row.playerName);
      }
    }
  }

  if (unmatched.size > 0) {
    console.warn(
      `Warning: ${unmatched.size} rostered player(s) not found in refreshed data:`,
    );
    for (const name of [...unmatched].sort()) console.warn(`  - ${name}`);
  }
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(
      "Usage: npm run update-players -- <path-to-fantasypros-half-ppr-export.csv>",
    );
    process.exit(1);
  }

  let csvText: string;
  try {
    csvText = readFileSync(inputPath, "utf-8");
  } catch (err) {
    console.error(`Could not read ${inputPath}: ${(err as Error).message}`);
    process.exit(1);
  }

  const { players, sanity } = normalizeSourceCsv(csvText);

  if (!sanity.ok) {
    console.error("Refusing to update players.csv — sanity checks failed:");
    for (const error of sanity.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  warnOnRosterMismatches(players);

  const rows = [...players]
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({
      name: p.name,
      position: p.position,
      nfl_team: p.nflTeam,
      rank: p.rank,
    }));

  const header = CSV_COLUMNS.playerPool.split(", ");
  const csvOut = Papa.unparse(rows, { columns: header });

  writeFileSync(OUTPUT_PATH, csvOut + "\n");
  console.log(`Wrote ${players.length} players to ${OUTPUT_PATH}`);
}

main();
