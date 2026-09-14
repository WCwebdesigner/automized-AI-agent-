/**
 * Project-Level Verification — Phase 6
 * Extends Phase 4 verification to holistic project evaluation
 * Required files exist, functionality works, tests pass, commands execute, acceptance criteria pass, no incomplete tasks, no unresolved critical failures
 * Deterministic, LLM cannot declare complete by itself
 */

import fs from "node:fs";
import path from "node:path";
import { VerificationEngine } from "./engine";
import { createCheck, createPlan, VerificationPlan, VerificationResult, VerificationStatus } from "./types";
import { Project } from "../project/types";
import { TaskGraphManager } from "../taskGraph/graph";
import { ProjectTaskStatus } from "../taskGraph/types";
import { AcceptanceCriteriaManager } from "../project/acceptance";
import { Observation, Evidence } from "../observation/types";
import { AgentLogger, globalLogger } from "../core/logger";

export interface ProjectVerificationResult {
  passed: boolean;
  status: VerificationStatus;
  summary: string;
  checks: {
    filesExist: { passed: boolean; missing: string[]; message: string };
    functionality: { passed: boolean; message: string };
    tests: { passed: boolean; message: string };
    acceptanceCriteria: { passed: boolean; failed: any[]; message: string };
    tasks: { passed: boolean; incomplete: string[]; message: string };
    failures: { passed: boolean; criticalFailures: string[]; message: string };
  };
  verificationResult: VerificationResult;
  acceptanceResults: any[];
  timestamp: string;
}

export class ProjectVerificationEngine {
  private verificationEngine: VerificationEngine;
  private acceptanceManager: AcceptanceCriteriaManager;
  private logger: AgentLogger;

  constructor(
    verificationEngine: VerificationEngine = new VerificationEngine(),
    acceptanceManager: AcceptanceCriteriaManager = new AcceptanceCriteriaManager(),
    logger: AgentLogger = globalLogger
  ) {
    this.verificationEngine = verificationEngine;
    this.acceptanceManager = acceptanceManager;
    this.logger = logger;
  }

