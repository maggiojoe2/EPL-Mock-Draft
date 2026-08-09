# Issue 07 — No-franchise-player `lastAvailableRound` fix

Status: ready-for-agent

## Problem

When a team enters the draft with no franchise-eligible players (new-to-league team), the app
incorrectly asks that team to make a pick in round 16 even though all 15 normal slots are already
filled. The draft also never completes, because slot 16 stays empty and `totalPicksFilled` requires
all 16 slots × all teams to be non-null.

Root cause: `initDraft` pre-places franchise players into slot 16 but never updates
`lastAvailableRound`. Teams arrive from `buildTeamsFromImport` / `makeDemoTeams` with
`lastAvailableRound: 15` as a placeholder. Teams with a franchise player get slot 16 filled, so
their saves/pullbacks correctly fill from slot 15 down. Teams *without* a franchise player retain
`lastAvailableRound: 15`, which means saves/pullbacks never reach slot 16 — leaving it permanently
empty and the draft stuck.

Additionally, `ADVANCE_SIMULATION` has no guard to skip a team whose normal slots are all filled.
For franchise teams at round 16, `nextNormalSlot` would throw instead of being skipped.

## Design decisions (from grilling session)

- **All 16 slots are uniform.** There are no "normal slots" vs "special slots" — franchise, save,
  and pullback all just fill the last available slot; normal picks fill the first available slot.
  Slot 16 is not reserved; it is simply the slot that is typically filled last.
- **Draft completes when every team has 16 players** — i.e. `totalPicksFilled === teams.length * 16`.
  This is already the case in `draftEngine.ts` (no change needed there).
- **`lastAvailableRound` is set by `initDraft`**, not by setup helpers. Setup helpers may default
  to any value as a pre-`initDraft` placeholder; `initDraft` is the authority.
- **No-franchise teams start at `lastAvailableRound: 16`**. Their first save or pullback fills
  slot 16; subsequent ones fill 15, 14, … etc. (same as franchise teams but one slot higher to
  start).
- **`ADVANCE_SIMULATION` must skip teams with no open normal slots** rather than throwing.

## Files to change

### `src/engine/initDraft.ts`

Update the `teams.map` to set `lastAvailableRound` for every team, not only those with a
franchise player:

```ts
const teams = params.teams.map(team => {
  const lastAvailableRound = team.franchisePlayer ? 15 : 16
  if (!team.franchisePlayer) return { ...team, lastAvailableRound }
  pool = pool.filter(p => p.id !== team.franchisePlayer!.id)
  const roster = [...team.roster]
  roster[16] = team.franchisePlayer
  return { ...team, roster, lastAvailableRound }
})
```

### `src/engine/draftEngine.ts`

1. Add a `teamHasOpenNormalSlot` helper (analogous to `nextNormalSlot` but returning a boolean):

```ts
function teamHasOpenNormalSlot(team: Team, fromRound: number): boolean {
  for (let r = fromRound; r <= TOTAL_ROUNDS; r++) {
    if (team.roster[r] === null) return true
  }
  return false
}
```

2. In `ADVANCE_SIMULATION`, before picking for an AI team, skip teams that are already full:

```ts
// Skip teams with no open normal slots (their roster is already complete via
// franchise/save/pullback; a normal pick would throw or overwrite).
const currentTeam = state.teams[teamIndex]!
if (!teamHasOpenNormalSlot(currentTeam, state.currentPick.round)) {
  // Advance the cursor without making a pick.
  const next = nextPick(state.currentPick.round, teamIndex, state.teams.length)
  if (!next) return { ...state, isDraftComplete: totalPicksFilled(state.teams) === state.teams.length * TOTAL_ROUNDS }
  return draftEngine({ ...state, currentPick: next }, { type: 'ADVANCE_SIMULATION' })
}
```

### `src/setup/SetupScreen.tsx` (line ~315)

Update copy: `{userTeam!.name} has no franchise-eligible players — round 16 will be empty.`
→ `{userTeam!.name} has no franchise-eligible players — saves and pullbacks will fill from round 16.`

### `CONTEXT.md`

Update save/pullback and `lastAvailableRound` definitions:
- "starting at round 15 … since round 16 is reserved for franchise player" → "starting at round 16 (or 15 if a franchise player was declared)"
- Remove: "Round 16 is never available this way"

## Tests

### Remove (wrong — tests behaviour that should not exist)

In `src/engine/__tests__/advanceSimulation.test.ts`, remove any test that asserts
`ADVANCE_SIMULATION` is a no-op when normal slots 1–15 are filled and slot 16 is empty.
(Such a test was added during the initial wrong fix and was reverted; confirm it is gone.)

### Add (regression tests for the fix)

In `src/engine/__tests__/advanceSimulation.test.ts`:

1. **No-franchise team gets `lastAvailableRound: 16` from `initDraft`**
   - Create a team with `franchisePlayer: null` and `lastAvailableRound: 15` (the pre-init default)
   - Call `initDraft`
   - Assert `state.teams[i].lastAvailableRound === 16`

2. **ADVANCE_SIMULATION skips a full team and moves the cursor**
   - Build a state where the current team's roster has slots 1–15 filled and slot 16 also filled
     (e.g. franchise player in 16)
   - Run `ADVANCE_SIMULATION`
   - Assert cursor advances to the next team (pick was NOT made on the full team, pool unchanged)

3. **Draft completes once all teams have 16 players (including no-franchise teams)**
   - Build a near-complete state where one no-franchise team has slots 1–15 filled and slot 16 null
   - Make the final pick that fills slot 16
   - Assert `isDraftComplete === true`

## Out of scope

- `src/setup/setupHelpers.ts` `buildTeamsFromImport` hardcodes `lastAvailableRound: 15` as a
  pre-`initDraft` default. Leave as-is — `initDraft` overrides it.
- `src/engine/testHelpers.ts` `makeTeam` defaults `lastAvailableRound: 15`. Leave as-is — tests
  that care about a specific value pass it explicitly.

## Comments
