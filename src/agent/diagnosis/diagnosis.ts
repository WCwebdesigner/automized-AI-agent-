/**
 * Diagnosis Subsystem — Phase 5.2
 * Focused context, structured output, must reference actual evidence
 */

import { Diagnosis, Failure, createDiagnosisId } from "./types";
import { DiagnosisContext } from "./types";
import { ModelRouter, globalRouter } from "../model/router";
import { AgentLogger, globalLogger } from "../core/logger";
import type { ChatMessage } from "../model/types";
import { FailureClassifier } from "./classifier";
import { Evidence } from "../observation/types";

export class DiagnosisEngine {
  private router: ModelRouter;
  private logger: AgentLogger;

  constructor(router: ModelRouter = globalRouter, logger: AgentLogger = globalLogger) {
    this.router = router;
    this.logger = logger;
  }

  /**
   * Diagnose failure — deterministic classification + LLM assistance for root cause
   * Must reference actual evidence
   */
  async diagnose(failure: Failure, context: DiagnosisContext): Promise<Diagnosis> {
    // Deterministic part: category already from classifier
    const affectedFiles = this.extractAffectedFiles(context);
    const relevantEvidence = this.selectRelevantEvidence(context.evidence, failure);

    let rootCause: string;
    let recommendedRepair: string;
    let confidence: number;
    let isRecoverable: boolean;
    let requiresHumanDecision: boolean;

    if (this.router.getConfig().providerKind === "scripted") {
      const heuristic = this.heuristicDiagnosis(failure, context);
      rootCause = heuristic.rootCause;
      recommendedRepair = heuristic.recommendedRepair;
      confidence = heuristic.confidence;
      isRecoverable = heuristic.isRecoverable;
      requiresHumanDecision = heuristic.requiresHumanDecision;
    } else {
      try {
        const llmResult = await this.llmDiagnosis(failure, context);
        rootCause = llmResult.rootCause;
        recommendedRepair = llmResult.recommendedRepair;
        confidence = llmResult.confidence;
        isRecoverable = llmResult.isRecoverable;
        requiresHumanDecision = llmResult.requiresHumanDecision;
      } catch (err) {
        this.logger.log("WARN", "diagnosis_llm_failed", `LLM diagnosis failed, using heuristic: ${(err as Error).message}`, {
          taskId: context.taskId,
          objectiveId: context.objectiveId,
        });
        const heuristic = this.heuristicDiagnosis(failure, context);
        rootCause = heuristic.rootCause;
        recommendedRepair = heuristic.recommendedRepair;
        confidence = heuristic.confidence;
        isRecoverable = heuristic.isRecoverable;
        requiresHumanDecision = heuristic.requiresHumanDecision;
      }
    }

    // Ensure evidence referenced
    if (relevantEvidence.length === 0 && context.evidence.length > 0) {
      relevantEvidence.push(...context.evidence.slice(0, 3));
    }

    const diagnosis: Diagnosis = {
      id: createDiagnosisId(),
      failureId: failure.id,
      objectiveId: failure.objectiveId,
      taskId: failure.taskId,
      runId: failure.runId,
      failureCategory: failure.category,
      rootCause,
      confidence,
      affectedFiles,
      relevantEvidence,
      recommendedRepair,
      isRecoverable,
      requiresHumanDecision,
      timestamp: new Date().toISOString(),
      contextSummary: `Task ${context.taskDescription} failed with ${failure.category}: ${failure.message.slice(0, 200)}. Evidence: ${relevantEvidence.map((e) => e.type).join(", ")}`,
      previousRepairCount: context.previousRepairs?.length ?? 0,
    };

    this.logger.diagnosis(context.taskId, `${diagnosis.failureCategory} -> ${diagnosis.rootCause.slice(0, 200)} (recoverable: ${diagnosis.isRecoverable})`);

    return diagnosis;
  }

