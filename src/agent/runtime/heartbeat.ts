/**
 * Phase 8 — Heartbeat / Health Monitoring
 * Tracks active runs, stalled runs, last activity, failed jobs, scheduler health, tool health, external connector health, resource exhaustion, overdue work
 */

import { DurableRunManager, globalDurableRunManager } from "./durableRun";
import { ControlledScheduler, globalScheduler } from "./scheduler";
import { MonitoringManager, globalMonitoringManager } from "./monitoring";
import { DurableRun } from "./types";

export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "STALLED";

export interface RunHealth {
  runId: string;
  objectiveId: string;
  state: string;
  lastActivity: string;
  elapsedSinceActivityMs: number;
  status: HealthStatus;
  reason?: string;
  stalled: boolean;
}

export interface SchedulerHealth {
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  overdueJobs: number;
  status: HealthStatus;
}

export interface ToolHealth {
  totalTools: number;
  failingTools: string[];
  status: HealthStatus;
}

export interface ConnectorHealth {
  totalConnectors: number;
  failingConnectors: string[];
  circuitBreakersOpen: string[];
  status: HealthStatus;
}

export interface SystemHealth {
  timestamp: string;
  runs: RunHealth[];
  scheduler: SchedulerHealth;
  monitoring: {
    activeJobs: number;
    escalatedJobs: number;
    status: HealthStatus;
  };
  stalledRuns: RunHealth[];
  overdueRuns: RunHealth[];
  resourceExhaustion: Array<{ runId: string; resource: string; usage: number; limit: number }>;
  overall: HealthStatus;
}

export class HeartbeatMonitor {
  private runManager: DurableRunManager;
  private scheduler: ControlledScheduler;
  private monitoring: MonitoringManager;
  private stalledThresholdMs: number;
  private overdueThresholdMs: number;

  constructor(
    runManager: DurableRunManager = globalDurableRunManager,
    scheduler: ControlledScheduler = globalScheduler,
    monitoring: MonitoringManager = globalMonitoringManager,
    stalledThresholdMs: number = 5 * 60 * 1000,
    overdueThresholdMs: number = 30 * 60 * 1000
  ) {
    this.runManager = runManager;
    this.scheduler = scheduler;
    this.monitoring = monitoring;
    this.stalledThresholdMs = stalledThresholdMs;
    this.overdueThresholdMs = overdueThresholdMs;
  }

  checkRunHealth(run: DurableRun): RunHealth {
    const now = Date.now();
    const lastActivity = new Date(run.lastActivityTime).getTime();
    const elapsed = now - lastActivity;

    let status: HealthStatus = "HEALTHY";
    let stalled = false;
    let reason: string | undefined;

    if (run.state === "RUNNING") {
      if (elapsed > this.stalledThresholdMs) {
        status = "STALLED";
        stalled = true;
        reason = `RUNNING but no activity for ${elapsed}ms (threshold ${this.stalledThresholdMs}ms)`;
      } else if (elapsed > this.stalledThresholdMs / 2) {
        status = "DEGRADED";
        reason = `RUNNING with degraded activity, ${elapsed}ms since last`;
      }
    } else if (run.state === "WAITING") {
      if (run.waitingState) {
        const waitingSince = new Date(run.waitingState.waitingSince).getTime();
        const waitingElapsed = now - waitingSince;
        if (run.waitingState.escalationAfterMs && waitingElapsed > run.waitingState.escalationAfterMs) {
          status = "UNHEALTHY";
          reason = `WAITING exceeded escalation threshold`;
        } else if (waitingElapsed > this.overdueThresholdMs) {
          status = "DEGRADED";
          reason = `WAITING overdue, ${waitingElapsed}ms`;
        }
      }
    } else if (run.state === "FAILED") {
      status = "UNHEALTHY";
      reason = `Run in FAILED state`;
    } else if (run.state === "ESCALATED") {
      status = "DEGRADED";
      reason = `Run escalated`;
    }

    return {
      runId: run.runId,
      objectiveId: run.objectiveId,
      state: run.state,
      lastActivity: run.lastActivityTime,
      elapsedSinceActivityMs: elapsed,
      status,
      reason,
      stalled,
    };
  }

