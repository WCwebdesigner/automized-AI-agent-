/**
 * Requirements Extraction — Phase 6
 * Structured requirements from natural language objective
 */

import { randomUUID } from "node:crypto";

export type RequirementCategory = "FUNCTIONAL" | "TECHNICAL" | "QUALITY" | "CONSTRAINT" | "DELIVERABLE";
export type RequirementPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RequirementSource = "USER_PROVIDED" | "INFERRED" | "ASSUMPTION" | "SYSTEM";
export type RequirementStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "DEFERRED";

export interface AcceptanceCriterion {
  id: string;
  requirementId: string;
  description: string;
  expected: string;
  verificationMethod: "FILE_EXISTS" | "COMMAND_OUTPUT" | "TEST_PASS" | "MANUAL" | "VERIFICATION_CHECK";
  status: "PENDING" | "PASSED" | "FAILED" | "BLOCKED";
  evidenceIds?: string[];
  actual?: string;
}

export interface Requirement {
  id: string;
  objectiveId: string;
  projectId: string;
  description: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  source: RequirementSource;
  status: RequirementStatus;
  acceptanceCriteria: AcceptanceCriterion[];
  inferredFrom?: string;
  createdAt: string;
  updatedAt: string;
}

export function createRequirementId(): string {
  return randomUUID();
}

export function createAcceptanceCriterionId(): string {
  return randomUUID();
}

export function createRequirement(params: {
  objectiveId: string;
  projectId: string;
  description: string;
  category: RequirementCategory;
  priority?: RequirementPriority;
  source?: RequirementSource;
  acceptanceCriteria?: Array<Omit<AcceptanceCriterion, "id" | "requirementId" | "status"> & { status?: AcceptanceCriterion["status"] }>;
  inferredFrom?: string;
}): Requirement {
  const id = createRequirementId();
  const now = new Date().toISOString();
  return {
    id,
    objectiveId: params.objectiveId,
    projectId: params.projectId,
    description: params.description,
    category: params.category,
    priority: params.priority ?? "MEDIUM",
    source: params.source ?? "USER_PROVIDED",
    status: "PENDING",
    acceptanceCriteria: (params.acceptanceCriteria ?? []).map((ac) => ({
      id: createAcceptanceCriterionId(),
      requirementId: id,
      description: ac.description,
      expected: ac.expected,
      verificationMethod: ac.verificationMethod,
      status: ac.status ?? "PENDING",
      evidenceIds: ac.evidenceIds,
      actual: ac.actual,
    })),
    inferredFrom: params.inferredFrom,
    createdAt: now,
    updatedAt: now,
  };
}

export function createAcceptanceCriterion(params: {
  requirementId: string;
  description: string;
  expected: string;
  verificationMethod: AcceptanceCriterion["verificationMethod"];
}): AcceptanceCriterion {
  return {
    id: createAcceptanceCriterionId(),
    requirementId: params.requirementId,
    description: params.description,
    expected: params.expected,
    verificationMethod: params.verificationMethod,
    status: "PENDING",
  };
}
