/**
 * Phase 8 — Explicit WAIT States
 * No wasteful model calls while waiting
 */

import { randomUUID } from "node:crypto";
import { WaitReason, WaitingState } from "./types";
import { DurableRunManager, globalDurableRunManager } from "./durableRun";
import { ControlledScheduler, globalScheduler } from "./scheduler";

export interface WaitCondition {
  check: () => Promise<{ done: boolean; result?: unknown; error?: string }>;
  intervalMs: number;
  timeoutMs: number;
  description: string;
}

export class WaitManager {
  private runManager: DurableRunManager;
  private scheduler: ControlledScheduler;

  constructor(runManager: DurableRunManager = globalDurableRunManager, scheduler: ControlledScheduler = globalScheduler) {
    this.runManager = runManager;
    this.scheduler = scheduler;
  }
  /**
   * Enter waiting state — deterministic, no model calls
   */
  async enterWait(params: {
    runId: string;
    reason: WaitReason;
    description: string;
    expectedUntil?: Date;
    retryAfterMs?: number;
    checkIntervalMs?: number;
    escalationAfterMs?: number;
    maxAttempts?: number;
    externalDependencyId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<WaitingState> {
    const waiting: WaitingState = {
      reason: params.reason,
      description: params.description,
      waitingSince: new Date().toISOString(),
      expectedUntil: params.expectedUntil?.toISOString(),
      retryAfterMs: params.retryAfterMs,
      externalDependencyId: params.externalDependencyId,
      escalationAfterMs: params.escalationAfterMs,
      checkIntervalMs: params.checkIntervalMs ?? 5000,
      attempts: 0,
      maxAttempts: params.maxAttempts,
      metadata: params.metadata,
    };

    this.runManager.setWaiting(params.runId, waiting);

    // Schedule polling if needed
    if (params.checkIntervalMs) {
      this.scheduler.schedule({
        runId: params.runId,
        objectiveId: this.runManager.getRun(params.runId)?.objectiveId ?? "unknown",
        type: "WAITING_POLL",
        intervalMs: params.checkIntervalMs,
        maxExecutions: params.maxAttempts,
        reason: `Polling wait condition ${params.reason}`,
        what: params.description,
        why: `Waiting for ${params.reason} — check every ${params.checkIntervalMs}ms`,
        payload: { waitReason: params.reason, runId: params.runId },
      });
    } else if (params.retryAfterMs) {
      this.scheduler.schedule({
        runId: params.runId,
        objectiveId: this.runManager.getRun(params.runId)?.objectiveId ?? "unknown",
        type: "RETRY_AFTER",
        delayMs: params.retryAfterMs,
        reason: `Retry after ${params.retryAfterMs}ms`,
        what: `Retry waiting ${params.reason}`,
        why: params.description,
        payload: { waitReason: params.reason, runId: params.runId },
      });
    } else if (params.expectedUntil) {
      const delay = params.expectedUntil.getTime() - Date.now();
      if (delay > 0) {
        this.scheduler.schedule({
          runId: params.runId,
          objectiveId: this.runManager.getRun(params.runId)?.objectiveId ?? "unknown",
          type: "SCHEDULED",
          delayMs: delay,
          reason: `Scheduled wakeup at ${params.expectedUntil.toISOString()}`,
          what: `Wakeup for ${params.reason}`,
          why: params.description,
          payload: { waitReason: params.reason, runId: params.runId },
        });
      }
    }

    return waiting;
  }

  /**
   * Check if wait condition is still active — no model calls, only deterministic checks
   */
  isStillWaiting(runId: string): boolean {
    const run = this.runManager.getRun(runId);
    if (!run) return false;
    return run.state === "WAITING" && !!run.waitingState;
  }

  /**
   * Explicit wakeup — deterministic
   */
  wakeUp(runId: string, result?: string): void {
    const run = this.runManager.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    if (run.state !== "WAITING") return;
    this.runManager.clearWaiting(runId);
    this.runManager.transition(runId, "RUNNING", result ?? "Wakeup from waiting");
  }

  /**
   * Poll wait condition — returns whether still waiting
   */
  async pollWaitCondition(runId: string, condition: WaitCondition): Promise<{ stillWaiting: boolean; result?: unknown }> {
    const run = this.runManager.getRun(runId);
    if (!run || run.state !== "WAITING" || !run.waitingState) {
      return { stillWaiting: false };
    }

    const waiting = run.waitingState;
    waiting.attempts++;
    waiting.lastCheckAt = new Date().toISOString();

    // Check timeout
    const waitingSince = new Date(waiting.waitingSince).getTime();
    if (waiting.escalationAfterMs && Date.now() - waitingSince > waiting.escalationAfterMs) {
      // Escalate
      this.runManager.transition(runId, "ESCALATED", `Wait timeout for ${waiting.reason} after ${waiting.escalationAfterMs}ms`);
      return { stillWaiting: false };
    }

    if (condition.timeoutMs && Date.now() - waitingSince > condition.timeoutMs) {
      this.runManager.transition(runId, "FAILED", `Wait condition timeout: ${condition.description}`);
      return { stillWaiting: false };
    }

    if (waiting.maxAttempts && waiting.attempts >= waiting.maxAttempts) {
      this.runManager.transition(runId, "FAILED", `Wait max attempts reached for ${waiting.reason}`);
      return { stillWaiting: false };
    }

    try {
      const checkResult = await condition.check();
      if (checkResult.done) {
        this.wakeUp(runId, `Condition met: ${condition.description}`);
        return { stillWaiting: false, result: checkResult.result };
      }
      // Still waiting — update waiting state
      this.runManager.setWaiting(runId, waiting);
      return { stillWaiting: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      waiting.attempts++;
      this.runManager.setWaiting(runId, waiting);
      return { stillWaiting: true };
    }
  }

  getWaitingState(runId: string): WaitingState | null {
    const run = this.runManager.getRun(runId);
    return run?.waitingState ?? null;
  }
}

export const globalWaitManager = new WaitManager();
