/**
 * Task System — Phase 1-3
 * Task representation with all required fields
 */

import { randomUUID } from "node:crypto";
import { TaskStatus, PermissionLevel, ToolResultStatus } from "./constants";

export interface StructuredToolResult {
  status: ToolResultStatus;
  tool: string;
  input: unknown;
  output: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  executionTimeMs: number;
  affectedFiles?: string[];
  error?: string;
  data?: unknown;
  timestamp: string;
}

export interface Task {
  id: string;
  objectiveId: string;
  objective: string;
  description: string;
  status: TaskStatus;
  priority: number;
  dependencies: string[]; // task IDs
  attempts: number;
  maxAttempts: number;
  selectedTool?: string;
  toolArguments?: unknown;
  result?: StructuredToolResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  verificationStatus?: "PENDING" | "PASSED" | "FAILED" | "SKIPPED";
  verificationDetails?: string;
  // Engineering extensions
  fileChanged?: string;
  operation?: string;
  beforeContent?: string;
  afterContent?: string;
  modelResponsible?: string;
  artifacts?: string[];
}

export function createTask(params: {
  objectiveId: string;
  objective: string;
  description: string;
  priority?: number;
  dependencies?: string[];
  maxAttempts?: number;
  selectedTool?: string;
  toolArguments?: unknown;
}): Task {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    objectiveId: params.objectiveId,
    objective: params.objective,
    description: params.description,
    status: TaskStatus.PENDING,
    priority: params.priority ?? 0,
    dependencies: params.dependencies ?? [],
    attempts: 0,
    maxAttempts: params.maxAttempts ?? 3,
    selectedTool: params.selectedTool,
    toolArguments: params.toolArguments,
    createdAt: now,
    updatedAt: now,
    verificationStatus: "PENDING",
  };
}

export function canExecuteTask(task: Task, completedTaskIds: Set<string>): boolean {
  if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.WAITING) {
    return false;
  }
  return task.dependencies.every((dep) => completedTaskIds.has(dep));
}

export function getBlockedTasks(tasks: Task[], completedIds: Set<string>): Task[] {
  return tasks.filter(
    (t) =>
      (t.status === TaskStatus.PENDING || t.status === TaskStatus.WAITING) &&
      t.dependencies.some((d) => !completedIds.has(d))
  );
}

export function getReadyTasks(tasks: Task[], completedIds: Set<string>): Task[] {
  return tasks
    .filter((t) => canExecuteTask(t, completedIds))
    .sort((a, b) => b.priority - a.priority);
}

export function getActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === TaskStatus.ACTIVE);
}

export function getFailedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === TaskStatus.FAILED);
}

export function getCompletedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === TaskStatus.COMPLETED);
}

export interface TaskUpdate {
  status?: TaskStatus;
  selectedTool?: string;
  toolArguments?: unknown;
  result?: StructuredToolResult;
  error?: string;
  verificationStatus?: Task["verificationStatus"];
  verificationDetails?: string;
  fileChanged?: string;
  operation?: string;
  beforeContent?: string;
  afterContent?: string;
  modelResponsible?: string;
  artifacts?: string[];
}

export function updateTask(task: Task, update: TaskUpdate): Task {
  const now = new Date().toISOString();
  const updated: Task = {
    ...task,
    ...update,
    updatedAt: now,
  };
  if (update.status === TaskStatus.ACTIVE && !task.startedAt) {
    updated.startedAt = now;
  }
  if (update.status === TaskStatus.COMPLETED || update.status === TaskStatus.FAILED) {
    updated.completedAt = now;
  }
  if (update.status === TaskStatus.ACTIVE) {
    updated.attempts = task.attempts + 1;
  }
  return updated;
}
