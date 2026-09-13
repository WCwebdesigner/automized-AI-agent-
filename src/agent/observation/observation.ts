/**
 * Observation Subsystem — Phase 4.1
 * Normalized observation per tool execution with limits
 */

import { randomUUID } from "node:crypto";
import { Observation, FileMetadata, ObservationLimits, DEFAULT_OBSERVATION_LIMITS, createObservationId } from "./types";
import { ObservationLimiter, globalObservationLimiter } from "./limits";
import { StructuredToolResult } from "../tools/registry";
import { loadConfig } from "../config";
import fs from "node:fs";
import path from "node:path";

export interface CreateObservationParams {
  actionId?: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  toolName: string;
  timestamp?: string;
  durationMs: number;
  result: StructuredToolResult;
  env?: Record<string, string>;
  workspaceRoot?: string;
  limits?: Partial<ObservationLimits>;
}

export class ObservationCollector {
  private limiter: ObservationLimiter;
  private config = loadConfig();

  constructor(limits?: Partial<ObservationLimits>) {
    this.limiter = new ObservationLimiter(limits);
  }

  getLimiter(): ObservationLimiter {
    return this.limiter;
  }

  /**
   * Create normalized observation from tool execution result
   * Deterministic, with configurable limits
   */
  async createObservation(params: CreateObservationParams): Promise<Observation> {
    const observationId = createObservationId();
    const actionId = params.actionId ?? randomUUID();
    const timestamp = params.timestamp ?? new Date().toISOString();
    const workspaceRoot = params.workspaceRoot ?? this.config.workspaceRoot;

    const result = params.result;

    // Apply limits to stdout/stderr
    const stdoutRaw = result.stdout ?? "";
    const stderrRaw = result.stderr ?? "";
    const stdoutLimited = this.limiter.enforceStdoutLimit(stdoutRaw);
    const stderrLimited = this.limiter.enforceStderrLimit(stderrRaw);

    // Determine affected files, created/modified/deleted
    const affectedRaw = result.affectedFiles ?? [];
    const affectedLimited = this.limiter.enforceAffectedFilesLimit(affectedRaw);

    const createdFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const deletedFiles: string[] = [];

    // Infer from tool type and result
    if (params.toolName === "write_file" || params.toolName === "create_directory") {
      createdFiles.push(...affectedLimited.files);
    } else if (params.toolName === "modify_file") {
      modifiedFiles.push(...affectedLimited.files);
    } else if (params.toolName === "delete_file") {
      deletedFiles.push(...affectedLimited.files);
    } else {
      // For other tools, treat affected as modified if file exists, or created if new
      // We'll check filesystem to determine
      for (const f of affectedLimited.files) {
        try {
          const abs = path.resolve(workspaceRoot, f);
          if (fs.existsSync(abs)) {
            // Check if recently created? Use heuristic: if tool is write_file, created, else modified
            if (params.toolName.includes("write")) createdFiles.push(f);
            else modifiedFiles.push(f);
          }
        } catch {
          modifiedFiles.push(f);
        }
      }
    }

    // Collect file metadata for affected files
    const fileMetadata: FileMetadata[] = [];
    const allFiles = [...new Set([...affectedLimited.files, ...createdFiles, ...modifiedFiles])];
    const metadataLimited = this.limiter.enforceMetadataLimit(allFiles);

    for (const filePath of metadataLimited.metadata) {
      try {
        const abs = path.resolve(workspaceRoot, filePath);
        const exists = fs.existsSync(abs);
        if (exists) {
          const stat = fs.statSync(abs);
          fileMetadata.push({
            path: filePath,
            exists: true,
            size: stat.size,
            isFile: stat.isFile(),
            isDirectory: stat.isDirectory(),
            mtime: stat.mtime.toISOString(),
          });
        } else {
          fileMetadata.push({
            path: filePath,
            exists: false,
          });
        }
      } catch {
        fileMetadata.push({
          path: filePath,
          exists: false,
        });
      }
    }

    // Calculate total size
    let totalSize = 0;
    totalSize += Buffer.byteLength(stdoutLimited.content, "utf8");
    totalSize += Buffer.byteLength(stderrLimited.content, "utf8");
    totalSize += Buffer.byteLength(result.output ?? "", "utf8");
    totalSize += fileMetadata.length * 200; // approximate metadata overhead

    const truncated = stdoutLimited.truncated || stderrLimited.truncated || affectedLimited.truncated || metadataLimited.truncated;

    // Check total size limit and truncate combined output if needed
    let outputCombined = result.output ?? "";
    if (totalSize > this.limiter.getLimits().maxTotalBytes) {
      const allowedForOutput = this.limiter.getLimits().maxTotalBytes - (Buffer.byteLength(stdoutLimited.content, "utf8") + Buffer.byteLength(stderrLimited.content, "utf8"));
      if (allowedForOutput < Buffer.byteLength(outputCombined, "utf8")) {
        const truncatedOutput = this.limiter.truncateString(outputCombined, Math.max(0, allowedForOutput));
        outputCombined = truncatedOutput.truncated;
      }
    }

    const observation: Observation = {
      id: observationId,
      actionId,
      objectiveId: params.objectiveId,
      taskId: params.taskId,
      runId: params.runId,
      toolName: params.toolName,
      timestamp,
      durationMs: params.durationMs,
      success: result.status === "SUCCESS",
      failureReason: result.status !== "SUCCESS" ? result.error ?? result.output : undefined,
      exitCode: result.exitCode ?? null,
      stdout: stdoutLimited.content,
      stdoutTruncated: stdoutLimited.truncated,
      stderr: stderrLimited.content,
      stderrTruncated: stderrLimited.truncated,
      outputCombined,
      affectedFiles: affectedLimited.files,
      createdFiles,
      modifiedFiles,
      deletedFiles,
      fileMetadata,
      error: result.error,
      env: params.env,
      rawResult: result,
      originalStdoutBytes: stdoutLimited.originalBytes,
      originalStderrBytes: stderrLimited.originalBytes,
      totalSizeBytes: totalSize,
      truncated,
    };

    return observation;
  }

  /**
   * Create observation from raw tool result (convenience)
   */
  static async fromToolResult(
    objectiveId: string,
    taskId: string,
    runId: string,
    toolName: string,
    result: StructuredToolResult,
    durationMs: number,
    workspaceRoot?: string,
    actionId?: string
  ): Promise<Observation> {
    const collector = new ObservationCollector();
    return collector.createObservation({
      objectiveId,
      taskId,
      runId,
      toolName,
      durationMs,
      result,
      workspaceRoot,
      actionId,
    });
  }
}

export const globalObservationCollector = new ObservationCollector();
