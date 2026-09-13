/**
 * Project Context Engineering — Phase 6
 * Task-specific context construction with configurable limits, not entire project dump
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";
import { Project } from "../project/types";
import { Requirement } from "../requirements/types";
import { ProjectTask } from "../taskGraph/types";
import { Observation, Evidence } from "../observation/types";
import { VerificationPlan } from "../verification/types";

export interface ContextLimits {
  maxFileContentBytes: number;
  maxEvidenceCount: number;
  maxRecentChanges: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  maxHistoryEntries: number;
  maxRelevantFiles: number;
}

export interface TaskContext {
  objective: string;
  projectId: string;
  objectiveId: string;
  requirements: Requirement[];
  currentTask: ProjectTask;
  dependencies: ProjectTask[];
  relevantFiles: string[];
  relevantFileContents: Record<string, string>;
  recentChanges: Array<{ file: string; operation: string; timestamp: string }>;
  previousAttempts: Array<{ attempt: number; error?: string; timestamp: string }>;
  verificationRequirements: string[];
  projectType: string;
  workspacePath: string;
}

export interface DiagnosisContext {
  failedAction: string;
  observation: Observation;
  evidence: Evidence[];
  relevantCode: Record<string, string>;
  recentChanges: Array<{ file: string; operation: string }>;
  previousRepairs: any[];
  objective: string;
  taskDescription: string;
}

export interface ReportContext {
  objective: string;
  completedTasks: ProjectTask[];
  verificationResults: any[];
  changes: Array<{ file: string; operation: string }>;
  unresolvedIssues: string[];
  requirements: Requirement[];
  assumptions: any[];
}

export class ProjectContextManager {
  private limits: ContextLimits;
  private config = loadConfig();

  constructor(limits?: Partial<ContextLimits>) {
    this.limits = {
      maxFileContentBytes: limits?.maxFileContentBytes ?? this.config.context.maxFileContentBytes,
      maxEvidenceCount: limits?.maxEvidenceCount ?? this.config.context.maxEvidenceCount,
      maxRecentChanges: limits?.maxRecentChanges ?? this.config.context.maxRecentChanges,
      maxStdoutBytes: limits?.maxStdoutBytes ?? this.config.context.maxStdoutBytes,
      maxStderrBytes: limits?.maxStderrBytes ?? this.config.context.maxStderrBytes,
      maxHistoryEntries: limits?.maxHistoryEntries ?? this.config.context.maxHistoryEntries,
      maxRelevantFiles: limits?.maxRelevantFiles ?? 10,
    };
  }

  buildTaskContext(params: {
    project: Project;
    task: ProjectTask;
    allTasks: ProjectTask[];
    workspaceRoot: string;
    recentChanges?: Array<{ file: string; operation: string; timestamp: string }>;
    previousAttempts?: Array<{ attempt: number; error?: string; timestamp: string }>;
  }): TaskContext {
    const dependencies = params.allTasks.filter((t) => params.task.dependencies.includes(t.id));

    // Determine relevant files based on task type and description
    const relevantFiles = this.extractRelevantFiles(params.task, params.project);

    const relevantFileContents: Record<string, string> = {};
    for (const file of relevantFiles.slice(0, this.limits.maxRelevantFiles)) {
      try {
        const abs = path.resolve(params.workspaceRoot, params.project.workspacePath, file);
        if (fs.existsSync(abs)) {
          const stat = fs.statSync(abs);
          if (stat.isFile() && stat.size <= this.limits.maxFileContentBytes) {
            relevantFileContents[file] = fs.readFileSync(abs, "utf8").slice(0, this.limits.maxFileContentBytes);
          } else if (stat.isFile()) {
            const content = fs.readFileSync(abs, "utf8");
            relevantFileContents[file] = content.slice(0, this.limits.maxFileContentBytes) + `\n...[truncated ${content.length - this.limits.maxFileContentBytes} chars]`;
          }
        }
      } catch {
        // Ignore unreadable files
      }
    }

    // Also include files from dependencies' expected outputs
    for (const dep of dependencies) {
      if (dep.expectedOutputs.filePath && !relevantFileContents[dep.expectedOutputs.filePath]) {
        try {
          const abs = path.resolve(params.workspaceRoot, params.project.workspacePath, dep.expectedOutputs.filePath);
          if (fs.existsSync(abs)) {
            const stat = fs.statSync(abs);
            if (stat.isFile() && stat.size <= this.limits.maxFileContentBytes) {
              relevantFileContents[dep.expectedOutputs.filePath] = fs.readFileSync(abs, "utf8").slice(0, this.limits.maxFileContentBytes);
            }
          }
        } catch {}
      }
    }

    return {
      objective: params.project.objective,
      projectId: params.project.id,
      objectiveId: params.project.objectiveId,
      requirements: params.project.requirements.slice(0, 20),
      currentTask: params.task,
      dependencies,
      relevantFiles,
      relevantFileContents,
      recentChanges: (params.recentChanges ?? []).slice(0, this.limits.maxRecentChanges),
      previousAttempts: (params.previousAttempts ?? []).slice(0, this.limits.maxHistoryEntries),
      verificationRequirements: params.task.verificationRequirements,
      projectType: params.project.projectType,
      workspacePath: params.project.workspacePath,
    };
  }

  buildDiagnosisContext(params: {
    failedAction: string;
    observation: Observation;
    evidence: Evidence[];
    workspaceRoot: string;
    projectWorkspacePath: string;
    recentChanges?: Array<{ file: string; operation: string }>;
    previousRepairs?: any[];
    objective: string;
    taskDescription: string;
  }): DiagnosisContext {
    const relevantCode: Record<string, string> = {};
    const files = params.observation.affectedFiles.slice(0, this.limits.maxRelevantFiles);

    for (const file of files) {
      try {
        const abs = path.resolve(params.workspaceRoot, params.projectWorkspacePath, file);
        if (fs.existsSync(abs)) {
          const stat = fs.statSync(abs);
          if (stat.isFile() && stat.size <= this.limits.maxFileContentBytes) {
            relevantCode[file] = fs.readFileSync(abs, "utf8").slice(0, this.limits.maxFileContentBytes);
          }
        }
      } catch {}
    }

    return {
      failedAction: params.failedAction,
      observation: {
        ...params.observation,
        stdout: params.observation.stdout?.slice(0, this.limits.maxStdoutBytes),
        stderr: params.observation.stderr?.slice(0, this.limits.maxStderrBytes),
      } as Observation,
      evidence: params.evidence.slice(0, this.limits.maxEvidenceCount),
      relevantCode,
      recentChanges: (params.recentChanges ?? []).slice(0, this.limits.maxRecentChanges),
      previousRepairs: (params.previousRepairs ?? []).slice(0, this.limits.maxHistoryEntries),
      objective: params.objective,
      taskDescription: params.taskDescription,
    };
  }

  buildReportContext(params: {
    project: Project;
    completedTasks: ProjectTask[];
    verificationResults: any[];
    changes: Array<{ file: string; operation: string }>;
    unresolvedIssues: string[];
  }): ReportContext {
    return {
      objective: params.project.objective,
      completedTasks: params.completedTasks,
      verificationResults: params.verificationResults.slice(0, 50),
      changes: params.changes.slice(0, 100),
      unresolvedIssues: params.unresolvedIssues.slice(0, 20),
      requirements: params.project.requirements,
      assumptions: params.project.assumptions,
    };
  }

  private extractRelevantFiles(task: ProjectTask, project: Project): string[] {
    const files: string[] = [];

    // From task inputs/outputs
    if (task.inputs.filePath) files.push(task.inputs.filePath);
    if (task.expectedOutputs.filePath) files.push(task.expectedOutputs.filePath);

    // From task description file patterns
    const fileRegex = /([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/gi;
    const matches = [...task.description.matchAll(fileRegex)];
    for (const m of matches) {
      if (m[1].length < 100) files.push(m[1]);
    }

    // From project deliverables
    for (const del of project.deliverables.slice(0, 5)) {
      if (del.filePath) files.push(del.filePath);
    }

    // Deduplicate
    return [...new Set(files)].slice(0, this.limits.maxRelevantFiles);
  }

  formatForPrompt(context: TaskContext): string {
    const parts: string[] = [];
    parts.push(`Objective: ${context.objective}`);
    parts.push(`Project Type: ${context.projectType}`);
    parts.push(`Current Task: ${context.currentTask.description} (type: ${context.currentTask.type}, priority: ${context.currentTask.priority})`);
    
    if (context.requirements.length > 0) {
      parts.push(`\nRequirements:`);
      for (const req of context.requirements.slice(0, 10)) {
        parts.push(`- [${req.category}/${req.priority}] ${req.description} (source: ${req.source})`);
      }
    }

    if (context.dependencies.length > 0) {
      parts.push(`\nDependencies (completed):`);
      for (const dep of context.dependencies) {
        parts.push(`- ${dep.description}: ${dep.status}`);
        if (dep.expectedOutputs.filePath) {
          parts.push(`  Output: ${dep.expectedOutputs.filePath}`);
        }
      }
    }

    if (Object.keys(context.relevantFileContents).length > 0) {
      parts.push(`\nRelevant Files:`);
      for (const [file, content] of Object.entries(context.relevantFileContents)) {
        parts.push(`\n--- ${file} ---\n${content.slice(0, 2000)}\n--- end ${file} ---`);
      }
    }

    if (context.recentChanges.length > 0) {
      parts.push(`\nRecent Changes:`);
      for (const ch of context.recentChanges.slice(0, 5)) {
        parts.push(`- ${ch.file}: ${ch.operation} at ${ch.timestamp}`);
      }
    }

    if (context.previousAttempts.length > 0) {
      parts.push(`\nPrevious Attempts:`);
      for (const att of context.previousAttempts.slice(0, 3)) {
        parts.push(`- Attempt ${att.attempt}: ${att.error ?? "unknown"} at ${att.timestamp}`);
      }
    }

    if (context.verificationRequirements.length > 0) {
      parts.push(`\nVerification Requirements: ${context.verificationRequirements.join(", ")}`);
    }

    return parts.join("\n");
  }
}

export const globalProjectContextManager = new ProjectContextManager();
