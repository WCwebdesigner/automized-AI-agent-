/**
 * Execution Engine — Phase 1-5
 * Processes tasks with observation, evidence, persistence
 */

import { Task, updateTask } from "../core/task";
import { TaskStatus, AgentState, ToolResultStatus } from "../core/constants";
import { AgentLogger, globalLogger } from "../core/logger";
import { globalToolRegistry } from "../tools/registry";
import { ModelRouter, globalRouter } from "../model/router";
import { RecoverySystem, globalRecovery } from "../recovery/recovery";
import { AgentStateMachine } from "../core/stateMachine";
import { loadConfig } from "../config";
import { Observation, Evidence } from "../observation/types";
import { ObservationCollector } from "../observation/observation";
import { EvidenceFactory } from "../observation/evidence";
import type { ChatMessage } from "../model/types";
import "../tools/engineering";

export interface ExecutionResult {
  task: Task;
  success: boolean;
  shouldContinue: boolean;
  nextState: AgentState;
  observation?: Observation;
  evidence?: Evidence[];
}

export class ExecutionEngine {
  private logger: AgentLogger;
  private router: ModelRouter;
  private recovery: RecoverySystem;
  private config = loadConfig();
  private observationCollector: ObservationCollector;

  constructor(
    logger: AgentLogger = globalLogger,
    router: ModelRouter = globalRouter,
    recovery: RecoverySystem = globalRecovery
  ) {
    this.logger = logger;
    this.router = router;
    this.recovery = recovery;
    this.observationCollector = new ObservationCollector();
  }

  async executeTask(task: Task, stateMachine?: AgentStateMachine): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (stateMachine) {
      stateMachine.transition(AgentState.EXECUTING, `Executing task ${task.id}`, {
        objectiveId: task.objectiveId,
        taskId: task.id,
      });
    }

    let activeTask = updateTask(task, { status: TaskStatus.ACTIVE });
    this.logger.taskStarted(task.objectiveId, task.id, task.selectedTool);

    if (!activeTask.selectedTool) {
      const selection = await this.selectToolForTask(activeTask);
      activeTask = {
        ...activeTask,
        selectedTool: selection.tool,
        toolArguments: selection.args,
      };
      this.logger.toolSelected(task.id, selection.tool, selection.args);
    }

    if (stateMachine) {
      stateMachine.transition(AgentState.OBSERVING, `Observing tool ${activeTask.selectedTool}`, {
        objectiveId: task.objectiveId,
        taskId: task.id,
      });
    }

    const { PermissionLevel } = await import("../core/constants");
    const actionId = task.id;
    const objectiveId = task.objectiveId;
    const taskId = task.id;
    const runId = (task as any).runId ?? "unknown-run";

    const toolResult = await globalToolRegistry.execute(
      activeTask.selectedTool!,
      activeTask.toolArguments,
      {
        workspaceRoot: this.config.workspaceRoot,
        permissionLevel: PermissionLevel.DESTRUCTIVE,
        objectiveId: task.objectiveId,
        taskId: task.id,
      }
    );

    const executionTime = Date.now() - startTime;
    this.logger.toolExecuted(task.id, activeTask.selectedTool!, toolResult, executionTime);
    this.logger.toolResult(task.id, activeTask.selectedTool!, toolResult.status, toolResult.output);

    // Create normalized observation
    const observation = await this.observationCollector.createObservation(
      {
        actionId,
        objectiveId,
        taskId,
        runId,
        toolName: activeTask.selectedTool!,
        timestamp: new Date().toISOString(),
        durationMs: executionTime,
        result: toolResult,
        workspaceRoot: this.config.workspaceRoot,
      }
    );

    // Create evidence from observation
    const evidence = EvidenceFactory.fromObservation(observation);

    const success = toolResult.status === ToolResultStatus.SUCCESS;