  private extractAffectedFiles(context: DiagnosisContext): string[] {
    const files = new Set<string>();
    for (const f of context.observation.affectedFiles) files.add(f);
    for (const f of Object.keys(context.fileContents ?? {})) files.add(f);
    for (const ev of context.evidence) {
      if (ev.filePath) files.add(ev.filePath);
    }
    // Parse failedAction for file paths like "run_python {"path":"broken.py"}"
    try {
      const fileMatch = context.failedAction.match(/([a-zA-Z0-9_\-./]+\.py)/);
      if (fileMatch) files.add(fileMatch[1]);
    } catch {}
    return [...files].slice(0, 10);
  }

  private selectRelevantEvidence(evidence: Evidence[], failure: Failure): Evidence[] {
    // Select evidence that directly relates to failure
    // Prioritize COMMAND_EXIT_CODE, STDERR, STDOUT, FILE_*
    const priority: Record<string, number> = {
      STDERR: 10,
      COMMAND_EXIT_CODE: 9,
      COMMAND_RESULT: 8,
      STDOUT: 7,
      FILE_EXISTS: 6,
      FILE_CONTENT: 5,
      TEST_RESULT: 8,
    };

    return [...evidence]
      .sort((a, b) => (priority[b.type] ?? 0) - (priority[a.type] ?? 0))
      .slice(0, 5);
  }

  private heuristicDiagnosis(
    failure: Failure,
    context: DiagnosisContext
  ): { rootCause: string; recommendedRepair: string; confidence: number; isRecoverable: boolean; requiresHumanDecision: boolean } {
    const lower = `${failure.message} ${context.stderr ?? ""} ${context.stdout ?? ""}`.toLowerCase();

    let rootCause = `Failure ${failure.category}: ${failure.message}`;
    let recommendedRepair = "Retry task or check file existence";
    let confidence = 0.6;
    let isRecoverable = failure.recoverability === "RECOVERABLE";
    let requiresHumanDecision = failure.recoverability === "REQUIRES_HUMAN";

    switch (failure.category) {
      case "SYNTAX_ERROR":
        rootCause = `Syntax error in ${context.observation.affectedFiles[0] ?? "file"}: ${failure.message}. Evidence: ${context.evidence.find((e) => e.type === "STDERR")?.message ?? "stderr shows syntax error"}`;
        recommendedRepair = `Fix syntax error in file ${context.observation.affectedFiles[0] ?? ""}. Check missing parentheses, quotes, or indentation. Referenced evidence: STDERR`;
        confidence = 0.9;
        isRecoverable = true;
        break;
      case "MISSING_FILE":
        rootCause = `Missing file: ${failure.message}. Evidence: FILE_EXISTS check failed`;
        recommendedRepair = `Create missing file. Evidence: ${context.evidence.map((e) => e.filePath).join(", ")}`;
        confidence = 0.85;
        isRecoverable = true;
        break;
      case "COMMAND_FAILURE":
        rootCause = `Command ${failure.toolName} failed with exit ${failure.exitCode}. Stdout: ${context.stdout?.slice(0, 200) ?? ""} Stderr: ${context.stderr?.slice(0, 200) ?? ""}. Evidence: COMMAND_EXIT_CODE=${failure.exitCode}, STDERR`;
        recommendedRepair = `Fix command failure. Check exit code ${failure.exitCode} and stderr. Evidence: COMMAND_EXIT_CODE, STDERR`;
        confidence = 0.8;
        break;
      case "TEST_FAILURE":
        rootCause = `Test failure: ${failure.message}. Evidence: TEST_RESULT, STDERR shows assertion`;
        recommendedRepair = `Fix failing test. Check assertion and implementation. Evidence: TEST_RESULT, STDERR`;
        confidence = 0.8;
        break;
      case "VERIFICATION_FAILURE":
        rootCause = `Verification failed: ${failure.message}. Evidence: VERIFICATION_RESULT`;
        recommendedRepair = `Address verification failure. Ensure expected output/files exist. Evidence: VERIFICATION_RESULT`;
        confidence = 0.85;
        break;
      case "PERMISSION_DENIED":
        rootCause = `Permission denied for ${failure.toolName}. Evidence: COMMAND_RESULT with permission error`;
        recommendedRepair = `Requires human decision: permission denied. Evidence: PERMISSION_DENIED`;
        confidence = 0.9;
        isRecoverable = false;
        requiresHumanDecision = true;
        break;
      case "SECURITY_VIOLATION":
        rootCause = `Security violation: ${failure.message}. Evidence: security check failed`;
        recommendedRepair = `Requires human: security violation. Do not auto-repair. Evidence: SECURITY_VIOLATION`;
        confidence = 0.95;
        isRecoverable = false;
        requiresHumanDecision = true;
        break;
      case "TIMEOUT":
        rootCause = `Timeout: ${failure.message}. Evidence: COMMAND_RESULT timed out`;
        recommendedRepair = `Retry with longer timeout or optimize command. Evidence: TIMEOUT`;
        confidence = 0.7;
        break;
      case "INVALID_OUTPUT":
        rootCause = `Invalid output: expected 12 but got ${context.stdout?.trim() ?? "different"}. Evidence: STDOUT shows ${context.stdout?.slice(0, 100) ?? ""}`;
        recommendedRepair = `Fix output to match expected. Evidence: STDOUT`;
        confidence = 0.85;
        break;
      default:
        rootCause = `${failure.category}: ${failure.message}. Evidence: ${context.evidence.map((e) => `${e.type}(${e.message.slice(0, 50)})`).join("; ")}`;
        recommendedRepair = `Investigate ${failure.category}. Check evidence: ${context.evidence.map((e) => e.type).join(", ")}`;
        break;
    }

    // Ensure rootCause references evidence types
    if (!rootCause.includes("Evidence:")) {
      rootCause += ` Evidence: ${context.evidence.slice(0, 2).map((e) => e.type).join(", ")}`;
    }

    return { rootCause, recommendedRepair, confidence, isRecoverable, requiresHumanDecision };
  }

