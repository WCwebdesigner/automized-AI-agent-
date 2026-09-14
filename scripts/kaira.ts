#!/usr/bin/env tsx
/**
 * Kaira CLI — Phase 8+9
 * kaira "<high-level objective>" with visibility: Objective, Project, Current task, Progress, State, Tool, Verification, Recovery, Final result
 * Extended with durable runs, scheduling, waiting, monitoring, research, connectors, escalation, observability
 */

import "dotenv/config";
process.env.KAIRA_ALLOW_DESTRUCTIVE = process.env.KAIRA_ALLOW_DESTRUCTIVE ?? "true";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ProjectPlanner, globalProjectPlanner } from "../src/agent/project/projectPlanner";
import { ProjectOrchestrator, globalProjectOrchestrator } from "../src/agent/orchestrator/orchestrator";
import { globalTaskGraphManager } from "../src/agent/taskGraph/graph";
import { globalProjectWorkspaceManager } from "../src/agent/workspace/projectWorkspace";
import { loadConfig } from "../src/agent/config";
import { StatePersistence, globalPersistence } from "../src/agent/state/persistence";
import { DurableRunManager, globalDurableRunManager } from "../src/agent/runtime/durableRun";
import { globalDurableOrchestrator } from "../src/agent/runtime/orchestratorExtension";
import { globalHeartbeatMonitor } from "../src/agent/runtime/heartbeat";
import { globalResourceGovernance } from "../src/agent/runtime/resourceGovernance";
import { globalAutonomyManager } from "../src/agent/autonomy/policy";
import { globalConnectorRegistry } from "../src/agent/connectors/registry";
import { globalResearchEngine } from "../src/agent/research/engine";

const objectiveText = process.argv.slice(2).join(" ").trim();

if (!objectiveText) {
  console.log(`
Kaira — Autonomous AI Worker (Phase 8+9)

Usage:
  npx tsx scripts/kaira.ts "<high-level objective>"
  npm run kaira -- "<high-level objective>"

Example:
  npx tsx scripts/kaira.ts "Create Python CLI calculator supporting + - * / with tests and verify"

Phase 8+9 Features:
  - Durable runs: CREATED/QUEUED/RUNNING/WAITING/PAUSED/RECOVERING/ESCALATED/COMPLETED/FAILED/CANCELLED/EXPIRED
  - Checkpointing: idempotent, survive restart
  - Scheduler: immediate/delayed/recurring/monitoring/retry-after/health checks
  - Wait states: explicit, no wasteful model calls
  - Monitoring jobs: polling interval, timeout, acceptable state, change detection
  - Heartbeat health: active/stalled/lastActivity/failed/scheduler/tool/connector/resource/overdue
  - Resource governance: bounded autonomy limits → STOP/ESCALATE
  - Research: DISCOVER→FETCH→EXTRACT→NORMALIZE→COMPARE→ANALYZE→VERIFY→SYNTHESIZE→REPORT with provenance
  - Connectors: READ_ONLY/REVERSIBLE_WRITE/IRREVERSIBLE_WRITE/HIGH_RISK with policy checks
  - Events: webhook/repo/deployment/scheduled/file change/API/monitoring → validate/authorize/correlate/execute/verify/record
  - Escalation: structured reason/objective/state/attempted/evidence/options/recommended/decision required
  - Autonomy: SUPERVISED/ASSISTED/AUTONOMOUS/RESTRICTED

Environment:
  KAIRA_WORKSPACE        Workspace root (default: ./workspace)
  OLLAMA_BASE_URL        Ollama endpoint (default: http://localhost:11434)
  KAIRA_REASONING_MODEL  Reasoning model (default: qwen3:8b)
  KAIRA_CODING_MODEL     Coding model (default: qwen2.5-coder:7b)
  KAIRA_LIGHTWEIGHT_MODEL Lightweight model (default: llama3.2:3b)
  KAIRA_AUTONOMY_LEVEL   Autonomy level (default: ASSISTED)
`);
  process.exit(0);
}

