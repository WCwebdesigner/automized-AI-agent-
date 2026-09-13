/**
 * Phase 8 — Resource Governance
 * Bounded autonomy limits, STOP or ESCALATE when reached, never bypass
 */

import { DurableRun } from "./types";
import { DurableRunManager, globalDurableRunManager } from "./durableRun";

export interface ResourceLimits {
  maxRuntimeMs: number; // max total runtime per run
  maxTaskAttempts: number;
  maxRepairAttempts: number;
  maxExternalRequests: number;
  maxModelCalls: number;
  maxConcurrentJobs: number;
  maxShellDurationMs: number;
  maxDownloadedBytes: number;
  maxResearchDepth: number;
  maxSpending?: number; // reserved
  maxConsecutiveFailures: number;
  maxTotalRuns?: number;
}

export interface GovernanceResult {
  allowed: boolean;
  reason?: string;
  action: "ALLOW" | "STOP" | "ESCALATE";
  limitName?: string;
  current?: number;
  limit?: number;
}

export const DEFAULT_LIMITS: ResourceLimits = {
  maxRuntimeMs: 600_000, // 10 min
  maxTaskAttempts: 30,
  maxRepairAttempts: 10,
  maxExternalRequests: 50,
  maxModelCalls: 100,
  maxConcurrentJobs: 5,
  maxShellDurationMs: 300_000,
  maxDownloadedBytes: 50 * 1024 * 1024, // 50MB
  maxResearchDepth: 5,
  maxConsecutiveFailures: 5,
  maxTotalRuns: 100,
};

export class ResourceGovernance {
  private limits: ResourceLimits;
  private runManager: DurableRunManager;

