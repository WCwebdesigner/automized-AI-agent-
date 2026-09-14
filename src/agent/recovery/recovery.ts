/**
 * Recovery System — Phase 1-3
 * Controlled recovery loop: capture failure → diagnose → repair → retry
 */

import { Task, StructuredToolResult, updateTask } from "../core/task";
import { TaskStatus, ToolResultStatus } from "../core/constants";
import { AgentLogger, globalLogger } from "../core/logger";
import { ModelRouter, globalRouter } from "../model/router";
import type { ChatMessage } from "../model/types";
import { globalToolRegistry } from "../tools/registry";
import "../tools/engineering"; // Ensure engineering tools registered
import { loadConfig } from "../config";

export interface DiagnosisResult {
  recoverable: boolean;
  reason: string;
  suggestedAction: string;
  repairTool?: string;
  repairArgs?: unknown;
  confidence: number;
}

export interface RecoveryAttempt {
  taskId: string;
  attempt: number;
  failure: string;
  diagnosis: DiagnosisResult;
  repairExecuted: boolean;
  repairResult?: StructuredToolResult;
  timestamp: string;
}

export class RecoverySystem {
  private logger: AgentLogger;
  private router: ModelRouter;
  private config = loadConfig();
  private attempts: Map<string, RecoveryAttempt[]> = new Map();

  constructor(logger: AgentLogger = globalLogger, router: ModelRouter = globalRouter) {
    this.logger = logger;
    this.router = router;
  }

  /**
   * Diagnose failure using reasoning model
   */
  async diagnose(task: Task, errorContext?: string): Promise<DiagnosisResult> {
    const failure = task.result?.error ?? task.error ?? "Unknown failure";
    const output = task.result?.output ?? "";
    const stderr = task.result?.stderr ?? "";

    // If scripted provider or no router, use heuristic diagnosis
    if (this.router.getConfig().providerKind === "scripted") {
      return this.heuristicDiagnosis(task, failure, output, stderr);
    }

    try {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: `You are a failure diagnosis expert for an autonomous coding agent. Analyze the failure and determine if it's recoverable.

Task: ${task.description}
Tool: ${task.selectedTool}
Input: ${JSON.stringify(task.toolArguments)}
Failure: ${failure}
Output: ${output.slice(0, 2000)}
Stderr: ${stderr.slice(0, 2000)}

Respond with JSON only:
{
  "recoverable": boolean,
  "reason": "explanation",
  "suggestedAction": "what to do",
  "repairTool": "tool name if applicable",
  "repairArgs": { ... },
  "confidence": 0.0-1.0
}`,
        },
        {
          role: "user",
          content: `Diagnose this failure and suggest repair. Task: ${task.description}, Error: ${failure}`,
        },
      ];

      const result = await this.router.diagnosis(messages, { temperature: 0.2, maxTokens: 800 });
      const content = result.content.trim();