async function main() {
  const config = loadConfig();
  const runId = randomUUID();
  const objectiveId = randomUUID();

  console.log("\n" + "=".repeat(80));
  console.log("KAIRA — Autonomous Software Engineering Worker (Phase 8+9)");
  console.log("=".repeat(80));
  console.log(`Objective: ${objectiveText}`);
  console.log(`Objective ID: ${objectiveId}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Workspace: ${config.workspaceRoot}`);
  console.log(`Ollama: ${config.ollamaBaseUrl}`);
  console.log(`Models: reasoning=${config.modelRouting.reasoning}, coding=${config.modelRouting.coding}, lightweight=${config.modelRouting.lightweight}`);
  console.log(`Autonomy: ${config.autonomy.defaultLevel} (policy: ${globalAutonomyManager.getPolicy().description})`);
  console.log(`Durable Limits: runtime=${config.durable.maxRuntimeMs}ms, external=${config.durable.maxExternalRequests}, modelCalls=${config.durable.maxModelCalls}`);
  console.log(`Research Limits: sources=${config.research.maxSources}, requests=${config.research.maxRequests}, runtime=${config.research.maxRuntimeMs}ms`);
  console.log("=".repeat(80) + "\n");

  // Create durable run
  console.log("🔧 Creating durable run (CREATED→QUEUED→RUNNING)...");
  const durableRun = globalDurableOrchestrator.createDurableRun({
    objectiveId,
    objective: objectiveText,
    autonomyPolicy: config.autonomy.defaultLevel as any,
    expirationMs: 30 * 60 * 1000,
  });
  console.log(`   Durable Run ID: ${durableRun.runId}, State: ${durableRun.state}`);
  globalDurableOrchestrator.startRun(durableRun.runId);
  console.log(`   Started: ${globalDurableRunManager.getRun(durableRun.runId)?.state}\n`);

  // Save objective
  try {
    const objective = {
      id: objectiveId,
      text: objectiveText,
      title: objectiveText.slice(0, 100),
      description: objectiveText,
      status: "ACTIVE",
      priority: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;
    globalPersistence.saveObjective(objective);
    globalPersistence.saveDurableRun(globalDurableRunManager.getRun(durableRun.runId));
  } catch {}

  console.log("🔍 PHASE: PLANNING — Extracting requirements, assumptions, task graph...\n");

  const planner = globalProjectPlanner;
  const { project, plan, taskGraph, requirements } = await planner.createProjectWithPlan(objectiveText, undefined, objectiveId);

  console.log(`📋 PROJECT CREATED`);
  console.log(`   Title: ${project.title}`);
  console.log(`   Project ID: ${project.id}`);
  console.log(`   Type: ${project.projectType}`);
  console.log(`   Workspace: ${project.workspacePath}`);
  console.log(`   Requirements: ${requirements.length}`);
  for (const req of requirements.slice(0, 10)) {
    console.log(`     - [${req.category}/${req.priority}/${req.source}] ${req.description}`);
  }
  if (requirements.length > 10) console.log(`     ... and ${requirements.length - 10} more`);
  console.log(`   Assumptions: ${project.assumptions.length}`);
  for (const asm of project.assumptions.slice(0, 5)) {
    console.log(`     - [${asm.risk}] ${asm.assumption}`);
  }
  console.log(`   Deliverables: ${project.deliverables.length}`);
  for (const del of project.deliverables) {
    console.log(`     - ${del.filePath ?? del.description} [${del.type}] required=${del.required}`);
  }
  console.log(`   Tasks: ${taskGraph.tasks.size}`);
  for (const t of Array.from(taskGraph.tasks.values()) as any[]) {
    console.log(`     - [${t.type}/${t.status}] ${t.description} deps=[${t.dependencies.join(",") || "none"}]`);
  }
  console.log(`   Verification Strategy: ${plan.verificationStrategy}`);
  console.log("");

  // Persist project
  try {
    globalPersistence.saveProject(project);
    globalPersistence.saveProjectPlan(plan);
    globalPersistence.saveRequirementsBatch(requirements);
    globalPersistence.saveAssumptionsBatch(project.assumptions);
    globalPersistence.saveTaskGraph({ id: taskGraph.id, projectId: project.id, objectiveId, tasks: Array.from(taskGraph.tasks.values()) });
    for (const t of Array.from(taskGraph.tasks.values()) as any[]) {
      globalPersistence.saveProjectTask(t);
    }
    // Link durable run to project
    const dr = globalDurableRunManager.getRun(durableRun.runId);
    if (dr) {
      dr.projectId = project.id;
      dr.taskGraphId = taskGraph.id;
      globalDurableRunManager.setCurrentTask(dr.runId, Array.from(taskGraph.tasks.values())[0]?.id ?? "unknown");
      globalPersistence.saveDurableRun(dr);
    }
  } catch (err) {
    console.warn(`Warning: could not persist project: ${(err as Error).message}`);
  }

  console.log("🚀 PHASE: EXECUTION — Running task graph (PLAN→IMPLEMENT→RUN→OBSERVE→TEST→VERIFY→DONE)\n");
  console.log("   Extended observability: OBJECTIVE→PROJECT→TASK→ACTION→TOOL→OBSERVATION→EVIDENCE→VERIFICATION→RESULT");
  console.log("   + EXTERNAL SOURCE→EXTERNAL ACTION→SCHEDULE→WAIT→RESUME→ESCALATION\n");

  const orchestrator = globalProjectOrchestrator;

  // Progress callback with durable observability
  const progressInterval = setInterval(() => {
    const graph = globalTaskGraphManager.getGraph(taskGraph.id);
    if (!graph) return;
    const completed = Array.from(graph.tasks.values()).filter((t: any) => t.status === "COMPLETED").length;
    const failed = Array.from(graph.tasks.values()).filter((t: any) => t.status === "FAILED").length;
    const running = Array.from(graph.tasks.values()).filter((t: any) => t.status === "RUNNING").length;
    const total = graph.tasks.size;
    const dr = globalDurableRunManager.getRun(durableRun.runId);
    const obs = globalDurableOrchestrator.getRunObservability(durableRun.runId);
    console.log(`   ⏳ Progress: ${completed}/${total} completed, ${failed} failed, ${running} running — State: ${project.status} — Current: ${project.currentTaskId ?? "none"}`);
    if (dr) {
      console.log(`      Durable: ${dr.state} — Last activity: ${dr.lastActivityTime} — Runtime: ${Date.now() - new Date(dr.startTime).getTime()}ms — Resources: modelCalls=${dr.resourceUsage.modelCalls}, external=${dr.resourceUsage.externalRequests}`);
    }
    if (obs?.waiting) {
      console.log(`      Waiting: ${obs.waiting.reason} — ${obs.waiting.description} since ${obs.waiting.waitingSince}`);
    }
    const health = globalHeartbeatMonitor.getSystemHealth();
    if (health.overall !== "HEALTHY") {
      console.log(`      Health: ${health.overall} — stalled=${health.stalledRuns.length}, overdue=${health.overdueRuns.length}`);
    }
  }, 5000);

  let result;
  try {
    result = await orchestrator.executeProject(project, runId);
    // Update durable run
    const dr = globalDurableRunManager.getRun(durableRun.runId);
    if (dr) {
      if (result.status === "COMPLETED") {
        globalDurableRunManager.transition(dr.runId, "COMPLETED", result.finalResult);
      } else if (result.status === "ESCALATED") {
        globalDurableRunManager.transition(dr.runId, "ESCALATED", result.finalResult);
      } else {
        globalDurableRunManager.transition(dr.runId, "FAILED", result.finalResult);
      }
    }
  } finally {
    clearInterval(progressInterval);
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 EXECUTION RESULT");
  console.log("=".repeat(80));
  console.log(`Objective: ${result.project.objective}`);
  console.log(`Project: ${result.project.title} (${result.project.id})`);
  console.log(`Status: ${result.status}`);
  console.log(`Final Result: ${result.finalResult}`);
  console.log(`Execution Time: ${result.executionTimeMs}ms`);
  console.log("");

  const durableFinal = globalDurableRunManager.getRun(durableRun.runId);
  if (durableFinal) {
    console.log(`Durable Run: ${durableFinal.runId}`);
    console.log(`  State: ${durableFinal.state} (previous: ${durableFinal.previousState ?? "none"})`);
    console.log(`  Start: ${durableFinal.startTime}, Last Activity: ${durableFinal.lastActivityTime}`);
    console.log(`  Checkpoint: ${durableFinal.checkpointRef?.id ?? "none"} — ${durableFinal.checkpointRef?.reason ?? ""}`);
    console.log(`  Resource Usage: runtime=${durableFinal.resourceUsage.runtimeMs}ms, modelCalls=${durableFinal.resourceUsage.modelCalls}, external=${durableFinal.resourceUsage.externalRequests}, tasks=${durableFinal.resourceUsage.taskAttempts}`);
    console.log(`  Failures: ${durableFinal.failureCount}, Escalations: ${durableFinal.escalationCount}`);
    if (durableFinal.waitingState) {
      console.log(`  Waiting: ${durableFinal.waitingState.reason} — ${durableFinal.waitingState.description}`);
    }
    console.log("");
  }

  const observability = globalDurableOrchestrator.getRunObservability(durableRun.runId);
  if (observability) {
    console.log(`Observability Chain:`);
    console.log(`  What: ${observability.runId} doing ${result.project.title}`);
    console.log(`  Why: Objective ${objectiveText}`);
    console.log(`  Last Observed: ${observability.lastActivity}`);
    console.log(`  Waiting For: ${observability.waiting?.description ?? "none"}`);
    console.log(`  Next: ${observability.scheduledJobs.map((j: any) => `${j.type} ${j.what}`).join(", ") || "none"}`);
    console.log(`  Attempts: ${durableFinal?.retryInfo.attempt ?? 0}, Failures: ${durableFinal?.failures.length ?? 0}`);
    console.log(`  External Accessed: ${durableFinal?.externalDependencies.length ?? 0}, Verified: ${result.verificationResults.length}`);
    console.log(`  Why Stopped: ${result.status} — ${result.finalResult}`);
    console.log("");
  }

  console.log(`Tasks: Completed ${result.completedTasks.length}, Failed ${result.failedTasks.length}`);
  for (const t of result.completedTasks) {
    console.log(`  ✅ ${t.description} [${t.type}] attempts=${t.attempts}`);
  }
  for (const t of result.failedTasks) {
    console.log(`  ❌ ${t.description}: ${t.failureInfo?.message ?? "failed"}`);
  }
  console.log("");
  console.log(`Observations: ${result.observations.length}, Evidence: ${result.evidence.length}`);
  console.log(`Verification: ${result.verificationResults.length} results, Acceptance: ${result.acceptanceResults.length} criteria`);
  if (result.projectVerification) {
    console.log(`Project Verification: ${result.projectVerification.passed ? "PASSED" : "FAILED"} — ${result.projectVerification.summary}`);
  }
  console.log(`Failures: ${result.failures.length}, Repairs: ${result.repairs.length}, Escalations: ${result.escalations.length}`);
  console.log("");

  // Show research if any
  const researchJobs = globalResearchEngine.list().filter(j => j.objectiveId === objectiveId);
  if (researchJobs.length > 0) {
    console.log(`Research Jobs: ${researchJobs.length}`);
    for (const rj of researchJobs) {
      console.log(`  - ${rj.researchId}: ${rj.objective} — stage ${rj.stage}, sources ${rj.sources.length}, claims ${rj.claims.length}, contradictions ${rj.contradictions.length}`);
    }
    console.log("");
  }

  // Show connectors
  console.log(`Connectors: ${globalConnectorRegistry.list().length} registered`);
  for (const conn of globalConnectorRegistry.list().slice(0, 5)) {
    console.log(`  - ${conn.name}: ${conn.permission} (${conn.riskLevel}) — ${conn.capability}`);
  }
  console.log("");

  // Health
  const health = globalHeartbeatMonitor.getSystemHealth();
  console.log(`System Health: ${health.overall}`);
  console.log(`  Runs: ${health.runs.length}, Stalled: ${health.stalledRuns.length}, Overdue: ${health.overdueRuns.length}`);
  console.log(`  Scheduler: ${health.scheduler.pendingJobs} pending, ${health.scheduler.failedJobs} failed, status ${health.scheduler.status}`);
  console.log(`  Monitoring: ${health.monitoring.activeJobs} active, ${health.monitoring.escalatedJobs} escalated`);
  if (health.resourceExhaustion.length > 0) {
    console.log(`  Resource Exhaustion: ${health.resourceExhaustion.map(r => `${r.resource} ${r.usage}/${r.limit} in ${r.runId}`).join(", ")}`);
  }
  console.log("");

  if (result.report) {
    console.log("📄 ENGINEERING REPORT");
    console.log("-".repeat(80));
    try {
      const { EngineeringReportGenerator } = await import("../src/agent/report/engineeringReport");
      const gen = new EngineeringReportGenerator();
      if (result.report && result.report.id) {
        console.log(gen.formatAsText(result.report).slice(0, 10000));
      } else {
        console.log(JSON.stringify(result.report, null, 2).slice(0, 5000));
      }
    } catch {
      console.log(JSON.stringify(result.report, null, 2).slice(0, 5000));
    }
    console.log("");
  }

  console.log("=".repeat(80));
  if (result.status === "COMPLETED") {
    console.log("✅ PROJECT COMPLETED SUCCESSFULLY");
  } else if (result.status === "ESCALATED") {
    console.log("⚠️ PROJECT ESCALATED — Human intervention required");
    for (const esc of result.escalations) {
      console.log(`   Reason: ${esc.reason}`);
      console.log(`   Action: ${esc.recommendedHumanAction}`);
    }
  } else {
    console.log(`❌ PROJECT FAILED: ${result.finalResult}`);
  }
  console.log("=".repeat(80) + "\n");

  // Persist final
  try {
    globalPersistence.saveProject(result.project);
    if (result.report) globalPersistence.saveEngineeringReport(result.report);
    if (durableFinal) globalPersistence.saveDurableRun(durableFinal);
  } catch {}

  process.exit(result.status === "COMPLETED" ? 0 : result.status === "ESCALATED" ? 2 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
