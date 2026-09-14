/**
 * Agent Core — Phase 1-5
 * Full loop with observation, evidence, verification, diagnosis, repair, recovery, completion decision
 * OBJECTIVE->PLAN(with verification JSON)->EXECUTE->OBSERVE->EVIDENCE->VERIFY->DECISION->CLASSIFY->DIAGNOSE->REPAIR->SAFEGUARDS->APPLY->RETRY->SUCCESS/ESCALATION
 */

import { randomUUID } from "node:crypto";
import { AgentState, ObjectiveStatus, TaskStatus } from "./constants";
import { AgentStateMachine } from "./stateMachine";
import { AgentLogger, globalLogger } from "./logger";
import { Objective, createObjective, updateObjective } from "./objective";
import { Task } from "./task";
import { Planner, globalPlanner } from "../planning/planner";
import { ExecutionEngine, globalExecutor } from "../execution/executor";
import { Verifier, globalVerifier } from "../verification/verifier";
import { RecoverySystem, globalRecovery } from "../recovery/recovery";
import { RecoveryLoop } from "../recovery/recoveryLoop";
import { ModelRouter, globalRouter } from "../model/router";
import { StatePersistence, globalPersistence } from "../state/persistence";
import { loadConfig } from "../config";
import { VerificationEngine, VerificationPlanParser, CompletionDecisionEngine } from "../verification";
import { VerificationPlan, VerificationResult, CompletionDecision } from "../verification/types";
import { ObservationCollector } from "../observation/observation";
import { EvidenceFactory } from "../observation/evidence";
import { Observation, Evidence } from "../observation/types";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import "../tools/engineering";

export interface AgentCoreConfig {
  workspaceRoot: string;
  maxSteps: number;
  maxRetries: number;
  persistenceEnabled: boolean;
}

export interface ExecutionReport {
  objectiveId: string;
  objective: string;
  status: ObjectiveStatus;
  agentState: AgentState;
  tasksTotal: number;
  tasksCompleted: number;
  tasksFailed: number;
  progress: number;
  finalResult?: string;
  verification?: VerificationResult;
  completionDecision?: CompletionDecision;
  // Compatibility fields for E2E tests expecting Phase 4-5 structure
  verificationPlan?: VerificationPlan;
  verificationResults?: VerificationResult[];
  evidenceChain?: Evidence[];
  observations: Observation[];
  evidence: Evidence[];
  executionTimeMs: number;
  logs: number;
  stateHistory: Array<{ from: AgentState; to: AgentState; timestamp: string; reason?: string }>;
  filesCreated: string[];
  changeTracking: Array<{
    objectiveId: string;
    taskId: string;
    fileChanged: string;
    operation: string;
    timestamp: string;
    modelResponsible?: string;
  }>;
  gitInfo?: {
    branch?: string;
    changedFiles?: string[];
    diffStat?: string;
  };
  escalations: any[];
  recoveryAttempts: number;
}

export class AgentCore {
  private stateMachine: AgentStateMachine;
  private logger: AgentLogger;
  private planner: Planner;
  private executor: ExecutionEngine;
  private verifier: Verifier;
  private recovery: RecoverySystem;
  private recoveryLoop: RecoveryLoop;
  private verificationEngine: VerificationEngine;
  private decisionEngine: CompletionDecisionEngine;
  private router: ModelRouter;
  private persistence: StatePersistence;
  private config: AgentCoreConfig;
  private rawConfig = loadConfig();

  constructor(
    config?: Partial<AgentCoreConfig>,
    deps?: {
      stateMachine?: AgentStateMachine;
      logger?: AgentLogger;
      planner?: Planner;
      executor?: ExecutionEngine;
      verifier?: Verifier;
      recovery?: RecoverySystem;
      router?: ModelRouter;
      persistence?: StatePersistence;
      verificationEngine?: VerificationEngine;
      recoveryLoop?: RecoveryLoop;
    }
  ) {
    this.config = {
      workspaceRoot: config?.workspaceRoot ?? this.rawConfig.workspaceRoot,
      maxSteps: config?.maxSteps ?? this.rawConfig.safety.maxSteps,
      maxRetries: config?.maxRetries ?? this.rawConfig.safety.maxAttempts,
      persistenceEnabled: config?.persistenceEnabled ?? true,
    };

    this.logger = deps?.logger ?? globalLogger;
    this.router = deps?.router ?? globalRouter;
    this.stateMachine = deps?.stateMachine ?? new AgentStateMachine(AgentState.IDLE, this.logger);
    this.planner = deps?.planner ?? new Planner(this.router, this.logger);
    this.recovery = deps?.recovery ?? new RecoverySystem(this.logger, this.router);
    this.executor = deps?.executor ?? new ExecutionEngine(this.logger, this.router, this.recovery);
    this.verifier = deps?.verifier ?? new Verifier(this.logger);
    this.persistence = deps?.persistence ?? globalPersistence;
    this.verificationEngine = deps?.verificationEngine ?? new VerificationEngine(this.logger);
    this.decisionEngine = new CompletionDecisionEngine();
    this.recoveryLoop = deps?.recoveryLoop ?? new RecoveryLoop(this.logger as any, this.router as any, this.verificationEngine as any, this.decisionEngine as any, this.stateMachine as any);

    try {
      fs.mkdirSync(this.config.workspaceRoot, { recursive: true });
    } catch {}
  }

