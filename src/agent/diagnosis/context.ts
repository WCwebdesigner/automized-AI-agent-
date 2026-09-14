/**
 * Context Management — Phase 5.9
 * Bounded contexts for planning/diagnosis/repair/verification with configurable limits
 */

import { loadConfig } from "../config";
import { Observation, Evidence } from "../observation/types";
import { DiagnosisContext, Repair } from "./types";
import { VerificationResult } from "../verification/types";
import fs from "node:fs";
import path from "node:path";

export interface ContextLimits {
  maxFileContentBytes: number;
  maxEvidenceCount: number;
  maxRecentChanges: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  maxHistoryEntries: number;
}

export const DEFAULT_CONTEXT_LIMITS: ContextLimits = {
  maxFileContentBytes: 100_000, // 100KB per file
  maxEvidenceCount: 20,
  maxRecentChanges: 10,
  maxStdoutBytes: 10_000,
  maxStderrBytes: 10_000,
  maxHistoryEntries: 20,
};

export class ContextManager {
  private limits: ContextLimits;

  constructor(limits?: Partial<ContextLimits>) {
    const config = loadConfig();
    this.limits = {
      maxFileContentBytes: limits?.maxFileContentBytes ?? Math.min(DEFAULT_CONTEXT_LIMITS.maxFileContentBytes, config.safety.maxFileSizeBytes),
      maxEvidenceCount: limits?.maxEvidenceCount ?? DEFAULT_CONTEXT_LIMITS.maxEvidenceCount,
      maxRecentChanges: limits?.maxRecentChanges ?? DEFAULT_CONTEXT_LIMITS.maxRecentChanges,
      maxStdoutBytes: limits?.maxStdoutBytes ?? DEFAULT_CONTEXT_LIMITS.maxStdoutBytes,
      maxStderrBytes: limits?.maxStderrBytes ?? DEFAULT_CONTEXT_LIMITS.maxStderrBytes,
      maxHistoryEntries: limits?.maxHistoryEntries ?? DEFAULT_CONTEXT_LIMITS.maxHistoryEntries,
    };
  }

  getLimits(): ContextLimits {
    return { ...this.limits };
  }

  /**
   * Build focused diagnosis context — bounded, deterministic
   */
  buildDiagnosisContext(params: {
    objective: string;
    objectiveId: string;
    taskDescription: string;
    taskId: string;
    runId: string;
    failedAction: string;
    observation: Observation;
    verificationResult?: VerificationResult;
    workspaceRoot: string;
    evidence: Evidence[];
    recentChanges?: Array<{ file: string; operation: string; timestamp: string }>;
    previousRepairs?: Repair[];
    filePathsToInclude?: string[];
  }): DiagnosisContext {
    // Truncate stdout/stderr for context
    let stdout = params.observation.stdout ?? "";
    let stderr = params.observation.stderr ?? "";

    if (Buffer.byteLength(stdout, "utf8") > this.limits.maxStdoutBytes) {
      stdout = stdout.slice(0, this.limits.maxStdoutBytes) + "\n...[truncated]...";
    }
    if (Buffer.byteLength(stderr, "utf8") > this.limits.maxStderrBytes) {
      stderr = stderr.slice(0, this.limits.maxStderrBytes) + "\n...[truncated]...";
    }

    // Collect file contents — bounded
    const fileContents: Record<string, string> = {};
    const filesToRead = params.filePathsToInclude ?? params.observation.affectedFiles ?? [];

    for (const filePath of filesToRead.slice(0, 5)) { // max 5 files for diagnosis
      try {
        const abs = path.resolve(params.workspaceRoot, filePath);
        if (fs.existsSync(abs)) {
          const stat = fs.statSync(abs);
          if (stat.isFile() && stat.size <= this.limits.maxFileContentBytes * 2) {
            let content = fs.readFileSync(abs, "utf8");
            if (Buffer.byteLength(content, "utf8") > this.limits.maxFileContentBytes) {
              content = content.slice(0, this.limits.maxFileContentBytes) + "\n...[truncated]...";
            }
            fileContents[filePath] = content;
          }
        }
      } catch {}
    }

    // Limit evidence
    const limitedEvidence = params.evidence.slice(0, this.limits.maxEvidenceCount);

    // Limit recent changes
    const recentChanges = (params.recentChanges ?? []).slice(0, this.limits.maxRecentChanges);

    return {
      objective: params.objective.slice(0, 2000),
      objectiveId: params.objectiveId,
      taskDescription: params.taskDescription.slice(0, 1000),
      taskId: params.taskId,
      runId: params.runId,
      failedAction: params.failedAction.slice(0, 1000),
      observation: params.observation,
      stderr,
      stdout,
      verificationResult: params.verificationResult,
      fileContents,
      recentChanges,
      previousRepairs: (params.previousRepairs ?? []).slice(0, this.limits.maxHistoryEntries),
      evidence: limitedEvidence,
      maxFileContentBytes: this.limits.maxFileContentBytes,
      maxEvidenceCount: this.limits.maxEvidenceCount,
      maxRecentChanges: this.limits.maxRecentChanges,
    };
  }

  /**
   * Build planning context — bounded
   */
  buildPlanningContext(params: {
    objective: string;
    workspaceFiles?: string[];
    recentObservations?: Observation[];
  }): { objective: string; workspaceFiles: string[]; recentObservations: string } {
    return {
      objective: params.objective.slice(0, 2000),
      workspaceFiles: (params.workspaceFiles ?? []).slice(0, 20),
      recentObservations: (params.recentObservations ?? [])
        .slice(0, this.limits.maxHistoryEntries)
        .map((o) => `${o.toolName}: ${o.success ? "SUCCESS" : "FAIL"} ${o.outputCombined?.slice(0, 200) ?? ""}`)
        .join("\n"),
    };
  }

  /**
   * Build repair context — bounded
   */
  buildRepairContext(params: {
    diagnosis: string;
    affectedFiles: string[];
    fileContents: Record<string, string>;
    evidence: Evidence[];
  }): { diagnosis: string; affectedFiles: string[]; fileContents: Record<string, string>; evidenceSummary: string } {
    const limitedContents: Record<string, string> = {};
    for (const [file, content] of Object.entries(params.fileContents)) {
      if (Buffer.byteLength(content, "utf8") > this.limits.maxFileContentBytes) {
        limitedContents[file] = content.slice(0, this.limits.maxFileContentBytes) + "\n...[truncated]...";
      } else {
        limitedContents[file] = content;
      }
    }

    return {
      diagnosis: params.diagnosis.slice(0, 2000),
      affectedFiles: params.affectedFiles.slice(0, 10),
      fileContents: limitedContents,
      evidenceSummary: params.evidence
        .slice(0, this.limits.maxEvidenceCount)
        .map((e) => `${e.type}: ${e.message}`)
        .join("\n"),
    };
  }

  /**
   * Build verification context — bounded
   */
  buildVerificationContext(params: {
    objective: string;
    observations: Observation[];
    evidence: Evidence[];
  }): { objective: string; observationsSummary: string; evidenceSummary: string } {
    return {
      objective: params.objective.slice(0, 2000),
      observationsSummary: params.observations
        .slice(0, this.limits.maxHistoryEntries)
        .map((o) => `${o.toolName} ${o.success ? "OK" : "FAIL"} exit=${o.exitCode} out=${o.stdout?.slice(0, 100) ?? ""}`)
        .join("\n"),
      evidenceSummary: params.evidence
        .slice(0, this.limits.maxEvidenceCount)
        .map((e) => `${e.type} ${e.message}`)
        .join("\n"),
    };
  }
}

export const globalContextManager = new ContextManager();
