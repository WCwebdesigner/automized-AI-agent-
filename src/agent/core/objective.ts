/**
 * Objective System — Phase 2-3
 * Objective containing tasks, status, verification
 */

import { randomUUID } from "node:crypto";
import { ObjectiveStatus } from "./constants";
import { Task } from "./task";

export interface Objective {
  id: string;
  originalObjective: string;
  title: string;
  description: string;
  status: ObjectiveStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  currentTaskId?: string;
  tasks: Task[];
  completedTasks: string[];
  failedTasks: string[];
  attemptCount: number;
  maxAttempts: number;
  finalResult?: string;
  verificationResult?: {
    passed: boolean;
    details: string;
    verifiedAt: string;
    checks: Array<{ name: string; passed: boolean; details: string }>;
  };
  error?: string;
  metadata?: Record<string, unknown>;
}

export function createObjective(params: {
  title: string;
  description?: string;
  originalObjective?: string;
  priority?: number;
  maxAttempts?: number;
}): Objective {
  const now = new Date().toISOString();
  const title = params.title.trim();
  return {
    id: randomUUID(),
    originalObjective: params.originalObjective ?? title,
    title,
    description: params.description ?? "",
    status: ObjectiveStatus.PENDING,
    priority: params.priority ?? 0,
    createdAt: now,
    updatedAt: now,
    tasks: [],
    completedTasks: [],
    failedTasks: [],
    attemptCount: 0,
    maxAttempts: params.maxAttempts ?? 3,
  };
}

export function addTaskToObjective(objective: Objective, task: Task): Objective {
  return {
    ...objective,
    tasks: [...objective.tasks, task],
    updatedAt: new Date().toISOString(),
  };
}

export function updateObjective(
  objective: Objective,
  update: Partial<Omit<Objective, "id" | "createdAt" | "tasks">> & { tasks?: Task[] }
): Objective {
  const now = new Date().toISOString();
  return {
    ...objective,
    ...update,
    updatedAt: now,
    ...(update.status === ObjectiveStatus.ACTIVE && !objective.startedAt ? { startedAt: now } : {}),
    ...(update.status === ObjectiveStatus.COMPLETED || update.status === ObjectiveStatus.FAILED
      ? { completedAt: now }
      : {}),
  };
}

export function getObjectiveProgress(objective: Objective): {
  total: number;
  completed: number;
  failed: number;
  active: number;
  pending: number;
  percent: number;
} {
  const total = objective.tasks.length;
  const completed = objective.tasks.filter((t) => t.status === "COMPLETED").length;
  const failed = objective.tasks.filter((t) => t.status === "FAILED").length;
  const active = objective.tasks.filter((t) => t.status === "ACTIVE").length;
  const pending = objective.tasks.filter((t) => t.status === "PENDING" || t.status === "WAITING").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, failed, active, pending, percent };
}
