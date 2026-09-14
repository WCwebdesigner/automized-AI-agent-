/**
 * Phase 8 — Monitoring Jobs
 * What monitored, how checked, polling interval, timeout, acceptable state, change detection, escalation, completion
 * Relies on observations, not model preference
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";

export type MonitoringCheckType =
  | "HTTP_STATUS"
  | "FILE_EXISTS"
  | "FILE_CONTENT"
  | "COMMAND_OUTPUT"
  | "API_RESPONSE"
  | "WEBSITE_CHANGE"
  | "CUSTOM";

export interface MonitoringJob {
  id: string;
  runId: string;
  objectiveId: string;
  projectId?: string;
  what: string; // what is monitored
  how: MonitoringCheckType;
  description: string;
  target: string; // URL, file path, command, etc
  pollingIntervalMs: number;
  timeoutMs: number;
  acceptableStates: string[]; // e.g., ["200", "exists", "contains:hello"]
  changeDetection: {
    enabled: boolean;
    previousValue?: string;
    currentValue?: string;
    changed: boolean;
    changeDescription?: string;
  };
  escalationConditions: {
    maxFailures: number;
    failureCount: number;
    escalateAfterMs?: number;
    startedAt: string;
    lastFailureAt?: string;
  };
  completionConditions: {
    onState?: string[]; // complete when state in acceptable
    onChange?: boolean; // complete on change detection
    maxChecks?: number;
  };
  state: "ACTIVE" | "COMPLETED" | "FAILED" | "ESCALATED" | "CANCELLED";
  checks: Array<{
    timestamp: string;
    success: boolean;
    observedValue: string;
    acceptable: boolean;
    changed: boolean;
    error?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  lastCheckAt?: string;
  completedAt?: string;
  result?: string;
}

export class MonitoringManager {
  private jobs: Map<string, MonitoringJob> = new Map();
  private filePath: string;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(filePath?: string) {
    const config = loadConfig();
    this.filePath = filePath ?? path.join(config.workspaceRoot, ".kaira", "monitoring_jobs.json");
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
      const list: MonitoringJob[] = Array.isArray(parsed) ? parsed : parsed.jobs ?? [];
      for (const j of list) {
        if (j.id) this.jobs.set(j.id, j);
      }
    } catch {}
  }

  private persist() {
    try {
      this.ensureDir();
      const tmp = this.filePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify([...this.jobs.values()], null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch {}
  }

  createJob(params: {
    runId: string;
    objectiveId: string;
    projectId?: string;
    what: string;
    how: MonitoringCheckType;
    target: string;
    description: string;
    pollingIntervalMs?: number;
    timeoutMs?: number;
    acceptableStates?: string[];
    completionConditions?: MonitoringJob["completionConditions"];
    escalationConditions?: Partial<MonitoringJob["escalationConditions"]>;
  }): MonitoringJob {
    if (params.pollingIntervalMs && params.pollingIntervalMs < 1000) {
      throw new Error("pollingIntervalMs must be >=1000");
    }
    if (params.timeoutMs && params.timeoutMs < 1000) {
      throw new Error("timeoutMs must be >=1000");
    }

    const job: MonitoringJob = {
      id: randomUUID(),
      runId: params.runId,
      objectiveId: params.objectiveId,
      projectId: params.projectId,
      what: params.what,
      how: params.how,
      target: params.target,
      description: params.description,
      pollingIntervalMs: params.pollingIntervalMs ?? 30_000,
      timeoutMs: params.timeoutMs ?? 5 * 60 * 1000,
      acceptableStates: params.acceptableStates ?? [],
      changeDetection: {
        enabled: true,
        changed: false,
      },
      escalationConditions: {
        maxFailures: params.escalationConditions?.maxFailures ?? 5,
        failureCount: 0,
        escalateAfterMs: params.escalationConditions?.escalateAfterMs,
        startedAt: new Date().toISOString(),
      },
      completionConditions: params.completionConditions ?? {},
      state: "ACTIVE",
      checks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(job.id, job);
    this.persist();
    return job;
  }

  // Record observation — deterministic, no model calls
  recordCheck(jobId: string, observed: { success: boolean; value: string; error?: string }): MonitoringJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Monitoring job ${jobId} not found`);
    if (job.state !== "ACTIVE") return job;

    const now = new Date().toISOString();
    const previousValue = job.changeDetection.currentValue;
    const changed = previousValue !== undefined && previousValue !== observed.value;

    const acceptable = this.isAcceptable(observed.value, job.acceptableStates);

    job.checks.push({
      timestamp: now,
      success: observed.success,
      observedValue: observed.value,
      acceptable,
      changed,
      error: observed.error,
    });

    job.changeDetection.previousValue = previousValue;
    job.changeDetection.currentValue = observed.value;
    job.changeDetection.changed = changed;
    if (changed) {
      job.changeDetection.changeDescription = `Changed from "${previousValue?.substring(0, 100)}" to "${observed.value.substring(0, 100)}"`;
    }

    job.lastCheckAt = now;
    job.updatedAt = now;

    if (!observed.success) {
      job.escalationConditions.failureCount++;
      job.escalationConditions.lastFailureAt = now;
    } else {
      // Reset failure count on success? Keep count but not increment
    }

    // Check escalation
    if (job.escalationConditions.failureCount >= job.escalationConditions.maxFailures) {
      job.state = "ESCALATED";
      job.completedAt = now;
      job.result = `Escalated after ${job.escalationConditions.failureCount} failures`;
      this.jobs.set(jobId, job);
      this.persist();
      return job;
    }

    if (job.escalationConditions.escalateAfterMs) {
      const elapsed = Date.now() - new Date(job.escalationConditions.startedAt).getTime();
      if (elapsed > job.escalationConditions.escalateAfterMs) {
        job.state = "ESCALATED";
        job.completedAt = now;
        job.result = `Escalated after ${elapsed}ms elapsed`;
        this.jobs.set(jobId, job);
        this.persist();
        return job;
      }
    }

    // Check completion
    if (job.completionConditions.onState && acceptable) {
      if (job.completionConditions.onState.some(s => this.isAcceptable(observed.value, [s]))) {
        job.state = "COMPLETED";
        job.completedAt = now;
        job.result = `Completed — observed acceptable state: ${observed.value.substring(0, 200)}`;
        this.jobs.set(jobId, job);
        this.persist();
        return job;
      }
    }

    if (job.completionConditions.onChange && changed) {
      job.state = "COMPLETED";
      job.completedAt = now;
      job.result = `Completed — change detected: ${job.changeDetection.changeDescription}`;
      this.jobs.set(jobId, job);
      this.persist();
      return job;
    }

    if (job.completionConditions.maxChecks && job.checks.length >= job.completionConditions.maxChecks) {
      job.state = "COMPLETED";
      job.completedAt = now;
      job.result = `Completed — max checks ${job.completionConditions.maxChecks} reached`;
      this.jobs.set(jobId, job);
      this.persist();
      return job;
    }

    // Timeout check
    const elapsed = Date.now() - new Date(job.createdAt).getTime();
    if (elapsed > job.timeoutMs) {
      job.state = "FAILED";
      job.completedAt = now;
      job.result = `Failed — timeout after ${job.timeoutMs}ms`;
      this.jobs.set(jobId, job);
      this.persist();
      return job;
    }

    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  private isAcceptable(value: string, acceptable: string[]): boolean {
    if (acceptable.length === 0) return true; // if no criteria, any success is acceptable
    for (const a of acceptable) {
      if (a.startsWith("contains:")) {
        const substr = a.substring("contains:".length);
        if (value.includes(substr)) return true;
      } else if (a.startsWith("regex:")) {
        try {
          const pattern = a.substring("regex:".length);
          const regex = new RegExp(pattern);
          if (regex.test(value)) return true;
        } catch {}
      } else {
        if (value === a) return true;
        if (value.includes(a)) return true;
      }
    }
    return false;
  }

  getJob(jobId: string): MonitoringJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  getJobsByRun(runId: string): MonitoringJob[] {
    return [...this.jobs.values()].filter(j => j.runId === runId);
  }

  getActiveJobs(): MonitoringJob[] {
    return [...this.jobs.values()].filter(j => j.state === "ACTIVE");
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.state = "CANCELLED";
    job.completedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    this.persist();
    return true;
  }

  clear() {
    this.jobs.clear();
    this.persist();
  }

  list(): MonitoringJob[] {
    return [...this.jobs.values()];
  }
}

export const globalMonitoringManager = new MonitoringManager();
