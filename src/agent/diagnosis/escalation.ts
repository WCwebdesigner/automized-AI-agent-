/**
 * Escalation — Phase 5.7
 * When permissions unavailable/policy violation/unsafe/unreliable diagnosis/retry exhausted/lacks info/human decision required
 * Structured escalation result, never pretend solved
 */

import { Escalation, Failure, Repair, Diagnosis, createEscalationId } from "./types";
import { Evidence } from "../observation/types";
import { VerificationResult } from "../verification/types";
import { AgentLogger, globalLogger } from "../core/logger";

export interface EscalationTrigger {
  reason: string;
  failure: Failure;
  diagnosis?: Diagnosis;
  attemptedRepairs: Repair[];
  failedVerificationResults: VerificationResult[];
  evidence: Evidence[];
  objectiveId: string;
  taskId: string;
  runId: string;
}

export class EscalationEngine {
  private logger: AgentLogger;

  constructor(logger: AgentLogger = globalLogger) {
    this.logger = logger;
  }

  /**
   * Determine if escalation is needed — deterministic rules
   */
  shouldEscalate(trigger: EscalationTrigger): { should: boolean; reason: string } {
    // Permissions unavailable
    if (trigger.failure.category === "PERMISSION_DENIED") {
      return { should: true, reason: `Permission denied for ${trigger.failure.toolName}: ${trigger.failure.message}` };
    }

    // Policy violation / security
    if (trigger.failure.category === "SECURITY_VIOLATION") {
      return { should: true, reason: `Security violation: ${trigger.failure.message} — unsafe to continue` };
    }

    // Retry exhausted
    if (trigger.attemptedRepairs.length >= 3) {
      const lastRepairs = trigger.attemptedRepairs.slice(-3);
      const allFailed = lastRepairs.every((r) => r.executionResult && !r.executionResult.success);
      if (allFailed) {
        return { should: true, reason: `Retry exhausted: ${trigger.attemptedRepairs.length} repair attempts failed` };
      }
    }

    // Unreliable diagnosis (low confidence)
    if (trigger.diagnosis && trigger.diagnosis.confidence < 0.3) {
      return { should: true, reason: `Unreliable diagnosis: confidence ${trigger.diagnosis.confidence} too low` };
    }

    // Requires human decision
    if (trigger.diagnosis?.requiresHumanDecision) {
      return { should: true, reason: `Diagnosis requires human decision: ${trigger.diagnosis.rootCause}` };
    }

    if (trigger.failure.recoverability === "REQUIRES_HUMAN") {
      return { should: true, reason: `Failure requires human: ${trigger.failure.message}` };
    }

    // Lacks info
    if (trigger.evidence.length === 0) {
      return { should: true, reason: "Lacks information: no evidence available for diagnosis" };
    }

    // Failed verification after repairs
    if (trigger.failedVerificationResults.length >= 2) {
      return { should: true, reason: `Verification repeatedly failed after repairs: ${trigger.failedVerificationResults.map((r) => r.summary).join("; ")}` };
    }

    return { should: false, reason: "No escalation needed" };
  }

  /**
   * Create structured escalation result — never pretend solved
   */
  escalate(trigger: EscalationTrigger): Escalation {
    const recommendedAction = this.determineHumanAction(trigger);

    const escalation: Escalation = {
      id: createEscalationId(),
      objectiveId: trigger.objectiveId,
      taskId: trigger.taskId,
      runId: trigger.runId,
      failureId: trigger.failure.id,
      diagnosisId: trigger.diagnosis?.id,
      reason: trigger.reason,
      evidence: trigger.evidence,
      attemptedRepairs: trigger.attemptedRepairs,
      failedVerificationResults: trigger.failedVerificationResults,
      recommendedHumanAction: recommendedAction,
      timestamp: new Date().toISOString(),
      severity: trigger.failure.severity,
    };

    this.logger.escalation(trigger.objectiveId, `Escalated: ${trigger.reason}. Recommended: ${recommendedAction}`);

    return escalation;
  }

  private determineHumanAction(trigger: EscalationTrigger): string {
    switch (trigger.failure.category) {
      case "PERMISSION_DENIED":
        return `Check permissions for tool ${trigger.failure.toolName}. Ensure workspace write permissions and allow destructive if needed. Evidence: ${trigger.evidence.map((e) => e.type).join(", ")}`;
      case "SECURITY_VIOLATION":
        return `Review security violation: ${trigger.failure.message}. Do not auto-repair. Evidence: ${trigger.evidence.map((e) => e.message).join("; ")}`;
      case "TIMEOUT":
        return `Increase timeout for ${trigger.failure.toolName} or optimize operation. Evidence: ${trigger.evidence.find((e) => e.type === "COMMAND_EXIT_CODE")?.message ?? ""}`;
      case "RESOURCE_LIMIT":
        return `Resource limit exceeded: ${trigger.failure.message}. Free resources or increase limits. Evidence: ${trigger.evidence.map((e) => e.type).join(", ")}`;
      default:
        if (trigger.attemptedRepairs.length > 0) {
          return `Manual intervention required after ${trigger.attemptedRepairs.length} failed repair attempts. Last failure: ${trigger.failure.message}. Review evidence: ${trigger.evidence.map((e) => `${e.type}:${e.message.slice(0, 50)}`).join("; ")}. Attempted repairs: ${trigger.attemptedRepairs.map((r) => r.intendedChanges).join("; ")}`;
        }
        return `Manual review needed for ${trigger.failure.category}: ${trigger.failure.message}. Evidence: ${trigger.evidence.map((e) => e.type).join(", ")}. Verify files and outputs manually.`;
    }
  }
}

export const globalEscalationEngine = new EscalationEngine();
