/**
 * Recovery Loop — Phase 5
 * Loop EXECUTE->OBSERVE->VERIFY->FAIL->DIAGNOSE->REPAIR PLAN->APPLY REPAIR->RETRY->OBSERVE->VERIFY->SUCCESS/ESCALATION
 * State machine integration, observable/auditable
 */

import { randomUUID } from "node:crypto";
import { Task } from "../core/task";
import { AgentState } from "../core/constants";
import { AgentStateMachine } from "../core/stateMachine";
import { AgentLogger, globalLogger } from "../core/logger";
import { ModelRouter, globalRouter } from "../model/router";
import { globalToolRegistry } from "../tools/registry";
import { PermissionLevel, ToolResultStatus } from "../core/constants";
import { loadConfig } from "../config";
import { Observation, Evidence } from "../observation/types";
import { ObservationCollector } from "../observation/observation";
import { EvidenceFactory, observeToolExecution } from "../observation";
import { VerificationEngine, VerificationPlanParser, CompletionDecisionEngine } from "../verification";
import { VerificationPlan, VerificationResult } from "../verification/types";
import { FailureClassifier } from "../diagnosis/classifier";
import { DiagnosisEngine } from "../diagnosis/diagnosis";
import { RepairEngine } from "../diagnosis/repair";
import { SafeguardTracker } from "../diagnosis/safeguards";
import { EscalationEngine } from "../diagnosis/escalation";
import { ContextManager } from "../diagnosis/context";
import { Failure, Repair, Diagnosis, Escalation, RetryAttempt, createRetryId } from "../diagnosis/types";
import { StructuredToolResult } from "../tools/registry";

export interface RecoveryLoopResult {
  success: boolean;
  finalTask: Task;
  observations: Observation[];
  evidence: Evidence[];
  failures: Failure[];
  diagnoses: Diagnosis[];
  repairs: Repair[];
  retryAttempts: RetryAttempt[];
  verificationResults: VerificationResult[];
  escalation?: Escalation;
  finalOutput?: string;
}

export class RecoveryLoop {
  private logger: AgentLogger;
  private router: ModelRouter;
  private verificationEngine: VerificationEngine;
  private diagnosisEngine: DiagnosisEngine;
  private repairEngine: RepairEngine;
  private safeguardTracker: SafeguardTracker;
  private escalationEngine: EscalationEngine;
  private contextManager: ContextManager;
  private config = loadConfig();

  constructor(
    logger: AgentLogger = globalLogger,
    router: ModelRouter = globalRouter,
    verificationEngineOrDecisionEngine?: any,
    diagnosisEngineOrStateMachine?: any,
    repairEngine?: RepairEngine,
    safeguardTracker?: SafeguardTracker,
    escalationEngine?: EscalationEngine,
    contextManager?: ContextManager
  ) {
    this.logger = logger;
    this.router = router;
    // Handle overloaded constructor from agentCore: (logger, router, verificationEngine, decisionEngine, stateMachine)
    let verificationEngine: VerificationEngine | undefined;
    if (verificationEngineOrDecisionEngine instanceof VerificationEngine) {
      verificationEngine = verificationEngineOrDecisionEngine;
    } else if (verificationEngineOrDecisionEngine && typeof verificationEngineOrDecisionEngine.executePlan === "function") {
      verificationEngine = verificationEngineOrDecisionEngine;
    }
    this.verificationEngine = verificationEngine ?? new VerificationEngine(logger);
    // diagnosisEngine may be passed as 4th arg or is actually stateMachine — handle gracefully
    let diagnosisEngine: DiagnosisEngine | undefined;
    if (diagnosisEngineOrStateMachine && typeof diagnosisEngineOrStateMachine.diagnose === "function") {
      diagnosisEngine = diagnosisEngineOrStateMachine;
    }
    this.diagnosisEngine = diagnosisEngine ?? new DiagnosisEngine(router, logger);
    this.repairEngine = repairEngine ?? new RepairEngine(router, logger);
    this.safeguardTracker = safeguardTracker ?? new SafeguardTracker();
    this.escalationEngine = escalationEngine ?? new EscalationEngine(logger);
    this.contextManager = contextManager ?? new ContextManager();
  }

