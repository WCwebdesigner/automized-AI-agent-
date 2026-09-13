/**
 * Engineering Report — Phase 6
 * Structured report from actual execution history, not invented by model
 */

import { randomUUID } from "node:crypto";
import { Project } from "../project/types";
import { ProjectTask } from "../taskGraph/types";
import { Requirement } from "../requirements/types";
import { Observation, Evidence } from "../observation/types";
import { VerificationResult } from "../verification/types";
import { Failure, Diagnosis, Repair, Escalation } from "../diagnosis/types";

export interface EngineeringReport {
  id: string;
  projectId: string;
  objectiveId: string;
  objective: string;
  title: string;
  status: "COMPLETED" | "FAILED" | "ESCALATED" | "IN_PROGRESS";
  requirements: Array<{ description: string; category: string; status: string; source: string }>;
  assumptions: Array<{ assumption: string; risk: string; status: string }>;
  tasksCompleted: Array<{ id: string; description: string; type: string; status: string; attempts: number }>;
  tasksFailed: Array<{ id: string; description: string; reason: string }>;
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  testsExecuted: Array<{ tool: string; success: boolean; output: string }>;
  verificationResults: Array<{ status: string; summary: string; passed: boolean }>;
  acceptanceCriteria: Array<{ description: string; expected: string; status: string; passed: boolean }>;
  repairsPerformed: Array<{ reason: string; riskLevel: string; files: string[]; success: boolean }>;
  retries: number;
  escalations: Array<{ reason: string; recommendedAction: string }>;
  unresolvedIssues: string[];
  changeTracking: Array<{ file: string; operation: string; timestamp: string }>;
  observationsCount: number;
  evidenceCount: number;
  executionTimeMs: number;
  finalStatus: string;
  createdAt: string;
}

export function createReportId(): string {
  return randomUUID();
}

export class EngineeringReportGenerator {
  generate(params: {
    project: Project;
    tasks: ProjectTask[];
    requirements: Requirement[];
    observations: Observation[];
    evidence: Evidence[];
    verificationResults: VerificationResult[];
    acceptanceResults: any[];
    failures: Failure[];
    diagnoses: Diagnosis[];
    repairs: Repair[];
    escalations: Escalation[];
    executionTimeMs: number;
    finalStatus: string;
  }): EngineeringReport {
    const { project, tasks, requirements, observations, evidence, verificationResults, acceptanceResults, failures, diagnoses, repairs, escalations, executionTimeMs, finalStatus } = params;

    const completedTasks = tasks.filter((t) => t.status === "COMPLETED");
    const failedTasks = tasks.filter((t) => t.status === "FAILED" || t.status === "ESCALATED");

    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    const filesDeleted: string[] = [];

    for (const obs of observations) {
      filesCreated.push(...obs.createdFiles);
      filesModified.push(...obs.modifiedFiles);
      filesDeleted.push(...obs.deletedFiles);
    }

    const uniqueCreated = [...new Set(filesCreated)];
    const uniqueModified = [...new Set(filesModified)];
    const uniqueDeleted = [...new Set(filesDeleted)];

    const testsExecuted = observations
      .filter((o) => o.toolName === "run_test" || o.toolName === "run_python" || o.toolName === "run_command")
      .map((o) => ({
        tool: o.toolName,
        success: o.success,
        output: (o.stdout ?? o.outputCombined ?? "").slice(0, 500),
      }));

    const changeTracking = observations.flatMap((o) =>
      [...o.createdFiles.map((f) => ({ file: f, operation: "created", timestamp: o.timestamp })), ...o.modifiedFiles.map((f) => ({ file: f, operation: "modified", timestamp: o.timestamp }))]
    );

    const unresolvedIssues: string[] = [];
    if (failedTasks.length > 0) {
      unresolvedIssues.push(...failedTasks.map((t) => `${t.description}: ${t.failureInfo?.message ?? "failed"}`));
    }
    if (failures.length > 0) {
      unresolvedIssues.push(...failures.filter((f) => f.recoverability === "NON_RECOVERABLE").map((f) => f.message));
    }

    const report: EngineeringReport = {
      id: createReportId(),
      projectId: project.id,
      objectiveId: project.objectiveId,
      objective: project.objective,
      title: project.title,
      status: finalStatus as any,
      requirements: requirements.map((r) => ({
        description: r.description,
        category: r.category,
        status: r.status,
        source: r.source,
      })),
      assumptions: project.assumptions.map((a) => ({
        assumption: a.assumption,
        risk: a.risk,
        status: a.status,
      })),
      tasksCompleted: completedTasks.map((t) => ({
        id: t.id,
        description: t.description,
        type: t.type,
        status: t.status,
        attempts: t.attempts,
      })),
      tasksFailed: failedTasks.map((t) => ({
        id: t.id,
        description: t.description,
        reason: t.failureInfo?.message ?? "unknown",
      })),
      filesCreated: uniqueCreated,
      filesModified: uniqueModified,
      filesDeleted: uniqueDeleted,
      testsExecuted,
      verificationResults: verificationResults.map((v) => ({
        status: v.status,
        summary: v.summary,
        passed: v.passed,
      })),
      acceptanceCriteria: acceptanceResults.map((ac: any) => ({
        description: ac.description,
        expected: ac.expected,
        status: ac.status,
        passed: ac.passed ?? ac.status === "PASSED",
      })),
      repairsPerformed: repairs.map((r: any) => ({
        reason: r.reason ?? r.intendedChanges ?? "repair",
        riskLevel: r.riskLevel ?? "UNKNOWN",
        files: r.affectedFiles ?? [],
        success: r.executed ?? true,
      })),
      retries: tasks.reduce((sum, t) => sum + Math.max(0, t.attempts - 1), 0),
      escalations: escalations.map((e) => ({
        reason: e.reason,
        recommendedAction: e.recommendedHumanAction,
      })),
      unresolvedIssues,
      changeTracking,
      observationsCount: observations.length,
      evidenceCount: evidence.length,
      executionTimeMs,
      finalStatus,
      createdAt: new Date().toISOString(),
    };

    return report;
  }

