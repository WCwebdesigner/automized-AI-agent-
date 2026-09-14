/**
 * Phase 8+9 — Event-Driven Architecture
 * webhook, repo event, deployment event, scheduled event, file change, external API event, monitoring alert
 */

export type EventType =
  | "WEBHOOK"
  | "REPO_EVENT"
  | "DEPLOYMENT_EVENT"
  | "SCHEDULED_EVENT"
  | "FILE_CHANGE"
  | "API_EVENT"
  | "MONITORING_ALERT"
  | "EXTERNAL_EVENT"
  | "MANUAL";

export type EventStatus = "RECEIVED" | "VALIDATED" | "AUTHORIZED" | "CORRELATED" | "EXECUTING" | "COMPLETED" | "FAILED" | "REJECTED";

export interface AgentEvent {
  id: string;
  type: EventType;
  source: string; // e.g., "github", "webhook", "scheduler"
  timestamp: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status: EventStatus;
  validationResult?: {
    valid: boolean;
    reason?: string;
  };
  authorizationResult?: {
    authorized: boolean;
    reason?: string;
    requiredPolicy?: string;
  };
  correlationId?: string;
  runId?: string;
  objectiveId?: string;
  result?: unknown;
  error?: string;
}

export interface EventSubscription {
  id: string;
  eventType: EventType;
  sourcePattern?: string; // regex or glob
  handler: string; // handler identifier
  enabled: boolean;
  createdAt: string;
}
