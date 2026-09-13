/**
 * Phase 8 — Durable Orchestrator Extension
 * Extends ProjectOrchestrator with long-running capabilities
 * Deterministic runtime remains authoritative
 */

import { DurableRunManager, globalDurableRunManager } from "./durableRun";
import { ControlledScheduler, globalScheduler } from "./scheduler";
import { WaitManager, globalWaitManager } from "./waitState";
import { MonitoringManager, globalMonitoringManager } from "./monitoring";
import { HeartbeatMonitor, globalHeartbeatMonitor } from "./heartbeat";
import { ResourceGovernance, globalResourceGovernance } from "./resourceGovernance";
import { DurableRun } from "./types";
import { randomUUID } from "node:crypto";

export class DurableOrchestrator {
  private runManager: DurableRunManager;
  private scheduler: ControlledScheduler;
  private waitManager: WaitManager;
  private monitoring: MonitoringManager;
  private heartbeat: HeartbeatMonitor;
  private governance: ResourceGovernance;

  constructor(
    runManager: DurableRunManager = globalDurableRunManager,
    scheduler: ControlledScheduler = globalScheduler,
    waitManager: WaitManager = globalWaitManager,
    monitoring: MonitoringManager = globalMonitoringManager,
    heartbeat: HeartbeatMonitor = globalHeartbeatMonitor,
    governance: ResourceGovernance = globalResourceGovernance
  ) {
    this.runManager = runManager;
    this.scheduler = scheduler;
    this.waitManager = waitManager;
    this.monitoring = monitoring;
    this.heartbeat = heartbeat;
    this.governance = governance;

    // Register scheduler handlers
    this.scheduler.registerHandler("HEALTH_CHECK", async (job) => {
      const health = this.heartbeat.getSystemHealth();
      return health;
    });

    this.scheduler.registerHandler("WAITING_POLL", async (job) => {
      const runId = job.payload?.runId as string;
      if (runId) {
        const waiting = this.waitManager.getWaitingState(runId);
        if (waiting) {
          // Check if still waiting — deterministic
          return { stillWaiting: true, waiting };
        }
      }
      return { stillWaiting: false };
    });
  }

  createDurableRun(params: {
    objectiveId: string;
    objective: string;
    projectId?: string;
    autonomyPolicy?: DurableRun["autonomyPolicy"];
    expirationMs?: number;
  }): DurableRun {
    // Check concurrent limit
    const concurrentCheck = this.governance.checkConcurrent();
    if (!concurrentCheck.allowed) {
      throw new Error(`Cannot create run: ${concurrentCheck.reason}`);
    }

    const run = this.runManager.createRun(params);
    this.runManager.transition(run.runId, "QUEUED", "Created durable run");

    // Schedule health check
    this.scheduler.schedule({
      runId: run.runId,
      objectiveId: run.objectiveId,
      type: "HEALTH_CHECK",
      intervalMs: 30_000,
      reason: "Periodic health check for durable run",
      what: `Health check for run ${run.runId}`,
      why: "Detect stalled RUNNING",
    });

    return run;
  }

  startRun(runId: string): DurableRun {
    const run = this.runManager.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    if (run.state === "QUEUED" || run.state === "CREATED") {
      this.runManager.transition(runId, "RUNNING", "Starting run");
    }
    return this.runManager.getRun(runId)!;
  }

  pauseRun(runId: string, reason?: string): DurableRun {
    const run = this.runManager.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    if (run.state === "RUNNING" || run.state === "WAITING") {
      this.runManager.transition(runId, "PAUSED", reason ?? "Paused");
    }
    return this.runManager.getRun(runId)!;
  }

  resumeRun(runId: string): DurableRun {
    const run = this.runManager.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    if (run.state === "PAUSED") {
      this.runManager.transition(runId, "QUEUED", "Resuming from paused");
      this.runManager.transition(runId, "RUNNING", "Resumed");
    } else if (run.checkpointRef) {
      return this.runManager.resumeFromCheckpoint(runId);
    }
    return this.runManager.getRun(runId)!;
  }

