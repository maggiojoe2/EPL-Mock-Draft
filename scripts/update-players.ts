#!/usr/bin/env tsx
/**
 * Regenerates `public/defaults/players.csv` from the live ranking source.
 *
 * Run on demand by a maintainer (`npm run update-players`) — not scheduled
 * or run in CI. Refuses to overwrite the bundled file if the fetched data
 * fails sanity checks (too few rows, missing columns, unrecognized position
 * codes), so a source-format change can't silently ship broken defaults.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import {
  normalizeSourceCsv,
  SOURCE_CSV_URL,
} from "../src/setup/sourcePlayers.ts";
import { CSV_COLUMNS } from "../src/setup/csvParser.ts";

const OUTPUT_PATH = fileURLToPath(
  new URL("../public/defaults/players.csv", import.meta.url),
);

async function main() {
  console.log(`Fetching ${SOURCE_CSV_URL} ...`);

  let csvText: string;
  try {
    const resp = await fetch(SOURCE_CSV_URL);
    if (!resp.ok) {
      console.error(`Fetch failed: HTTP ${resp.status} ${resp.statusText}`);
      process.exit(1);
    }
    csvText = await resp.text();
  } catch (err) {
    console.error(`Fetch failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const { players, sanity } = normalizeSourceCsv(csvText);

  if (!sanity.ok) {
    console.error("Refusing to update players.csv — sanity checks failed:");
    for (const error of sanity.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

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

void main();
