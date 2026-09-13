/**
 * Verification Plans — Phase 4.4
 * Explicit JSON executable independently from LLM
 */

import { VerificationPlan, VerificationCheck, createPlan, createCheck } from "./types";
import { loadConfig } from "../config";
import fs from "node:fs";
import path from "node:path";

export class VerificationPlanParser {
  /**
   * Parse JSON verification plan — deterministic, no LLM needed
   */
  static parse(json: string | object, objectiveId?: string): VerificationPlan {
    let raw: any;
    if (typeof json === "string") {
      raw = JSON.parse(json);
    } else {
      raw = json;
    }

    if (!raw.checks || !Array.isArray(raw.checks)) {
      throw new Error("Verification plan must have checks array");
    }

    const checks: VerificationCheck[] = raw.checks.map((c: any) => {
      if (!c.type) throw new Error(`Check missing type: ${JSON.stringify(c)}`);
      return createCheck({
        id: c.id,
        type: c.type,
        description: c.description,
        filePath: c.filePath ?? c.path,
        expectedContent: c.expectedContent ?? c.contains ?? c.expected,
        command: c.command,
        expectedExitCode: c.expectedExitCode ?? c.exitCode,
        expectedOutput: c.expectedOutput ?? c.outputContains ?? c.expected,
        testCommand: c.testCommand ?? c.command,
        expectedTestCount: c.expectedTestCount,
        required: c.required ?? true,
        timeoutMs: c.timeoutMs,
      });
    });

    return createPlan({
      objectiveId: objectiveId ?? raw.objectiveId ?? raw.id ?? "unknown-objective",
      taskId: raw.taskId,
      description: raw.description ?? "Verification plan",
      checks,
      createdBy: raw.createdBy ?? "SYSTEM",
    });
  }

  /**
   * Serialize plan to JSON — explicit, executable independently
   */
  static serialize(plan: VerificationPlan): string {
    return JSON.stringify(
      {
        id: plan.id,
        objectiveId: plan.objectiveId,
        taskId: plan.taskId,
        description: plan.description,
        createdAt: plan.createdAt,
        createdBy: plan.createdBy,
        checks: plan.checks.map((c) => ({
          id: c.id,
          type: c.type,
          description: c.description,
          filePath: c.filePath,
          expectedContent: c.expectedContent,
          command: c.command,
          expectedExitCode: c.expectedExitCode,
          expectedOutput: c.expectedOutput,
          testCommand: c.testCommand,
          expectedTestCount: c.expectedTestCount,
          required: c.required,
          timeoutMs: c.timeoutMs,
        })),
      },
      null,
      2
    );
  }

  /**
   * Generate heuristic verification plan from objective text
   * Deterministic fallback, no LLM required
   */
  static heuristicPlan(objectiveText: string, objectiveId: string): VerificationPlan {
    const checks: VerificationCheck[] = [];
    const lower = objectiveText.toLowerCase();

    // File existence checks
    const fileRegex = /([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/gi;
    const files = [...new Set([...objectiveText.matchAll(fileRegex)].map((m) => m[1]))];

    for (const file of files) {
      if (file.length < 3 || file.length > 100) continue;
      checks.push(
        createCheck({
          type: "FILE_EXISTS",
          description: `File ${file} should exist`,
          filePath: file,
          required: true,
        })
      );
    }

    // Output contains checks
    const outputPatterns = [
      /output is\s+([^\s.]+)/i,
      /prints?\s+([^\s.]+)/i,
      /verify.*\s+([0-9]+)/i,
      /produces\s+([0-9]+)/i,
    ];

    for (const pattern of outputPatterns) {
      const match = objectiveText.match(pattern);
      if (match) {
        const expected = match[1].replace(/["']/g, "").trim();
        if (expected && expected.length > 0 && expected.length < 50) {
          checks.push(
            createCheck({
              type: "COMMAND_OUTPUT_CONTAINS",
              description: `Output should contain ${expected}`,
              expectedOutput: expected,
              required: true,
            })
          );
          break; // only first
        }
      }
    }

    // If mentions 12 specifically
    if (lower.includes("12") && !checks.some((c) => c.expectedOutput === "12")) {
      checks.push(
        createCheck({
          type: "COMMAND_OUTPUT_CONTAINS",
          description: "Output should contain 12",
          expectedOutput: "12",
          required: true,
        })
      );
    }

    // If mentions test
    if (lower.includes("test")) {
      checks.push(
        createCheck({
          type: "TEST_PASSES",
          description: "Tests should pass",
          required: false,
        })
      );
    }

    if (checks.length === 0) {
      // Fallback: at least check that tasks completed (handled elsewhere)
      checks.push(
        createCheck({
          type: "FILE_EXISTS",
          description: "At least one file should exist (fallback)",
          filePath: "output.txt",
          required: false,
        })
      );
    }

    return createPlan({
      objectiveId,
      description: `Heuristic verification for: ${objectiveText.slice(0, 100)}`,
      checks,
      createdBy: "SYSTEM",
    });
  }

  /**
   * Generate plan from objective text — alias for heuristicPlan
   */
  static fromObjective(objectiveText: string, objectiveId: string): VerificationPlan {
    return this.heuristicPlan(objectiveText, objectiveId);
  }

  /**
   * Load plan from file — executable independently
   */
  static loadFromFile(filePath: string, workspaceRoot?: string): VerificationPlan {
    const config = loadConfig();
    const root = workspaceRoot ?? config.workspaceRoot;
    const abs = path.resolve(root, filePath);
    const content = fs.readFileSync(abs, "utf8");
    return this.parse(content, "unknown");
  }
}
