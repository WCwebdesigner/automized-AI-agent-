/**
 * Structured Logger — Phase 1-3
 * Logs all agent lifecycle events for reconstruction
 */

import fs from "node:fs";
import path from "node:path";
import { AgentState } from "./constants";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  agentState?: AgentState;
  objectiveId?: string;
  taskId?: string;
  runId?: string;
  tool?: string;
  message: string;
  data?: unknown;
  // Allow extra fields for verificationPlanId, verificationStatus, decisionStatus etc
  [key: string]: any;
}

export class AgentLogger {
  private logFile?: string;
  private entries: LogEntry[] = [];
  private maxMemory = 1000;

  constructor(logFile?: string) {
    if (logFile) {
      this.logFile = logFile;
      try {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
      } catch {}
    }
  }

  private write(entry: LogEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxMemory) {
      this.entries.shift();
    }
    const line = JSON.stringify(entry);
    // Console for dev
    if (entry.level === "ERROR") {
      console.error(`[${entry.event}] ${entry.message}`, entry.data ? JSON.stringify(entry.data).slice(0, 500) : "");
    } else if (process.env.KAIRA_DEBUG === "true" || entry.level !== "DEBUG") {
      console.log(`[${entry.event}] ${entry.message}`);
    }
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, line + "\n", "utf8");
      } catch {}
    }
  }

  log(level: LogLevel, event: string, message: string, meta: Partial<LogEntry> = {}) {
    this.write({
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      ...meta,
    });
  }

  objectiveReceived(objectiveId: string, objective: string) {
    this.log("INFO", "objective_received", `Objective received: ${objective.slice(0, 200)}`, {
      objectiveId,
    });
  }

  planGenerated(objectiveId: string, plan: string, taskCount: number) {
    this.log("INFO", "plan_generated", `Plan generated with ${taskCount} tasks`, {
      objectiveId,
      data: { plan: plan.slice(0, 2000), taskCount },
    });
  }

  taskCreated(objectiveId: string, taskId: string, description: string) {
    this.log("INFO", "task_created", `Task created: ${description.slice(0, 200)}`, {
      objectiveId,
      taskId,
    });
  }

  taskStarted(objectiveId: string, taskId: string, tool?: string) {
    this.log("INFO", "task_started", `Task started${tool ? ` with ${tool}` : ""}`, {
      objectiveId,
      taskId,
      tool,
    });
  }

  stateTransition(from: AgentState, to: AgentState, objectiveId?: string, taskId?: string, reason?: string) {
    this.log("INFO", "state_transition", `${from} → ${to}${reason ? `: ${reason}` : ""}`, {
      agentState: to,
      objectiveId,
      taskId,
      data: { from, to, reason },
    });
  }

  toolSelected(taskId: string, tool: string, args: unknown) {
    this.log("INFO", "tool_selected", `Tool selected: ${tool}`, {
      taskId,
      tool,
      data: { args },
    });
  }

  toolExecuted(taskId: string, tool: string, result: unknown, durationMs: number) {
    this.log("INFO", "tool_executed", `Tool ${tool} executed in ${durationMs}ms`, {
      taskId,
      tool,
      data: { result, durationMs },
    });
  }

  toolResult(taskId: string, tool: string, status: string, output: string) {
    this.log("INFO", "tool_result", `Tool ${tool} result: ${status}`, {
      taskId,
      tool,
      data: { status, output: output.slice(0, 1000) },
    });
  }

  failure(taskId: string, error: string, context?: unknown) {
    this.log("ERROR", "failure", `Failure: ${error.slice(0, 500)}`, {
      taskId,
      data: { error, context },
    });
  }

  diagnosis(taskId: string, diagnosis: string) {
    this.log("INFO", "diagnosis", `Diagnosis: ${diagnosis.slice(0, 500)}`, {
      taskId,
      data: { diagnosis },
    });
  }

  repair(taskId: string, repairAction: string) {
    this.log("INFO", "repair", `Repair: ${repairAction.slice(0, 500)}`, {
      taskId,
      data: { repairAction },
    });
  }

  retry(taskId: string, attempt: number, maxAttempts: number) {
    this.log("INFO", "retry", `Retry attempt ${attempt}/${maxAttempts}`, {
      taskId,
      data: { attempt, maxAttempts },
    });
  }

  verification(objectiveId: string, result: boolean, details: string) {
    this.log("INFO", "verification", `Verification ${result ? "PASSED" : "FAILED"}: ${details.slice(0, 500)}`, {
      objectiveId,
      data: { passed: result, details },
    });
  }

  completion(objectiveId: string, status: string, result: string) {
    this.log("INFO", "completion", `Objective ${status}: ${result.slice(0, 500)}`, {
      objectiveId,
      data: { status, result },
    });
  }

  escalation(objectiveId: string, reason: string) {
    this.log("WARN", "escalation", `Escalated: ${reason}`, {
      objectiveId,
      data: { reason },
    });
  }

  info(event: string, message: string, meta: Partial<LogEntry> = {}) {
    this.log("INFO", event, message, meta);
  }

  warn(event: string, message: string, meta: Partial<LogEntry> = {}) {
    this.log("WARN", event, message, meta);
  }

  error(event: string, message: string, meta: Partial<LogEntry> = {}) {
    this.log("ERROR", event, message, meta);
  }

  debug(event: string, message: string, meta: Partial<LogEntry> = {}) {
    this.log("DEBUG", event, message, meta);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
  }
}

export const globalLogger = new AgentLogger(
  process.env.KAIRA_LOG_FILE ?? path.join(process.cwd(), "workspace", ".kaira", "agent.log")
);
