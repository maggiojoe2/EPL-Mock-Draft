# 03 — Full draft board + ADP simulation

**What to build:** Polish the draft board into the primary draft UI and replace random AI picks with ADP-weighted simulation. The board shows all 12 teams × 16 rounds with clear slot states (empty, filled, reserved). The current pick is indicated. The player pool is sorted by ADP rank and the user's previous-year players are highlighted. Practice mode and watch mode both work: in practice mode the user picks on their turn; in watch mode all picks simulate automatically. AI teams pick by ADP with Gaussian noise.

**Blocked by:** 02 — CSV import + pre-draft setup.

**Status:** ready-for-agent

- [ ] Draft board renders all 12 teams as columns and 16 rounds as rows
- [ ] Each cell shows: player name (if filled), "Franchise" label (round 16 pre-fill), or empty state
- [ ] Reserved slots (filled by franchise pre-placement) are visually distinct from empty normal slots
- [ ] Current pick cell is highlighted (team column + round row)
- [ ] Available player pool is sorted by ADP rank (ascending rank number = higher value)
- [ ] User's previous-year players are visually highlighted in the player pool list
- [ ] Practice mode: player pool is interactive on the user's turn; clicking a player dispatches `PICK_PLAYER`; AI picks automatically on all other turns
- [ ] Watch mode: all picks simulate automatically without user interaction; a short delay between picks makes the draft readable
- [ ] AI pick logic: select the available player with the best ADP rank, with Gaussian noise applied to the ranking so results vary between runs
- [ ] `ADVANCE_SIMULATION` action drives AI turns in both modes
- [ ] The board scrolls or is laid out so all 12×16 cells are reachable without information loss
