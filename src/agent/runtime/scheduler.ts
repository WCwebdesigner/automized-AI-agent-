/**
 * Phase 8 — Controlled Scheduler
 * Handles immediate, delayed, scheduled, recurring monitoring, retry-after, waiting, health checks
 * Bounded, persistent, observable, no infinite loops
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";

export type ScheduleType =
  | "IMMEDIATE"
  | "DELAYED"
  | "SCHEDULED"
  | "RECURRING"
  | "RETRY_AFTER"
  | "WAITING_POLL"
  | "HEALTH_CHECK"
  | "MONITORING";

export interface ScheduledJob {
  id: string;
  runId: string;
  objectiveId: string;
  type: ScheduleType;
  state: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  scheduledAt: string; // when to execute
  intervalMs?: number; // for recurring
  maxExecutions?: number;
  executionCount: number;
  lastExecutionAt?: string;
  nextExecutionAt?: string;
  payload?: Record<string, unknown>;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
    currentRetry: number;
  };
  timeoutMs: number;
  resourceLimits?: {
    maxRuntimeMs?: number;
    maxAttempts?: number;
  };
  cancellationRequested: boolean;
  result?: unknown;
  error?: string;
  observability: {
    reason: string;
    what: string;
    why: string;
  };
}

export interface SchedulerOptions {
  maxConcurrentJobs?: number;
  defaultTimeoutMs?: number;
  persistencePath?: string;
}

export class ControlledScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private filePath: string;
  private maxConcurrent: number;
  private defaultTimeout: number;
  private runningCount = 0;
  private handlers: Map<ScheduleType, (job: ScheduledJob) => Promise<unknown>> = new Map();
  private stopped = false;

  constructor(opts: SchedulerOptions = {}) {
    const config = loadConfig();
    this.filePath = opts.persistencePath ?? path.join(config.workspaceRoot, ".kaira", "scheduler_jobs.json");
    this.maxConcurrent = opts.maxConcurrentJobs ?? 5;
    this.defaultTimeout = opts.defaultTimeoutMs ?? 30_000;
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
      const list: ScheduledJob[] = Array.isArray(parsed) ? parsed : parsed.jobs ?? [];
      for (const j of list) {
        if (j.id && j.runId && j.type) {
          // Reset RUNNING to PENDING on restart — survive process restart
          if (j.state === "RUNNING") {
            j.state = "PENDING";
          }
          this.jobs.set(j.id, j);
        }
      }
    } catch (e) {
      console.warn(`Failed to load scheduler jobs:`, e);
    }
  }

  private persist() {
    try {
      this.ensureDir();
      const tmp = this.filePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify([...this.jobs.values()], null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch (e) {
      console.error(`Scheduler persist failed:`, e);
    }
  }

  registerHandler(type: ScheduleType, handler: (job: ScheduledJob) => Promise<unknown>) {
    this.handlers.set(type, handler);
  }

  schedule(params: {
    runId: string;
    objectiveId: string;
    type: ScheduleType;
    scheduledAt?: Date | string;
    delayMs?: number;
    intervalMs?: number;
    maxExecutions?: number;
    payload?: Record<string, unknown>;
    timeoutMs?: number;
    reason: string;
    what: string;
    why: string;
    retryPolicy?: ScheduledJob["retryPolicy"];
  }): ScheduledJob {
    // Validate boundaries
    if (params.intervalMs && params.intervalMs < 1000) {
      throw new Error(`intervalMs must be >= 1000, got ${params.intervalMs}`);
    }
    if (params.delayMs && params.delayMs < 0) {
      throw new Error(`delayMs must be >=0`);
    }
    if (params.timeoutMs && params.timeoutMs > 300_000) {
      throw new Error(`timeoutMs max 300000`);
    }

    let scheduledAt: string;
    if (params.scheduledAt) {
      scheduledAt = typeof params.scheduledAt === "string" ? params.scheduledAt : params.scheduledAt.toISOString();
    } else if (params.delayMs) {
      scheduledAt = new Date(Date.now() + params.delayMs).toISOString();
    } else {
      scheduledAt = new Date().toISOString();
    }

    // Validate scheduledAt not too far future (max 30 days)
    const schedTime = new Date(scheduledAt).getTime();
    if (schedTime > Date.now() + 30 * 24 * 60 * 60 * 1000) {
      throw new Error(`Scheduled time too far future, max 30 days`);
    }

    const job: ScheduledJob = {
      id: randomUUID(),
      runId: params.runId,
      objectiveId: params.objectiveId,
      type: params.type,
      state: "PENDING",
      createdAt: new Date().toISOString(),
      scheduledAt,
      intervalMs: params.intervalMs,
      maxExecutions: params.maxExecutions,
      executionCount: 0,
      nextExecutionAt: scheduledAt,
      payload: params.payload,
      retryPolicy: params.retryPolicy,
      timeoutMs: params.timeoutMs ?? this.defaultTimeout,
      cancellationRequested: false,
      observability: {
        reason: params.reason,
        what: params.what,
        why: params.why,
      },
    };

    this.jobs.set(job.id, job);
    this.persist();
    this.scheduleTimer(job);
    return job;
  }

  private scheduleTimer(job: ScheduledJob) {
    if (this.stopped) return;
    if (job.state !== "PENDING") return;
    if (job.cancellationRequested) return;

    const now = Date.now();
    const scheduled = new Date(job.nextExecutionAt ?? job.scheduledAt).getTime();
    const delay = Math.max(0, scheduled - now);

    // Cap delay to 1 hour max timer, re-schedule after
    const timerDelay = Math.min(delay, 60 * 60 * 1000);

    const timer = setTimeout(() => {
      this.executeJob(job.id).catch(err => {
        console.warn(`Scheduler job ${job.id} failed:`, err);
      });
    }, timerDelay);

    this.timers.set(job.id, timer);
  }

  private async executeJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.cancellationRequested) {
      job.state = "CANCELLED";
      this.persist();
      return;
    }
    if (job.state !== "PENDING") return;

    // Check concurrency limit
    if (this.runningCount >= this.maxConcurrent) {
      // Re-schedule 1 second later
      setTimeout(() => this.scheduleTimer(job), 1000);
      return;
    }

    // Check if still time to execute (for delayed jobs)
    const now = Date.now();
    const scheduled = new Date(job.nextExecutionAt ?? job.scheduledAt).getTime();
    if (now < scheduled) {
      this.scheduleTimer(job);
      return;
    }

    job.state = "RUNNING";
    job.lastExecutionAt = new Date().toISOString();
    job.executionCount++;
    this.runningCount++;
    this.persist();

    const handler = this.handlers.get(job.type);
    let success = false;
    try {
      if (!handler) {
        // No handler — treat as no-op but complete
        job.result = { noHandler: true, type: job.type };
        success = true;
      } else {
        // Execute with timeout
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${job.timeoutMs}ms`)), job.timeoutMs)
        );
        const result = await Promise.race([handler(job), timeoutPromise]);
        job.result = result;
        success = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.error = msg;

      // Retry policy
      if (job.retryPolicy && job.retryPolicy.currentRetry < job.retryPolicy.maxRetries) {
        job.retryPolicy.currentRetry++;
        const backoff = job.retryPolicy.backoffMs * Math.pow(2, job.retryPolicy.currentRetry - 1);
        job.nextExecutionAt = new Date(Date.now() + backoff).toISOString();
        job.state = "PENDING";
        this.persist();
        this.scheduleTimer(job);
        this.runningCount--;
        return;
      }
    } finally {
      this.runningCount--;
    }

    if (success) {
      // Handle recurring
      if (job.type === "RECURRING" || job.intervalMs) {
        if (job.maxExecutions && job.executionCount >= job.maxExecutions) {
          job.state = "COMPLETED";
        } else {
          job.state = "PENDING";
          job.nextExecutionAt = new Date(Date.now() + (job.intervalMs ?? 60000)).toISOString();
          this.persist();
          this.scheduleTimer(job);
          return;
        }
      } else {
        job.state = "COMPLETED";
      }
    } else {
      if ((job.state as string) !== "PENDING") {
        job.state = "FAILED";
      }
    }

    this.persist();
  }

  cancel(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.cancellationRequested = true;
    job.state = "CANCELLED";
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
    this.persist();
    return true;
  }

  getJob(jobId: string): ScheduledJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  getJobsByRun(runId: string): ScheduledJob[] {
    return [...this.jobs.values()].filter(j => j.runId === runId);
  }

  getPendingJobs(): ScheduledJob[] {
    return [...this.jobs.values()].filter(j => j.state === "PENDING");
  }

  // For observability
  listJobs(): ScheduledJob[] {
    return [...this.jobs.values()];
  }

  stop() {
    this.stopped = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  restart() {
    this.stopped = false;
    for (const job of this.jobs.values()) {
      if (job.state === "PENDING") {
        this.scheduleTimer(job);
      }
    }
  }

  clear() {
    this.stop();
    this.jobs.clear();
    this.persist();
  }

  getFilePath() {
    return this.filePath;
  }
}

export const globalScheduler = new ControlledScheduler();
