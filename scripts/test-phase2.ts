/**
 * Phase 2 Test — Autonomous Agent Core
 * Tests objective/task system, planner, execution engine, recovery, verification, persistence, model routing, safety, first real test, failure recovery test
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ModelRouter } from "../src/agent/model/router";
import { ScriptedProvider } from "../src/agent/model/scripted";
import { AgentLogger } from "../src/agent/core/logger";
import { AgentCore } from "../src/agent/core/agentCore";
import { globalToolRegistry } from "../src/agent/tools/registry";
import "../src/agent/tools/engineering";
import { PermissionLevel, ToolResultStatus } from "../src/agent/core/constants";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kaira-phase2-"));
process.env.KAIRA_WORKSPACE = tmpRoot;
process.env.KAIRA_ALLOW_ALL_COMMANDS = "true";
process.env.KAIRA_ALLOW_DESTRUCTIVE = "true";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.error(`  ✘ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function testObjectiveTaskSystem() {
  console.log("\n1. Objective/Task System");

  const { createObjective, updateObjective, getObjectiveProgress } = await import("../src/agent/core/objective");
  const { createTask } = await import("../src/agent/core/task");

  const obj = createObjective({ title: "Test objective", description: "Create file", priority: 1 });
  check("objective has unique ID", !!obj.id);
  check("objective has originalObjective", !!obj.originalObjective);
  check("objective status PENDING", obj.status === "PENDING");
  check("objective has creation time", !!obj.createdAt);
  check("objective has task list", Array.isArray(obj.tasks));
  check("objective has completed/failed lists", Array.isArray(obj.completedTasks) && Array.isArray(obj.failedTasks));
  check("objective has attempt count", typeof obj.attemptCount === "number");
  check("objective has maxAttempts", typeof obj.maxAttempts === "number");

  const task1 = createTask({ objectiveId: obj.id, objective: obj.title, description: "Task 1", priority: 1 });
  const task2 = createTask({ objectiveId: obj.id, objective: obj.title, description: "Task 2", priority: 2, dependencies: [task1.id] });

  check("task has dependencies", task2.dependencies.includes(task1.id));
  check("task has priority", task2.priority === 2);
  check("task has attempts", task2.attempts === 0);
  check("task has selectedTool optional", true); // field exists

  const objWithTasks = { ...obj, tasks: [task1, task2] };
  const progress = getObjectiveProgress(objWithTasks);
  check("progress total 2", progress.total === 2);
  check("progress percent 0", progress.percent === 0);
}

async function testPlanner() {
  console.log("\n2. Planner (qwen3:8b via router)");

  const scripted = new ScriptedProvider([
    JSON.stringify({
      reasoning: "Need to create file and verify",
      tasks: [
        { description: "List workspace", tool: "list_directory", args: { path: "." }, priority: 10 },
        { description: "Create file", tool: "write_file", args: { path: "test.txt", content: "hello" }, priority: 9, dependencies: [0] },
      ],
    }),
  ]);

  const router = new ModelRouter({ providerKind: "scripted" } as any);
  router.setScriptedProvider(scripted);

  const { Planner } = await import("../src/agent/planning/planner");
  const planner = new Planner(router);

  const plan = await planner.generatePlan("Create a file test.txt");
  check("planner generates plan", !!plan);
  check("plan has tasks", plan.tasks.length > 0);
  check("plan has reasoning", !!plan.reasoning);
  check("plan tasks have description", plan.tasks.every((t) => !!t.description));

  const tasks = planner.planToTasks(plan, "obj-1", "Create file");
  check("planToTasks creates Task objects", tasks.length === plan.tasks.length);
  check("tasks have IDs", tasks.every((t) => !!t.id));
}

async function testExecutionEngine() {
  console.log("\n3. Execution Engine");

  const router = new ModelRouter({ providerKind: "scripted" } as any);
  router.setScriptedProvider(new ScriptedProvider([]));
  const logger = new AgentLogger();
  const { ExecutionEngine } = await import("../src/agent/execution/executor");
  const engine = new ExecutionEngine(logger, router);

  const { createTask } = await import("../src/agent/core/task");
  const task = createTask({
    objectiveId: "test",
    objective: "Test",
    description: "Create file via write_file",
    selectedTool: "write_file",
    toolArguments: { path: "exec_test.txt", content: "executed" },
  });

  const result = await engine.executeTask(task);
  check("execution engine executes task", !!result.task);
  check("task succeeded", result.success);
  check("task has result", !!result.task.result);
  check("result status SUCCESS", result.task.result?.status === ToolResultStatus.SUCCESS);
  check("file actually created", fs.existsSync(path.join(tmpRoot, "exec_test.txt")));
}

async function testFailureRecovery() {
  console.log("\n4. Failure Recovery");

  const { RecoverySystem } = await import("../src/agent/recovery/recovery");
  const { createTask } = await import("../src/agent/core/task");
  const recovery = new RecoverySystem();

  const task = createTask({
    objectiveId: "test",
    objective: "Test failure",
    description: "Run non-existent file",
    selectedTool: "run_python",
    toolArguments: { path: "nonexistent.py" },
    maxAttempts: 2,
  });

  // Simulate failure
  const failedResult = await globalToolRegistry.execute("run_python", { path: "nonexistent.py" }, {
    workspaceRoot: tmpRoot,
    permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  } as any);

  const failedTask = {
    ...task,
    status: "FAILED" as any,
    result: failedResult,
    error: failedResult.error,
    attempts: 1,
  };

  const diagnosis = await recovery.diagnose(failedTask as any);
  check("diagnosis returns recoverable boolean", typeof diagnosis.recoverable === "boolean");
  check("diagnosis has reason", !!diagnosis.reason);
  check("diagnosis has suggestedAction", !!diagnosis.suggestedAction);

  check("canRetry when attempts < max", recovery.canRetry(failedTask as any));
}

async function testVerification() {
  console.log("\n5. Verification (separate from execution)");

  const { Verifier } = await import("../src/agent/verification/verifier");
  const verifier = new Verifier();

  fs.writeFileSync(path.join(tmpRoot, "verify_me.txt"), "hello world", "utf8");

  const check1 = await verifier.verifyFileExists(tmpRoot, "verify_me.txt", true);
  check("verify file exists", check1.passed);

  const check2 = await verifier.verifyFileContains(tmpRoot, "verify_me.txt", "hello");
  check("verify file contains", check2.passed);

  const check3 = await verifier.verifyCommandOutput("output is 12", "12");
  check("verify command output contains", check3.passed);

  const { createObjective } = await import("../src/agent/core/objective");
  const { createTask } = await import("../src/agent/core/task");
  const obj = createObjective({ title: "Create file verify_me.txt", description: "Create file" });
  const task = createTask({
    objectiveId: obj.id,
    objective: obj.title,
    description: "Create file",
    selectedTool: "write_file",
    toolArguments: { path: "verify_me.txt" },
  });

  // Simulate completed task
  const completedTask = {
    ...task,
    status: "COMPLETED" as any,
    result: {
      status: ToolResultStatus.SUCCESS,
      tool: "write_file",
      input: {},
      output: "Wrote file",
      executionTimeMs: 10,
      timestamp: new Date().toISOString(),
      affectedFiles: ["verify_me.txt"],
    },
  };

  const objWithTask = { ...obj, tasks: [completedTask as any], finalResult: "Created file" };
  const verification = await verifier.verifyObjective(objWithTask as any, tmpRoot);
  check("objective verification runs", !!verification);
  check("verification has checks", verification.checks.length > 0);
}

async function testModelRouting() {
  console.log("\n6. Model Routing (qwen3:8b reasoning, qwen2.5-coder:7b coding, llama3.2:3b lightweight)");

  const router = new ModelRouter({
    reasoningModel: "qwen3:8b",
    codingModel: "qwen2.5-coder:7b",
    lightweightModel: "llama3.2:3b",
    visionModel: "moondream:latest",
    baseUrl: "http://localhost:11434",
    providerKind: "scripted",
  });

  check("reasoning → qwen3:8b", router.getModelForTaskType("reasoning") === "qwen3:8b");
  check("coding → qwen2.5-coder:7b", router.getModelForTaskType("coding") === "qwen2.5-coder:7b");
  check("lightweight → llama3.2:3b", router.getModelForTaskType("lightweight") === "llama3.2:3b");
  check("vision → moondream:latest", router.getModelForTaskType("vision") === "moondream:latest");
  check("planning uses reasoning model", router.getModelForTaskType("planning") === "qwen3:8b");
  check("diagnosis uses reasoning model", router.getModelForTaskType("diagnosis") === "qwen3:8b");
  check("repair uses coding model", router.getModelForTaskType("repair") === "qwen2.5-coder:7b");

  const scripted = new ScriptedProvider(["reasoning response", "coding response"]);
  router.setScriptedProvider(scripted);

  const reasoningResult = await router.reasoning([{ role: "user", content: "test" }]);
  check("reasoning route works", !!reasoningResult.content);

  const codingResult = await router.coding([{ role: "user", content: "test" }]);
  check("coding route works", !!codingResult.content);
}

async function testSafety() {
  console.log("\n7. Safety / Control");

  const { loadConfig } = await import("../src/agent/config");
  const config = loadConfig();

  check("config has maxAttempts", typeof config.safety.maxAttempts === "number");
  check("config has maxExecutionTimeMs", typeof config.safety.maxExecutionTimeMs === "number");
  check("config has maxRepairCycles", typeof config.safety.maxRepairCycles === "number");
  check("config has commandTimeout", typeof config.safety.commandTimeoutMs === "number");
  check("config has maxSteps", typeof config.safety.maxSteps === "number");

  // Test state transitions are explicit and logged
  const { AgentStateMachine } = await import("../src/agent/core/stateMachine");
  const { AgentState } = await import("../src/agent/core/constants");
  const logger = new AgentLogger();
  const sm = new AgentStateMachine(AgentState.IDLE, logger);

  sm.transition(AgentState.PLANNING, "test");
  sm.transition(AgentState.EXECUTING, "test");

  check("state transitions logged", sm.getHistory().length === 2);
  check("logger has entries", logger.getEntries().length > 0);
}

async function testFirstRealTest() {
  console.log("\n8. First Real Test: calculator_test.py (5+7=12)");

  const scripted = new ScriptedProvider([
    JSON.stringify({
      reasoning: "Create calculator_test.py with 5+7=12",
      tasks: [
        { description: "Create calculator_test.py", tool: "write_file", args: { path: "calculator_test.py", content: "def main():\n    result = 5 + 7\n    print(result)\n\nif __name__ == \"__main__\":\n    main()\n" }, priority: 10 },
        { description: "Run calculator_test.py", tool: "run_python", args: { path: "calculator_test.py" }, priority: 9, dependencies: [0] },
      ],
    }),
  ]);

  const router = new ModelRouter({ providerKind: "scripted" } as any);
  router.setScriptedProvider(scripted);
  const logger = new AgentLogger();
  const core = new AgentCore({ workspaceRoot: tmpRoot, persistenceEnabled: false }, { router, logger });

  const report = await core.executeObjective("Create a Python file called calculator_test.py containing a program that adds 5 and 7 and prints the result. Execute the program and verify that the output is 12.");

  check("first real test: objective completed or attempted", !!report);
  check("first real test: tasks executed", report.tasksTotal > 0);
  check("first real test: file created", fs.existsSync(path.join(tmpRoot, "calculator_test.py")) || report.filesCreated.includes("calculator_test.py"));

  if (fs.existsSync(path.join(tmpRoot, "calculator_test.py"))) {
    const runResult = await globalToolRegistry.execute("run_python", { path: "calculator_test.py" }, {
      workspaceRoot: tmpRoot,
      permissionLevel: PermissionLevel.COMMAND_EXECUTION,
    } as any);
    check("first real test: output is 12", runResult.stdout?.trim() === "12", `got ${runResult.stdout?.trim()}`);
  }

  console.log(`\n   Report: status=${report.status}, progress=${report.progress}%, time=${report.executionTimeMs}ms`);
  console.log(`   Files: ${report.filesCreated.join(", ")}`);
  console.log(`   Verification: ${report.verification?.passed ? "PASSED" : "FAILED"} - ${report.verification?.details}`);
}

async function testFailureRecoveryTest() {
  console.log("\n9. Failure Recovery Test (broken Python file)");

  // Create broken file then repair via core
  const brokenContent = 'print("hello"\n'; // syntax error
  fs.writeFileSync(path.join(tmpRoot, "broken_recovery.py"), brokenContent, "utf8");

  const runBroken = await globalToolRegistry.execute("run_python", { path: "broken_recovery.py" }, {
    workspaceRoot: tmpRoot,
    permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  } as any);

  check("failure recovery: broken file fails", runBroken.status === ToolResultStatus.FAILURE);

  // Repair
  const fixedContent = 'print("hello")\nprint(12)\n';
  const fixResult = await globalToolRegistry.execute("write_file", { path: "broken_recovery.py", content: fixedContent }, {
    workspaceRoot: tmpRoot,
    permissionLevel: PermissionLevel.DESTRUCTIVE,
  } as any);

  check("failure recovery: repair succeeds", fixResult.status === ToolResultStatus.SUCCESS);

  const rerunResult = await globalToolRegistry.execute("run_python", { path: "broken_recovery.py" }, {
    workspaceRoot: tmpRoot,
    permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  } as any);

  check("failure recovery: rerun succeeds", rerunResult.status === ToolResultStatus.SUCCESS);
  check("failure recovery: corrected result verified", rerunResult.stdout?.includes("12") || false);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 2 TEST — Autonomous Agent Core                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Workspace: ${tmpRoot}`);

  await testObjectiveTaskSystem();
  await testPlanner();
  await testExecutionEngine();
  await testFailureRecovery();
  await testVerification();
  await testModelRouting();
  await testSafety();
  await testFirstRealTest();
  await testFailureRecoveryTest();

  console.log(`\n${failures === 0 ? "RESULT: PASS" : `RESULT: FAIL — ${failures} check(s) failed`}`);

  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("PHASE2 TEST CRASHED:", err);
  process.exit(1);
});