  private async llmDiagnosis(
    failure: Failure,
    context: DiagnosisContext
  ): Promise<{ rootCause: string; recommendedRepair: string; confidence: number; isRecoverable: boolean; requiresHumanDecision: boolean }> {
    const evidenceSummary = context.evidence.map((e) => `- ${e.type} (${e.source}, conf=${e.confidence}): ${e.message}`).join("\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a failure diagnosis expert for an autonomous coding agent. You MUST reference actual evidence.

Failure: ${failure.category} - ${failure.message}
Tool: ${failure.toolName}
Exit code: ${failure.exitCode}
Stdout: ${context.stdout?.slice(0, 2000) ?? ""}
Stderr: ${context.stderr?.slice(0, 2000) ?? ""}
Affected files: ${context.observation.affectedFiles.join(", ")}
File contents: ${Object.entries(context.fileContents ?? {})
          .map(([p, c]) => `${p}: ${c.slice(0, 500)}`)
          .join("\n")}

Evidence (MUST reference):
${evidenceSummary}

Previous repairs: ${context.previousRepairs?.length ?? 0}

Respond with JSON only:
{
  "rootCause": "explanation MUST mention evidence types like STDERR, COMMAND_EXIT_CODE, etc",
  "recommendedRepair": "what to do, MUST reference evidence",
  "confidence": 0.0-1.0,
  "isRecoverable": boolean,
  "requiresHumanDecision": boolean
}`,
      },
      {
        role: "user",
        content: `Diagnose: ${failure.category} ${failure.message}. Task: ${context.taskDescription}. Must reference evidence.`,
      },
    ];

    const result = await this.router.diagnosis(messages, { temperature: 0.2, maxTokens: 800 });
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in diagnosis response");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      rootCause: parsed.rootCause ?? `Diagnosis for ${failure.category}`,
      recommendedRepair: parsed.recommendedRepair ?? "Retry",
      confidence: parsed.confidence ?? 0.5,
      isRecoverable: !!parsed.isRecoverable,
      requiresHumanDecision: !!parsed.requiresHumanDecision,
    };
  }
}

export const globalDiagnosisEngine = new DiagnosisEngine();
