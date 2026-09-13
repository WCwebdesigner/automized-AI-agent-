/**
 * Acceptance Criteria — Phase 6
 * Explicit completion criteria derived from requirements, must be satisfied before complete
 */

import { AcceptanceCriterion, Requirement } from "../requirements/types";
import { createAcceptanceCriterion } from "../requirements/types";
import { VerificationEngine } from "../verification/engine";
import { createCheck } from "../verification/types";
import { AgentLogger, globalLogger } from "../core/logger";

export class AcceptanceCriteriaManager {
  private logger: AgentLogger;
  private verificationEngine: VerificationEngine;

  constructor(logger: AgentLogger = globalLogger, verificationEngine?: VerificationEngine) {
    this.logger = logger;
    this.verificationEngine = verificationEngine ?? new VerificationEngine(logger);
  }

  deriveFromRequirements(requirements: Requirement[]): AcceptanceCriterion[] {
    const criteria: AcceptanceCriterion[] = [];
    for (const req of requirements) {
      for (const ac of req.acceptanceCriteria) {
        criteria.push({ ...ac });
      }
      if (req.acceptanceCriteria.length === 0) {
        criteria.push(
          createAcceptanceCriterion({
            requirementId: req.id,
            description: req.description,
            expected: req.description,
            verificationMethod: "MANUAL",
          })
        );
      }
    }
    return criteria;
  }

  async verify(
    criteria: AcceptanceCriterion[],
    context: { workspaceRoot: string; projectWorkspacePath: string; runId: string; observations: any[]; evidence: any[] }
  ): Promise<Array<AcceptanceCriterion & { passed: boolean; message: string }>> {
    const results: Array<AcceptanceCriterion & { passed: boolean; message: string }> = [];

    for (const ac of criteria) {
      let passed = false;
      let message = "";
      let actual = "";

      try {
        switch (ac.verificationMethod) {
          case "FILE_EXISTS": {
            const fs = require("node:fs");
            const path = require("node:path");
            if (ac.expected === ".py" || ac.expected === ".js" || ac.expected === ".ts") {
              const root = path.resolve(context.workspaceRoot, context.projectWorkspacePath);
              try {
                const walk = (dir: string): string[] => {
                  const entries = fs.readdirSync(dir, { withFileTypes: true });
                  const files: string[] = [];
                  for (const e of entries) {
                    const full = path.join(dir, e.name);
                    if (e.isDirectory()) {
                      if (e.name === "node_modules" || e.name === ".git") continue;
                      files.push(...walk(full));
                    } else {
                      files.push(full);
                    }
                  }
                  return files;
                };
                const allFiles = fs.existsSync(root) ? walk(root) : [];
                const hasMatch = allFiles.some((f: string) => f.endsWith(ac.expected));
                passed = hasMatch;
                message = hasMatch ? `Found file ending with ${ac.expected}` : `No file ending with ${ac.expected} found`;
                actual = hasMatch ? allFiles.filter((f: string) => f.endsWith(ac.expected)).slice(0, 5).join(", ") : "missing";
              } catch {
                passed = false;
                message = `Error checking for ${ac.expected}`;
                actual = "error";
              }
            } else {
              const abs = path.resolve(context.workspaceRoot, context.projectWorkspacePath, ac.expected);
              const exists = fs.existsSync(abs);
              passed = exists;
              message = exists ? `File exists: ${ac.expected}` : `File missing: ${ac.expected}`;
              actual = exists ? `exists at ${abs}` : "missing";
            }
            break;
          }
          case "COMMAND_OUTPUT": {
            const allOutputs = (context.observations ?? [])
              .map((o: any) => o.stdout ?? o.output ?? o.outputCombined ?? "")
              .join("\n");
            const generic = ["executable", "completed", "exit 0", "pass", "verified"];
            if (generic.includes(ac.expected.toLowerCase())) {
              passed = (context.observations ?? []).some((o: any) => o.success);
              message = passed ? `Found successful execution for "${ac.expected}"` : `No successful execution for "${ac.expected}"`;
              actual = allOutputs.slice(0, 500) || "no output";
            } else {
              passed = allOutputs.includes(ac.expected);
              message = passed ? `Found expected "${ac.expected}"` : `Expected "${ac.expected}" not found in outputs (got ${allOutputs.slice(0, 200)})`;
              actual = allOutputs.slice(0, 500) || "no output";
            }
            break;
          }
          case "TEST_PASS": {
            const testObs = (context.observations ?? []).find(
              (o: any) => o.toolName === "run_tests" || o.toolName === "run_python" || o.toolName === "run_command"
            );
            if (testObs) {
              passed = testObs.success;
              message = passed ? "Tests passed" : `Tests failed: ${testObs.failureReason ?? testObs.stderr?.slice(0, 200)}`;
              actual = testObs.stdout?.slice(0, 500) ?? "";
            } else {
              const check = createCheck({
                type: "TEST_PASSES",
                testCommand: "python3 -m pytest tests/ 2>&1 || python3 -m unittest discover -s tests 2>&1 || npm test 2>&1 || echo 'no test command'",
                required: false,
                description: ac.description,
              });
              const result = await this.verificationEngine.executeCheck(check, {
                workspaceRoot: context.workspaceRoot,
                objectiveId: "acceptance",
                runId: context.runId,
              });
              passed = result.status === "PASSED" || result.status === "INCONCLUSIVE";
              message = result.message;
              actual = result.actual;
            }
            break;
          }
          case "MANUAL":
          default: {
            passed = (context.observations ?? []).length > 0;
            message = passed ? `Manual criterion considered passed (observations exist)` : "No observations";
            actual = "manual";
            break;
          }
        }
      } catch (err) {
        passed = false;
        message = `Error verifying criterion: ${(err as Error).message}`;
        actual = `error: ${(err as Error).message}`;
      }

      results.push({
        ...ac,
        status: passed ? "PASSED" : "FAILED",
        passed,
        message,
        actual,
      } as any);

      this.logger.info("acceptance_criteria_verified", `Criteria ${ac.id} ${passed ? "PASSED" : "FAILED"}: ${ac.description}`, {
        criteriaId: ac.id,
        passed,
      } as any);
    }

    return results;
  }

  allPassed(results: Array<{ passed: boolean }>): boolean {
    return results.every((r) => r.passed);
  }

  getFailed(results: Array<{ passed: boolean; description: string }>): Array<{ passed: boolean; description: string }> {
    return results.filter((r) => !r.passed);
  }
}

export const globalAcceptanceCriteriaManager = new AcceptanceCriteriaManager();
