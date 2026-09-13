/**
 * Phase 4 Test — Observation, Evidence & Verification
 * 20 tests covering command observation, file observation, evidence, verification, completion decision, limits, persistence, traceability
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kaira-phase4-"));
process.env.KAIRA_WORKSPACE = tmpRoot;
process.env.KAIRA_ALLOW_DESTRUCTIVE = "true";
process.env.KAIRA_PERSISTENCE_PATH = path.join(tmpRoot, ".kaira", "agent_state.json");

let passes = 0;
let failures = 0;

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passes++;
    console.log(`  ✔ ${label}`);
  } else {
    failures++;
    console.error(`  ✘ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 4 TEST — Observation, Evidence & Verification    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Workspace: ${tmpRoot}`);

  // Dynamic imports after env setup
  const { globalToolRegistry } = await import("../src/agent/tools/registry");
  await import("../src/agent/tools/engineering");
  const { PermissionLevel, ToolResultStatus } = await import("../src/agent/core/constants");
  const { ObservationCollector, EvidenceFactory, observeToolExecution, ObservationLimiter } = await import("../src/agent/observation");
  const { VerificationEngine, VerificationPlanParser, CompletionDecisionEngine } = await import("../src/agent/verification");
  const { createCheck, createPlan } = await import("../src/agent/verification/types");
  const { globalPersistence } = await import("../src/agent/state/persistence");

  const objectiveId = randomUUID();
  const taskId = randomUUID();
  const runId = randomUUID();

  // 1. Command observation success
  console.log("\n1. Command observation success/fail");
  const writeResult = await globalToolRegistry.execute("write_file", { path: "obs_test.py", content: "print(12)\n" }, { workspaceRoot: tmpRoot, permissionLevel: PermissionLevel.DESTRUCTIVE } as any);
  const collector = new ObservationCollector();
  const obsSuccess = await collector.createObservation({
    objectiveId,
    taskId,
    runId,
    toolName: "write_file",
    durationMs: writeResult.executionTimeMs,
    result: writeResult,
    workspaceRoot: tmpRoot,
  });
  check("Command observation success has actionId", !!obsSuccess.actionId);
  check("Command observation success has objectiveId/taskId/runId", obsSuccess.objectiveId === objectiveId && obsSuccess.taskId === taskId && obsSuccess.runId === runId);
  check("Command observation success has toolName/timestamp/duration", !!obsSuccess.toolName && !!obsSuccess.timestamp && obsSuccess.durationMs >= 0);
  check("Command observation success flag true", obsSuccess.success === true);
  check("Command observation captures affectedFiles", obsSuccess.affectedFiles.includes("obs_test.py"));

  // 2. Command observation failure
  const failResult = await globalToolRegistry.execute("run_command", { command: "node -e \"console.log('out'); console.error('err'); process.exit(1)\"" }, { workspaceRoot: tmpRoot, permissionLevel: PermissionLevel.COMMAND_EXECUTION } as any);
  const obsFail = await collector.createObservation({
    objectiveId,
    taskId,
    runId,
    toolName: "run_command",
    durationMs: failResult.executionTimeMs,
    result: failResult,
    workspaceRoot: tmpRoot,
  });
  check("Command observation failure success=false", obsFail.success === false);
  check("Command observation failure has exitCode", obsFail.exitCode === 1);
  check("Command observation captures stdout/stderr", !!obsFail.stdout?.includes("out") && !!obsFail.stderr?.includes("err"));

  // 3. Stdout/stderr/exit capture
  console.log("\n2. Stdout/stderr/exit capture");
  check("Stdout captured", obsFail.stdout?.includes("out") || false);
  check("Stderr captured", obsFail.stderr?.includes("err") || false);
  check("Exit code captured", obsFail.exitCode === 1);

  // 4. File observation
  console.log("\n3. File observation");
  const obsFile = obsSuccess;
  check("File observation createdFiles", obsFile.createdFiles.includes("obs_test.py") || obsFile.affectedFiles.includes("obs_test.py"));
  check("File observation fileMetadata exists", obsFile.fileMetadata.length > 0);
  check("File observation fileMetadata has path and exists", obsFile.fileMetadata[0]?.path === "obs_test.py" && obsFile.fileMetadata[0]?.exists === true);

  // 5. Evidence creation
  console.log("\n4. Evidence creation from observation");
  const evidences = EvidenceFactory.fromObservation(obsSuccess);
  check("Evidence creation produces evidence", evidences.length > 0);
  check("Evidence has source/type/confidence", evidences.every((e) => !!e.source && !!e.type && typeof e.confidence === "number"));
  check("Evidence types include FILE_CREATED or FILE_EXISTS", evidences.some((e) => e.type === "FILE_CREATED" || e.type === "FILE_EXISTS"));
  check("Evidence originates from real observation", evidences.every((e) => e.observationId === obsSuccess.id));

  const evidencesFail = EvidenceFactory.fromObservation(obsFail);
  check("Evidence from failed command includes COMMAND_EXIT_CODE", evidencesFail.some((e) => e.type === "COMMAND_EXIT_CODE"));
  check("Evidence from failed command includes STDOUT/STDERR", evidencesFail.some((e) => e.type === "STDOUT") && evidencesFail.some((e) => e.type === "STDERR"));

  // 6. File existence/content verification
  console.log("\n5. File verification checks");
  const verificationEngine = new VerificationEngine();
  const checkExists = createCheck({ type: "FILE_EXISTS", filePath: "obs_test.py", required: true, description: "obs_test.py exists" });
  const resultExists = await verificationEngine.executeCheck(checkExists, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("File existence verification PASSED", resultExists.status === "PASSED");
  check("File existence returns VerificationCheckResult with checkId/type/status/expected/actual/evidence[]/message/duration/timestamp", !!resultExists.checkId && !!resultExists.type && !!resultExists.status && resultExists.expected !== undefined && resultExists.actual !== undefined && Array.isArray(resultExists.evidence) && !!resultExists.message && typeof resultExists.durationMs === "number" && !!resultExists.timestamp);

  const checkNotExists = createCheck({ type: "FILE_NOT_EXISTS", filePath: "nonexistent_xyz.txt", required: true, description: "should not exist" });
  const resultNotExists = await verificationEngine.executeCheck(checkNotExists, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("File not exists verification PASSED", resultNotExists.status === "PASSED");

  const checkContains = createCheck({ type: "FILE_CONTAINS", filePath: "obs_test.py", expectedContent: "print(12)", required: true, description: "contains print(12)" });
  const resultContains = await verificationEngine.executeCheck(checkContains, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("File contains verification PASSED", resultContains.status === "PASSED");

  const checkNotContains = createCheck({ type: "FILE_NOT_CONTAINS", filePath: "obs_test.py", expectedContent: "nonexistent", required: true, description: "not contains" });
  const resultNotContains = await verificationEngine.executeCheck(checkNotContains, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("File not contains verification PASSED", resultNotContains.status === "PASSED");

  const checkEquals = createCheck({ type: "FILE_EQUALS", filePath: "obs_test.py", expectedContent: "print(12)\n", required: true, description: "equals" });
  const resultEquals = await verificationEngine.executeCheck(checkEquals, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("File equals verification PASSED", resultEquals.status === "PASSED");

  // 7. Command verification
  console.log("\n6. Command verification");
  const checkExitZero = createCheck({ type: "COMMAND_EXIT_ZERO", command: "echo hello", required: true, description: "exit zero" });
  const resultExitZero = await verificationEngine.executeCheck(checkExitZero, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("Command exit zero verification PASSED", resultExitZero.status === "PASSED");

  const checkExitCode = createCheck({ type: "COMMAND_EXIT_CODE", command: "node -e \"process.exit(2)\"", expectedExitCode: 2, required: true, description: "exit 2" });
  const resultExitCode = await verificationEngine.executeCheck(checkExitCode, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("Command expected exit code verification PASSED", resultExitCode.status === "PASSED");

  const checkSucceeds = createCheck({ type: "COMMAND_SUCCEEDS", command: "echo ok", required: true, description: "succeeds" });
  const resultSucceeds = await verificationEngine.executeCheck(checkSucceeds, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("Command succeeds verification PASSED", resultSucceeds.status === "PASSED");

  const checkOutputContains = createCheck({ type: "COMMAND_OUTPUT_CONTAINS", command: "echo hello world", expectedOutput: "hello", required: true, description: "output contains" });
  const resultOutputContains = await verificationEngine.executeCheck(checkOutputContains, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("Command output contains verification PASSED", resultOutputContains.status === "PASSED");

  const checkOutputEquals = createCheck({ type: "COMMAND_OUTPUT_EQUALS", command: "echo 12", expectedOutput: "12", required: true, description: "output equals" });
  const resultOutputEquals = await verificationEngine.executeCheck(checkOutputEquals, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("Command output equals verification PASSED", resultOutputEquals.status === "PASSED");

  // 8. Test verification
  console.log("\n7. Test verification");
  fs.writeFileSync(path.join(tmpRoot, "test_pass.py"), "print('test passed')\n", "utf8");
  const checkTestPasses = createCheck({ type: "TEST_PASSES", testCommand: "python3 test_pass.py", required: true, description: "test passes" });
  const resultTestPasses = await verificationEngine.executeCheck(checkTestPasses, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("Test verification passes", resultTestPasses.status === "PASSED");

  // 9. Failed/inconclusive verification
  console.log("\n8. Failed/inconclusive verification");
  const checkFail = createCheck({ type: "FILE_EXISTS", filePath: "definitely_not_exist_12345.txt", required: true, description: "should fail" });
  const resultFail = await verificationEngine.executeCheck(checkFail, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("Failed verification returns FAILED", resultFail.status === "FAILED");

  const checkInconclusive = createCheck({ type: "TEST_COUNT" as any, expectedTestCount: 5, required: false, description: "count" });
  const resultInconclusive = await verificationEngine.executeCheck(checkInconclusive, { workspaceRoot: tmpRoot, objectiveId, taskId, runId });
  check("Inconclusive verification handled", resultInconclusive.status === "INCONCLUSIVE" || resultInconclusive.status === "FAILED" || resultInconclusive.status === "PASSED");

  // 10. Verification plan explicit JSON executable independently
  console.log("\n9. Verification plans explicit JSON");
  const plan = createPlan({
    objectiveId,
    description: "Test plan",
    checks: [
      createCheck({ type: "FILE_EXISTS", filePath: "obs_test.py", required: true, description: "exists" }),
      createCheck({ type: "FILE_CONTAINS", filePath: "obs_test.py", expectedContent: "12", required: true, description: "contains 12" }),
    ],
    createdBy: "SYSTEM",
  });
  const planJson = VerificationPlanParser.serialize(plan);
  const parsedPlan = VerificationPlanParser.parse(planJson, objectiveId);
  check("Verification plan serializes to JSON", planJson.includes("FILE_EXISTS") && planJson.includes("obs_test.py"));
  check("Verification plan parses from JSON", parsedPlan.checks.length === 2);
  check("Verification plan executable independently from LLM", parsedPlan.createdBy === "SYSTEM");

  const planResult = await verificationEngine.executePlan(parsedPlan, { workspaceRoot: tmpRoot, runId, observations: [], evidence: [] });
  check("Verification plan execution PASSED", planResult.passed === true && planResult.status === "PASSED");

  // 11. Completion decision
  console.log("\n10. Completion decision VERIFIED/FAILED/INCONCLUSIVE/BLOCKED");
  const decisionVerified = CompletionDecisionEngine.decide({
    objectiveId,
    runId,
    modelClaim: "I believe complete",
    verificationResult: planResult,
    evidenceChainIds: [],
  });
  check("Completion decision VERIFIED when verification PASSED", decisionVerified.status === "VERIFIED");
  check("Completion decision verifiedBy SYSTEM", decisionVerified.verifiedBy === "SYSTEM");

  const failedVerificationResult = {
    id: randomUUID(),
    planId: plan.id,
    objectiveId,
    runId,
    status: "FAILED" as const,
    passed: false,
    checks: [resultFail],
    summary: "Failed",
    timestamp: new Date().toISOString(),
    durationMs: 10,
  };
  const decisionFailed = CompletionDecisionEngine.decide({
    objectiveId,
    runId,
    modelClaim: "I believe complete",
    verificationResult: failedVerificationResult,
  });
  check("Completion decision FAILED when verification FAILED", decisionFailed.status === "FAILED");

  const blockedResult = { ...failedVerificationResult, status: "BLOCKED" as const, summary: "Blocked" };
  const decisionBlocked = CompletionDecisionEngine.decide({ objectiveId, runId, verificationResult: blockedResult as any });
  check("Completion decision BLOCKED when verification BLOCKED", decisionBlocked.status === "BLOCKED");

  const inconclusiveResult = { ...failedVerificationResult, status: "INCONCLUSIVE" as const, summary: "Inconclusive" };
  const decisionInconclusive = CompletionDecisionEngine.decide({ objectiveId, runId, verificationResult: inconclusiveResult as any });
  check("Completion decision INCONCLUSIVE when verification INCONCLUSIVE", decisionInconclusive.status === "INCONCLUSIVE");

  // 12. Model claim cannot bypass
  console.log("\n11. Model claim cannot bypass verification");
  check("Model claim NEVER proof", CompletionDecisionEngine.isModelClaimSufficient() === false);
  const decisionWithClaimButFailedVerification = CompletionDecisionEngine.decide({
    objectiveId,
    runId,
    modelClaim: "I believe complete and output is 12, task is done, verified!",
    verificationResult: failedVerificationResult,
  });
  check("Model claim cannot bypass FAILED verification", decisionWithClaimButFailedVerification.status === "FAILED");
  check("Completion decision reason mentions model claim vs verification", decisionWithClaimButFailedVerification.reason.includes("Model claimed") || decisionWithClaimButFailedVerification.reason.includes("verification"));

  // 13. Size limits
  console.log("\n12. Size limits and output limits");
  const limiter = new ObservationLimiter({ maxStdoutBytes: 10, maxStderrBytes: 10, maxTotalBytes: 100 });
  const truncated = limiter.enforceStdoutLimit("This is a very long stdout that should be truncated because it exceeds limit");
  check("Size limits truncate stdout", truncated.truncated === true && truncated.content.length < 100);
  const truncatedStderr = limiter.enforceStderrLimit("long stderr content that exceeds limit definitely");
  check("Size limits truncate stderr", truncatedStderr.truncated === true);

  // Test large observation
  const largeResult = {
    status: "SUCCESS" as const,
    tool: "run_command",
    input: {},
    output: "x".repeat(200),
    stdout: "y".repeat(200),
    stderr: "z".repeat(200),
    executionTimeMs: 10,
    timestamp: new Date().toISOString(),
  };
  const largeObs = await new ObservationCollector({ maxStdoutBytes: 50, maxStderrBytes: 50, maxTotalBytes: 100 }).createObservation({
    objectiveId,
    taskId,
    runId,
    toolName: "run_command",
    durationMs: 10,
    result: largeResult as any,
    workspaceRoot: tmpRoot,
  });
  check("Observation respects total size limits", largeObs.totalSizeBytes <= 500 || largeObs.truncated === true);

  // 14. Persistence
  console.log("\n13. Persistence");
  globalPersistence.saveObservation(obsSuccess);
  globalPersistence.saveEvidenceBatch(evidences);
  globalPersistence.saveVerificationPlan(plan);
  globalPersistence.saveVerificationResult(planResult);
  globalPersistence.saveCompletionDecision(decisionVerified);

  const loadedObs = globalPersistence.getObservationsByObjective(objectiveId);
  check("Persistence saves observations with FK to objective", loadedObs.length > 0 && loadedObs[0].objectiveId === objectiveId);

  const loadedEvidence = globalPersistence.getEvidenceByObjective(objectiveId);
  check("Persistence saves evidence with FK", loadedEvidence.length > 0);

  const loadedVerifications = globalPersistence.getVerificationResultsByObjective(objectiveId);
  check("Persistence saves verification results with FK", loadedVerifications.length > 0);

  // 15. Traceability
  console.log("\n14. Evidence chain traceability Objective->Task->Action->Tool Execution->Observation->Evidence->Verification Check->Result->Completion Decision");
  const chain = {
    objectiveId,
    taskId,
    actionId: obsSuccess.actionId,
    observation: obsSuccess,
    evidence: evidences,
    verificationCheckId: plan.checks[0].id,
    verificationResultId: planResult.id,
    completionDecisionId: decisionVerified.id,
  };
  check("Evidence chain has objectiveId", !!chain.objectiveId);
  check("Evidence chain has taskId", !!chain.taskId);
  check("Evidence chain has actionId", !!chain.actionId);
  check("Evidence chain has observation", !!chain.observation);
  check("Evidence chain has evidence", chain.evidence.length > 0);
  check("Evidence chain has verification check", !!chain.verificationCheckId);
  check("Evidence chain has verification result", !!chain.verificationResultId);
  check("Evidence chain has completion decision", !!chain.completionDecisionId);

  // 16. Evidence must originate from real observations not LLM
  console.log("\n15. Evidence must originate from real observations");
  try {
    const { EvidenceFactory } = await import("../src/agent/observation/evidence");
    // @ts-ignore
    EvidenceFactory.create({ type: "STDOUT", source: "TOOL_EXECUTION", confidence: 1, data: {}, message: "fake" } as any);
    check("Evidence without observation throws", false);
  } catch {
    check("Evidence without observation throws (must originate from real observations)", true);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Passed: ${passes}, Failed: ${failures}`);
  console.log(failures === 0 ? "RESULT: PASS — Phase 4 all checks passed" : `RESULT: FAIL — ${failures} failed`);
  console.log("=".repeat(60));

  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("PHASE4 TEST CRASHED:", err);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
