/**
 * Verification Layer — Phase 1-3
 * Separate from execution, verifies objective actually accomplished
 */

import fs from "node:fs/promises";
import { ToolResultStatus } from "../core/constants";
import { Task } from "../core/task";
import { Objective } from "../core/objective";
import { globalToolRegistry } from "../tools/registry";
import "../tools/engineering"; // Ensure engineering tools registered
import { loadConfig } from "../config";
import { AgentLogger, globalLogger } from "../core/logger";

export interface VerificationCheck {
  name: string;
  passed: boolean;
  details: string;
  required: boolean;
}

export interface VerificationResult {
  passed: boolean;
  objectiveId: string;
  checks: VerificationCheck[];
  details: string;
  verifiedAt: string;
}

export class Verifier {
  private logger: AgentLogger;
  private config = loadConfig();

  constructor(logger: AgentLogger = globalLogger) {
    this.logger = logger;
  }

  /**
   * Verify file existence
   */
  async verifyFileExists(workspaceRoot: string, filePath: string, shouldExist = true): Promise<VerificationCheck> {
    try {
      const { safeResolve } = await import("../tools/registry");
      let abs: string;
      try {
        abs = safeResolve(workspaceRoot, filePath);
      } catch {
        // If safeResolve fails, try direct resolve
        const path = await import("node:path");
        abs = path.resolve(workspaceRoot, filePath);
      }
      const stat = await fs.stat(abs).catch(() => null);
      const exists = !!stat;
      // Also try fs.existsSync as fallback and check directory listing
      let existsFallback = exists;
      if (!exists) {
        try {
          const fsSync = await import("node:fs");
          existsFallback = fsSync.existsSync(abs);
        } catch {}
      }
      const finalExists = exists || existsFallback;
      const passed = finalExists === shouldExist;
      return {
        name: `file_exists:${filePath}`,
        passed,
        details: passed
          ? `File ${filePath} ${shouldExist ? "exists" : "correctly does not exist"} at ${abs}`
          : `File ${filePath} should ${shouldExist ? "exist" : "not exist"} but ${finalExists ? "exists" : "does not"} (checked ${abs})`,
        required: true,
      };
    } catch (err) {
      return {
        name: `file_exists:${filePath}`,
        passed: false,
        details: `Error checking file ${filePath}: ${(err as Error).message}`,
        required: true,
      };
    }
  }

  async verifyFileContains(workspaceRoot: string, filePath: string, expected: string): Promise<VerificationCheck> {
    try {
      const { safeResolve } = await import("../tools/registry");
      const abs = safeResolve(workspaceRoot, filePath);
      const content = await fs.readFile(abs, "utf8").catch(() => "");
      const passed = content.includes(expected);
      return {
        name: `file_contains:${filePath}`,
        passed,
        details: passed
          ? `File ${filePath} contains expected text`
          : `File ${filePath} does NOT contain "${expected.slice(0, 100)}"`,
        required: true,
      };
    } catch (err) {
      return {
        name: `file_contains:${filePath}`,
        passed: false,
        details: `Error reading file ${filePath}: ${(err as Error).message}`,
        required: true,
      };
    }
  }

  async verifyCommandOutput(output: string, expected: string): Promise<VerificationCheck> {
    const passed = output.includes(expected);
    return {
      name: `output_contains:${expected.slice(0, 50)}`,
      passed,
      details: passed
        ? `Output contains "${expected}"`
        : `Output does NOT contain "${expected}". Actual: ${output.slice(0, 500)}`,
      required: true,
    };
  }

