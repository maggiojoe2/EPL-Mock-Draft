# 05 — JSON log download (panel + summary screen)

**What to build:** Let the user download the current `debugLog` as a JSON file, from a button inside the live panel (usable at any time during the draft, downloads whatever's logged so far) and from a new button on `SummaryScreen` next to the existing roster CSV export (downloads the complete end-of-draft log). Both use the same underlying serialization — no separate "partial" vs "final" format.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A single export function serializes `debugLog` to a downloadable `.json` file
- [ ] A download button in the live panel triggers this export with the log's current contents at click time
- [ ] A new download button on `SummaryScreen`, alongside the existing CSV export, triggers the same export with the full end-of-draft log
- [ ] The exported JSON is a plain array of log entries in the same shape/order as `debugLog`, with no lossy transformation
- [ ] Works correctly regardless of which entry kinds (picks, reactions, save-target computations, skips) are present at download time — no dependency on tickets 02–04 having landed
- [ ] The export function's serialization is covered by a plain unit test (given a `debugLog` array, asserts the produced JSON); per existing project precedent (ADR 0002), the button-wiring/panel UI itself is not component-tested