      // Try to parse JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          recoverable: !!parsed.recoverable,
          reason: parsed.reason ?? "No reason provided",
          suggestedAction: parsed.suggestedAction ?? "Retry",
          repairTool: parsed.repairTool,
          repairArgs: parsed.repairArgs,
          confidence: parsed.confidence ?? 0.5,
        };
      }

      // Fallback
      return {
        recoverable: true,
        reason: content.slice(0, 500),
        suggestedAction: "Attempt repair based on error",
        confidence: 0.5,
      };
    } catch (err) {
      this.logger.log("WARN", "diagnosis_failed", `Diagnosis model failed: ${(err as Error).message}`, {
        taskId: task.id,
      });
      return this.heuristicDiagnosis(task, failure, output, stderr);
    }
  }

  private heuristicDiagnosis(task: Task, failure: string, output: string, stderr: string): DiagnosisResult {
    const lower = `${failure} ${output} ${stderr}`.toLowerCase();

    // Syntax error
    if (lower.includes("syntaxerror") || lower.includes("invalid syntax")) {
      return {
        recoverable: true,
        reason: "Python syntax error detected",
        suggestedAction: "Fix syntax error in file",
        repairTool: "write_file",
        confidence: 0.9,
      };
    }

    if (lower.includes("filenotfound") || lower.includes("no such file") || lower.includes("file not found")) {
      return {
        recoverable: true,
        reason: "File not found",
        suggestedAction: "Create missing file or correct path",
        confidence: 0.8,
      };
    }

    if (lower.includes("modulenotfound") || lower.includes("importerror")) {
      return {
        recoverable: true,
        reason: "Missing module",
        suggestedAction: "Install missing dependency or fix import",
        confidence: 0.7,
      };
    }

    if (lower.includes("permission denied") || lower.includes("eperm")) {
      return {
        recoverable: false,
        reason: "Permission denied",
        suggestedAction: "Check permissions, may need escalation",
        confidence: 0.8,
      };
    }

    if (lower.includes("timeout")) {
      return {
        recoverable: true,
        reason: "Operation timed out",
        suggestedAction: "Retry with longer timeout or optimize",
        confidence: 0.6,
      };
    }

    // Generic recoverable
    return {
      recoverable: task.attempts < task.maxAttempts,
      reason: `Failure: ${failure.slice(0, 200)}`,
      suggestedAction: "Retry or attempt repair",
      confidence: 0.5,
    };
  }

  /**
   * Attempt repair
   */
  async attemptRepair(task: Task, diagnosis: DiagnosisResult): Promise<{ task: Task; repairResult?: StructuredToolResult }> {
    this.logger.repair(task.id, diagnosis.suggestedAction);

    // If diagnosis suggests specific repair tool, use it
    if (diagnosis.repairTool && diagnosis.repairArgs) {
      const { PermissionLevel } = await import("../core/constants");
      const result = await globalToolRegistry.execute(diagnosis.repairTool, diagnosis.repairArgs, {
        workspaceRoot: this.config.workspaceRoot,
        permissionLevel: PermissionLevel.DESTRUCTIVE,
        taskId: task.id,
        objectiveId: task.objectiveId,
      });

      // Record attempt
      const attempt: RecoveryAttempt = {
        taskId: task.id,
        attempt: task.attempts,
        failure: task.error ?? task.result?.error ?? "Unknown",
        diagnosis,
        repairExecuted: true,
        repairResult: result,
        timestamp: new Date().toISOString(),
      };

      if (!this.attempts.has(task.id)) this.attempts.set(task.id, []);
      this.attempts.get(task.id)!.push(attempt);

      // If repair tool is write_file/modify_file, consider task repaired and ready to retry
      if (result.status === ToolResultStatus.SUCCESS) {
        return {
          task: {
            ...task,
            status: TaskStatus.PENDING,
            updatedAt: new Date().toISOString(),
          },
          repairResult: result,
        };
      }

      return { task, repairResult: result };
    }

    // Otherwise, attempt to use coding model to generate fix
    if (this.router.getConfig().providerKind !== "scripted") {
      try {
        const repair = await this.generateRepairWithCodingModel(task, diagnosis);
        if (repair) {
          const { PermissionLevel } = await import("../core/constants");
          const result = await globalToolRegistry.execute(repair.tool, repair.args, {
            workspaceRoot: this.config.workspaceRoot,
            permissionLevel: PermissionLevel.DESTRUCTIVE,
            taskId: task.id,
            objectiveId: task.objectiveId,
          });

          const attempt: RecoveryAttempt = {
            taskId: task.id,
            attempt: task.attempts,
            failure: task.error ?? "Unknown",
            diagnosis,
            repairExecuted: true,
            repairResult: result,
            timestamp: new Date().toISOString(),
          };

          if (!this.attempts.has(task.id)) this.attempts.set(task.id, []);
          this.attempts.get(task.id)!.push(attempt);

          return { task: { ...task, status: TaskStatus.PENDING, updatedAt: new Date().toISOString() }, repairResult: result };
        }
      } catch (err) {
        this.logger.log("WARN", "repair_generation_failed", `Repair generation failed: ${(err as Error).message}`, {
          taskId: task.id,
        });
      }
    }

    // No specific repair, just mark for retry if attempts left
    return { task };
  }

  private async generateRepairWithCodingModel(task: Task, diagnosis: DiagnosisResult): Promise<{ tool: string; args: unknown } | null> {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a coding repair expert. Given a failed task, generate a repair action.

Task: ${task.description}
Tool: ${task.selectedTool}
Error: ${task.error ?? task.result?.error}
Output: ${task.result?.output?.slice(0, 2000)}
Diagnosis: ${diagnosis.reason}

You must respond with a single JSON tool call to fix the issue.
Example: {"tool":"write_file","args":{"path":"file.py","content":"fixed code"}}
Or: {"tool":"modify_file","args":{"path":"file.py","oldContent":"bad","newContent":"good","operation":"replace"}}

Respond with JSON only.`,
      },
      {
        role: "user",
        content: `Generate repair for: ${task.description} failed with ${task.error}`,
      },
    ];

    const result = await this.router.coding(messages, { temperature: 0.2, maxTokens: 1000 });
    const jsonMatch = result.content.match(/\{[\s\S]*"tool"[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.tool && parsed.args) {
        return { tool: parsed.tool, args: parsed.args };
      }
    } catch {
      return null;
    }

    return null;
  }

  canRetry(task: Task): boolean {
    return task.attempts < task.maxAttempts;
  }

  getAttempts(taskId: string): RecoveryAttempt[] {
    return this.attempts.get(taskId) ?? [];
  }

  clearAttempts(taskId: string) {
    this.attempts.delete(taskId);
  }
}

export const globalRecovery = new RecoverySystem();
