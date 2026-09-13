#!/usr/bin/env tsx
/**
 * Kaira CLI — Phase 6
 * kaira "<high-level objective>" with visibility: Objective, Project, Current task, Progress, State, Tool, Verification, Recovery, Final result
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

const objectiveText = process.argv.slice(2).join(" ").trim();

if (!objectiveText) {
  console.log(`
Kaira — Autonomous AI Worker (Phase 6)

Usage:
  npx tsx scripts/kaira.ts "<high-level objective>"
  npm run kaira -- "<high-level objective>"

Example:
  npx tsx scripts/kaira.ts "Create Python CLI calculator supporting + - * / with tests and verify"

Environment:
  KAIRA_WORKSPACE        Workspace root (default: ./workspace)
  OLLAMA_BASE_URL        Ollama endpoint (default: http://localhost:11434)
  KAIRA_REASONING_MODEL  Reasoning model (default: qwen3:8b)
  KAIRA_CODING_MODEL     Coding model (default: qwen2.5-coder:7b)
  KAIRA_LIGHTWEIGHT_MODEL Lightweight model (default: llama3.2:3b)
`);
  process.exit(0);
}

async function main() {
  const config = loadConfig();
  const runId = randomUUID();
  const objectiveId = randomUUID();

  console.log("\n" + "=".repeat(80));
  console.log("KAIRA — Autonomous Software Engineering Worker (Phase 6)");
  console.log("=".repeat(80));
  console.log(`Objective: ${objectiveText}`);
  console.log(`Objective ID: ${objectiveId}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Workspace: ${config.workspaceRoot}`);
  console.log(`Ollama: ${config.ollamaBaseUrl}`);
  console.log(`Models: reasoning=${config.modelRouting.reasoning}, coding=${config.modelRouting.coding}, lightweight=${config.modelRouting.lightweight}`);
  console.log("=".repeat(80) + "\n");

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
  } catch (err) {
    console.warn(`Warning: could not persist project: ${(err as Error).message}`);
  }

  console.log("🚀 PHASE: EXECUTION — Running task graph (PLAN→IMPLEMENT→RUN→OBSERVE→TEST→VERIFY→DONE)\n");

  const orchestrator = globalProjectOrchestrator;

  // Add progress callback via polling task graph
  const progressInterval = setInterval(() => {
    const graph = globalTaskGraphManager.getGraph(taskGraph.id);
    if (!graph) return;
    const completed = Array.from(graph.tasks.values()).filter((t: any) => t.status === "COMPLETED").length;
    const failed = Array.from(graph.tasks.values()).filter((t: any) => t.status === "FAILED").length;
    const running = Array.from(graph.tasks.values()).filter((t: any) => t.status === "RUNNING").length;
    const total = graph.tasks.size;
    console.log(`   ⏳ Progress: ${completed}/${total} completed, ${failed} failed, ${running} running — State: ${project.status} — Current: ${project.currentTaskId ?? "none"}`);
  }, 5000);

  let result;
  try {
    result = await orchestrator.executeProject(project, runId);
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

  if (result.report) {
    console.log("📄 ENGINEERING REPORT");
    console.log("-".repeat(80));
    const reportText = result.report ? (typeof result.report === "string" ? result.report : JSON.stringify(result.report, null, 2).slice(0, 5000)) : "";
    // Format via generator if available
    try {
      const { EngineeringReportGenerator } = await import("../src/agent/report/engineeringReport");
      const gen = new EngineeringReportGenerator();
      if (result.report && result.report.id) {
        console.log(gen.formatAsText(result.report).slice(0, 10000));
      } else {
        console.log(reportText.slice(0, 5000));
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
  } catch {}

  process.exit(result.status === "COMPLETED" ? 0 : result.status === "ESCALATED" ? 2 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