  /**
   * Execute task with full recovery loop — deterministic state machine
   */
  async executeWithRecovery(params: {
    task: Task;
    objectiveId: string;
    objectiveText: string;
    runId: string;
    workspaceRoot: string;
    stateMachine?: AgentStateMachine;
    verificationPlan?: VerificationPlan;
    maxAttempts?: number;
  }): Promise<RecoveryLoopResult> {
    const runId = params.runId ?? randomUUID();
    const workspaceRoot = params.workspaceRoot ?? this.config.workspaceRoot;
    const maxAttempts = params.maxAttempts ?? this.config.safety.maxAttempts;

    const observations: Observation[] = [];
    const evidence: Evidence[] = [];
    const failures: Failure[] = [];
    const diagnoses: Diagnosis[] = [];
    const repairs: Repair[] = [];
    const retryAttempts: RetryAttempt[] = [];
    const verificationResults: VerificationResult[] = [];

    let currentTask = params.task;
    let attempt = 0;
    let lastFailure: Failure | undefined;
    let lastDiagnosis: Diagnosis | undefined;

    // Initial state
    if (params.stateMachine) {
      params.stateMachine.transition(AgentState.EXECUTING, `Executing task ${currentTask.id}`, {
        objectiveId: params.objectiveId,
        taskId: currentTask.id,
      });
    }

    while (attempt < maxAttempts) {
      attempt++;

      // EXECUTE
      this.logger.taskStarted(params.objectiveId, currentTask.id, currentTask.selectedTool);

      if (params.stateMachine) {
        params.stateMachine.transition(AgentState.EXECUTING, `Attempt ${attempt} for task ${currentTask.id}`, {
          objectiveId: params.objectiveId,
          taskId: currentTask.id,
        });
      }

      const toolName = currentTask.selectedTool ?? "list_directory";
      const toolArgs = currentTask.toolArguments ?? {};

      const toolResult = await globalToolRegistry.execute(toolName, toolArgs, {
        workspaceRoot,
        permissionLevel: PermissionLevel.DESTRUCTIVE,
        objectiveId: params.objectiveId,
        taskId: currentTask.id,
        runId,
      });

      // OBSERVE — normalized observation per tool execution
      if (params.stateMachine) {
        params.stateMachine.transition(AgentState.OBSERVING, `Observing tool ${toolName}`, {
          objectiveId: params.objectiveId,
          taskId: currentTask.id,
        });
      }

      const { observation, evidence: newEvidence } = await observeToolExecution(
        params.objectiveId,
        currentTask.id,
        runId,
        toolName,
        toolResult,
        toolResult.executionTimeMs,
        workspaceRoot,
        randomUUID()
      );

      observations.push(observation);
      evidence.push(...newEvidence);

      this.logger.toolExecuted(currentTask.id, toolName, toolResult, toolResult.executionTimeMs);
      this.logger.toolResult(currentTask.id, toolName, toolResult.status, toolResult.output);

      // Check if tool succeeded
      if (toolResult.status === ToolResultStatus.SUCCESS) {
        // VERIFY — even on success, verify output if plan provided
        if (params.stateMachine) {
          params.stateMachine.transition(AgentState.VERIFYING, `Verifying task ${currentTask.id}`, {
            objectiveId: params.objectiveId,
            taskId: currentTask.id,
          });
        }

        let verificationResult: VerificationResult | undefined;
        if (params.verificationPlan) {
          verificationResult = await this.verificationEngine.executePlan(params.verificationPlan, {
            workspaceRoot,
            runId,
            observations: observations.map((o) => ({ stdout: o.stdout, output: o.outputCombined, outputCombined: o.outputCombined })),
            evidence,
          });
          verificationResults.push(verificationResult);

          if (!verificationResult.passed) {
            // Verification failed — treat as failure
            const failure = FailureClassifier.classify({
              objectiveId: params.objectiveId,
              taskId: currentTask.id,
              runId,
              actionId: observation.actionId,
              observation,
              evidence: newEvidence,
              verificationResult,
              toolName,
            });
            failures.push(failure);
            lastFailure = failure;

            // Check safeguards
            const consecutive = this.safeguardTracker.checkConsecutiveFailures(currentTask.id, failure);
            if (consecutive.isLoop) {
              const escalation = this.escalationEngine.escalate({
                reason: `Consecutive identical failures detected: ${consecutive.count} times`,
                failure,
                diagnosis: lastDiagnosis,
                attemptedRepairs: repairs,
                failedVerificationResults: verificationResults,
                evidence,
                objectiveId: params.objectiveId,
                taskId: currentTask.id,
                runId,
              });
              if (params.stateMachine) {
                params.stateMachine.transition(AgentState.ESCALATED, `Escalated after ${consecutive.count} identical failures`, {
                  objectiveId: params.objectiveId,
                  taskId: currentTask.id,
                });
              }
              return {
                success: false,
                finalTask: { ...currentTask, status: "FAILED" as any, error: failure.message },
                observations,
                evidence,
                failures,
                diagnoses,
                repairs,
                retryAttempts,
                verificationResults,
                escalation,
              };
            }

            // Continue to diagnosis
          } else {
            // Verification passed — SUCCESS
            if (params.stateMachine) {
              params.stateMachine.transition(AgentState.COMPLETED, `Task ${currentTask.id} verified`, {
                objectiveId: params.objectiveId,
                taskId: currentTask.id,
              });
            }
            const completedTask = { ...currentTask, status: "COMPLETED" as any, result: toolResult };
            return {
              success: true,
              finalTask: completedTask,
              observations,
              evidence,
              failures,
              diagnoses,
              repairs,
              retryAttempts,
              verificationResults,
              finalOutput: toolResult.stdout ?? toolResult.output,
            };
          }
        } else {
          // No verification plan — success if tool succeeded
          if (params.stateMachine) {
            params.stateMachine.transition(AgentState.COMPLETED, `Task ${currentTask.id} completed`, {
              objectiveId: params.objectiveId,
              taskId: currentTask.id,
            });
          }
          const completedTask = { ...currentTask, status: "COMPLETED" as any, result: toolResult };
          return {
            success: true,
            finalTask: completedTask,
            observations,
            evidence,
            failures,
            diagnoses,
            repairs,
            retryAttempts,
            verificationResults,
            finalOutput: toolResult.stdout ?? toolResult.output,
          };
        }
      }

      // FAILURE PATH — tool failed or verification failed
      const failureInput = {
        objectiveId: params.objectiveId,
        taskId: currentTask.id,
        runId,
        actionId: observation.actionId,
        observation,
        evidence: newEvidence,
        verificationResult: verificationResults[verificationResults.length - 1],
        toolName,
      };

      const failure = lastFailure ?? FailureClassifier.classify(failureInput);
      if (!failures.includes(failure)) {
        failures.push(failure);
      }
      lastFailure = failure;

      // Check if should escalate immediately
      const escalationCheck = this.escalationEngine.shouldEscalate({
        reason: failure.message,
        failure,
        diagnosis: lastDiagnosis,
        attemptedRepairs: repairs,
        failedVerificationResults: verificationResults,
        evidence,
        objectiveId: params.objectiveId,
        taskId: currentTask.id,
        runId,
      });

      if (escalationCheck.should) {
        const escalation = this.escalationEngine.escalate({
          reason: escalationCheck.reason,
          failure,
          diagnosis: lastDiagnosis,
          attemptedRepairs: repairs,
          failedVerificationResults: verificationResults,
          evidence,
          objectiveId: params.objectiveId,
          taskId: currentTask.id,
          runId,
        });
        if (params.stateMachine) {
          params.stateMachine.transition(AgentState.ESCALATED, escalation.reason, {
            objectiveId: params.objectiveId,
            taskId: currentTask.id,
          });
        }
        return {
          success: false,
          finalTask: { ...currentTask, status: "FAILED" as any, error: failure.message },
          observations,
          evidence,
          failures,
          diagnoses,
          repairs,
          retryAttempts,
          verificationResults,
          escalation,
        };
      }

      // DIAGNOSE
      if (params.stateMachine) {
        params.stateMachine.transition(AgentState.DIAGNOSING, `Diagnosing failure for ${currentTask.id}`, {
          objectiveId: params.objectiveId,
          taskId: currentTask.id,
        });
      }

      // Extract file path from tool args for better diagnosis context
      const filePathsFromArgs: string[] = [];
      if (toolArgs && typeof toolArgs === "object") {
        const argsObj = toolArgs as any;
        if (argsObj.path) filePathsFromArgs.push(argsObj.path);
        if (argsObj.filePath) filePathsFromArgs.push(argsObj.filePath);
        if (argsObj.from) filePathsFromArgs.push(argsObj.from);
      }
      const filePathsToInclude = [...new Set([...observation.affectedFiles, ...filePathsFromArgs])];

      const diagnosisContext = this.contextManager.buildDiagnosisContext({
        objective: params.objectiveText,
        objectiveId: params.objectiveId,
        taskDescription: currentTask.description,
        taskId: currentTask.id,
        runId,
        failedAction: `${toolName} ${JSON.stringify(toolArgs)}`,
        observation: {
          ...observation,
          affectedFiles: filePathsToInclude, // ensure affected files include args path
        },
        verificationResult: verificationResults[verificationResults.length - 1],
        workspaceRoot,
        evidence,
        recentChanges: [],
        previousRepairs: repairs,
        filePathsToInclude,
      });

      const diagnosis = await this.diagnosisEngine.diagnose(failure, diagnosisContext);
      diagnoses.push(diagnosis);
      lastDiagnosis = diagnosis;

      if (!diagnosis.isRecoverable || diagnosis.requiresHumanDecision) {
        const escalation = this.escalationEngine.escalate({
          reason: diagnosis.requiresHumanDecision ? `Requires human decision: ${diagnosis.rootCause}` : `Non-recoverable: ${diagnosis.rootCause}`,
          failure,
          diagnosis,
          attemptedRepairs: repairs,
          failedVerificationResults: verificationResults,
          evidence,
          objectiveId: params.objectiveId,
          taskId: currentTask.id,
          runId,
        });
        if (params.stateMachine) {
          params.stateMachine.transition(AgentState.ESCALATED, escalation.reason, {
            objectiveId: params.objectiveId,
            taskId: currentTask.id,
          });
        }
        return {
          success: false,
          finalTask: { ...currentTask, status: "FAILED" as any, error: failure.message },
          observations,
          evidence,
          failures,
          diagnoses,
          repairs,
          retryAttempts,
          verificationResults,
          escalation,
        };
      }

      // REPAIR PLAN
      if (params.stateMachine) {
        params.stateMachine.transition(AgentState.REPAIRING, `Repairing task ${currentTask.id}`, {
          objectiveId: params.objectiveId,
          taskId: currentTask.id,
        });
      }

      const repair = await this.repairEngine.createRepair(diagnosis, {
        workspaceRoot,
        objectiveId: params.objectiveId,
        taskId: currentTask.id,
        runId,
      });

      // Safeguards check
      const canRepair = this.safeguardTracker.canAttemptRepair(currentTask.id, params.objectiveId, repair, evidence.map((e) => e.id));
      if (!canRepair.allowed) {
        const escalation = this.escalationEngine.escalate({
          reason: `Safeguard blocked repair: ${canRepair.reason}`,
          failure,
          diagnosis,
          attemptedRepairs: repairs,
          failedVerificationResults: verificationResults,
          evidence,
          objectiveId: params.objectiveId,
          taskId: currentTask.id,
          runId,
        });
        if (params.stateMachine) {
          params.stateMachine.transition(AgentState.ESCALATED, escalation.reason, {
            objectiveId: params.objectiveId,
            taskId: currentTask.id,
          });
        }
        return {
          success: false,
          finalTask: { ...currentTask, status: "FAILED" as any, error: canRepair.reason },
          observations,
          evidence,
          failures,
          diagnoses,
          repairs,
          retryAttempts,
          verificationResults,
          escalation,
        };
      }

      // APPLY REPAIR — via tool system, policy->tool->observation->change tracking
      const repairResult = await this.repairEngine.executeRepair(repair, {
        workspaceRoot,
        objectiveId: params.objectiveId,
        taskId: currentTask.id,
        runId,
      });

      repairs.push(repairResult.repair);
      this.safeguardTracker.recordRepairAttempt(currentTask.id, params.objectiveId, repair, evidence.map((e) => e.id));

      if (repairResult.observation) {
        observations.push(repairResult.observation);
        evidence.push(...EvidenceFactory.fromObservation(repairResult.observation));
      }

      // RETRY — retry original task, observe, verify (not assume success)
      if (params.stateMachine) {
        params.stateMachine.transition(AgentState.RETRYING, `Retrying task ${currentTask.id} attempt ${attempt + 1}`, {
          objectiveId: params.objectiveId,
          taskId: currentTask.id,
        });
      }

      const retryAttempt: RetryAttempt = {
        id: createRetryId(),
        objectiveId: params.objectiveId,
        taskId: currentTask.id,
        runId,
        attemptNumber: attempt,
        repairId: repair.id,
        failureId: failure.id,
        observationId: repairResult.observation?.id,
        success: repairResult.success,
        timestamp: new Date().toISOString(),
      };
      retryAttempts.push(retryAttempt);

      if (!repairResult.success) {
        // Repair itself failed, continue loop to try again or escalate
        this.logger.log("WARN", "repair_failed", `Repair failed for ${currentTask.id}: ${repairResult.repair.executionResult?.message}`, {
          taskId: currentTask.id,
        });
      }

      // Loop continues — will re-execute original task in next iteration
      // Reset consecutive failures if repair succeeded
      if (repairResult.success) {
        this.safeguardTracker.resetConsecutiveFailures(currentTask.id);
      }

      // Update task attempt count
      currentTask = { ...currentTask, attempts: attempt } as any;
    }

    // Max attempts exhausted
    const escalation = this.escalationEngine.escalate({
      reason: `Max attempts ${maxAttempts} exhausted for task ${currentTask.id}`,
      failure: lastFailure!,
      diagnosis: lastDiagnosis,
      attemptedRepairs: repairs,
      failedVerificationResults: verificationResults,
      evidence,
      objectiveId: params.objectiveId,
      taskId: currentTask.id,
      runId,
    });

    if (params.stateMachine) {
      params.stateMachine.transition(AgentState.FAILED, `Max attempts exhausted`, {
        objectiveId: params.objectiveId,
        taskId: currentTask.id,
      });
    }

    return {
      success: false,
      finalTask: { ...currentTask, status: "FAILED" as any, error: `Max attempts ${maxAttempts} exhausted` },
      observations,
      evidence,
      failures,
      diagnoses,
      repairs,
      retryAttempts,
      verificationResults,
      escalation,
    };
  }

