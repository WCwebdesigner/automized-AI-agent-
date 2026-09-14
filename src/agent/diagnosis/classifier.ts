/**
 * Failure Classification — Phase 5.1
 * Deterministic classification based on evidence, not LLM alone
 */

import { Failure, FailureCategory, FailureSeverity, Recoverability, createFailureId } from "./types";
import { Observation, Evidence } from "../observation/types";
import { VerificationResult } from "../verification/types";

export interface ClassificationInput {
  objectiveId: string;
  taskId: string;
  runId: string;
  actionId: string;
  observation: Observation;
  evidence: Evidence[];
  verificationResult?: VerificationResult;
  toolName: string;
}

export class FailureClassifier {
  /**
   * Deterministic failure classification — no LLM needed for core logic
   */
  static classify(input: ClassificationInput): Failure {
    const obs = input.observation;
    const toolName = input.toolName;
    const lowerOutput = `${obs.outputCombined ?? ""} ${obs.stdout ?? ""} ${obs.stderr ?? ""} ${obs.error ?? ""}`.toLowerCase();
    const exitCode = obs.exitCode;

    let category: FailureCategory = "UNKNOWN_FAILURE";
    let severity: FailureSeverity = "MEDIUM";
    let recoverability: Recoverability = "RECOVERABLE";
    let message = obs.failureReason ?? obs.error ?? "Unknown failure";

    // Security violation
    if (
      lowerOutput.includes("escapes workspace") ||
      lowerOutput.includes("symlink escapes") ||
      lowerOutput.includes("path traversal") ||
      lowerOutput.includes("permission denied") && lowerOutput.includes("destructive")
    ) {
      if (lowerOutput.includes("escapes workspace") || lowerOutput.includes("symlink") || lowerOutput.includes("traversal")) {
        category = "SECURITY_VIOLATION";
        severity = "CRITICAL";
        recoverability = "REQUIRES_HUMAN";
        message = `Security violation: ${message}`;
      }
    }

    // Permission denied
    if (category === "UNKNOWN_FAILURE" && (lowerOutput.includes("permission denied") || lowerOutput.includes("permission_error") || lowerOutput.includes("eperm") || obs.failureReason?.includes("Permission"))) {
      category = "PERMISSION_DENIED";
      severity = "HIGH";
      recoverability = "REQUIRES_HUMAN";
    }

    // Timeout
    if (category === "UNKNOWN_FAILURE" && (lowerOutput.includes("timeout") || obs.failureReason?.toLowerCase().includes("timeout") || toolName.includes("timeout"))) {
      category = "TIMEOUT";
      severity = "MEDIUM";
      recoverability = "RECOVERABLE";
    }

    // Syntax error
    if (category === "UNKNOWN_FAILURE" && (lowerOutput.includes("syntaxerror") || lowerOutput.includes("invalid syntax") || lowerOutput.includes("unexpected token") || lowerOutput.includes("parse error"))) {
      category = "SYNTAX_ERROR";
      severity = "MEDIUM";
      recoverability = "RECOVERABLE";
    }

    // Missing file
    if (category === "UNKNOWN_FAILURE" && (lowerOutput.includes("filenotfound") || lowerOutput.includes("no such file") || lowerOutput.includes("file not found") || lowerOutput.includes("cannot find") || lowerOutput.includes("module not found") && lowerOutput.includes("file"))) {
      category = "MISSING_FILE";
      severity = "MEDIUM";
      recoverability = "RECOVERABLE";
    }

    // Test failure
    if (category === "UNKNOWN_FAILURE" && (toolName === "run_test" || lowerOutput.includes("test failed") || lowerOutput.includes("assertionerror") || lowerOutput.includes("assert") || lowerOutput.includes("failed:") && lowerOutput.includes("test"))) {
      if (toolName.includes("test") || lowerOutput.includes("test")) {
        category = "TEST_FAILURE";
        severity = "MEDIUM";
        recoverability = "RECOVERABLE";
      }
    }

    // Verification failure
    if (category === "UNKNOWN_FAILURE" && input.verificationResult && !input.verificationResult.passed) {
      category = "VERIFICATION_FAILURE";
      severity = "HIGH";
      recoverability = "RECOVERABLE";
      message = `Verification failed: ${input.verificationResult.summary}`;
    }

    // Command failure
    if (category === "UNKNOWN_FAILURE" && (toolName === "run_command" || toolName === "run_python" || toolName === "run_test")) {
      if (exitCode !== 0 && exitCode !== null && exitCode !== undefined) {
        category = "COMMAND_FAILURE";
        severity = "MEDIUM";
        recoverability = "RECOVERABLE";
      }
    }

    // Runtime error
    if (category === "UNKNOWN_FAILURE" && (lowerOutput.includes("runtimeerror") || lowerOutput.includes("referenceerror") || lowerOutput.includes("typeerror") || lowerOutput.includes("valueerror") || lowerOutput.includes("exception") || lowerOutput.includes("error") && exitCode !== 0)) {
      category = "RUNTIME_ERROR";
      severity = "MEDIUM";
      recoverability = "RECOVERABLE";
    }

    // Invalid output
    if (category === "UNKNOWN_FAILURE" && (lowerOutput.includes("invalid output") || lowerOutput.includes("output does not contain") || lowerOutput.includes("does not match"))) {
      category = "INVALID_OUTPUT";
      severity = "MEDIUM";
      recoverability = "RECOVERABLE";
    }

    // Tool failure generic
    if (category === "UNKNOWN_FAILURE") {
      category = "TOOL_FAILURE";
      severity = "MEDIUM";
      recoverability = "RECOVERABLE";
    }

    // Resource limit
    if (lowerOutput.includes("too large") || lowerOutput.includes("exceeds") || lowerOutput.includes("resource") || lowerOutput.includes("out of memory")) {
      if (category !== "SECURITY_VIOLATION" && category !== "PERMISSION_DENIED") {
        category = "RESOURCE_LIMIT";
        severity = "HIGH";
        recoverability = "NON_RECOVERABLE";
      }
    }

    return {
      id: createFailureId(),
      category,
      message,
      actionId: input.actionId,
      objectiveId: input.objectiveId,
      taskId: input.taskId,
      runId: input.runId,
      observationId: obs.id,
      evidence: input.evidence,
      severity,
      recoverability,
      timestamp: new Date().toISOString(),
      toolName,
      exitCode,
      stdout: obs.stdout,
      stderr: obs.stderr,
      verificationResultId: input.verificationResult?.id,
    };
  }

  static isRecoverable(failure: Failure): boolean {
    return failure.recoverability === "RECOVERABLE";
  }

  static requiresHuman(failure: Failure): boolean {
    return failure.recoverability === "REQUIRES_HUMAN" || failure.severity === "CRITICAL" || failure.category === "SECURITY_VIOLATION";
  }
}
