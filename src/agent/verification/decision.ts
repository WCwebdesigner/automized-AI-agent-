/**
 * Completion Decision — Phase 4.5
 * Model claim "I believe complete" is only CLAIM, system evaluates verification plan -> VERIFIED/FAILED/INCONCLUSIVE/BLOCKED
 * Deterministic rules, task NOT COMPLETE on model claim alone
 */

import { CompletionDecision, CompletionDecisionStatus, VerificationResult, createCompletionDecisionId } from "./types";

export interface ModelClaim {
  claim: string;
  confidence?: number;
  timestamp: string;
  taskId?: string;
  objectiveId: string;
  runId: string;
}

export class CompletionDecisionEngine {
  /**
   * Deterministic completion decision — model claim never proof
   * Only VERIFIED if verification passed
   * Instance method for agentCore usage: decide(objectiveId, planId, verificationResult, modelClaim, evidence)
   */
  decide(
    objectiveId: string,
    planIdOrParams: string | { objectiveId: string; taskId?: string; runId: string; modelClaim?: ModelClaim | string; verificationResult: VerificationResult; evidenceChainIds?: string[] },
    verificationResult?: VerificationResult,
    modelClaim?: string | ModelClaim,
    evidence?: any[]
  ): CompletionDecision {
    // Handle both signatures: object param or positional
    if (typeof planIdOrParams === "object") {
      return CompletionDecisionEngine.decideStatic(planIdOrParams);
    }
    const vr = verificationResult!;
    const claimText = typeof modelClaim === "string" ? modelClaim : (modelClaim as any)?.claim;
    const evidenceIds = (evidence ?? []).map((e: any) => e.id ?? e);
    return CompletionDecisionEngine.decideStatic({
      objectiveId,
      runId: planIdOrParams, // planId used as runId fallback
      modelClaim: claimText,
      verificationResult: vr,
      evidenceChainIds: evidenceIds,
    });
  }

  /**
   * Static version with object params
   */
  static decide(params: {
    objectiveId: string;
    taskId?: string;
    runId: string;
    modelClaim?: ModelClaim | string;
    verificationResult: VerificationResult;
    evidenceChainIds?: string[];
  }): CompletionDecision {
    return this.decideStatic(params);
  }

  static decideStatic(params: {
    objectiveId: string;
    taskId?: string;
    runId: string;
    modelClaim?: ModelClaim | string;
    verificationResult: VerificationResult;
    evidenceChainIds?: string[];
  }): CompletionDecision {
    const claimText = typeof params.modelClaim === "string" ? params.modelClaim : params.modelClaim?.claim;

    // Deterministic rules:
    // - If verification PASSED => VERIFIED
    // - If verification FAILED => FAILED
    // - If verification BLOCKED => BLOCKED
    // - If verification INCONCLUSIVE => INCONCLUSIVE
    // Model claim is irrelevant to decision, only logged

    let status: CompletionDecisionStatus;
    let reason: string;

    switch (params.verificationResult.status) {
      case "PASSED":
        status = "VERIFIED";
        reason = `Verification PASSED: ${params.verificationResult.summary}. ${claimText ? `Model claimed: "${claimText.slice(0, 100)}" — claim validated by evidence.` : "Validated by deterministic verification."}`;
        break;
      case "FAILED":
        status = "FAILED";
        reason = `Verification FAILED: ${params.verificationResult.summary}. ${claimText ? `Model claimed "${claimText.slice(0, 100)}" but verification contradicts claim — task NOT complete.` : "Task not complete per verification."}`;
        break;
      case "BLOCKED":
        status = "BLOCKED";
        reason = `Verification BLOCKED: ${params.verificationResult.summary}. Cannot determine completion — blocked.`;
        break;
      case "INCONCLUSIVE":
      default:
        status = "INCONCLUSIVE";
        reason = `Verification INCONCLUSIVE: ${params.verificationResult.summary}. ${claimText ? `Model claim "${claimText.slice(0, 100)}" insufficient without verification.` : "Insufficient evidence to verify completion."}`;
        break;
    }

    return {
      id: createCompletionDecisionId(),
      objectiveId: params.objectiveId,
      taskId: params.taskId,
      runId: params.runId,
      status,
      modelClaim: claimText,
      verificationResultId: params.verificationResult.id,
      evidenceChainIds: params.evidenceChainIds ?? [],
      reason,
      timestamp: new Date().toISOString(),
      verifiedBy: "SYSTEM",
    };
  }

  /**
   * Check if model claim alone would be insufficient
   * Always true — model claim never proof
   */
  static isModelClaimSufficient(): boolean {
    return false; // Model claim NEVER sufficient
  }

  /**
   * Validate that completion decision is based on evidence, not claim
   */
  static validate(decision: CompletionDecision): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!decision.verificationResultId) {
      errors.push("Completion decision must reference verificationResultId");
    }
    if (decision.verifiedBy !== "SYSTEM") {
      errors.push("Completion decision must be verified by SYSTEM, not LLM");
    }
    if (!decision.reason) {
      errors.push("Completion decision must have reason");
    }
    return { valid: errors.length === 0, errors };
  }
}
