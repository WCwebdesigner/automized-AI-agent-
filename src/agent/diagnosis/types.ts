/**
 * Diagnosis & Repair Types — Phase 5
 */

import { randomUUID } from "node:crypto";
import { Evidence, Observation } from "../observation/types";
import { VerificationCheckResult, VerificationResult, VerificationPlan } from "../verification/types";

export type FailureCategory =
  | "TOOL_FAILURE"
  | "COMMAND_FAILURE"
  | "SYNTAX_ERROR"
  | "RUNTIME_ERROR"
  | "TEST_FAILURE"
  | "VERIFICATION_FAILURE"
  | "MISSING_FILE"
  | "INVALID_OUTPUT"
  | "PERMISSION_DENIED"
  | "TIMEOUT"
  | "RESOURCE_LIMIT"
  | "SECURITY_VIOLATION"
  | "UNKNOWN_FAILURE";

export type FailureSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Recoverability = "RECOVERABLE" | "NON_RECOVERABLE" | "REQUIRES_HUMAN";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Failure {
  id: string;
  category: FailureCategory;
  message: string;
  actionId: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  observationId: string;
  evidence: Evidence[];
  severity: FailureSeverity;
  recoverability: Recoverability;
  timestamp: string;
  // Context
  toolName?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  filePath?: string;
  verificationResultId?: string;
}

export interface Diagnosis {
  id: string;
  failureId: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  failureCategory: FailureCategory;
  rootCause: string;
  confidence: number; // 0-1
  affectedFiles: string[];
  relevantEvidence: Evidence[];
  recommendedRepair: string;
  isRecoverable: boolean;
  requiresHumanDecision: boolean;
  timestamp: string;
  // Context used
  contextSummary: string;
  previousRepairCount: number;
}

export interface Repair {
  id: string;
  diagnosisId: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  intendedChanges: string;
  affectedFiles: string[];
  commands: string[];
  reason: string;
  riskLevel: RiskLevel;
  expectedOutcome: string;
  verificationPlan?: VerificationPlan;
  approvalRequired: boolean;
  timestamp: string;
  // Execution
  executed: boolean;
  executionResult?: {
    success: boolean;
    observationId?: string;
    evidenceIds?: string[];
    message: string;
  };
}

export interface Escalation {
  id: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  failureId: string;
  diagnosisId?: string;
  reason: string;
  evidence: Evidence[];
  attemptedRepairs: Repair[];
  failedVerificationResults: VerificationResult[];
  recommendedHumanAction: string;
  timestamp: string;
  severity: FailureSeverity;
}

export interface RetryAttempt {
  id: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  attemptNumber: number;
  repairId?: string;
  failureId?: string;
  observationId?: string;
  success: boolean;
  timestamp: string;
}

export interface DiagnosisContext {
  objective: string;
  objectiveId: string;
  taskDescription: string;
  taskId: string;
  runId: string;
  failedAction: string;
  observation: Observation;
  stderr?: string;
  stdout?: string;
  verificationResult?: VerificationResult;
  fileContents?: Record<string, string>; // filePath -> content (bounded)
  recentChanges?: Array<{ file: string; operation: string; timestamp: string }>;
  previousRepairs?: Repair[];
  evidence: Evidence[];
  // Bounded context limits
  maxFileContentBytes: number;
  maxEvidenceCount: number;
  maxRecentChanges: number;
}

export function createFailureId(): string { return randomUUID(); }
export function createDiagnosisId(): string { return randomUUID(); }
export function createRepairId(): string { return randomUUID(); }
export function createEscalationId(): string { return randomUUID(); }
export function createRetryId(): string { return randomUUID(); }
