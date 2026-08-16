# Issue 02 — Fix 2026 draft order

Status: completed

## Problem

The bundled default draft order (`public/defaults/rosters.csv`, row order of `team_name`
blocks) was never the real 2026 order — it was just whatever order rows happened to land in
when the file was authored, unrelated to any ranking. The domain glossary claimed draft order
is "set by the previous year's standings," which was also never implemented in code; order has
always been implicit CSV row order.

Additionally, 5 of the 12 team names in that file were left as slash-joined multi-name
artifacts (e.g. `"Grapevine Garms / Lamarvelous"`) instead of the team's actual current name.

## Fix

One-time data correction (not a computed feature):

- Reordered the row-blocks in `public/defaults/rosters.csv` to match the real 2026 draft order:
  bottom 6 picks by reverse final standings, top 6 picks seeded by the non-playoff-team
  compensation bracket (bracket winner picks first). Order remains implicit (array/row
  position) — no new ordering field was introduced.
- Renamed the 5 ambiguous `team_name` values to their canonical name (the segment after the
  final `/`): "Grapevine Garms / Lamarvelous" → "Lamarvelous", "Rick in a Box / Pushin Tush" →
  "Pushin Tush", "You Like That? / Taylormade" → "Taylormade", "Concussion Protocol / Zorro /
  The Ironmen" → "The Ironmen", "Bishop Taco 2.0 / Gnome Mercy" → "Gnome Mercy".
- Corrected the `CONTEXT.md` "Draft order" glossary entry to describe the real rule instead of
  the incomplete "previous year's standings" line.
- Uploaded CSVs are unaffected and continue to determine their own order.

Follow-up: also renamed "Gerardo Taco Bout a Win" → "Taco Bout a Win" (dropped the
first-name prefix, same canonical-name correction as the other 5).

Explicitly out of scope: computing draft order automatically from standings/bracket results
(spec story 5) — this issue is a one-time correction of the shipped default, not that feature.

## Comments