  async verifyPythonExecution(task: Task, expectedOutput?: string): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];
    if (!task.result) {
      checks.push({
        name: "python_executed",
        passed: false,
        details: "Task has no result",
        required: true,
      });
      return checks;
    }

    const success = task.result.status === ToolResultStatus.SUCCESS;
    checks.push({
      name: "python_success",
      passed: success,
      details: success ? "Python execution succeeded" : `Python failed: ${task.result.error}`,
      required: true,
    });

    if (expectedOutput && task.result.stdout) {
      const contains = task.result.stdout.includes(expectedOutput);
      checks.push({
        name: "python_output",
        passed: contains,
        details: contains
          ? `Output contains expected "${expectedOutput}"`
          : `Output "${task.result.stdout.slice(0, 200)}" does not contain "${expectedOutput}"`,
        required: true,
      });
    }

    return checks;
  }

  /**
   * Main verification for objective
   */
  async verifyObjective(objective: Objective, workspaceRoot?: string): Promise<VerificationResult> {
    const root = workspaceRoot ?? this.config.workspaceRoot;
    const checks: VerificationCheck[] = [];
    const lowerObj = objective.originalObjective.toLowerCase();

    // Generic checks based on objective text
    // If objective mentions file creation, verify file exists
    const fileMatch = objective.originalObjective.match(/called\s+([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/i) ||
                      objective.originalObjective.match(/file\s+([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/i) ||
                      objective.originalObjective.match(/([a-zA-Z0-9_\-]+\.(?:py|js|ts))/i);

    if (fileMatch) {
      const fileName = fileMatch[1];
      const existsCheck = await this.verifyFileExists(root, fileName, true);
      checks.push(existsCheck);
    }

    // If objective mentions output verification like "prints 12" or "output is 12"
    const outputMatch = objective.originalObjective.match(/output is\s+([^\s.]+)/i) ||
                        objective.originalObjective.match(/prints?\s+([^\s.]+)/i) ||
                        objective.originalObjective.match(/verify.*\s+([0-9]+)/i) ||
                        objective.originalObjective.match(/produces\s+([0-9]+)/i);

    if (outputMatch) {
      const expected = outputMatch[1].replace(/["']/g, "");
      // Search ALL tasks for output containing expected, not just last
      const allOutputs = objective.tasks
        .map((t) => t.result?.stdout ?? t.result?.output ?? "")
        .join("\n");
      // Also check if any task's stdout contains expected
      const found = allOutputs.includes(expected);
      if (found) {
        checks.push({
          name: `output_contains:${expected}`,
          passed: true,
          details: `Found expected output "${expected}" in task outputs`,
          required: true,
        });
      } else {
        // Try to find last with output as fallback for detailed message
        const lastWithOutput = [...objective.tasks].reverse().find((t) => t.result?.stdout || t.result?.output);
        if (lastWithOutput) {
          const output = lastWithOutput.result?.stdout ?? lastWithOutput.result?.output ?? "";
          checks.push(await this.verifyCommandOutput(allOutputs || output, expected));
        } else {
          checks.push({
            name: `output_contains:${expected}`,
            passed: false,
            details: `No task output found containing "${expected}"`,
            required: true,
          });
        }
      }
    }

    // Check tasks completed
    const completedCount = objective.tasks.filter((t) => t.status === "COMPLETED").length;
    const totalCount = objective.tasks.length;
    if (totalCount > 0) {
      checks.push({
        name: "tasks_completed",
        passed: completedCount === totalCount,
        details: `${completedCount}/${totalCount} tasks completed`,
        required: false,
      });
    }

    // If no specific checks, at least verify objective has result
    if (checks.length === 0) {
      checks.push({
        name: "objective_has_result",
        passed: !!objective.finalResult,
        details: objective.finalResult ? "Objective has final result" : "No final result",
        required: true,
      });
    }

    const requiredFailed = checks.filter((c) => c.required && !c.passed);
    const passed = requiredFailed.length === 0;

    const result: VerificationResult = {
      passed,
      objectiveId: objective.id,
      checks,
      details: passed
        ? `Verification PASSED: ${checks.filter((c) => c.passed).length}/${checks.length} checks passed`
        : `Verification FAILED: ${requiredFailed.map((c) => c.name).join(", ")} failed`,
      verifiedAt: new Date().toISOString(),
    };

    this.logger.verification(objective.id, passed, result.details);

    return result;
  }

  /**
   * Verify task individually
   */
  async verifyTask(task: Task, expected?: { outputContains?: string; fileExists?: string }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    if (!task.result) {
      checks.push({
        name: "task_has_result",
        passed: false,
        details: "Task has no result",
        required: true,
      });
      return checks;
    }

    const success = task.result.status === ToolResultStatus.SUCCESS;
    checks.push({
      name: "task_success",
      passed: success,
      details: success ? "Task succeeded" : `Task failed: ${task.result.error}`,
      required: true,
    });

    if (expected?.outputContains) {
      const output = task.result.stdout ?? task.result.output ?? "";
      const contains = output.includes(expected.outputContains);
      checks.push({
        name: "output_contains",
        passed: contains,
        details: contains ? `Output contains "${expected.outputContains}"` : `Missing "${expected.outputContains}"`,
        required: true,
      });
    }

    if (expected?.fileExists) {
      const exists = await this.verifyFileExists(this.config.workspaceRoot, expected.fileExists, true);
      checks.push(exists);
    }

    return checks;
  }
}

export const globalVerifier = new Verifier();