  formatAsText(report: EngineeringReport): string {
    const lines: string[] = [];
    lines.push(`# Engineering Report: ${report.title}`);
    lines.push(`Project ID: ${report.projectId}`);
    lines.push(`Objective: ${report.objective}`);
    lines.push(`Status: ${report.status}`);
    lines.push(`Execution Time: ${report.executionTimeMs}ms`);
    lines.push(``);
    lines.push(`## Requirements (${report.requirements.length})`);
    for (const req of report.requirements) {
      lines.push(`- [${req.category}/${req.status}] ${req.description} (source: ${req.source})`);
    }
    lines.push(``);
    lines.push(`## Assumptions (${report.assumptions.length})`);
    for (const a of report.assumptions) {
      lines.push(`- [${a.risk}/${a.status}] ${a.assumption}`);
    }
    lines.push(``);
    lines.push(`## Tasks Completed (${report.tasksCompleted.length})`);
    for (const t of report.tasksCompleted) {
      lines.push(`- ${t.description} [${t.type}] attempts=${t.attempts}`);
    }
    lines.push(``);
    lines.push(`## Tasks Failed (${report.tasksFailed.length})`);
    for (const t of report.tasksFailed) {
      lines.push(`- ${t.description}: ${t.reason}`);
    }
    lines.push(``);
    lines.push(`## Files Created (${report.filesCreated.length})`);
    for (const f of report.filesCreated) {
      lines.push(`- ${f}`);
    }
    lines.push(``);
    lines.push(`## Files Modified (${report.filesModified.length})`);
    for (const f of report.filesModified) {
      lines.push(`- ${f}`);
    }
    lines.push(``);
    lines.push(`## Tests Executed (${report.testsExecuted.length})`);
    for (const te of report.testsExecuted) {
      lines.push(`- ${te.tool}: ${te.success ? "PASS" : "FAIL"} — ${te.output.slice(0, 200)}`);
    }
    lines.push(``);
    lines.push(`## Verification Results (${report.verificationResults.length})`);
    for (const vr of report.verificationResults) {
      lines.push(`- [${vr.status}] ${vr.summary}`);
    }
    lines.push(``);
    lines.push(`## Acceptance Criteria (${report.acceptanceCriteria.length})`);
    for (const ac of report.acceptanceCriteria) {
      lines.push(`- [${ac.status}] ${ac.description} expected=${ac.expected}`);
    }
    lines.push(``);
    lines.push(`## Repairs (${report.repairsPerformed.length})`);
    for (const rp of report.repairsPerformed) {
      lines.push(`- ${rp.reason} risk=${rp.riskLevel} files=${rp.files.join(",")} success=${rp.success}`);
    }
    lines.push(``);
    lines.push(`## Escalations (${report.escalations.length})`);
    for (const esc of report.escalations) {
      lines.push(`- ${esc.reason} → ${esc.recommendedAction}`);
    }
    lines.push(``);
    lines.push(`## Unresolved Issues (${report.unresolvedIssues.length})`);
    for (const ui of report.unresolvedIssues) {
      lines.push(`- ${ui}`);
    }
    lines.push(``);
    lines.push(`## Summary`);
    lines.push(`Observations: ${report.observationsCount}, Evidence: ${report.evidenceCount}, Retries: ${report.retries}`);
    lines.push(`Final Status: ${report.finalStatus}`);

    return lines.join("\n");
  }
}

export const globalEngineeringReportGenerator = new EngineeringReportGenerator();