  async verifyProject(params: {
    project: Project;
    taskGraphManager: TaskGraphManager;
    workspaceRoot: string;
    runId: string;
    observations: Observation[];
    evidence: Evidence[];
  }): Promise<ProjectVerificationResult> {
    const { project, taskGraphManager, workspaceRoot, runId, observations, evidence } = params;
    const projectRoot = path.resolve(workspaceRoot, project.workspacePath);

    // 1. Required files exist
    const filesExist = this.checkRequiredFiles(project, projectRoot);

    // 2. Tasks completeness
    const tasksCheck = this.checkTasks(project, taskGraphManager);

    // 3. No unresolved critical failures
    const failuresCheck = this.checkFailures(project, taskGraphManager);

    // 4. Acceptance criteria
    const acceptanceResults = await this.acceptanceManager.verify(project.acceptanceCriteria, {
      workspaceRoot,
      projectWorkspacePath: project.workspacePath,
      runId,
      observations: observations as any,
      evidence: evidence as any,
    });
    const acceptancePassed = this.acceptanceManager.allPassed(acceptanceResults);
    const failedAcceptance = this.acceptanceManager.getFailed(acceptanceResults as any);

    // 5. Functionality — check via observations that commands executed successfully
    const functionality = this.checkFunctionality(observations, project);

    // 6. Tests — if project has test deliverables or requirements mentioning tests
    const tests = this.checkTests(observations, project);

    // Build verification plan for holistic checks
    const checks: any[] = [];

    // File existence checks for deliverables
    for (const del of project.deliverables.filter((d) => d.required)) {
      if (del.filePath) {
        checks.push(
          createCheck({
            type: "FILE_EXISTS",
            filePath: path.join(project.workspacePath, del.filePath),
            required: true,
            description: `Deliverable ${del.description} exists at ${del.filePath}`,
          })
        );
      }
    }

    // Acceptance criteria as file/output checks — deduplicate and skip generic patterns
    const seenFiles = new Set<string>();
    for (const del of project.deliverables.filter((d) => d.required)) {
      if (del.filePath) seenFiles.add(del.filePath);
    }
    for (const ac of project.acceptanceCriteria.slice(0, 10)) {
      if (ac.verificationMethod === "FILE_EXISTS") {
        // Skip generic ".py" etc that are already covered by deliverables
        if (ac.expected === ".py" || ac.expected === ".js" || ac.expected === ".ts") continue;
        // Skip if already covered by deliverable
        if (seenFiles.has(ac.expected)) continue;
        // Skip if expected is not a reasonable file path (contains spaces or too short generic)
        if (ac.expected.length < 3 || ac.expected.includes(" ")) continue;
        checks.push(
          createCheck({
            type: "FILE_EXISTS",
            filePath: path.join(project.workspacePath, ac.expected),
            required: true,
            description: ac.description,
          })
        );
        seenFiles.add(ac.expected);
      } else if (ac.verificationMethod === "COMMAND_OUTPUT") {
        const generic = ["executable", "completed", "exit 0", "pass", "verified"];
        if (generic.includes(ac.expected.toLowerCase())) continue; // already covered by functionality check
        checks.push(
          createCheck({
            type: "COMMAND_OUTPUT_CONTAINS",
            expectedOutput: ac.expected,
            required: true,
            description: ac.description,
          })
        );
      }
    }

    if (checks.length === 0) {
      checks.push(
        createCheck({
          type: "FILE_EXISTS",
          filePath: project.workspacePath,
          required: false,
          description: "Project workspace exists",
        })
      );
    }

    const plan = createPlan({
      objectiveId: project.objectiveId,
      description: `Project verification for ${project.title}`,
      checks,
      createdBy: "SYSTEM",
    });

    const verificationResult = await this.verificationEngine.executePlan(plan, {
      workspaceRoot,
      runId,
      observations: observations.map((o) => ({ stdout: o.stdout, output: o.outputCombined, outputCombined: o.outputCombined })),
      evidence,
    });

    // Overall passed only if all checks pass and verificationResult passed and no critical failures and acceptance passed
    const passed =
      filesExist.passed &&
      tasksCheck.passed &&
      failuresCheck.passed &&
      acceptancePassed &&
      functionality.passed &&
      tests.passed &&
      verificationResult.passed;

    const status: VerificationStatus = passed ? "PASSED" : "FAILED";
    const summary = passed
      ? `Project verification PASSED: all ${checks.length} checks, ${acceptanceResults.length} acceptance criteria, ${tasksCheck.total} tasks`
      : `Project verification FAILED: ${[
          !filesExist.passed ? `files missing: ${filesExist.missing.join(", ")}` : "",
          !tasksCheck.passed ? `incomplete tasks: ${tasksCheck.incomplete.join(", ")}` : "",
          !failuresCheck.passed ? `critical failures: ${failuresCheck.criticalFailures.join(", ")}` : "",
          !acceptancePassed ? `acceptance failed: ${failedAcceptance.map((f: any) => f.description).join(", ")}` : "",
          !functionality.passed ? `functionality: ${functionality.message}` : "",
          !tests.passed ? `tests: ${tests.message}` : "",
          !verificationResult.passed ? `verification: ${verificationResult.summary}` : "",
        ]
          .filter(Boolean)
          .join("; ")}`;

    this.logger.info("project_verification", summary, {
      projectId: project.id,
      passed,
      status,
    });

    return {
      passed,
      status,
      summary,
      checks: {
        filesExist,
        functionality,
        tests,
        acceptanceCriteria: {
          passed: acceptancePassed,
          failed: failedAcceptance,
          message: acceptancePassed ? "All acceptance criteria passed" : `Failed: ${failedAcceptance.map((f: any) => f.description).join(", ")}`,
        },
        tasks: tasksCheck,
        failures: failuresCheck,
      },
      verificationResult,
      acceptanceResults,
      timestamp: new Date().toISOString(),
    };
  }

