/**
 * Task Graph — Phase 6
 * Dependency model, status transitions, cycle detection, persistence
 */

import { TaskGraph, ProjectTask, ProjectTaskStatus, createTaskGraph, createProjectTask } from "./types";
import { AgentLogger, globalLogger } from "../core/logger";

export class TaskGraphManager {
  private logger: AgentLogger;
  private graphs: Map<string, TaskGraph> = new Map();

  constructor(logger: AgentLogger = globalLogger) {
    this.logger = logger;
  }

  createGraph(projectId: string, objectiveId: string, tasks: ProjectTask[] = []): TaskGraph {
    const graph = createTaskGraph({ projectId, objectiveId, tasks });
    this.graphs.set(graph.id, graph);
    this.logger.info("task_graph_created", `Created task graph ${graph.id} with ${tasks.length} tasks`, {
      projectId,
      taskGraphId: graph.id,
    });
    return graph;
  }

  getGraph(graphId: string): TaskGraph | undefined {
    return this.graphs.get(graphId);
  }

  getGraphByProject(projectId: string): TaskGraph | undefined {
    for (const graph of this.graphs.values()) {
      if (graph.projectId === projectId) return graph;
    }
    return undefined;
  }

  addTask(graphId: string, task: ProjectTask): void {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Task graph ${graphId} not found`);
    graph.tasks.set(task.id, task);
    // Update dependents for dependencies
    for (const depId of task.dependencies) {
      const dep = graph.tasks.get(depId);
      if (dep && !dep.dependents.includes(task.id)) {
        dep.dependents.push(task.id);
        dep.updatedAt = new Date().toISOString();
      }
    }
    graph.updatedAt = new Date().toISOString();
  }

  updateTaskStatus(graphId: string, taskId: string, status: ProjectTaskStatus, failureInfo?: ProjectTask["failureInfo"]): ProjectTask {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Task graph ${graphId} not found`);
    const task = graph.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found in graph ${graphId}`);

    const oldStatus = task.status;
    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (status === ProjectTaskStatus.RUNNING && !task.startedAt) {
      task.startedAt = new Date().toISOString();
      task.attempts += 1;
    }
    if (status === ProjectTaskStatus.COMPLETED || status === ProjectTaskStatus.FAILED || status === ProjectTaskStatus.ESCALATED || status === ProjectTaskStatus.CANCELLED) {
      task.completedAt = new Date().toISOString();
    }
    if (failureInfo) {
      task.failureInfo = failureInfo;
    }

    graph.updatedAt = new Date().toISOString();

    this.logger.info("task_status_updated", `Task ${taskId} ${oldStatus} → ${status}`, {
      taskId,
      projectId: graph.projectId,
      from: oldStatus,
      to: status,
    });

    return task;
  }

  getReadyTasks(graphId: string): ProjectTask[] {
    const graph = this.graphs.get(graphId);
    if (!graph) return [];

    const ready: ProjectTask[] = [];
    for (const task of graph.tasks.values()) {
      if (task.status !== ProjectTaskStatus.PENDING && task.status !== ProjectTaskStatus.READY) continue;
      const depsSatisfied = task.dependencies.every((depId) => {
        const dep = graph.tasks.get(depId);
        return dep && dep.status === ProjectTaskStatus.COMPLETED;
      });
      if (depsSatisfied) {
        // Mark as READY if was PENDING
        if (task.status === ProjectTaskStatus.PENDING) {
          task.status = ProjectTaskStatus.READY;
          task.updatedAt = new Date().toISOString();
        }
        ready.push(task);
      } else {
        // Check if blocked by failed dependency
        const hasFailedDep = task.dependencies.some((depId) => {
          const dep = graph.tasks.get(depId);
          return dep && (dep.status === ProjectTaskStatus.FAILED || dep.status === ProjectTaskStatus.ESCALATED || dep.status === ProjectTaskStatus.CANCELLED);
        });
        if (hasFailedDep) {
          task.status = ProjectTaskStatus.BLOCKED;
          task.updatedAt = new Date().toISOString();
        }
      }
    }

    // Sort by priority descending
    ready.sort((a, b) => b.priority - a.priority);
    return ready;
  }

  getBlockedTasks(graphId: string): ProjectTask[] {
    const graph = this.graphs.get(graphId);
    if (!graph) return [];
    return Array.from(graph.tasks.values()).filter((t) => t.status === ProjectTaskStatus.BLOCKED);
  }

  getCompletedTasks(graphId: string): ProjectTask[] {
    const graph = this.graphs.get(graphId);
    if (!graph) return [];
    return Array.from(graph.tasks.values()).filter((t) => t.status === ProjectTaskStatus.COMPLETED);
  }

  getFailedTasks(graphId: string): ProjectTask[] {
    const graph = this.graphs.get(graphId);
    if (!graph) return [];
    return Array.from(graph.tasks.values()).filter((t) => t.status === ProjectTaskStatus.FAILED);
  }

  getTask(graphId: string, taskId: string): ProjectTask | undefined {
    const graph = this.graphs.get(graphId);
    if (!graph) return undefined;
    return graph.tasks.get(taskId);
  }

  getAllTasks(graphId: string): ProjectTask[] {
    const graph = this.graphs.get(graphId);
    if (!graph) return [];
    return Array.from(graph.tasks.values());
  }

  isComplete(graphId: string): boolean {
    const graph = this.graphs.get(graphId);
    if (!graph) return false;
    for (const task of graph.tasks.values()) {
      if (task.status !== ProjectTaskStatus.COMPLETED && task.status !== ProjectTaskStatus.CANCELLED) {
        return false;
      }
    }
    return true;
  }

  hasFailures(graphId: string): boolean {
    const graph = this.graphs.get(graphId);
    if (!graph) return false;
    return Array.from(graph.tasks.values()).some((t) => t.status === ProjectTaskStatus.FAILED || t.status === ProjectTaskStatus.ESCALATED);
  }

  detectCycles(graphId: string): { hasCycle: boolean; cycle?: string[] } {
    const graph = this.graphs.get(graphId);
    if (!graph) return { hasCycle: false };

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (taskId: string): boolean => {
      if (recStack.has(taskId)) {
        path.push(taskId);
        return true; // cycle
      }
      if (visited.has(taskId)) return false;

      visited.add(taskId);
      recStack.add(taskId);
      path.push(taskId);

      const task = graph.tasks.get(taskId);
      if (task) {
        for (const dep of task.dependencies) {
          if (dfs(dep)) return true;
        }
      }

      recStack.delete(taskId);
      path.pop();
      return false;
    };

    for (const taskId of graph.tasks.keys()) {
      if (dfs(taskId)) {
        return { hasCycle: true, cycle: [...path] };
      }
    }

    return { hasCycle: false };
  }

  // Idempotency check: if task's expected output already exists and is valid, mark completed
  checkIdempotency(graphId: string, taskId: string, workspaceRoot: string): { alreadyDone: boolean; reason: string } {
    const graph = this.graphs.get(graphId);
    if (!graph) return { alreadyDone: false, reason: "Graph not found" };
    const task = graph.tasks.get(taskId);
    if (!task) return { alreadyDone: false, reason: "Task not found" };

    // If file creation task and file already exists, inspect rather than blindly recreate
    if (task.expectedOutputs.filePath) {
      try {
        const fs = require("node:fs");
        const path = require("node:path");
        const abs = path.resolve(workspaceRoot, task.expectedOutputs.filePath);
        if (fs.existsSync(abs)) {
          const stat = fs.statSync(abs);
          if (stat.size > 0) {
            return { alreadyDone: true, reason: `File ${task.expectedOutputs.filePath} already exists (${stat.size} bytes)` };
          }
        }
      } catch {
        // Ignore, not done
      }
    }

    return { alreadyDone: false, reason: "Not completed yet" };
  }

  // Serialize for persistence
  serialize(graphId: string): any {
    const graph = this.graphs.get(graphId);
    if (!graph) return null;
    return {
      id: graph.id,
      projectId: graph.projectId,
      objectiveId: graph.objectiveId,
      tasks: Array.from(graph.tasks.values()),
      createdAt: graph.createdAt,
      updatedAt: graph.updatedAt,
    };
  }

  deserialize(data: any): TaskGraph {
    const tasksMap = new Map<string, ProjectTask>();
    for (const task of data.tasks ?? []) {
      tasksMap.set(task.id, task);
    }
    const graph: TaskGraph = {
      id: data.id,
      projectId: data.projectId,
      objectiveId: data.objectiveId,
      tasks: tasksMap,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
    this.graphs.set(graph.id, graph);
    return graph;
  }

  clear(projectId?: string): void {
    if (projectId) {
      for (const [id, graph] of this.graphs) {
        if (graph.projectId === projectId) this.graphs.delete(id);
      }
    } else {
      this.graphs.clear();
    }
  }
}

export const globalTaskGraphManager = new TaskGraphManager();
