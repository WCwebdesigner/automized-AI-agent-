/**
 * Phase 8 — Durable Run Manager
 * Persists runs, survives restart, idempotent checkpointing, recovery
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DurableRun, DurableRunState, VALID_TRANSITIONS, isValidTransition, TERMINAL_STATES, WaitingState, CheckpointRef } from "./types";
import { loadConfig } from "../config";

export class DurableRunManager {
  private runs: Map<string, DurableRun> = new Map();
  private filePath: string;

  constructor(filePath?: string) {
    const config = loadConfig();
    this.filePath = filePath ?? path.join(config.workspaceRoot, ".kaira", "durable_runs.json");
    this.ensureDir();
    this.loadFromDisk();
  }

  private ensureDir() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    } catch {}
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const list: DurableRun[] = Array.isArray(parsed) ? parsed : parsed.runs ?? [];
      for (const r of list) {
        // Validate
        if (r.runId && r.objectiveId && r.state) {
          this.runs.set(r.runId, r);
        }
      }
    } catch (e) {
      console.warn(`Failed to load durable runs from ${this.filePath}:`, e);
    }
  }

  private persist() {
    try {
      this.ensureDir();
      const list = [...this.runs.values()];
      // Atomic write: write temp then rename
      const tmp = this.filePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch (e) {
      console.error(`Failed to persist durable runs:`, e);
    }
  }

  createRun(params: {
    objectiveId: string;
    objective: string;
    projectId?: string;
    autonomyPolicy?: DurableRun["autonomyPolicy"];
    expirationMs?: number;
  }): DurableRun {
    const now = new Date().toISOString();
    const runId = randomUUID();
    const run: DurableRun = {
      runId,
      objectiveId: params.objectiveId,
      projectId: params.projectId,
      state: "CREATED",
      objective: params.objective,
      startTime: now,
      lastActivityTime: now,
      retryInfo: {
        attempt: 0,
        maxAttempts: 10,
        backoffMs: 1000,
        consecutiveFailures: 0,
      },
      externalDependencies: [],
      failureCount: 0,
      failures: [],
      escalationCount: 0,
      escalations: [],
      resourceUsage: {
        runtimeMs: 0,
        modelCalls: 0,
        externalRequests: 0,
        shellDurationMs: 0,
        downloadedBytes: 0,
        taskAttempts: 0,
        repairAttempts: 0,
      },
      autonomyPolicy: params.autonomyPolicy ?? "ASSISTED",
      createdAt: now,
      updatedAt: now,
      expirationState: params.expirationMs ? {
        expiresAt: new Date(Date.now() + params.expirationMs).toISOString(),
        reason: "TTL expiration",
      } : undefined,
    };
    this.runs.set(runId, run);
    this.persist();
    return run;
  }

  getRun(runId: string): DurableRun | null {
    return this.runs.get(runId) ?? null;
  }

  getAllRuns(): DurableRun[] {
    return [...this.runs.values()];
  }

  getRunsByObjective(objectiveId: string): DurableRun[] {
    return [...this.runs.values()].filter(r => r.objectiveId === objectiveId);
  }

  getActiveRuns(): DurableRun[] {
    return [...this.runs.values()].filter(r => !TERMINAL_STATES.has(r.state));
  }

  transition(runId: string, to: DurableRunState, reason?: string): DurableRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);

    if (!isValidTransition(run.state, to)) {
      throw new Error(`Invalid transition ${run.state} → ${to} for run ${runId}`);
    }

    const now = new Date().toISOString();
    run.previousState = run.state;
    run.state = to;
    run.lastActivityTime = now;
    run.updatedAt = now;

    if (to === "FAILED") {
      run.failureCount++;
      if (reason) {
        run.failures.push({ timestamp: now, message: reason, taskId: run.currentTaskId });
      }
      run.retryInfo.consecutiveFailures++;
    } else if (to === "COMPLETED") {
      run.completionState = {
        completedAt: now,
        result: reason,
      };
      run.retryInfo.consecutiveFailures = 0;
    } else if (to === "ESCALATED") {
      run.escalationCount++;
      run.escalations.push({
        id: randomUUID(),
        reason: reason ?? "Escalated",
        timestamp: now,
        resolved: false,
      });
    } else if (to === "CANCELLED") {
      run.cancellationState = {
        cancelledAt: now,
        reason: reason ?? "Cancelled",
      };
    } else if (to === "EXPIRED") {
      run.expirationState = {
        expiresAt: now,
        reason: reason ?? "Expired",
      };
    } else if (to === "RUNNING") {
      if (run.previousState === "FAILED" || run.previousState === "RECOVERING") {
        run.retryInfo.attempt++;
        run.retryInfo.lastRetryAt = now;
      }
    }

    this.runs.set(runId, run);
    this.persist();
    return run;
  }

  updateLastActivity(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return;
    run.lastActivityTime = new Date().toISOString();
    run.updatedAt = run.lastActivityTime;
    this.persist();
  }

  setCurrentTask(runId: string, taskId: string, taskGraphState?: Record<string, unknown>) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    run.currentTaskId = taskId;
    if (taskGraphState) run.taskGraphState = taskGraphState;
    run.lastActivityTime = new Date().toISOString();
    run.updatedAt = run.lastActivityTime;
    this.runs.set(runId, run);
    this.persist();
  }

  setWaiting(runId: string, waiting: WaitingState) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    run.waitingState = waiting;
    run.state = "WAITING";
    run.lastActivityTime = new Date().toISOString();
    run.updatedAt = run.lastActivityTime;
    this.runs.set(runId, run);
    this.persist();
  }

  clearWaiting(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return;
    delete run.waitingState;
    run.lastActivityTime = new Date().toISOString();
    run.updatedAt = run.lastActivityTime;
    this.persist();
  }

  setCheckpoint(runId: string, checkpoint: CheckpointRef) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    run.checkpointRef = checkpoint;
    run.lastActivityTime = new Date().toISOString();
    run.updatedAt = run.lastActivityTime;
    this.runs.set(runId, run);
    this.persist();
  }

  addExternalDependency(runId: string, dep: { type: string; request?: Record<string, unknown> }) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const depId = randomUUID();
    run.externalDependencies.push({
      id: depId,
      type: dep.type,
      status: "PENDING",
      request: dep.request,
      createdAt: new Date().toISOString(),
    });
    this.runs.set(runId, run);
    this.persist();
    return depId;
  }

  updateResourceUsage(runId: string, usage: Partial<DurableRun["resourceUsage"]>) {
    const run = this.runs.get(runId);
    if (!run) return;
    Object.assign(run.resourceUsage, usage);
    run.updatedAt = new Date().toISOString();
    this.runs.set(runId, run);
    this.persist();
  }

  incrementResource(runId: string, key: keyof DurableRun["resourceUsage"], delta: number) {
    const run = this.runs.get(runId);
    if (!run) return;
    (run.resourceUsage[key] as number) += delta;
    run.updatedAt = new Date().toISOString();
    this.runs.set(runId, run);
    this.persist();
  }

  // Idempotent checkpoint creation validation
  validateCheckpoint(checkpoint: CheckpointRef): { valid: boolean; reason?: string } {
    if (!checkpoint.id) return { valid: false, reason: "Missing checkpoint id" };
    if (!checkpoint.timestamp) return { valid: false, reason: "Missing timestamp" };
    if (!checkpoint.objectiveId) return { valid: false, reason: "Missing objectiveId" };
    if (!checkpoint.runId) return { valid: false, reason: "Missing runId" };
    // Check timestamp is not future
    const ts = new Date(checkpoint.timestamp).getTime();
    if (isNaN(ts)) return { valid: false, reason: "Invalid timestamp" };
    if (ts > Date.now() + 60000) return { valid: false, reason: "Timestamp in future" };
    return { valid: true };
  }

  // Resume from checkpoint — idempotent
  resumeFromCheckpoint(runId: string): DurableRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    if (!run.checkpointRef) throw new Error(`No checkpoint for run ${runId}`);
    const validation = this.validateCheckpoint(run.checkpointRef);
    if (!validation.valid) throw new Error(`Invalid checkpoint: ${validation.reason}`);
    // Idempotent: if already RUNNING, return as is
    if (run.state === "RUNNING" || run.state === "QUEUED") {
      return run;
    }
    // Transition to QUEUED for resume, then RUNNING — idempotent
    const resumableStates: DurableRunState[] = ["WAITING", "PAUSED", "FAILED", "RECOVERING", "CREATED", "EXPIRED"];
    if ((resumableStates as string[]).includes(run.state as string)) {
      try {
        if ((run.state as string) !== "QUEUED") {
          this.transition(runId, "QUEUED", `Resuming from checkpoint ${run.checkpointRef.id}`);
        }
        this.transition(runId, "RUNNING", `Resumed`);
      } catch (e) {
        // If transition fails because already in target state, treat as idempotent success
        const current = this.getRun(runId)!;
        if (current.state === "RUNNING" || current.state === "QUEUED") {
          return current;
        }
        throw e;
      }
    }
    return this.getRun(runId)!;
  }

  // Recovery from incomplete state — e.g., after process restart, RUNNING but no activity
  recoverStaleRuns(staleThresholdMs: number = 5 * 60 * 1000): DurableRun[] {
    const now = Date.now();
    const recovered: DurableRun[] = [];
    for (const run of this.runs.values()) {
      if (run.state === "RUNNING") {
        const lastActivity = new Date(run.lastActivityTime).getTime();
        if (now - lastActivity > staleThresholdMs) {
          try {
            this.transition(run.runId, "RECOVERING", `Stale RUNNING detected, last activity ${run.lastActivityTime}`);
            recovered.push(this.getRun(run.runId)!);
          } catch {}
        }
      }
    }
    return recovered;
  }

  // Check expiration
  checkExpirations(): DurableRun[] {
    const now = Date.now();
    const expired: DurableRun[] = [];
    for (const run of this.runs.values()) {
      if (TERMINAL_STATES.has(run.state)) continue;
      if (run.expirationState?.expiresAt) {
        const exp = new Date(run.expirationState.expiresAt).getTime();
        if (now > exp) {
          try {
            this.transition(run.runId, "EXPIRED", "TTL expired");
            expired.push(this.getRun(run.runId)!);
          } catch {}
        }
      }
    }
    return expired;
  }

  clear() {
    this.runs.clear();
    this.persist();
  }

  getFilePath() {
    return this.filePath;
  }
}

export const globalDurableRunManager = new DurableRunManager();