  getState(): AgentState {
    return this.stateMachine.getState();
  }

  getStateMachine(): AgentStateMachine {
    return this.stateMachine;
  }

  /**
   * Main entry: receive high-level objective and complete it with full Phase 4-5 loop
   */
  async executeObjective(objectiveText: string, title?: string): Promise<ExecutionReport> {
    const startTime = Date.now();
    const objectiveId = randomUUID();
    const runId = randomUUID();

    this.logger.objectiveReceived(objectiveId, objectiveText);
    this.stateMachine.transition(AgentState.PLANNING, `Received objective: ${objectiveText.slice(0, 100)}`, {
      objectiveId,
    });

    // UNDERSTAND + PLAN
    let objective: Objective;
    let planTasks: Task[] = [];
    let verificationPlan: VerificationPlan;

    try {
      const { objective: plannedObj, plan } = await this.planner.createObjectiveWithPlan(objectiveText, title);
      objective = {
        ...plannedObj,
        id: objectiveId,
        status: ObjectiveStatus.PLANNING,
      };
      planTasks = objective.tasks;

      // Generate verification plan from objective
      verificationPlan = VerificationPlanParser.fromObjective(objectiveText, objectiveId);
      // Merge planner's verification if present
      if (plan.verificationPlan) {
        try {
          const parsed = VerificationPlanParser.parse(JSON.stringify(plan.verificationPlan));
          if (parsed.checks.length > 0) {
            verificationPlan = parsed;
          }
        } catch {
          // Use heuristic plan
        }
      }

      this.logger.planGenerated(objectiveId, plan.reasoning, plan.tasks.length);
      this.logger.info("verification_plan_generated", `Verification plan with ${verificationPlan.checks.length} checks`, {
        objectiveId,
        verificationPlanId: verificationPlan.id,
      });

      if (this.config.persistenceEnabled) {
        this.persistence.saveObjective(objective);
        this.persistence.saveVerificationPlan(verificationPlan);
      }
    } catch (err) {
      this.stateMachine.transition(AgentState.FAILED, `Planning failed: ${(err as Error).message}`, {
        objectiveId,
      });
      return this.createReport(objectiveId, objectiveText, ObjectiveStatus.FAILED, startTime, [], `Planning failed: ${(err as Error).message}`, undefined, undefined, [], [], 0, [], [], undefined, undefined);
    }

    // EXECUTE with observation
    this.stateMachine.transition(AgentState.EXECUTING, "Starting task execution", { objectiveId });
    objective = updateObjective(objective, { status: ObjectiveStatus.EXECUTING });

    const filesCreated: string[] = [];
    const changeTracking: ExecutionReport["changeTracking"] = [];
    const allObservations: Observation[] = [];
    const allEvidence: Evidence[] = [];

    const onTaskUpdate = (task: Task) => {
      if (task.result?.affectedFiles) {
        for (const f of task.result.affectedFiles) {
          if (!filesCreated.includes(f)) filesCreated.push(f);
        }
      }
      if (task.fileChanged || task.result?.affectedFiles?.[0]) {
        changeTracking.push({
          objectiveId,
          taskId: task.id,
          fileChanged: task.fileChanged ?? task.result?.affectedFiles?.[0] ?? "unknown",
          operation: task.operation ?? task.selectedTool ?? "unknown",
          timestamp: new Date().toISOString(),
          modelResponsible: task.modelResponsible ?? this.router.getModelForTaskType("coding"),
        });
      }
      if (this.config.persistenceEnabled) {
        this.persistence.saveTask(task);
      }
    };

    // Collect observations via executor callback
    const onObservation = (obs: Observation, ev: Evidence[]) => {
      allObservations.push(obs);
      allEvidence.push(...ev);
      if (this.config.persistenceEnabled) {
        this.persistence.saveObservation(obs);
        for (const e of ev) this.persistence.saveEvidence(e);
      }
    };

    let executionResult: { completed: Task[]; failed: Task[]; all: Task[] } = { completed: [], failed: [], all: [] };

    try {
      executionResult = await this.executor.executeTasksWithObservation(
        planTasks,
        this.stateMachine,
        onTaskUpdate,
        onObservation,
        objectiveId,
        runId
      );
      objective = {
        ...objective,
        tasks: executionResult.all,
        completedTasks: executionResult.completed.map((t) => t.id),
        failedTasks: executionResult.failed.map((t) => t.id),
      };
    } catch (err) {
      this.stateMachine.transition(AgentState.FAILED, `Execution failed: ${(err as Error).message}`, {
        objectiveId,
      });
      objective = updateObjective(objective, { status: ObjectiveStatus.FAILED, error: (err as Error).message });
      if (this.config.persistenceEnabled) this.persistence.saveObjective(objective);
      return this.createReport(objectiveId, objectiveText, ObjectiveStatus.FAILED, startTime, filesCreated, `Execution failed: ${(err as Error).message}`, undefined, undefined, allObservations, allEvidence, 0, [], changeTracking, executionResult as any, verificationPlan);
    }

    // VERIFY — deterministic, independent from LLM
    this.stateMachine.transition(AgentState.VERIFYING, "Verifying objective completion", { objectiveId });
    objective = updateObjective(objective, { status: ObjectiveStatus.VERIFYING });

    let verificationResult: VerificationResult;
    let completionDecision: CompletionDecision;

    try {
      verificationResult = await this.verificationEngine.executePlan(verificationPlan, objectiveId, allObservations, allEvidence);
      
      // If there are failed tasks, override verification to FAILED
      if (executionResult.failed.length > 0) {
        verificationResult = {
          ...verificationResult,
          status: "FAILED" as any,
          passed: false,
          summary: `Tasks failed: ${executionResult.failed.length}, verification: ${verificationResult.summary}`,
        };
      }

      if (this.config.persistenceEnabled) {
        this.persistence.saveVerificationResult(verificationResult);
        const checksToSave = verificationResult.checkResults ?? verificationResult.checks ?? [];
        for (const cr of checksToSave) {
          this.persistence.saveVerificationCheck(cr);
        }
      }

      // Completion decision: model claim is only CLAIM, system evaluates verification plan -> VERIFIED/FAILED/INCONCLUSIVE/BLOCKED
      const modelClaim = executionResult.failed.length === 0 ? "I believe complete" : "Failed";
      completionDecision = this.decisionEngine.decide(objectiveId, verificationPlan.id, verificationResult, modelClaim, allEvidence);

      if (this.config.persistenceEnabled) {
        this.persistence.saveCompletionDecision(completionDecision);
      }

      this.logger.info("verification_completed", `Verification ${verificationResult.status}, Decision ${completionDecision.status}`, {
        objectiveId,
        verificationStatus: verificationResult.status,
        decisionStatus: completionDecision.status,
      });
    } catch (err) {
      verificationResult = {
        id: randomUUID(),
        planId: verificationPlan.id,
        objectiveId,
        runId,
        status: "FAILED" as any,
        passed: false,
        checks: [],
        checkResults: [],
        summary: `Verification error: ${(err as Error).message}`,
        timestamp: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
      } as VerificationResult;
      completionDecision = this.decisionEngine.decide(objectiveId, verificationPlan.id, verificationResult, "I believe complete", allEvidence);
    }

    // If verification FAILED, attempt recovery loop
    if (completionDecision.status !== "VERIFIED") {
      this.logger.info("verification_failed_entering_recovery", `Entering recovery loop, decision: ${completionDecision.status}`, {
        objectiveId,
        decisionStatus: completionDecision.status,
      });

      // Use recoveryLoop for automatic repair
      const recoveryResult = await this.recoveryLoop.executeRecoveryLoop(
        objective,
        executionResult.all,
        verificationPlan,
        verificationResult,
        allObservations,
        allEvidence,
        objectiveId,
        runId,
        onObservation,
        onTaskUpdate,
        this.config.workspaceRoot
      );

      // Merge recovery observations
      allObservations.push(...recoveryResult.observations);
      allEvidence.push(...recoveryResult.evidence);

      if (recoveryResult.success && recoveryResult.finalVerification) {
        verificationResult = recoveryResult.finalVerification;
        completionDecision = this.decisionEngine.decide(objectiveId, verificationPlan.id, verificationResult, "I believe complete after repair", allEvidence);
        if (this.config.persistenceEnabled) {
          this.persistence.saveVerificationResult(verificationResult);
          this.persistence.saveCompletionDecision(completionDecision);
        }
      }

      // Update executionResult with recovery tasks
      if (recoveryResult.repairedTasks.length > 0) {
        executionResult = {
          completed: [...executionResult.completed, ...recoveryResult.repairedTasks.filter(t => t.status === TaskStatus.COMPLETED)],
          failed: recoveryResult.repairedTasks.filter(t => t.status === TaskStatus.FAILED),
          all: [...executionResult.all, ...recoveryResult.repairedTasks],
        };
      }

      if (recoveryResult.escalation) {
        this.stateMachine.transition(AgentState.ESCALATED, `Escalated: ${recoveryResult.escalation.reason}`, { objectiveId });
        objective = updateObjective(objective, { status: ObjectiveStatus.ESCALATED, error: recoveryResult.escalation.reason });
        if (this.config.persistenceEnabled) this.persistence.saveObjective(objective);

        return this.createReport(
          objectiveId,
          objectiveText,
          ObjectiveStatus.ESCALATED,
          startTime,
          filesCreated,
          `Escalated: ${recoveryResult.escalation.reason}. Recommended: ${recoveryResult.escalation.recommendedHumanAction}`,
          verificationResult,
          completionDecision,
          allObservations,
          allEvidence,
          recoveryResult.attempts,
          recoveryResult.escalation ? [recoveryResult.escalation] : [],
          changeTracking,
          executionResult,
          verificationPlan
        );
      }
    }

    // COMPLETE / FAILED based on verification, not model claim alone
    const finalStatus = completionDecision.status === "VERIFIED" ? ObjectiveStatus.COMPLETED : ObjectiveStatus.FAILED;
    const finalAgentState = completionDecision.status === "VERIFIED" ? AgentState.COMPLETED : AgentState.FAILED;

    this.stateMachine.transition(finalAgentState, completionDecision.reason, { objectiveId });

    const finalResult = completionDecision.status === "VERIFIED"
      ? `Objective completed successfully: ${objectiveText}. ${verificationResult.summary}. Evidence: ${allEvidence.length} items, Observations: ${allObservations.length}. Files: ${filesCreated.join(", ")}`
      : `Objective failed: ${objectiveText}. Decision: ${completionDecision.status}, Reason: ${completionDecision.reason}, Verification: ${verificationResult.summary}`;

    objective = updateObjective(objective, {
      status: finalStatus,
      finalResult,
    });

    if (this.config.persistenceEnabled) {
      this.persistence.saveObjective(objective);
    }

    this.logger.completion(objectiveId, finalStatus, finalResult);

    return this.createReport(
      objectiveId,
      objectiveText,
      finalStatus,
      startTime,
      filesCreated,
      finalResult,
      verificationResult,
      completionDecision,
      allObservations,
      allEvidence,
      0,
      [],
      changeTracking,
      executionResult,
      verificationPlan
    );
  }

