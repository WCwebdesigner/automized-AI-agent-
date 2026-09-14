/**
 * Phase 8 — Durable Run Model
 * Deterministic runtime is authority for state, scheduling, limits, policies
 */

export type DurableRunState =
  | "CREATED"
  | "QUEUED"
  | "RUNNING"
  | "WAITING"
  | "PAUSED"
  | "RECOVERING"
  | "ESCALATED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type WaitReason =
  | "DEPLOYMENT"
  | "EXTERNAL_API"
  | "WEBSITE_CHANGE"
  | "SCHEDULED_TIME"
  | "APPROVAL"
  | "LONG_COMMAND"
  | "DEPENDENCY"
  | "EXTERNAL_EVENT"
  | "RETRY_AFTER"
  | "MONITORING"
  | "RESEARCH"
  | "HEALTH_CHECK";

export interface WaitingState {
  reason: WaitReason;
  description: string;
  waitingSince: string; // ISO
  expectedUntil?: string; // ISO
  retryAfterMs?: number;
  externalDependencyId?: string;
  escalationAfterMs?: number;
  checkIntervalMs?: number;
  attempts: number;
  maxAttempts?: number;
  lastCheckAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  lastError?: string;
  lastRetryAt?: string;
  nextRetryAt?: string;
  backoffMs: number;
  consecutiveFailures: number;
}

export interface CheckpointRef {
  id: string;
  timestamp: string;
  reason: string;
  taskId?: string;
  projectId?: string;
  objectiveId: string;
  runId: string;
  valid: boolean;
  dataHash?: string;
}

export interface ExternalDependency {
  id: string;
  type: string; // connector name
  status: "PENDING" | "RESOLVED" | "FAILED" | "TIMEOUT";
  request?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface DurableRun {
  runId: string;
  objectiveId: string;
  projectId?: string;
  state: DurableRunState;
  previousState?: DurableRunState;
  currentTaskId?: string;
  taskGraphId?: string;
  taskGraphState?: Record<string, unknown>; // serialized graph
  objective: string;
  startTime: string; // ISO
  lastActivityTime: string; // ISO
  nextScheduledAction?: string; // ISO
  checkpointRef?: CheckpointRef;
  retryInfo: RetryInfo;
  waitingState?: WaitingState;
  externalDependencies: ExternalDependency[];
  failureCount: number;
  failures: Array<{ timestamp: string; message: string; taskId?: string }>;
  escalationCount: number;
  escalations: Array<{ id: string; reason: string; timestamp: string; resolved: boolean }>;
  verificationState?: {
    lastVerificationAt?: string;
    status?: string;
    passed?: boolean;
    summary?: string;
  };
  completionState?: {
    completedAt?: string;
    result?: string;
    verificationResultId?: string;
  };
  cancellationState?: {
    cancelledAt?: string;
    reason?: string;
    requestedBy?: string;
  };
  expirationState?: {
    expiresAt?: string;
    reason?: string;
  };
  resourceUsage: {
    runtimeMs: number;
    modelCalls: number;
    externalRequests: number;
    shellDurationMs: number;
    downloadedBytes: number;
    taskAttempts: number;
    repairAttempts: number;
  };
  autonomyPolicy: "SUPERVISED" | "ASSISTED" | "AUTONOMOUS" | "RESTRICTED";
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const DURABLE_RUN_STATE_ORDER: Record<DurableRunState, number> = {
  CREATED: 0,
  QUEUED: 1,
  RUNNING: 2,
  WAITING: 3,
  PAUSED: 4,
  RECOVERING: 5,
  ESCALATED: 6,
  COMPLETED: 7,
  FAILED: 8,
  CANCELLED: 9,
  EXPIRED: 10,
};

export const TERMINAL_STATES: Set<DurableRunState> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

export const ACTIVE_STATES: Set<DurableRunState> = new Set([
  "RUNNING",
  "WAITING",
  "RECOVERING",
  "QUEUED",
]);

// Valid transitions — deterministic authority
export const VALID_TRANSITIONS: Record<DurableRunState, DurableRunState[]> = {
  CREATED: ["QUEUED", "CANCELLED", "EXPIRED"],
  QUEUED: ["RUNNING", "CANCELLED", "EXPIRED", "PAUSED"],
  RUNNING: ["WAITING", "PAUSED", "RECOVERING", "ESCALATED", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"],
  WAITING: ["RUNNING", "QUEUED", "PAUSED", "RECOVERING", "ESCALATED", "FAILED", "CANCELLED", "EXPIRED"],
  PAUSED: ["QUEUED", "RUNNING", "CANCELLED", "EXPIRED"],
  RECOVERING: ["RUNNING", "WAITING", "QUEUED", "ESCALATED", "FAILED", "CANCELLED", "EXPIRED"],
  ESCALATED: ["QUEUED", "RUNNING", "PAUSED", "FAILED", "CANCELLED", "COMPLETED"],
  COMPLETED: [], // terminal
  FAILED: ["QUEUED", "RECOVERING", "CANCELLED"], // allow retry via QUEUED
  CANCELLED: [], // terminal
  EXPIRED: ["QUEUED"], // allow re-queue if policy permits
};

export function isValidTransition(from: DurableRunState, to: DurableRunState): boolean {
  if (from === to) return true; // self-transition allowed for heartbeat
  const allowed = VALID_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}
