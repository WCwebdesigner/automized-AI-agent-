/**
 * Agent Core Constants — Phase 1-3
 * Explicit states, statuses, permission levels, tool result statuses
 */

export enum AgentState {
  IDLE = "IDLE",
  PLANNING = "PLANNING",
  EXECUTING = "EXECUTING",
  OBSERVING = "OBSERVING",
  DIAGNOSING = "DIAGNOSING",
  REPAIRING = "REPAIRING",
  RETRYING = "RETRYING",
  VERIFYING = "VERIFYING",
  WAITING = "WAITING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  ESCALATED = "ESCALATED",
}

export enum TaskStatus {
  PENDING = "PENDING",
  READY = "READY",
  ACTIVE = "ACTIVE",
  RUNNING = "RUNNING",
  WAITING = "WAITING",
  BLOCKED = "BLOCKED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  ESCALATED = "ESCALATED",
  CANCELLED = "CANCELLED",
  SKIPPED = "SKIPPED",
}

export enum ObjectiveStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  PLANNING = "PLANNING",
  EXECUTING = "EXECUTING",
  VERIFYING = "VERIFYING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  ESCALATED = "ESCALATED",
  PAUSED = "PAUSED",
}

export enum PermissionLevel {
  READ_ONLY = "READ_ONLY",
  WORKSPACE_WRITE = "WORKSPACE_WRITE",
  COMMAND_EXECUTION = "COMMAND_EXECUTION",
  DESTRUCTIVE = "DESTRUCTIVE",
}

export enum ToolResultStatus {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
  TIMEOUT = "TIMEOUT",
  PERMISSION_ERROR = "PERMISSION_ERROR",
}

export const AGENT_STATE_TRANSITIONS: Record<AgentState, AgentState[]> = {
  [AgentState.IDLE]: [AgentState.PLANNING, AgentState.FAILED],
  [AgentState.PLANNING]: [AgentState.EXECUTING, AgentState.FAILED, AgentState.ESCALATED],
  [AgentState.EXECUTING]: [AgentState.OBSERVING, AgentState.EXECUTING, AgentState.FAILED, AgentState.VERIFYING],
  [AgentState.OBSERVING]: [AgentState.EXECUTING, AgentState.VERIFYING, AgentState.DIAGNOSING, AgentState.WAITING],
  [AgentState.DIAGNOSING]: [AgentState.REPAIRING, AgentState.FAILED, AgentState.ESCALATED],
  [AgentState.REPAIRING]: [AgentState.RETRYING, AgentState.FAILED],
  [AgentState.RETRYING]: [AgentState.EXECUTING, AgentState.OBSERVING, AgentState.FAILED],
  [AgentState.VERIFYING]: [AgentState.COMPLETED, AgentState.FAILED, AgentState.DIAGNOSING, AgentState.EXECUTING, AgentState.VERIFYING],
  [AgentState.WAITING]: [AgentState.EXECUTING, AgentState.FAILED],
  [AgentState.COMPLETED]: [AgentState.IDLE],
  [AgentState.FAILED]: [AgentState.IDLE],
  [AgentState.ESCALATED]: [AgentState.IDLE],
};

export const RETRYABLE_STATES: AgentState[] = [
  AgentState.DIAGNOSING,
  AgentState.REPAIRING,
  AgentState.RETRYING,
];
