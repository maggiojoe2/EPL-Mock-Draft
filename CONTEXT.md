# EPL Mock Drafter — Domain Glossary

"EPL" is the name of the fantasy football league, not a reference to soccer.

## Terms

**League** — the group of 12 fantasy teams that compete each NFL season on ESPN.

**Draft** — the annual event where all 12 teams select NFL players in sequence before the season begins. The league runs its own paper draft independently of ESPN's draft tools.

**Round** — one pass through all 12 teams in pick order. The draft has 16 rounds.

**Pick** — a single team's selection of one NFL player from the available pool during their turn.

**Draft order** — the sequence in which teams pick each round. The same order repeats every round (non-snake). Set by the previous year's standings; manually adjustable before the draft.

**Available pool** — the set of NFL players not yet selected in the current draft.

**Previous-year roster** — the set of players a fantasy team held at the end of the prior NFL season. Determines eligibility for saves, pullbacks, and franchise designation.

**Franchise player** — a player who has been on the same fantasy team's previous-year roster for 2 consecutive seasons. Each team pre-declares one franchise player before the draft; they automatically fill that team's round 16 slot and are never in the available pool.

**Franchise eligibility** — the property of a player having been on the same fantasy team's roster at the end of 2 consecutive seasons. Tracked per team via the franchise_eligible flag in the roster import.

**Save** — a one-per-draft action. When an opponent picks a player from your previous-year roster who has never been saved by your team before, you may block that pick and keep the player. The saved player fills your furthest-back open round (starting at round 15, then 14, 13, etc., since round 16 is reserved for the franchise player).

**Saveable player** — a player on your previous-year roster who has never been saved by your team in any prior draft. Save history is tracked across sessions.

**Save history** — the record of which players have ever been saved by a given team. A player saved once is no longer saveable by that team in future drafts.

**Pullback** — an unlimited reaction (one per eligible player picked). When an opponent picks any player from your previous-year roster, you may claim a *different* player from your previous-year roster instead. The original pick stands; the pulled-back player fills your furthest-back open round. A team may decline to pull back.

**Last available round** — the furthest-back unfilled round slot for a team. Saves and pullbacks always fill this slot, pushing it forward (15→14→13…). Round 16 is never available this way — it is always reserved for the franchise player.

**ADP (Average Draft Position)** — a ranking of NFL players by the average position at which they are drafted across many leagues. Used to drive AI pick decisions, sourced from a FantasyPros CSV export.

**Practice mode** — a draft session where the user controls one team and the remaining 11 teams are simulated by the app.

**Watch mode** — a draft session where all 12 teams are simulated and the user observes without making picks.

**Simulated team** — an AI-controlled fantasy team that selects players by ADP with randomness, and makes save/pullback decisions based on player value.

**Roster** — a team's complete set of 16 drafted players: 9 starters (1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX, 1 K, 1 DEF/ST) and 7 bench spots.