  private createReport(
    objectiveId: string,
    objectiveText: string,
    status: ObjectiveStatus,
    startTime: number,
    filesCreated: string[],
    finalResult?: string,
    verification?: VerificationResult,
    completionDecision?: CompletionDecision,
    observations: Observation[] = [],
    evidence: Evidence[] = [],
    recoveryAttempts: number = 0,
    escalations: any[] = [],
    changeTracking: ExecutionReport["changeTracking"] = [],
    executionResult?: { completed: Task[]; failed: Task[]; all: Task[] },
    verificationPlan?: VerificationPlan
  ): ExecutionReport {
    const executionTimeMs = Date.now() - startTime;
    const total = executionResult?.all.length ?? 0;
    const completed = executionResult?.completed.length ?? 0;
    const failed = executionResult?.failed.length ?? 0;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    let gitInfo: ExecutionReport["gitInfo"] | undefined;
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: this.config.workspaceRoot, encoding: "utf8" }).trim();
      const changedFiles = execSync("git diff --name-only", { cwd: this.config.workspaceRoot, encoding: "utf8" })
        .trim()
        .split("\n")
        .filter(Boolean);
      const diffStat = execSync("git diff --stat", { cwd: this.config.workspaceRoot, encoding: "utf8" }).trim().slice(0, 2000);
      gitInfo = { branch, changedFiles, diffStat };
    } catch {}

    return {
      objectiveId,
      objective: objectiveText,
      status,
      agentState: this.stateMachine.getState(),
      tasksTotal: total,
      tasksCompleted: completed,
      tasksFailed: failed,
      progress,
      finalResult,
      verification,
      completionDecision,
      verificationPlan,
      verificationResults: verification ? [verification] : [],
      evidenceChain: evidence,
      observations,
      evidence,
      executionTimeMs,
      logs: this.logger.getEntries().length,
      stateHistory: this.stateMachine.getHistory(),
      filesCreated,
      changeTracking,
      gitInfo,
      escalations,
      recoveryAttempts,
    };
  }

  reset() {
    this.stateMachine.reset();
    this.logger.clear();
  }

  getLogger(): AgentLogger {
    return this.logger;
  }

  getPersistence(): StatePersistence {
    return this.persistence;
  }
}

export const globalAgentCore = new AgentCore();
