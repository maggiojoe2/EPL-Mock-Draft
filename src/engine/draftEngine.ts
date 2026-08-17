import type { Action, DraftState } from "../types";
import { pickPlayer } from "./pickReducer";
import { declinePullback, invokePullback } from "./pullbackReducer";
import { declineSave, invokeSave } from "./saveReducer";
import { advanceSimulation } from "./simulationOrchestrator";

// ── Engine ─────────────────────────────────────────────────────────────────

export function draftEngine(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case "PICK_PLAYER":
      return pickPlayer(state, action.player, action.aiContext);

    case "INVOKE_SAVE":
      return invokeSave(state, action);

    case "DECLINE_SAVE":
      return declineSave(state, action);

    case "INVOKE_PULLBACK":
      return invokePullback(state, action);

    case "DECLINE_PULLBACK":
      return declinePullback(state, action);

    case "ADVANCE_SIMULATION":
      return advanceSimulation(state, draftEngine);

    default:
      return state;
  }
}
