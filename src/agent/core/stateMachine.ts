/**
 * Agent State Machine — Phase 1-3
 * Explicit states, controlled transitions, logging
 */

import { AgentState, AGENT_STATE_TRANSITIONS } from "./constants";
import { AgentLogger, globalLogger } from "./logger";

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  timestamp: string;
  reason?: string;
  objectiveId?: string;
  taskId?: string;
}

export class AgentStateMachine {
  private current: AgentState;
  private history: StateTransition[] = [];
  private logger: AgentLogger;

  constructor(initial: AgentState = AgentState.IDLE, logger: AgentLogger = globalLogger) {
    this.current = initial;
    this.logger = logger;
    this.logger.log("DEBUG", "state_init", `Initialized in ${initial}`, {
      agentState: initial,
    });
  }

  getState(): AgentState {
    return this.current;
  }

  getHistory(): StateTransition[] {
    return [...this.history];
  }

  canTransition(to: AgentState): boolean {
    const allowed = AGENT_STATE_TRANSITIONS[this.current] ?? [];
    return allowed.includes(to);
  }

  transition(to: AgentState, reason?: string, meta: { objectiveId?: string; taskId?: string } = {}): boolean {
    if (!this.canTransition(to)) {
      this.logger.log(
        "WARN",
        "invalid_transition",
        `Invalid transition attempted: ${this.current} → ${to}${reason ? ` (${reason})` : ""}`,
        {
          agentState: this.current,
          objectiveId: meta.objectiveId,
          taskId: meta.taskId,
          data: { attempted: to, reason },
        }
      );
      // For robustness, still allow forced transitions to FAILED/ESCALATED
      if (to !== AgentState.FAILED && to !== AgentState.ESCALATED && to !== AgentState.IDLE) {
        return false;
      }
    }

    const transition: StateTransition = {
      from: this.current,
      to,
      timestamp: new Date().toISOString(),
      reason,
      objectiveId: meta.objectiveId,
      taskId: meta.taskId,
    };

    this.history.push(transition);
    const prev = this.current;
    this.current = to;

    this.logger.stateTransition(prev, to, meta.objectiveId, meta.taskId, reason);

    return true;
  }

  forceTransition(to: AgentState, reason?: string, meta: { objectiveId?: string; taskId?: string } = {}) {
    const transition: StateTransition = {
      from: this.current,
      to,
      timestamp: new Date().toISOString(),
      reason: reason ? `FORCED: ${reason}` : "FORCED",
      objectiveId: meta.objectiveId,
      taskId: meta.taskId,
    };
    this.history.push(transition);
    const prev = this.current;
    this.current = to;
    this.logger.stateTransition(prev, to, meta.objectiveId, meta.taskId, reason);
  }

  reset() {
    this.current = AgentState.IDLE;
    this.history = [];
    this.logger.log("INFO", "state_reset", "State machine reset to IDLE", {
      agentState: AgentState.IDLE,
    });
  }

  isTerminal(): boolean {
    return [AgentState.COMPLETED, AgentState.FAILED, AgentState.ESCALATED].includes(this.current);
  }

  isActive(): boolean {
    return !this.isTerminal() && this.current !== AgentState.IDLE;
  }
}
