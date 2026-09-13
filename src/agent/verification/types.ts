/**
 * Verification Engine Types — Phase 4.3
 * Reusable verification with structured VerificationCheckResult
 */

import { randomUUID } from "node:crypto";
import { Evidence } from "../observation/types";

export type VerificationCheckType =
  | "FILE_EXISTS"
  | "FILE_NOT_EXISTS"
  | "FILE_NOT_EMPTY"
  | "FILE_CONTAINS"
  | "FILE_NOT_CONTAINS"
  | "FILE_EQUALS"
  | "COMMAND_EXIT_ZERO"
  | "COMMAND_EXIT_CODE"
  | "COMMAND_SUCCEEDS"
  | "COMMAND_OUTPUT_CONTAINS"
  | "COMMAND_OUTPUT_EQUALS"
  | "TEST_PASSES"
  | "TEST_FAILS"
  | "TEST_COUNT";

export type VerificationStatus = "PASSED" | "FAILED" | "INCONCLUSIVE" | "BLOCKED" | "SKIPPED";

export interface VerificationCheck {
  id: string;
  type: VerificationCheckType;
  description?: string;
  // File checks
  filePath?: string;
  expectedContent?: string;
  // Command checks
  command?: string;
  expectedExitCode?: number;
  expectedOutput?: string;
  // Test checks
  testCommand?: string;
  expectedTestCount?: number;
  // Common
  required: boolean;
  timeoutMs?: number;
}

export interface VerificationCheckResult {
  checkId: string;
  type: VerificationCheckType;
  status: VerificationStatus;
  expected: string;
  actual: string;
  evidence: Evidence[];
  message: string;
  durationMs: number;
  timestamp: string;
}

export interface VerificationPlan {
  id: string;
  objectiveId: string;
  taskId?: string;
  description: string;
  checks: VerificationCheck[];
  createdAt: string;
  createdBy: "LLM" | "SYSTEM" | "USER";
}

export interface VerificationResult {
  id: string;
  planId: string;
  objectiveId: string;
  taskId?: string;
  runId: string;
  status: VerificationStatus;
  passed: boolean;
  checks: VerificationCheckResult[];
  checkResults?: VerificationCheckResult[]; // alias for compatibility
  summary: string;
  timestamp: string;
  completedAt?: string;
  durationMs: number;
}

export type CompletionDecisionStatus = "VERIFIED" | "FAILED" | "INCONCLUSIVE" | "BLOCKED";

export interface CompletionDecision {
  id: string;
  objectiveId: string;
  taskId?: string;
  runId: string;
  status: CompletionDecisionStatus;
  modelClaim?: string; // What model claimed
  verificationResultId: string;
  evidenceChainIds: string[];
  reason: string;
  timestamp: string;
  verifiedBy: "SYSTEM"; // Always system, never LLM alone
}

export function createVerificationPlanId(): string {
  return randomUUID();
}

export function createVerificationCheckId(): string {
  return randomUUID();
}

export function createVerificationResultId(): string {
  return randomUUID();
}

export function createCompletionDecisionId(): string {
  return randomUUID();
}

export function createCheck(params: Omit<VerificationCheck, "id"> & { id?: string }): VerificationCheck {
  return {
    id: params.id ?? createVerificationCheckId(),
    ...params,
  };
}

export function createPlan(params: {
  objectiveId: string;
  taskId?: string;
  description: string;
  checks: VerificationCheck[];
  createdBy?: VerificationPlan["createdBy"];
}): VerificationPlan {
  return {
    id: createVerificationPlanId(),
    objectiveId: params.objectiveId,
    taskId: params.taskId,
    description: params.description,
    checks: params.checks,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy ?? "SYSTEM",
  };
}
