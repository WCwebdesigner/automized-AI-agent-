/**
 * Task Scheduler — Phase 6
 * Only executes tasks whose dependencies are satisfied, sequential for correctness > speed
 */

import { TaskGraphManager, globalTaskGraphManager } from "./graph";
import { ProjectTaskStatus } from "./types";
import { AgentLogger, globalLogger } from "../core/logger";

export class TaskScheduler {
  private graphManager: TaskGraphManager;
  private logger: AgentLogger;

  constructor(graphManager: TaskGraphManager = globalTaskGraphManager, logger: AgentLogger = globalLogger) {
    this.graphManager = graphManager;
    this.logger = logger;
  }

  getNextReadyTask(graphId: string): any {
    const ready = this.graphManager.getReadyTasks(graphId);
    if (ready.length === 0) return null;
    const next = ready[0];
    // Return task directly for compatibility, but also support {taskId, task}
    const result: any = next;
    result.taskId = next.id;
    result.task = next;
    return result;
  }

  canExecute(taskOrGraphId: any, graphIdOrTask?: any): boolean {
    let graphId: string;
    let taskId: string;
    let taskObj: any;

    // Support both signatures: canExecute(graphId, taskId) and canExecute(task, graphId)
    if (typeof taskOrGraphId === "string" && typeof graphIdOrTask === "string") {
      graphId = taskOrGraphId;
      taskId = graphIdOrTask;
    } else if (typeof taskOrGraphId === "object" && typeof graphIdOrTask === "string") {
      taskObj = taskOrGraphId;
      graphId = graphIdOrTask;
      taskId = taskObj.id;
    } else if (typeof taskOrGraphId === "object") {
      // canExecute(task, graphId) with graphId as second arg
      taskObj = taskOrGraphId;
      graphId = graphIdOrTask;
      taskId = taskObj.id;
    } else {
      return false;
    }

    const graph = this.graphManager.getGraph(graphId);
    if (!graph) return false;
    const task = taskObj ?? graph.tasks.get(taskId);
    if (!task) return false;
    if (task.status !== ProjectTaskStatus.PENDING && task.status !== ProjectTaskStatus.READY) return false;
    return task.dependencies.every((depId: string) => {
      const dep = graph.tasks.get(depId);
      return dep && dep.status === ProjectTaskStatus.COMPLETED;
    });
  }

  markRunning(graphId: string, taskId: string): void {
    this.graphManager.updateTaskStatus(graphId, taskId, ProjectTaskStatus.RUNNING);
  }

  markCompleted(graphId: string, taskId: string, result?: any): void {
    this.graphManager.updateTaskStatus(graphId, taskId, ProjectTaskStatus.COMPLETED);
    const graph = this.graphManager.getGraph(graphId);
    if (graph) {
      const task = graph.tasks.get(taskId);
      if (task && result) {
        task.result = result;
        task.updatedAt = new Date().toISOString();
      }
    }
    this.logger.info("task_completed_unlock_dependents", `Task ${taskId} completed, unlocking dependents`, { taskId });
  }

  markFailed(graphId: string, taskId: string, failureInfo: any): void {
    this.graphManager.updateTaskStatus(graphId, taskId, ProjectTaskStatus.FAILED, failureInfo);
  }

  markEscalated(graphId: string, taskId: string, reason: string): void {
    this.graphManager.updateTaskStatus(graphId, taskId, ProjectTaskStatus.ESCALATED, {
      message: reason,
      timestamp: new Date().toISOString(),
    });
  }

  getProgress(graphId: string): { total: number; completed: number; failed: number; blocked: number; pending: number; percent: number } {
    const graph = this.graphManager.getGraph(graphId);
    if (!graph) return { total: 0, completed: 0, failed: 0, blocked: 0, pending: 0, percent: 0 };
    const all = Array.from(graph.tasks.values());
    const completed = all.filter((t) => t.status === ProjectTaskStatus.COMPLETED).length;
    const failed = all.filter((t) => t.status === ProjectTaskStatus.FAILED || t.status === ProjectTaskStatus.ESCALATED).length;
    const blocked = all.filter((t) => t.status === ProjectTaskStatus.BLOCKED).length;
    const pending = all.filter((t) => t.status === ProjectTaskStatus.PENDING || t.status === ProjectTaskStatus.READY).length;
    const percent = all.length > 0 ? Math.round((completed / all.length) * 100) : 0;
    return { total: all.length, completed, failed, blocked, pending, percent };
  }
}

export const globalTaskScheduler = new TaskScheduler();