  /**
   * Recovery loop for full objective — used by AgentCore
   * Attempts to repair failed tasks and re-verify
   */
  async executeRecoveryLoop(
    objective: any,
    allTasks: Task[],
    verificationPlan: VerificationPlan,
    verificationResult: VerificationResult,
    existingObservations: Observation[],
    existingEvidence: Evidence[],
    objectiveId: string,
    runId: string,
    onObservation?: (obs: Observation, ev: Evidence[]) => void,
    onTaskUpdate?: (task: Task) => void,
    workspaceRoot?: string
  ): Promise<{
    success: boolean;
    observations: Observation[];
    evidence: Evidence[];
    failures: Failure[];
    diagnoses: Diagnosis[];
    repairs: Repair[];
    repairedTasks: Task[];
    finalVerification?: VerificationResult;
    attempts: number;
    escalation?: Escalation;
  }> {
    const root = workspaceRoot ?? this.config.workspaceRoot;
    const failedTasks = allTasks.filter((t: any) => t.status === "FAILED" || t.status === "failed");

    // If no failed tasks but verification failed, treat verification failure as needing repair
    const tasksToRepair = failedTasks.length > 0 ? failedTasks : allTasks.slice(-1);

    const observations: Observation[] = [];
    const evidence: Evidence[] = [];
    const failures: Failure[] = [];
    const diagnoses: Diagnosis[] = [];
    const repairs: Repair[] = [];
    const repairedTasks: Task[] = [];
    let attempts = 0;
    let finalVerification: VerificationResult | undefined = verificationResult;
    let escalation: Escalation | undefined;

    // Try to repair each failed task
    for (const failedTask of tasksToRepair) {
      attempts++;
      const result = await this.executeWithRecovery({
        task: failedTask,
        objectiveId,
        objectiveText: objective?.objective ?? objective?.description ?? "unknown objective",
        runId,
        workspaceRoot: root,
        verificationPlan,
        maxAttempts: this.config.safety.maxRepairAttemptsPerTask,
      });

      observations.push(...result.observations);
      evidence.push(...result.evidence);
      failures.push(...result.failures);
      diagnoses.push(...result.diagnoses);
      repairs.push(...result.repairs);

      if (result.observations.length > 0 && onObservation) {
        for (const obs of result.observations) {
          const ev = EvidenceFactory.fromObservation(obs);
          onObservation(obs, ev);
        }
      }

      if (result.success) {
        repairedTasks.push(result.finalTask as any);
        // Re-verify after repair
        try {
          const allObs = [...existingObservations, ...observations];
          const allEv = [...existingEvidence, ...evidence];
          finalVerification = await this.verificationEngine.executePlan(verificationPlan, {
            workspaceRoot: root,
            runId,
            observations: allObs.map((o: any) => ({ stdout: o.stdout, output: o.outputCombined, outputCombined: o.outputCombined })),
            evidence: allEv,
          });
          if (finalVerification.passed) {
            return {
              success: true,
              observations,
              evidence,
              failures,
              diagnoses,
              repairs,
              repairedTasks,
              finalVerification,
              attempts,
              escalation: undefined,
            };
          }
        } catch (err) {
          // Verification after repair failed, continue
        }
      } else {
        if (result.escalation) {
          escalation = result.escalation;
          break;
        }
      }

      if (onTaskUpdate) {
        onTaskUpdate(result.finalTask as any);
      }
    }

    // If we repaired something but verification still fails, return failure
    // If no repair succeeded, return with escalation or failure
    if (repairedTasks.length === 0 && !escalation) {
      // Create escalation for repair failure
      escalation = this.escalationEngine.escalate({
        reason: `Recovery loop failed to repair ${failedTasks.length} failed tasks`,
        failure: failures[0],
        diagnosis: diagnoses[0],
        attemptedRepairs: repairs,
        failedVerificationResults: [verificationResult, ...(finalVerification ? [finalVerification] : [])],
        evidence: [...existingEvidence, ...evidence],
        objectiveId,
        taskId: failedTasks[0]?.id ?? "unknown",
        runId,
      });
    }

    return {
      success: false,
      observations,
      evidence,
      failures,
      diagnoses,
      repairs,
      repairedTasks,
      finalVerification,
      attempts,
      escalation,
    };
  }
}

export const globalRecoveryLoop = new RecoveryLoop();