  checkSchedulerHealth(): SchedulerHealth {
    const allJobs = this.scheduler.listJobs();
    const pending = allJobs.filter(j => j.state === "PENDING").length;
    const running = allJobs.filter(j => j.state === "RUNNING").length;
    const failed = allJobs.filter(j => j.state === "FAILED").length;

    const now = Date.now();
    const overdue = allJobs.filter(j => {
      if (j.state !== "PENDING") return false;
      const scheduled = new Date(j.scheduledAt).getTime();
      return now - scheduled > 5 * 60 * 1000; // 5 min overdue
    }).length;

    let status: HealthStatus = "HEALTHY";
    if (failed > 5 || overdue > 5) status = "UNHEALTHY";
    else if (failed > 0 || overdue > 0) status = "DEGRADED";

    return {
      pendingJobs: pending,
      runningJobs: running,
      failedJobs: failed,
      overdueJobs: overdue,
      status,
    };
  }

  getSystemHealth(): SystemHealth {
    const runs = this.runManager.getAllRuns();
    const runHealths = runs.map(r => this.checkRunHealth(r));
    const stalledRuns = runHealths.filter(r => r.stalled);
    const overdueRuns = runHealths.filter(r => r.elapsedSinceActivityMs > this.overdueThresholdMs && r.state !== "COMPLETED" && r.state !== "FAILED" && r.state !== "CANCELLED" && r.state !== "EXPIRED");

    const schedulerHealth = this.checkSchedulerHealth();

    const activeMonitoring = this.monitoring.getActiveJobs();
    const escalatedMonitoring = this.monitoring.list().filter(j => j.state === "ESCALATED");

    // Resource exhaustion detection
    const resourceExhaustion: SystemHealth["resourceExhaustion"] = [];
    for (const run of runs) {
      if (run.resourceUsage.runtimeMs > 600_000) {
        resourceExhaustion.push({ runId: run.runId, resource: "runtimeMs", usage: run.resourceUsage.runtimeMs, limit: 600_000 });
      }
      if (run.resourceUsage.modelCalls > 100) {
        resourceExhaustion.push({ runId: run.runId, resource: "modelCalls", usage: run.resourceUsage.modelCalls, limit: 100 });
      }
      if (run.resourceUsage.externalRequests > 50) {
        resourceExhaustion.push({ runId: run.runId, resource: "externalRequests", usage: run.resourceUsage.externalRequests, limit: 50 });
      }
    }

    let overall: HealthStatus = "HEALTHY";
    if (stalledRuns.length > 0 || schedulerHealth.status === "UNHEALTHY" || escalatedMonitoring.length > 3) {
      overall = "UNHEALTHY";
    } else if (overdueRuns.length > 0 || schedulerHealth.status === "DEGRADED" || resourceExhaustion.length > 0) {
      overall = "DEGRADED";
    }

    return {
      timestamp: new Date().toISOString(),
      runs: runHealths,
      scheduler: schedulerHealth,
      monitoring: {
        activeJobs: activeMonitoring.length,
        escalatedJobs: escalatedMonitoring.length,
        status: escalatedMonitoring.length > 0 ? "DEGRADED" : "HEALTHY",
      },
      stalledRuns,
      overdueRuns,
      resourceExhaustion,
      overall,
    };
  }

  detectStalledRuns(): RunHealth[] {
    const runs = this.runManager.getAllRuns();
    return runs
      .map(r => this.checkRunHealth(r))
      .filter(h => h.stalled);
  }

  // Attempt recovery of stalled runs
  recoverStalledRuns(): string[] {
    const stalled = this.detectStalledRuns();
    const recovered: string[] = [];
    for (const h of stalled) {
      try {
        this.runManager.transition(h.runId, "RECOVERING", h.reason ?? "Stalled detection recovery");
        recovered.push(h.runId);
      } catch {}
    }
    return recovered;
  }
}

export const globalHeartbeatMonitor = new HeartbeatMonitor();