  constructor(limits: Partial<ResourceLimits> = {}, runManager: DurableRunManager = globalDurableRunManager) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.runManager = runManager;
  }

  setLimits(newLimits: Partial<ResourceLimits>) {
    this.limits = { ...this.limits, ...newLimits };
  }

  getLimits(): ResourceLimits {
    return { ...this.limits };
  }

  // Check if run can continue — deterministic
  checkRun(runId: string): GovernanceResult {
    const run = this.runManager.getRun(runId);
    if (!run) {
      return { allowed: false, reason: `Run ${runId} not found`, action: "STOP" };
    }

    // Runtime
    const runtime = Date.now() - new Date(run.startTime).getTime();
    if (runtime > this.limits.maxRuntimeMs) {
      return {
        allowed: false,
        reason: `Max runtime exceeded: ${runtime}ms > ${this.limits.maxRuntimeMs}ms`,
        action: "STOP",
        limitName: "maxRuntimeMs",
        current: runtime,
        limit: this.limits.maxRuntimeMs,
      };
    }

    // Task attempts
    if (run.resourceUsage.taskAttempts > this.limits.maxTaskAttempts) {
      return {
        allowed: false,
        reason: `Max task attempts exceeded: ${run.resourceUsage.taskAttempts} > ${this.limits.maxTaskAttempts}`,
        action: "ESCALATE",
        limitName: "maxTaskAttempts",
        current: run.resourceUsage.taskAttempts,
        limit: this.limits.maxTaskAttempts,
      };
    }

    // Repair attempts
    if (run.resourceUsage.repairAttempts > this.limits.maxRepairAttempts) {
      return {
        allowed: false,
        reason: `Max repair attempts exceeded: ${run.resourceUsage.repairAttempts} > ${this.limits.maxRepairAttempts}`,
        action: "ESCALATE",
        limitName: "maxRepairAttempts",
        current: run.resourceUsage.repairAttempts,
        limit: this.limits.maxRepairAttempts,
      };
    }

    // External requests
    if (run.resourceUsage.externalRequests > this.limits.maxExternalRequests) {
      return {
        allowed: false,
        reason: `Max external requests exceeded: ${run.resourceUsage.externalRequests} > ${this.limits.maxExternalRequests}`,
        action: "STOP",
        limitName: "maxExternalRequests",
        current: run.resourceUsage.externalRequests,
        limit: this.limits.maxExternalRequests,
      };
    }

    // Model calls
    if (run.resourceUsage.modelCalls > this.limits.maxModelCalls) {
      return {
        allowed: false,
        reason: `Max model calls exceeded: ${run.resourceUsage.modelCalls} > ${this.limits.maxModelCalls}`,
        action: "STOP",
        limitName: "maxModelCalls",
        current: run.resourceUsage.modelCalls,
        limit: this.limits.maxModelCalls,
      };
    }

    // Shell duration
    if (run.resourceUsage.shellDurationMs > this.limits.maxShellDurationMs) {
      return {
        allowed: false,
        reason: `Max shell duration exceeded: ${run.resourceUsage.shellDurationMs} > ${this.limits.maxShellDurationMs}`,
        action: "STOP",
        limitName: "maxShellDurationMs",
        current: run.resourceUsage.shellDurationMs,
        limit: this.limits.maxShellDurationMs,
      };
    }

    // Downloaded bytes
    if (run.resourceUsage.downloadedBytes > this.limits.maxDownloadedBytes) {
      return {
        allowed: false,
        reason: `Max downloaded data exceeded: ${run.resourceUsage.downloadedBytes} > ${this.limits.maxDownloadedBytes}`,
        action: "STOP",
        limitName: "maxDownloadedBytes",
        current: run.resourceUsage.downloadedBytes,
        limit: this.limits.maxDownloadedBytes,
      };
    }

    // Consecutive failures
    if (run.retryInfo.consecutiveFailures > this.limits.maxConsecutiveFailures) {
      return {
        allowed: false,
        reason: `Max consecutive failures exceeded: ${run.retryInfo.consecutiveFailures} > ${this.limits.maxConsecutiveFailures}`,
        action: "ESCALATE",
        limitName: "maxConsecutiveFailures",
        current: run.retryInfo.consecutiveFailures,
        limit: this.limits.maxConsecutiveFailures,
      };
    }

    return { allowed: true, action: "ALLOW" };
  }

  // Check concurrent jobs limit
  checkConcurrent(): GovernanceResult {
    const activeRuns = this.runManager.getActiveRuns();
    if (activeRuns.length > this.limits.maxConcurrentJobs) {
      return {
        allowed: false,
        reason: `Max concurrent jobs exceeded: ${activeRuns.length} > ${this.limits.maxConcurrentJobs}`,
        action: "STOP",
        limitName: "maxConcurrentJobs",
        current: activeRuns.length,
        limit: this.limits.maxConcurrentJobs,
      };
    }
    return { allowed: true, action: "ALLOW" };
  }

  // Enforce — STOP or ESCALATE action taken
  enforce(runId: string): GovernanceResult {
    const result = this.checkRun(runId);
    if (!result.allowed) {
      const run = this.runManager.getRun(runId);
      if (!run) return result;

      if (result.action === "STOP") {
        try {
          this.runManager.transition(runId, "FAILED", result.reason);
        } catch {}
      } else if (result.action === "ESCALATE") {
        try {
          this.runManager.transition(runId, "ESCALATED", result.reason);
        } catch {}
      }
    }
    return result;
  }

  // Track usage — must be called by runtime
  recordModelCall(runId: string) {
    this.runManager.incrementResource(runId, "modelCalls", 1);
  }

  recordExternalRequest(runId: string) {
    this.runManager.incrementResource(runId, "externalRequests", 1);
  }

  recordShellDuration(runId: string, ms: number) {
    this.runManager.incrementResource(runId, "shellDurationMs", ms);
  }

  recordDownload(runId: string, bytes: number) {
    this.runManager.incrementResource(runId, "downloadedBytes", bytes);
  }

  recordTaskAttempt(runId: string) {
    this.runManager.incrementResource(runId, "taskAttempts", 1);
  }

  recordRepairAttempt(runId: string) {
    this.runManager.incrementResource(runId, "repairAttempts", 1);
  }
}

export const globalResourceGovernance = new ResourceGovernance();