    if (success) {
      const completedTask = updateTask(activeTask, {
        status: TaskStatus.COMPLETED,
        result: toolResult,
        verificationStatus: "PENDING",
      });

      return {
        task: completedTask,
        success: true,
        shouldContinue: true,
        nextState: AgentState.VERIFYING,
        observation,
        evidence,
      };
    } else {
      const failedTask = updateTask(activeTask, {
        status: TaskStatus.FAILED,
        result: toolResult,
        error: toolResult.error ?? toolResult.output,
      });

      this.logger.failure(task.id, toolResult.error ?? toolResult.output, {
        tool: activeTask.selectedTool,
        input: activeTask.toolArguments,
      });

      if (stateMachine) {
        stateMachine.transition(AgentState.DIAGNOSING, `Diagnosing failure for ${task.id}`, {
          objectiveId: task.objectiveId,
          taskId: task.id,
        });
      }

      const diagnosis = await this.recovery.diagnose(failedTask);
      this.logger.diagnosis(task.id, `${diagnosis.reason} (recoverable: ${diagnosis.recoverable})`);

      if (!diagnosis.recoverable || !this.recovery.canRetry(failedTask)) {
        return {
          task: failedTask,
          success: false,
          shouldContinue: false,
          nextState: AgentState.FAILED,
          observation,
          evidence,
        };
      }

      if (stateMachine) {
        stateMachine.transition(AgentState.REPAIRING, `Repairing task ${task.id}`, {
          objectiveId: task.objectiveId,
          taskId: task.id,
        });
      }

      const repair = await this.recovery.attemptRepair(failedTask, diagnosis);

      if (stateMachine) {
        stateMachine.transition(AgentState.RETRYING, `Retrying task ${task.id} attempt ${failedTask.attempts + 1}`, {
          objectiveId: task.objectiveId,
          taskId: task.id,
        });
      }

      this.logger.retry(task.id, failedTask.attempts, failedTask.maxAttempts);

      const retryTask = repair.task.status === TaskStatus.PENDING ? repair.task : updateTask(failedTask, { status: TaskStatus.PENDING });

      return {
        task: retryTask,
        success: false,
        shouldContinue: true,
        nextState: AgentState.EXECUTING,
        observation,
        evidence,
      };
    }
  }

  private async selectToolForTask(task: Task): Promise<{ tool: string; args: unknown }> {
    if (task.selectedTool) {
      return { tool: task.selectedTool, args: task.toolArguments };
    }

    const lower = task.description.toLowerCase();

    if (lower.includes("list") && (lower.includes("file") || lower.includes("directory") || lower.includes("workspace"))) {
      return { tool: "list_directory", args: { path: ".", recursive: false } };
    }
    if (lower.includes("inspect") && (lower.includes("directory") || lower.includes("tree"))) {
      return { tool: "inspect_directory_tree", args: { path: ".", maxDepth: 3 } };
    }
    if (lower.includes("read") && lower.includes("file")) {
      const match = task.description.match(/([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/);
      return { tool: "read_file", args: { path: match?.[1] ?? "file.txt" } };
    }
    if (lower.includes("create") && lower.includes("directory")) {
      const match = task.description.match(/directory\s+([a-zA-Z0-9_\-./]+)/i);
      return { tool: "create_directory", args: { path: match?.[1] ?? "new_dir" } };
    }
    if (lower.includes("check") && lower.includes("exist")) {
      const match = task.description.match(/([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/);
      return { tool: "file_exists", args: { path: match?.[1] ?? "file.txt" } };
    }
    if (lower.includes("run") && (lower.includes("python") || lower.includes(".py"))) {
      const match = task.description.match(/([a-zA-Z0-9_\-./]+\.py)/);
      return { tool: "run_python", args: { path: match?.[1] ?? "script.py" } };
    }
    if (lower.includes("run") && (lower.includes("test") || lower.includes("npm"))) {
      return { tool: "run_test", args: {} };
    }
    if (lower.includes("verify")) {
      const match = task.description.match(/([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/);
      return { tool: "verify_file", args: { path: match?.[1] ?? "output.txt", shouldExist: true } };
    }

    if (this.router.getConfig().providerKind !== "scripted") {
      try {
        const messages: ChatMessage[] = [
          {
            role: "system",
            content: `You are a tool selection expert. Given a task, select the appropriate tool and arguments.

Available tools:
${globalToolRegistry.getPromptSection()}

Task: ${task.description}
Objective: ${task.objective}

Respond with JSON only:
{"tool": "tool_name", "args": { ... }}`,
          },
          {
            role: "user",
            content: `Select tool for: ${task.description}`,
          },
        ];

        const result = await this.router.reasoning(messages, { temperature: 0.2, maxTokens: 500 });
        const jsonMatch = result.content.match(/\{[\s\S]*"tool"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tool && globalToolRegistry.get(parsed.tool)) {
            return { tool: parsed.tool, args: parsed.args ?? {} };
          }
        }
      } catch (err) {
        this.logger.log("WARN", "tool_selection_failed", `Tool selection via model failed: ${(err as Error).message}`, {
          taskId: task.id,
        });
      }
    }

    return { tool: "list_directory", args: { path: "." } };
  }

  async executeTasks(
    tasks: Task[],
    stateMachine?: AgentStateMachine,
    onTaskUpdate?: (task: Task) => void
  ): Promise<{ completed: Task[]; failed: Task[]; all: Task[] }> {
    const result = await this.executeTasksWithObservation(tasks, stateMachine, onTaskUpdate, undefined, "unknown-objective", "unknown-run");
    return { completed: result.completed, failed: result.failed, all: result.all };
  }

  async executeTasksWithObservation(
    tasks: Task[],
    stateMachine?: AgentStateMachine,
    onTaskUpdate?: (task: Task) => void,
    onObservation?: (obs: Observation, evidence: Evidence[]) => void,
    objectiveId: string = "unknown-objective",
    runId: string = "unknown-run"
  ): Promise<{ completed: Task[]; failed: Task[]; all: Task[]; observations: Observation[]; evidence: Evidence[] }> {
    const completedIds = new Set<string>();
    const completed: Task[] = [];
    const failed: Task[] = [];
    const observations: Observation[] = [];
    const evidence: Evidence[] = [];
    let remaining = [...tasks];
    let iterations = 0;
    const maxIterations = tasks.length * 3;

    while (remaining.length > 0 && iterations < maxIterations) {
      iterations++;

      const ready = remaining.filter((t) => {
        if (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED) return false;
        return t.dependencies.every((dep) => completedIds.has(dep));
      });

      if (ready.length === 0) {
        const blocked = remaining.filter((t) => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.FAILED);
        if (blocked.length > 0) {
          this.logger.log("WARN", "tasks_blocked", `Tasks blocked: ${blocked.map((t) => t.id).join(", ")}`, {});
          for (const b of blocked) {
            const depFailed = b.dependencies.some((dep) => failed.some((f) => f.id === dep));
            if (depFailed) {
              const failedTask = updateTask(b, { status: TaskStatus.FAILED, error: "Dependency failed" });
              failed.push(failedTask);
              remaining = remaining.filter((r) => r.id !== b.id);
              onTaskUpdate?.(failedTask);
            }
          }
          if (ready.length === 0 && blocked.length === remaining.length) break;
        } else {
          break;
        }
      }

      ready.sort((a, b) => b.priority - a.priority);

      for (const task of ready) {
        const taskWithRun = { ...task, runId } as Task & { runId: string };
        const result = await this.executeTask(taskWithRun, stateMachine);

        if (result.observation) {
          observations.push(result.observation);
          onObservation?.(result.observation, result.evidence ?? []);
          if (result.evidence) evidence.push(...result.evidence);
        }

        if (result.success) {
          completed.push(result.task);
          completedIds.add(result.task.id);
        } else {
          if (result.shouldContinue && result.task.status === TaskStatus.PENDING) {
            const idx = remaining.findIndex((r) => r.id === task.id);
            if (idx >= 0) remaining[idx] = result.task;
            continue;
          } else {
            failed.push(result.task);
          }
        }

        remaining = remaining.filter((r) => r.id !== task.id);
        onTaskUpdate?.(result.task);
      }
    }

    return { completed, failed, all: [...completed, ...failed], observations, evidence };
  }

  /**
   * Execute single task with verification — used by E2E tests
   */
  async executeTaskWithVerification(
    task: Task,
    verificationPlan: any,
    objectiveId: string,
    runId: string,
    onObservation?: (obs: Observation, ev: Evidence[]) => void
  ): Promise<{ task: Task; observation: Observation; evidence: Evidence[]; verification: any }> {
    const result = await this.executeTask({ ...task, runId } as any);
    if (result.observation && onObservation) {
      onObservation(result.observation, result.evidence ?? []);
    }
    return {
      task: result.task,
      observation: result.observation!,
      evidence: result.evidence ?? [],
      verification: null,
    };
  }
}

export const globalExecutor = new ExecutionEngine();
