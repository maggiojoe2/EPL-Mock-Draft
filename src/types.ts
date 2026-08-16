// ── Core domain types ──────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  adp: number;
}

export interface PickRecord {
  round: number;
  teamIndex: number;
  player: Player;
  /** 'normal' | 'save' | 'pullback' — how the slot was filled */
  pickType: "normal" | "save" | "pullback" | "franchise";
}

export interface Team {
  name: string;
  /** roster[i] holds the player drafted into round i (1-indexed, so index 1–16).
   *  Index 0 is unused. */
  roster: (Player | null)[];
  /** Players this team held at the end of the prior season. */
  previousYearRoster: Player[];
  /** Set of player IDs that this team has ever saved (across all past drafts). */
  saveHistory: Set<string>;
  /** The franchise player pre-declared for round 16. */
  franchisePlayer: Player | null;
  /** Player IDs from previousYearRoster that are franchise-eligible. */
  franchiseEligibleIds: Set<string>;
  /** Whether this team has already used their one save this draft. */
  saveUsedThisDraft: boolean;
  /** Furthest-back open round available for saves/pullbacks (starts at 15). */
  lastAvailableRound: number;
}

export type SavePrompt = {
  kind: "save";
  /** The team that originally made the pick */
  pickingTeamIndex: number;
  /** The team that may save (the owner of the previous-year player) */
  reactingTeamIndex: number;
  player: Player;
  /** Other previous-year players still in the pool the team could pull back
   *  instead of saving. A team with an unused save can save this player, pull
   *  back one of these, or decline — empty when no pullback options remain. */
  pullbackOptions: Player[];
};

export type PullbackPrompt = {
  kind: "pullback";
  /** The team that originally made the pick */
  pickingTeamIndex: number;
  /** The team that may pull back */
  reactingTeamIndex: number;
  /** The player who was picked (stays with picking team) */
  pickedPlayer: Player;
  /** Players from this team's previous-year roster still available to pull back */
  pullbackOptions: Player[];
};

export type PendingPrompt = SavePrompt | PullbackPrompt;

/** "practice" — user controls one team; "watch" — all 12 teams simulate. */
export type DraftMode = "practice" | "watch";

// ── Debug log ──────────────────────────────────────────────────────────────

/** "user" — a human-dispatched decision. "ai" — a simulated team's decision. */
export type LogActor = "user" | "ai";

/** One `PICK_PLAYER` action, human or simulated. For a simulated ("ai") pick,
 *  also captures the deterministic best-by-ADP comparison point: the
 *  optimal player, whether the actual pick diverged from it, and (only when
 *  it did) the Gaussian noise magnitude responsible. Human picks carry none
 *  of the optimal-comparison fields — there's no algorithmic reasoning to
 *  report for a manual choice. This is the first variant of what will grow
 *  into a `LogEntry` union covering the rest of `Action` plus turn skips. */
export interface PickLogEntry {
  seq: number;
  type: "PICK_PLAYER";
  round: number;
  teamIndex: number;
  actor: LogActor;
  player: Player;
  optimalPlayer?: Player;
  diverged?: boolean;
  noise?: number;
}

/** A team's turn skipped by `ADVANCE_SIMULATION` because it has no open
 *  normal slot at the landing round (its roster is already complete via
 *  franchise/save/pullback). No `actor` — this is a systemic scheduling
 *  decision, not a human or simulated choice. */
export interface SkipLogEntry {
  seq: number;
  type: "SKIP_TURN";
  round: number;
  teamIndex: number;
  reason: "no-open-slot";
}

export type LogEntry = PickLogEntry | SkipLogEntry;

export interface DraftState {
  mode: DraftMode;
  /** null in watch mode */
  userTeamIndex: number | null;
  teams: Team[];
  availablePool: Player[];
  currentPick: { round: number; teamIndex: number };
  pickHistory: PickRecord[];
  pendingPrompt: PendingPrompt | null;
  isDraftComplete: boolean;
  /** Ordered list of pending reactions to work through after a pick.
   *  Reactions are resolved one at a time; this queue lets the engine
   *  handle multiple teams having reactions to the same pick. */
  reactionQueue: PendingPrompt[];
  /** Append-only narrative of every decision the engine has processed this
   *  draft, in dispatch order. Reset alongside the rest of `DraftState` when
   *  a new draft starts; never persisted. */
  debugLog: LogEntry[];
}

// ── Actions ────────────────────────────────────────────────────────────────

/** Attached by `advanceSimulation` (never by the UI) when a `PICK_PLAYER`
 *  action represents a simulated team's decision, so the pick reducer can
 *  build the optimal-comparison fields on the resulting `PickLogEntry`
 *  without recomputing or guessing at "ai"-ness from other state. */
export interface PickAiContext {
  optimalPlayer: Player | null;
  noise: number;
}

export type Action =
  | { type: "PICK_PLAYER"; player: Player; aiContext?: PickAiContext }
  | { type: "INVOKE_SAVE"; player: Player }
  | { type: "DECLINE_SAVE" }
  | { type: "INVOKE_PULLBACK"; pullbackPlayer: Player }
  | { type: "DECLINE_PULLBACK" }
  | { type: "ADVANCE_SIMULATION" };
