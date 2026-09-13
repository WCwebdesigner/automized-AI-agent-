/**
 * Project Abstractions — Phase 6
 * Project-level planning: objective, inferred requirements, assumptions, constraints, deliverables, tasks, dependencies, verification strategy, completion criteria, risk considerations
 */

import { randomUUID } from "node:crypto";
import { Requirement, AcceptanceCriterion } from "../requirements/types";
import { Task } from "../core/task";

export type ProjectStatus = "PENDING" | "PLANNING" | "IN_PROGRESS" | "VERIFYING" | "COMPLETED" | "FAILED" | "ESCALATED" | "PAUSED";
export type AssumptionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProjectType = "PYTHON" | "NODE" | "TYPESCRIPT" | "GENERIC" | "MIXED";

export interface Assumption {
  id: string;
  projectId: string;
  objectiveId: string;
  assumption: string;
  reason: string;
  confidence: number; // 0-1
  risk: AssumptionRisk;
  affectedTasks: string[]; // task IDs
  approvalRequired: boolean;
  status: "ACTIVE" | "VALIDATED" | "INVALIDATED" | "ESCALATED";
  createdAt: string;
}

export interface Deliverable {
  id: string;
  projectId: string;
  description: string;
  filePath?: string;
  type: "FILE" | "DIRECTORY" | "TEST" | "CONFIG" | "DOCUMENTATION";
  required: boolean;
  status: "PENDING" | "CREATED" | "VERIFIED" | "FAILED";
  createdAt: string;
}

export interface ProjectConstraint {
  id: string;
  description: string;
  type: "SECURITY" | "PERMISSION" | "RESOURCE" | "TIME" | "DEPENDENCY";
  value?: string;
}

export interface ProjectPlan {
  id: string;
  projectId: string;
  objectiveId: string;
  objective: string;
  projectType: ProjectType;
  inferredRequirements: Requirement[];
  assumptions: Assumption[];
  constraints: ProjectConstraint[];
  deliverables: Deliverable[];
  taskGraphId: string;
  verificationStrategy: string;
  completionCriteria: AcceptanceCriterion[];
  riskConsiderations: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: "LLM" | "SYSTEM" | "USER";
}

export interface Project {
  id: string;
  objectiveId: string;
  title: string;
  description: string;
  objective: string;
  status: ProjectStatus;
  projectType: ProjectType;
  workspacePath: string; // relative to global workspace
  requirements: Requirement[];
  plan?: ProjectPlan;
  taskGraphId?: string;
  currentTaskId?: string;
  completedTaskIds: string[];
  failedTaskIds: string[];
  pendingTaskIds: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  assumptions: Assumption[];
  deliverables: Deliverable[];
  checkpoints: string[]; // checkpoint IDs
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  reportId?: string;
}

export function createProjectId(): string {
  return randomUUID();
}

export function createAssumptionId(): string {
  return randomUUID();
}

export function createDeliverableId(): string {
  return randomUUID();
}

export function createProjectPlanId(): string {
  return randomUUID();
}

export function createConstraintId(): string {
  return randomUUID();
}

export function createProject(params: {
  objectiveId: string;
  title: string;
  description: string;
  objective: string;
  projectType?: ProjectType;
  workspacePath?: string;
}): Project {
  const now = new Date().toISOString();
  return {
    id: createProjectId(),
    objectiveId: params.objectiveId,
    title: params.title,
    description: params.description,
    objective: params.objective,
    status: "PENDING",
    projectType: params.projectType ?? "GENERIC",
    workspacePath: params.workspacePath ?? `projects/${createProjectId()}`,
    requirements: [],
    completedTaskIds: [],
    failedTaskIds: [],
    pendingTaskIds: [],
    acceptanceCriteria: [],
    assumptions: [],
    deliverables: [],
    checkpoints: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createAssumption(params: {
  projectId: string;
  objectiveId: string;
  assumption: string;
  reason: string;
  confidence?: number;
  risk?: AssumptionRisk;
  affectedTasks?: string[];
}): Assumption {
  const risk = params.risk ?? "LOW";
  return {
    id: createAssumptionId(),
    projectId: params.projectId,
    objectiveId: params.objectiveId,
    assumption: params.assumption,
    reason: params.reason,
    confidence: params.confidence ?? 0.8,
    risk,
    affectedTasks: params.affectedTasks ?? [],
    approvalRequired: risk === "HIGH" || risk === "CRITICAL",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };
}

export function createDeliverable(params: {
  projectId: string;
  description: string;
  filePath?: string;
  type?: Deliverable["type"];
  required?: boolean;
}): Deliverable {
  return {
    id: createDeliverableId(),
    projectId: params.projectId,
    description: params.description,
    filePath: params.filePath,
    type: params.type ?? "FILE",
    required: params.required ?? true,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
}

export function createProjectPlan(params: {
  projectId: string;
  objectiveId: string;
  objective: string;
  projectType: ProjectType;
  requirements: Requirement[];
  assumptions: Assumption[];
  deliverables: Deliverable[];
  taskGraphId: string;
  verificationStrategy: string;
  completionCriteria: AcceptanceCriterion[];
  riskConsiderations?: string[];
}): ProjectPlan {
  const now = new Date().toISOString();
  return {
    id: createProjectPlanId(),
    projectId: params.projectId,
    objectiveId: params.objectiveId,
    objective: params.objective,
    projectType: params.projectType,
    inferredRequirements: params.requirements,
    assumptions: params.assumptions,
    constraints: [],
    deliverables: params.deliverables,
    taskGraphId: params.taskGraphId,
    verificationStrategy: params.verificationStrategy,
    completionCriteria: params.completionCriteria,
    riskConsiderations: params.riskConsiderations ?? [],
    createdAt: now,
    updatedAt: now,
    createdBy: "SYSTEM",
  };
}
