/**
 * Verification Engine — Phase 4.3
 * Reusable, deterministic, independent from LLM
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import {
  VerificationCheck,
  VerificationCheckResult,
  VerificationPlan,
  VerificationResult,
  VerificationStatus,
  createVerificationResultId,
} from "./types";
import { Evidence } from "../observation/types";
import { EvidenceFactory } from "../observation/evidence";
import { ObservationCollector } from "../observation/observation";
import { loadConfig } from "../config";
import { AgentLogger, globalLogger } from "../core/logger";
import { StructuredToolResult } from "../tools/registry";
import { ToolResultStatus } from "../core/constants";

export class VerificationEngine {
  private logger: AgentLogger;
  private config = loadConfig();

  constructor(logger: AgentLogger = globalLogger) {
    this.logger = logger;
  }

  async executeCheck(
    check: VerificationCheck,
    context: {
      workspaceRoot: string;
      objectiveId: string;
      taskId?: string;
      runId: string;
      observations?: any[];
      evidence?: Evidence[];
    }
  ): Promise<VerificationCheckResult> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    try {
      switch (check.type) {
        case "FILE_EXISTS":
          return await this.checkFileExists(check, context, start, timestamp);
        case "FILE_NOT_EXISTS":
          return await this.checkFileNotExists(check, context, start, timestamp);
        case "FILE_NOT_EMPTY":
          return await this.checkFileNotEmpty(check, context, start, timestamp);
        case "FILE_CONTAINS":
          return await this.checkFileContains(check, context, start, timestamp);
        case "FILE_NOT_CONTAINS":
          return await this.checkFileNotContains(check, context, start, timestamp);
        case "FILE_EQUALS":
          return await this.checkFileEquals(check, context, start, timestamp);
        case "COMMAND_EXIT_ZERO":
          return await this.checkCommandExitZero(check, context, start, timestamp);
        case "COMMAND_EXIT_CODE":
          return await this.checkCommandExitCode(check, context, start, timestamp);
        case "COMMAND_SUCCEEDS":
          return await this.checkCommandSucceeds(check, context, start, timestamp);
        case "COMMAND_OUTPUT_CONTAINS":
          return await this.checkCommandOutputContains(check, context, start, timestamp);
        case "COMMAND_OUTPUT_EQUALS":
          return await this.checkCommandOutputEquals(check, context, start, timestamp);
        case "TEST_PASSES":
          return await this.checkTestPasses(check, context, start, timestamp);
        case "TEST_FAILS":
          return await this.checkTestFails(check, context, start, timestamp);
        case "TEST_COUNT":
          return await this.checkTestCount(check, context, start, timestamp);
        default:
          return this.makeResult(check, "INCONCLUSIVE", `Unknown check type ${check.type}`, `Unknown type`, "", [], start, timestamp);
      }
    } catch (err) {
      return this.makeResult(
        check,
        "INCONCLUSIVE",
        (err as Error).message,
        check.type,
        `Error: ${(err as Error).message}`,
        [],
        start,
        timestamp
      );
    }
  }

  private async checkFileExists(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const filePath = check.filePath!;
    const abs = path.resolve(ctx.workspaceRoot, filePath);
    const exists = fs.existsSync(abs);
    const evidence: Evidence[] = [];
    try {
      const fakeResult: StructuredToolResult = {
        status: exists ? ToolResultStatus.SUCCESS : ToolResultStatus.FAILURE,
        tool: "verify_file",
        input: { path: filePath },
        output: exists ? `File exists: ${filePath}` : `File does not exist: ${filePath}`,
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        affectedFiles: [filePath],
      };
      const collector = new ObservationCollector();
      const obs = await collector.createObservation({
        objectiveId: ctx.objectiveId,
        taskId: ctx.taskId ?? "verification",
        runId: ctx.runId,
        toolName: "verify_file",
        durationMs: Date.now() - start,
        result: fakeResult,
        workspaceRoot: ctx.workspaceRoot,
      });
      evidence.push(...EvidenceFactory.fromObservation(obs));
    } catch {}

    return this.makeResult(
      check,
      exists ? "PASSED" : "FAILED",
      filePath,
      exists ? `File exists: ${filePath}` : `File does not exist: ${filePath}`,
      exists ? `File exists at ${abs}` : `Missing at ${abs}`,
      evidence,
      start,
      timestamp
    );
  }

  private async checkFileNotExists(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const filePath = check.filePath!;
    const abs = path.resolve(ctx.workspaceRoot, filePath);
    const exists = fs.existsSync(abs);
    return this.makeResult(
      check,
      !exists ? "PASSED" : "FAILED",
      `File ${filePath} should not exist`,
      !exists ? `File correctly does not exist` : `File exists but should not`,
      exists ? `Exists at ${abs}` : `Does not exist`,
      [],
      start,
      timestamp
    );
  }

  private async checkFileNotEmpty(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const filePath = check.filePath!;
    const abs = path.resolve(ctx.workspaceRoot, filePath);
    try {
      const stat = fs.statSync(abs);
      const notEmpty = stat.size > 0;
      return this.makeResult(
        check,
        notEmpty ? "PASSED" : "FAILED",
        "File not empty",
        notEmpty ? `File ${filePath} not empty (${stat.size} bytes)` : `File ${filePath} is empty`,
        `Size: ${stat.size}`,
        [],
        start,
        timestamp
      );
    } catch {
      return this.makeResult(check, "FAILED", "File not empty", `File ${filePath} does not exist`, "Missing", [], start, timestamp);
    }
  }

  private async checkFileContains(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const filePath = check.filePath!;
    const expected = check.expectedContent!;
    const abs = path.resolve(ctx.workspaceRoot, filePath);
    try {
      const content = fs.readFileSync(abs, "utf8");
      const contains = content.includes(expected);
      return this.makeResult(
        check,
        contains ? "PASSED" : "FAILED",
        expected,
        contains ? `File ${filePath} contains expected` : `File ${filePath} does NOT contain "${expected.slice(0, 100)}"`,
        contains ? `Found` : `Content: ${content.slice(0, 200)}`,
        [],
        start,
        timestamp
      );
    } catch (err) {
      return this.makeResult(check, "FAILED", expected, `Error reading file: ${(err as Error).message}`, "Error", [], start, timestamp);
    }
  }

  private async checkFileNotContains(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const filePath = check.filePath!;
    const expected = check.expectedContent!;
    const abs = path.resolve(ctx.workspaceRoot, filePath);
    try {
      const content = fs.readFileSync(abs, "utf8");
      const notContains = !content.includes(expected);
      return this.makeResult(
        check,
        notContains ? "PASSED" : "FAILED",
        `Should NOT contain ${expected}`,
        notContains ? `File correctly does not contain` : `File contains forbidden "${expected.slice(0, 100)}"`,
        notContains ? `OK` : `Found in content`,
        [],
        start,
        timestamp
      );
    } catch (err) {
      return this.makeResult(check, "INCONCLUSIVE", `Should NOT contain ${expected}`, `Error: ${(err as Error).message}`, "Error", [], start, timestamp);
    }
  }

  private async checkFileEquals(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const filePath = check.filePath!;
    const expected = check.expectedContent!;
    const abs = path.resolve(ctx.workspaceRoot, filePath);
    try {
      const content = fs.readFileSync(abs, "utf8");
      const equals = content.trim() === expected.trim();
      return this.makeResult(
        check,
        equals ? "PASSED" : "FAILED",
        expected,
        equals ? `File equals expected` : `File does NOT equal expected`,
        `Actual: ${content.slice(0, 200)}`,
        [],
        start,
        timestamp
      );
    } catch (err) {
      return this.makeResult(check, "FAILED", expected, `Error: ${(err as Error).message}`, "Error", [], start, timestamp);
    }
  }

  private async checkCommandExitZero(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const cmd = check.command!;
    try {
      const result = spawnSync(cmd, { shell: true, cwd: ctx.workspaceRoot, encoding: "utf8", timeout: check.timeoutMs ?? 30000 });
      const passed = result.status === 0;
      return this.makeResult(
        check,
        passed ? "PASSED" : "FAILED",
        "Exit code 0",
        passed ? `Command exited 0` : `Command exited ${result.status}: ${result.stderr?.slice(0, 200)}`,
        `Exit: ${result.status}`,
        [],
        start,
        timestamp
      );
    } catch (err) {
      return this.makeResult(check, "FAILED", "Exit 0", `Command failed: ${(err as Error).message}`, "Error", [], start, timestamp);
    }
  }

  private async checkCommandExitCode(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const cmd = check.command!;
    const expectedCode = check.expectedExitCode ?? 0;
    try {
      const result = spawnSync(cmd, { shell: true, cwd: ctx.workspaceRoot, encoding: "utf8", timeout: check.timeoutMs ?? 30000 });
      const passed = result.status === expectedCode;
      return this.makeResult(
        check,
        passed ? "PASSED" : "FAILED",
        `Exit code ${expectedCode}`,
        passed ? `Exited ${expectedCode}` : `Exited ${result.status}, expected ${expectedCode}`,
        `Actual: ${result.status}`,
        [],
        start,
        timestamp
      );
    } catch (err) {
      return this.makeResult(check, "FAILED", `Exit ${expectedCode}`, `Error: ${(err as Error).message}`, "Error", [], start, timestamp);
    }
  }

  private async checkCommandSucceeds(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const cmd = check.command!;
    try {
      execSync(cmd, { cwd: ctx.workspaceRoot, stdio: "pipe", timeout: check.timeoutMs ?? 30000 });
      return this.makeResult(check, "PASSED", "Command succeeds", "Command succeeded", "Success", [], start, timestamp);
    } catch (err: any) {
      return this.makeResult(check, "FAILED", "Command succeeds", `Command failed: ${err.message}`, `Exit: ${err.status}`, [], start, timestamp);
    }
  }

  private async checkCommandOutputContains(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string; observations?: any[] },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const expected = check.expectedOutput!;
    if (ctx.observations && ctx.observations.length > 0) {
      const allOutputs = ctx.observations
        .map((o: any) => {
          if (typeof o === "string") return o;
          return o.stdout ?? o.output ?? o.outputCombined ?? "";
        })
        .join("\n");
      if (allOutputs.includes(expected)) {
        return this.makeResult(
          check,
          "PASSED",
          expected,
          `Found expected output "${expected}" in observations`,
          `Found in: ${allOutputs.slice(0, 200)}`,
          [],
          start,
          timestamp
        );
      }
    }
    if (check.command) {
      try {
        const result = spawnSync(check.command, { shell: true, cwd: ctx.workspaceRoot, encoding: "utf8", timeout: check.timeoutMs ?? 30000 });
        const output = (result.stdout ?? "") + (result.stderr ?? "");
        const contains = output.includes(expected);
        return this.makeResult(
          check,
          contains ? "PASSED" : "FAILED",
          expected,
          contains ? `Output contains "${expected}"` : `Output does NOT contain "${expected}". Actual: ${output.slice(0, 500)}`,
          contains ? `Found` : output.slice(0, 500),
          [],
          start,
          timestamp
        );
      } catch (err) {
        return this.makeResult(check, "FAILED", expected, `Command error: ${(err as Error).message}`, "Error", [], start, timestamp);
      }
    }
    return this.makeResult(
      check,
      "FAILED",
      expected,
      `No observation contains "${expected}" and no command to run`,
      "No output found",
      [],
      start,
      timestamp
    );
  }

  private async checkCommandOutputEquals(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string; observations?: any[] },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const expected = check.expectedOutput!;
    if (ctx.observations && ctx.observations.length > 0) {
      const allOutputs = ctx.observations.map((o: any) => (o.stdout ?? o.output ?? "").trim()).join("\n").trim();
      const equals = allOutputs === expected.trim();
      return this.makeResult(
        check,
        equals ? "PASSED" : "FAILED",
        expected,
        equals ? `Output equals expected` : `Output "${allOutputs.slice(0, 200)}" != "${expected}"`,
        allOutputs.slice(0, 500),
        [],
        start,
        timestamp
      );
    }
    if (check.command) {
      try {
        const result = spawnSync(check.command, { shell: true, cwd: ctx.workspaceRoot, encoding: "utf8", timeout: check.timeoutMs ?? 30000 });
        const output = (result.stdout ?? "").trim();
        const equals = output === expected.trim();
        return this.makeResult(
          check,
          equals ? "PASSED" : "FAILED",
          expected,
          equals ? `Output equals` : `Output "${output.slice(0, 200)}" != "${expected}"`,
          output.slice(0, 500),
          [],
          start,
          timestamp
        );
      } catch (err) {
        return this.makeResult(check, "FAILED", expected, `Error: ${(err as Error).message}`, "Error", [], start, timestamp);
      }
    }
    return this.makeResult(check, "INCONCLUSIVE", expected, "No observations or command", "Missing", [], start, timestamp);
  }

  private async checkTestPasses(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const cmd = check.testCommand ?? check.command ?? "npm test";
    try {
      const result = spawnSync(cmd, { shell: true, cwd: ctx.workspaceRoot, encoding: "utf8", timeout: check.timeoutMs ?? 60000 });
      const passed = result.status === 0;
      return this.makeResult(
        check,
        passed ? "PASSED" : "FAILED",
        "Tests pass",
        passed ? "Tests passed" : `Tests failed: ${result.stderr?.slice(0, 500) ?? result.stdout?.slice(0, 500)}`,
        `Exit: ${result.status}`,
        [],
        start,
        timestamp
      );
    } catch (err) {
      return this.makeResult(check, "FAILED", "Tests pass", `Error: ${(err as Error).message}`, "Error", [], start, timestamp);
    }
  }

  private async checkTestFails(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    const cmd = check.testCommand ?? check.command ?? "npm test";
    try {
      const result = spawnSync(cmd, { shell: true, cwd: ctx.workspaceRoot, encoding: "utf8", timeout: check.timeoutMs ?? 60000 });
      const failed = result.status !== 0;
      return this.makeResult(
        check,
        failed ? "PASSED" : "FAILED",
        "Tests fail",
        failed ? "Tests failed as expected" : "Tests passed but expected fail",
        `Exit: ${result.status}`,
        [],
        start,
        timestamp
      );
    } catch {
      return this.makeResult(check, "PASSED", "Tests fail", "Tests failed (exception)", "Exception", [], start, timestamp);
    }
  }

  private async checkTestCount(
    check: VerificationCheck,
    ctx: { workspaceRoot: string; objectiveId: string; taskId?: string; runId: string },
    start: number,
    timestamp: string
  ): Promise<VerificationCheckResult> {
    return this.makeResult(check, "INCONCLUSIVE", `Count ${check.expectedTestCount}`, "Test count check not fully implemented", "INCONCLUSIVE", [], start, timestamp);
  }

  private makeResult(
    check: VerificationCheck,
    status: VerificationStatus,
    expected: string,
    message: string,
    actual: string,
    evidence: Evidence[],
    start: number,
    timestamp: string
  ): VerificationCheckResult {
    return {
      checkId: check.id,
      type: check.type,
      status,
      expected,
      actual,
      evidence,
      message,
      durationMs: Date.now() - start,
      timestamp,
    };
  }

  /**
   * Execute full verification plan — deterministic, independent from LLM
   * Supports both signatures:
   * - executePlan(plan, { workspaceRoot, runId, observations, evidence })
   * - executePlan(plan, objectiveId, observations, evidence)  [agentCore compatibility]
   */
  async executePlan(
    plan: VerificationPlan,
    contextOrObjectiveId: { workspaceRoot: string; runId: string; observations?: any[]; evidence?: Evidence[] } | string,
    observations?: any[],
    evidence?: Evidence[]
  ): Promise<VerificationResult> {
    let context: { workspaceRoot: string; runId: string; observations?: any[]; evidence?: Evidence[] };

    if (typeof contextOrObjectiveId === "string") {
      const objectiveId = contextOrObjectiveId;
      const obs = observations ?? [];
      const ev = evidence ?? [];
      context = {
        workspaceRoot: this.config.workspaceRoot,
        runId: objectiveId,
        observations: obs,
        evidence: ev,
      };
    } else {
      context = contextOrObjectiveId;
    }

    const start = Date.now();
    const results: VerificationCheckResult[] = [];

    for (const check of plan.checks) {
      const result = await this.executeCheck(check, {
        workspaceRoot: context.workspaceRoot,
        objectiveId: plan.objectiveId,
        taskId: plan.taskId,
        runId: context.runId,
        observations: context.observations,
        evidence: context.evidence,
      });
      results.push(result);
    }

    const requiredFailed = results.filter((r) => {
      const check = plan.checks.find((c) => c.id === r.checkId);
      return check?.required && r.status === "FAILED";
    });

    const blocked = results.some((r) => r.status === "BLOCKED");
    const inconclusive = results.some((r) => r.status === "INCONCLUSIVE") && requiredFailed.length === 0;

    let status: VerificationStatus;
    let passed: boolean;
    if (blocked) {
      status = "BLOCKED";
      passed = false;
    } else if (requiredFailed.length > 0) {
      status = "FAILED";
      passed = false;
    } else if (inconclusive) {
      status = "INCONCLUSIVE";
      passed = false;
    } else {
      status = "PASSED";
      passed = true;
    }

    const summary = passed
      ? `Verification PASSED: ${results.filter((r) => r.status === "PASSED").length}/${results.length} checks passed`
      : `Verification ${status}: ${requiredFailed.map((r) => r.checkId).join(", ")} failed`;

    const result: VerificationResult = {
      id: createVerificationResultId(),
      planId: plan.id,
      objectiveId: plan.objectiveId,
      taskId: plan.taskId,
      runId: context.runId,
      status,
      passed,
      checkResults: results,
      checks: results as any,
      summary,
      timestamp: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    } as any;

    this.logger.verification(plan.objectiveId, passed, summary);

    return result;
  }
}

export const globalVerificationEngine = new VerificationEngine();