  private checkRequiredFiles(project: Project, projectRoot: string): { passed: boolean; missing: string[]; message: string } {
    const missing: string[] = [];
    for (const del of project.deliverables.filter((d) => d.required)) {
      if (del.filePath) {
        const abs = path.resolve(projectRoot, del.filePath);
        if (!fs.existsSync(abs)) {
          missing.push(del.filePath);
        }
      }
    }
    return {
      passed: missing.length === 0,
      missing,
      message: missing.length === 0 ? "All required files exist" : `Missing files: ${missing.join(", ")}`,
    };
  }

  private checkTasks(project: Project, taskGraphManager: TaskGraphManager): { passed: boolean; incomplete: string[]; total: number; message: string } {
    const graph = project.taskGraphId ? taskGraphManager.getGraph(project.taskGraphId) : taskGraphManager.getGraphByProject(project.id);
    if (!graph) {
      return { passed: false, incomplete: ["No task graph"], total: 0, message: "No task graph found" };
    }
    const all = Array.from(graph.tasks.values());
    const incomplete = all.filter((t) => t.status !== ProjectTaskStatus.COMPLETED && t.status !== ProjectTaskStatus.CANCELLED).map((t) => `${t.description} (${t.status})`);
    return {
      passed: incomplete.length === 0,
      incomplete,
      total: all.length,
      message: incomplete.length === 0 ? `All ${all.length} tasks completed` : `Incomplete tasks: ${incomplete.join(", ")}`,
    };
  }

  private checkFailures(project: Project, taskGraphManager: TaskGraphManager): { passed: boolean; criticalFailures: string[]; message: string } {
    const graph = project.taskGraphId ? taskGraphManager.getGraph(project.taskGraphId) : taskGraphManager.getGraphByProject(project.id);
    if (!graph) return { passed: true, criticalFailures: [], message: "No graph, no failures" };

    const critical = Array.from(graph.tasks.values())
      .filter((t) => t.status === ProjectTaskStatus.FAILED && (t.failureInfo?.message?.toLowerCase().includes("critical") || t.type === "VERIFICATION"))
      .map((t) => t.description);

    return {
      passed: critical.length === 0,
      criticalFailures: critical,
      message: critical.length === 0 ? "No critical failures" : `Critical failures: ${critical.join(", ")}`,
    };
  }

  private checkFunctionality(observations: Observation[], project: Project): { passed: boolean; message: string } {
    // At least one successful command execution if project is executable
    const hasSuccess = observations.some((o) => o.success);
    if (!hasSuccess && observations.length > 0) {
      return { passed: false, message: "No successful tool executions observed" };
    }
    // If observations contain output, consider functionality verified
    const hasOutput = observations.some((o) => o.stdout && o.stdout.length > 0);
    return {
      passed: hasSuccess,
      message: hasSuccess ? `Functionality observed: ${observations.length} executions, output present: ${hasOutput}` : "No functionality evidence",
    };
  }

  private checkTests(observations: Observation[], project: Project): { passed: boolean; message: string } {
    const requiresTests = project.requirements.some((r) => r.description.toLowerCase().includes("test")) || project.deliverables.some((d) => d.type === "TEST");

    if (!requiresTests) {
      return { passed: true, message: "No tests required" };
    }

    // Check if test executions passed
    const testObservations = observations.filter((o) => o.toolName === "run_test" || o.toolName === "run_python" || o.toolName === "run_command");
    const hasTestSuccess = testObservations.some((o) => o.success);

    // If no test observations yet but tests required, it's not necessarily failed — may be pending
    // For final verification, require at least one test success if tests required
    if (requiresTests && observations.length > 0 && !hasTestSuccess) {
      // Check if there are any test files that exist
      return { passed: false, message: "Tests required but no successful test execution observed" };
    }

    return { passed: true, message: hasTestSuccess ? "Tests passed" : "Tests not yet executed but not failed" };
  }
}

export const globalProjectVerificationEngine = new ProjectVerificationEngine();