  // Checkpoint creation — idempotent
  createCheckpoint(runId: string, data: { taskId?: string; projectId?: string; reason: string; dataHash?: string }): DurableRun {
    const run = this.runManager.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);

    const checkpoint = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      reason: data.reason,
      taskId: data.taskId,
      projectId: data.projectId ?? run.projectId,
      objectiveId: run.objectiveId,
      runId,
      valid: true,
      dataHash: data.dataHash,
    };

    const validation = this.runManager.validateCheckpoint(checkpoint);
    if (!validation.valid) {
      throw new Error(`Invalid checkpoint: ${validation.reason}`);
    }

    this.runManager.setCheckpoint(runId, checkpoint);
    return this.runManager.getRun(runId)!;
  }

  // Wait state handling
  async enterWait(runId: string, params: {
    reason: DurableRun["waitingState"] extends infer W ? W extends { reason: infer R } ? R : never : never;
    description: string;
    expectedUntil?: Date;
    retryAfterMs?: number;
    checkIntervalMs?: number;
    escalationAfterMs?: number;
    maxAttempts?: number;
  }) {
    return this.waitManager.enterWait({
      runId,
      reason: params.reason as any,
      description: params.description,
      expectedUntil: params.expectedUntil,
      retryAfterMs: params.retryAfterMs,
      checkIntervalMs: params.checkIntervalMs,
      escalationAfterMs: params.escalationAfterMs,
      maxAttempts: params.maxAttempts,
    });
  }

  // Monitoring job creation
  createMonitoringJob(params: {
    runId: string;
    objectiveId: string;
    what: string;
    how: "HTTP_STATUS" | "FILE_EXISTS" | "FILE_CONTENT" | "COMMAND_OUTPUT" | "API_RESPONSE" | "WEBSITE_CHANGE" | "CUSTOM";
    target: string;
    description: string;
    pollingIntervalMs?: number;
    timeoutMs?: number;
    acceptableStates?: string[];
  }) {
    const job = this.monitoring.createJob(params);
    // Schedule monitoring
    this.scheduler.schedule({
      runId: params.runId,
      objectiveId: params.objectiveId,
      type: "MONITORING",
      intervalMs: params.pollingIntervalMs ?? 30_000,
      reason: `Monitoring ${params.what}`,
      what: params.what,
      why: params.description,
      payload: { monitoringJobId: job.id },
    });
    return job;
  }

  // Resource governance check
  checkAndEnforce(runId: string) {
    return this.governance.enforce(runId);
  }

  // Heartbeat health
  getHealth() {
    return this.heartbeat.getSystemHealth();
  }

  detectAndRecoverStalled() {
    return this.heartbeat.recoverStalledRuns();
  }

  // Observability chain extended
  getRunObservability(runId: string) {
    const run = this.runManager.getRun(runId);
    if (!run) return null;

    const scheduledJobs = this.scheduler.getJobsByRun(runId);
    const monitoringJobs = this.monitoring.getJobsByRun(runId);
    const health = this.heartbeat.checkRunHealth(run);

    return {
      runId: run.runId,
      objectiveId: run.objectiveId,
      state: run.state,
      currentTask: run.currentTaskId,
      lastActivity: run.lastActivityTime,
      nextScheduled: run.nextScheduledAction,
      waiting: run.waitingState,
      checkpoint: run.checkpointRef,
      resourceUsage: run.resourceUsage,
      scheduledJobs: scheduledJobs.map(j => ({
        id: j.id,
        type: j.type,
        state: j.state,
        nextExecution: j.nextExecutionAt,
        what: j.observability.what,
        why: j.observability.why,
      })),
      monitoringJobs: monitoringJobs.map(j => ({
        id: j.id,
        what: j.what,
        how: j.how,
        state: j.state,
        lastCheck: j.lastCheckAt,
        changeDetected: j.changeDetection.changed,
      })),
      health,
      failures: run.failures.slice(-5),
      escalations: run.escalations.slice(-5),
      externalDeps: run.externalDependencies,
    };
  }

  clear() {
    this.runManager.clear();
    this.scheduler.clear();
    this.monitoring.clear();
  }
}

export const globalDurableOrchestrator = new DurableOrchestrator();
