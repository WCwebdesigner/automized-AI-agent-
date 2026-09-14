/**
 * Evidence Model — Phase 4.2
 * Structured evidence originating from real observations, not LLM
 */

import { Evidence, Observation, EvidenceType, EvidenceSource, createEvidenceId, FileMetadata } from "./types";

export interface EvidenceCreationParams {
  observation: Observation;
  type: EvidenceType;
  source: EvidenceSource;
  confidence: number;
  data: unknown;
  message: string;
  filePath?: string;
  content?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  exists?: boolean;
  metadata?: FileMetadata;
}

/**
 * Factory that ensures evidence originates from real observations
 * Deterministic control — no LLM fabrication allowed
 */
export class EvidenceFactory {
  static create(params: EvidenceCreationParams): Evidence {
    if (!params.observation) {
      throw new Error("Evidence must originate from a real observation — observation required");
    }
    if (!params.observation.id) {
      throw new Error("Evidence must have valid observationId from real observation");
    }

    // Validate confidence
    if (params.confidence < 0 || params.confidence > 1) {
      throw new Error(`Invalid confidence ${params.confidence}, must be 0-1`);
    }

    return {
      id: createEvidenceId(),
      observationId: params.observation.id,
      actionId: params.observation.actionId,
      objectiveId: params.observation.objectiveId,
      taskId: params.observation.taskId,
      runId: params.observation.runId,
      source: params.source,
      type: params.type,
      confidence: params.confidence,
      timestamp: new Date().toISOString(),
      data: params.data,
      filePath: params.filePath,
      content: params.content,
      exitCode: params.exitCode,
      stdout: params.stdout,
      stderr: params.stderr,
      exists: params.exists,
      metadata: params.metadata,
      message: params.message,
    };
  }

  static fromObservation(observation: Observation): Evidence[] {
    const evidences: Evidence[] = [];
    const base = {
      observation,
    };

    // COMMAND_EXIT_CODE evidence if exitCode present
    if (observation.exitCode !== undefined && observation.exitCode !== null) {
      evidences.push(
        this.create({
          ...base,
          type: "COMMAND_EXIT_CODE",
          source: observation.toolName.includes("python") || observation.toolName.includes("command") || observation.toolName.includes("test") ? "COMMAND" : "TOOL_EXECUTION",
          confidence: 1.0,
          data: { exitCode: observation.exitCode, tool: observation.toolName },
          message: `Tool ${observation.toolName} exited with code ${observation.exitCode}`,
          exitCode: observation.exitCode,
        })
      );
    }

    // STDOUT evidence
    if (observation.stdout && observation.stdout.length > 0) {
      evidences.push(
        this.create({
          ...base,
          type: "STDOUT",
          source: "TOOL_EXECUTION",
          confidence: 1.0,
          data: { stdout: observation.stdout, truncated: observation.stdoutTruncated },
          message: `Captured stdout from ${observation.toolName} (${observation.stdout.length} chars)`,
          stdout: observation.stdout,
        })
      );
    }

    // STDERR evidence
    if (observation.stderr && observation.stderr.length > 0) {
      evidences.push(
        this.create({
          ...base,
          type: "STDERR",
          source: "TOOL_EXECUTION",
          confidence: 1.0,
          data: { stderr: observation.stderr, truncated: observation.stderrTruncated },
          message: `Captured stderr from ${observation.toolName}`,
          stderr: observation.stderr,
        })
      );
    }

    // COMMAND_RESULT for command-like tools
    if (observation.toolName === "run_command" || observation.toolName === "run_python" || observation.toolName === "run_test") {
      evidences.push(
        this.create({
          ...base,
          type: "COMMAND_RESULT",
          source: "COMMAND",
          confidence: observation.success ? 0.95 : 0.9,
          data: {
            tool: observation.toolName,
            success: observation.success,
            exitCode: observation.exitCode,
            stdout: observation.stdout,
            stderr: observation.stderr,
          },
          message: `Command ${observation.toolName} ${observation.success ? "succeeded" : "failed"}`,
          exitCode: observation.exitCode,
          stdout: observation.stdout,
          stderr: observation.stderr,
        })
      );
    }

    // TEST_RESULT for test tools
    if (observation.toolName === "run_test" || observation.toolName.includes("test")) {
      evidences.push(
        this.create({
          ...base,
          type: "TEST_RESULT",
          source: "COMMAND",
          confidence: 0.95,
          data: {
            success: observation.success,
            output: observation.outputCombined,
          },
          message: `Test execution ${observation.success ? "passed" : "failed"}`,
          stdout: observation.stdout,
        })
      );
    }

    // FILE_* evidences
    for (const file of observation.createdFiles) {
      evidences.push(
        this.create({
          ...base,
          type: "FILE_CREATED",
          source: "FILE_SYSTEM",
          confidence: 1.0,
          data: { path: file, operation: "created" },
          message: `File created: ${file}`,
          filePath: file,
        })
      );
    }

    for (const file of observation.modifiedFiles) {
      evidences.push(
        this.create({
          ...base,
          type: "FILE_MODIFIED",
          source: "FILE_SYSTEM",
          confidence: 1.0,
          data: { path: file, operation: "modified" },
          message: `File modified: ${file}`,
          filePath: file,
        })
      );
    }

    for (const file of observation.deletedFiles) {
      evidences.push(
        this.create({
          ...base,
          type: "FILE_DELETED",
          source: "FILE_SYSTEM",
          confidence: 1.0,
          data: { path: file, operation: "deleted" },
          message: `File deleted: ${file}`,
          filePath: file,
        })
      );
    }

    // FILE_EXISTS from metadata
    for (const meta of observation.fileMetadata) {
      evidences.push(
        this.create({
          ...base,
          type: meta.exists ? "FILE_EXISTS" : "FILE_EXISTS",
          source: "FILE_SYSTEM",
          confidence: 1.0,
          data: meta,
          message: `File ${meta.path} ${meta.exists ? "exists" : "does not exist"}`,
          filePath: meta.path,
          exists: meta.exists,
          metadata: meta,
        })
      );

      if (meta.exists) {
        evidences.push(
          this.create({
            ...base,
            type: "FILE_METADATA",
            source: "FILE_SYSTEM",
            confidence: 0.95,
            data: meta,
            message: `Metadata for ${meta.path}: size=${meta.size}`,
            filePath: meta.path,
            metadata: meta,
          })
        );
      }
    }

    return evidences;
  }

  /**
   * Validate that evidence chain originates from real observations
   */
  static validateChain(evidences: Evidence[], observations: Observation[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const observationIds = new Set(observations.map((o) => o.id));

    for (const ev of evidences) {
      if (!observationIds.has(ev.observationId)) {
        errors.push(`Evidence ${ev.id} references non-existent observation ${ev.observationId}`);
      }
      if (!ev.source || !ev.type) {
        errors.push(`Evidence ${ev.id} missing source or type`);
      }
      if (ev.confidence < 0 || ev.confidence > 1) {
        errors.push(`Evidence ${ev.id} has invalid confidence ${ev.confidence}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
