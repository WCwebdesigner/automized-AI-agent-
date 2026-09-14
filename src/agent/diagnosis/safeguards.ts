/**
 * Safeguards — Phase 5.5
 * max repair attempts per task, max retries per objective, max consecutive identical failures,
 * no infinite loops, no repeated identical repairs without new evidence, workspace/command/file-size/timeout enforcement
 */

import { Failure, Repair } from "./types";

export interface SafeguardConfig {
  maxRepairAttemptsPerTask: number;
  maxRetriesPerObjective: number;
  maxConsecutiveIdenticalFailures: number;
  maxTotalRepairAttempts: number;
  noRepeatIdenticalRepairWithoutNewEvidence: boolean;
}

export const DEFAULT_SAFEGUARD_CONFIG: SafeguardConfig = {
  maxRepairAttemptsPerTask: 3,
  maxRetriesPerObjective: 10,
  maxConsecutiveIdenticalFailures: 3,
  maxTotalRepairAttempts: 20,
  noRepeatIdenticalRepairWithoutNewEvidence: true,
};

export class SafeguardTracker {
  private config: SafeguardConfig;
  private repairAttemptsPerTask: Map<string, number> = new Map();
  private retriesPerObjective: Map<string, number> = new Map();
  private consecutiveIdenticalFailures: Map<string, { count: number; lastFailureHash: string }> = new Map();
  private executedRepairs: Map<string, { repairHash: string; evidenceHash: string }[]> = new Map(); // taskId -> repairs
  private totalRepairs = 0;

  constructor(config?: Partial<SafeguardConfig>) {
    this.config = { ...DEFAULT_SAFEGUARD_CONFIG, ...config };
  }

  getConfig(): SafeguardConfig {
    return { ...this.config };
  }

  private hashFailure(failure: Failure): string {
    return `${failure.category}:${failure.message.slice(0, 200)}:${failure.toolName ?? ""}:${failure.exitCode ?? ""}`;
  }

  private hashRepair(repair: Repair): string {
    return `${repair.intendedChanges.slice(0, 200)}:${repair.affectedFiles.join(",")}:${repair.commands.join(",")}`;
  }

  private hashEvidence(evidenceIds: string[]): string {
    return evidenceIds.sort().join(",");
  }

  /**
   * Check if repair attempt is allowed
   */
  canAttemptRepair(taskId: string, objectiveId: string, repair: Repair, evidenceIds: string[]): { allowed: boolean; reason?: string } {
    // Max repair attempts per task
    const perTask = this.repairAttemptsPerTask.get(taskId) ?? 0;
    if (perTask >= this.config.maxRepairAttemptsPerTask) {
      return { allowed: false, reason: `Max repair attempts per task exceeded: ${perTask}/${this.config.maxRepairAttemptsPerTask}` };
    }

    // Max retries per objective
    const perObjective = this.retriesPerObjective.get(objectiveId) ?? 0;
    if (perObjective >= this.config.maxRetriesPerObjective) {
      return { allowed: false, reason: `Max retries per objective exceeded: ${perObjective}/${this.config.maxRetriesPerObjective}` };
    }

    // Max total
    if (this.totalRepairs >= this.config.maxTotalRepairAttempts) {
      return { allowed: false, reason: `Max total repair attempts exceeded: ${this.totalRepairs}/${this.config.maxTotalRepairAttempts}` };
    }

    // No repeated identical repairs without new evidence
    if (this.config.noRepeatIdenticalRepairWithoutNewEvidence) {
      const repairHash = this.hashRepair(repair);
      const evidenceHash = this.hashEvidence(evidenceIds);
      const previous = this.executedRepairs.get(taskId) ?? [];
      for (const prev of previous) {
        if (prev.repairHash === repairHash && prev.evidenceHash === evidenceHash) {
          return { allowed: false, reason: `Identical repair already attempted with same evidence — no new evidence` };
        }
      }
    }

    return { allowed: true };
  }

  recordRepairAttempt(taskId: string, objectiveId: string, repair: Repair, evidenceIds: string[]) {
    const perTask = this.repairAttemptsPerTask.get(taskId) ?? 0;
    this.repairAttemptsPerTask.set(taskId, perTask + 1);

    const perObjective = this.retriesPerObjective.get(objectiveId) ?? 0;
    this.retriesPerObjective.set(objectiveId, perObjective + 1);

    this.totalRepairs++;

    const repairHash = this.hashRepair(repair);
    const evidenceHash = this.hashEvidence(evidenceIds);
    const previous = this.executedRepairs.get(taskId) ?? [];
    previous.push({ repairHash, evidenceHash });
    this.executedRepairs.set(taskId, previous);
  }

  /**
   * Check consecutive identical failures
   */
  checkConsecutiveFailures(taskId: string, failure: Failure): { isLoop: boolean; count: number } {
    const hash = this.hashFailure(failure);
    const existing = this.consecutiveIdenticalFailures.get(taskId);

    if (!existing || existing.lastFailureHash !== hash) {
      this.consecutiveIdenticalFailures.set(taskId, { count: 1, lastFailureHash: hash });
      return { isLoop: false, count: 1 };
    }

    const newCount = existing.count + 1;
    this.consecutiveIdenticalFailures.set(taskId, { count: newCount, lastFailureHash: hash });

    const isLoop = newCount >= this.config.maxConsecutiveIdenticalFailures;
    return { isLoop, count: newCount };
  }

  resetConsecutiveFailures(taskId: string) {
    this.consecutiveIdenticalFailures.delete(taskId);
  }

  /**
   * Check if infinite loop detected
   */
  isInfiniteLoop(taskId: string, objectiveId: string): boolean {
    const perTask = this.repairAttemptsPerTask.get(taskId) ?? 0;
    const perObjective = this.retriesPerObjective.get(objectiveId) ?? 0;
    return perTask >= this.config.maxRepairAttemptsPerTask || perObjective >= this.config.maxRetriesPerObjective;
  }

  getStats(): { perTask: Record<string, number>; perObjective: Record<string, number>; total: number } {
    const perTask: Record<string, number> = {};
    for (const [k, v] of this.repairAttemptsPerTask) perTask[k] = v;
    const perObjective: Record<string, number> = {};
    for (const [k, v] of this.retriesPerObjective) perObjective[k] = v;
    return { perTask, perObjective, total: this.totalRepairs };
  }

  clear() {
    this.repairAttemptsPerTask.clear();
    this.retriesPerObjective.clear();
    this.consecutiveIdenticalFailures.clear();
    this.executedRepairs.clear();
    this.totalRepairs = 0;
  }
}

export const globalSafeguardTracker = new SafeguardTracker();
