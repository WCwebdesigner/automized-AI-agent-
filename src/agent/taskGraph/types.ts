/**
 * Task Graph Types — Phase 6
 * Proper task graph / dependency model with enhanced statuses
 */

import { randomUUID } from "node:crypto";
import { TaskStatus as LegacyTaskStatus } from "../core/constants";

// Extended statuses for Phase 6, backward compatible with legacy
export enum ProjectTaskStatus {
  PENDING = "PENDING",
  READY = "READY",
  RUNNING = "RUNNING",
  BLOCKED = "BLOCKED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  ESCALATED = "ESCALATED",
  CANCELLED = "CANCELLED",
  WAITING = "WAITING",
  ACTIVE = "ACTIVE", // legacy compatibility
  SKIPPED = "SKIPPED",
}

export type TaskType = "INITIALIZATION" | "IMPLEMENTATION" | "TEST" | "VERIFICATION" | "REPAIR" | "DOCUMENTATION" | "SETUP" | "GENERIC";

export interface TaskInput {
  filePath?: string;
  content?: string;
  command?: string;
  dependenciesOutput?: Record<string, any>;
}

export interface TaskOutput {
  filePath?: string;
  content?: string;
  output?: string;
  artifacts?: string[];
}

export interface ProjectTask {
  id: string;
  objectiveId: string;
  projectId: string;
  description: string;
  type: TaskType;
  status: ProjectTaskStatus;
  priority: number;
  dependencies: string[]; // task IDs that must complete first
  dependents: string[]; // tasks that depend on this
  inputs: TaskInput;
  expectedOutputs: TaskOutput;
  verificationRequirements: string[];
  attempts: number;
  maxAttempts: number;
  result?: any;
  failureInfo?: {
    message: string;
    error?: string;
    observationId?: string;
    evidenceIds?: string[];
    timestamp: string;
  };
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  // Legacy compatibility fields
  selectedTool?: string;
  toolArguments?: unknown;
  legacyTaskId?: string; // maps to original Task ID if converted
}

export interface TaskGraph {
  id: string;
  projectId: string;
  objectiveId: string;
  tasks: Map<string, ProjectTask>;
  createdAt: string;
  updatedAt: string;
}

export function createTaskGraphId(): string {
  return randomUUID();
}

export function createProjectTaskId(): string {
  return randomUUID();
}

export function createProjectTask(params: {
  objectiveId: string;
  projectId: string;
  description: string;
  type?: TaskType;
  priority?: number;
  dependencies?: string[];
  inputs?: TaskInput;
  expectedOutputs?: TaskOutput;
  verificationRequirements?: string[];
  maxAttempts?: number;
  selectedTool?: string;
  toolArguments?: unknown;
}): ProjectTask {
  const now = new Date().toISOString();
  return {
    id: createProjectTaskId(),
    objectiveId: params.objectiveId,
    projectId: params.projectId,
    description: params.description,
    type: params.type ?? "GENERIC",
    status: ProjectTaskStatus.PENDING,
    priority: params.priority ?? 0,
    dependencies: params.dependencies ?? [],
    dependents: [],
    inputs: params.inputs ?? {},
    expectedOutputs: params.expectedOutputs ?? {},
    verificationRequirements: params.verificationRequirements ?? [],
    attempts: 0,
    maxAttempts: params.maxAttempts ?? 3,
    createdAt: now,
    updatedAt: now,
    selectedTool: params.selectedTool,
    toolArguments: params.toolArguments,
  };
}

export function createTaskGraph(params: { projectId: string; objectiveId: string; tasks?: ProjectTask[] }): TaskGraph {
  const tasksMap = new Map<string, ProjectTask>();
  for (const task of params.tasks ?? []) {
    tasksMap.set(task.id, task);
  }
  // Build dependents
  for (const task of tasksMap.values()) {
    for (const depId of task.dependencies) {
      const dep = tasksMap.get(depId);
      if (dep && !dep.dependents.includes(task.id)) {
        dep.dependents.push(task.id);
      }
    }
  }
  const now = new Date().toISOString();
  return {
    id: createTaskGraphId(),
    projectId: params.projectId,
    objectiveId: params.objectiveId,
    tasks: tasksMap,
    createdAt: now,
    updatedAt: now,
  };
}

// Convert legacy TaskStatus to ProjectTaskStatus
export function toProjectStatus(legacy: LegacyTaskStatus | string): ProjectTaskStatus {
  switch (legacy) {
    case "PENDING":
      return ProjectTaskStatus.PENDING;
    case "ACTIVE":
      return ProjectTaskStatus.RUNNING;
    case "COMPLETED":
      return ProjectTaskStatus.COMPLETED;
    case "FAILED":
      return ProjectTaskStatus.FAILED;
    case "BLOCKED":
      return ProjectTaskStatus.BLOCKED;
    case "WAITING":
      return ProjectTaskStatus.WAITING;
    case "SKIPPED":
      return ProjectTaskStatus.CANCELLED;
    default:
      return ProjectTaskStatus.PENDING;
  }
}
