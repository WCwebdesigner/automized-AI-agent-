/**
 * Persistent Task State — Phase 1-5
 * JSON and SQLite persistence for objectives/tasks + Phase 4-5 entities
 * Extended to v2.0.0 with observations/evidence/verification/failures/diagnoses/repairs/escalations
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";
import { Objective } from "../core/objective";
import { Task } from "../core/task";
import { AgentState } from "../core/constants";
import { Observation, Evidence } from "../observation/types";
import { VerificationPlan, VerificationCheckResult, VerificationResult, CompletionDecision } from "../verification/types";
import { Failure, Diagnosis, Repair, Escalation } from "../diagnosis/types";

export interface PersistedState {
  version: string;
  objectives: Record<string, Objective>;
  tasks: Record<string, Task>;
  agentState: AgentState;
  lastUpdated: string;
  metadata?: Record<string, unknown>;
  // Phase 4-5
  observations: Record<string, Observation>;
  evidence: Record<string, Evidence>;
  verificationPlans: Record<string, VerificationPlan>;
  verificationResults: Record<string, VerificationResult>;
  verificationChecks: Record<string, VerificationCheckResult>;
  completionDecisions: Record<string, CompletionDecision>;
  failures: Record<string, Failure>;
  diagnoses: Record<string, Diagnosis>;
  repairs: Record<string, Repair>;
  escalations: Record<string, Escalation>;
  retryAttempts: Record<string, any>;
  // Phase 6
  projects: Record<string, any>;
  projectPlans: Record<string, any>;
  requirements: Record<string, any>;
  acceptanceCriteria: Record<string, any>;
  assumptions: Record<string, any>;
  taskGraphs: Record<string, any>;
  projectTasks: Record<string, any>;
  checkpoints: Record<string, any>;
  engineeringReports: Record<string, any>;
  // Phase 8+9
  durableRuns: Record<string, any>;
  scheduledJobs: Record<string, any>;
  waitingStates: Record<string, any>;
  monitoringJobs: Record<string, any>;
  researchJobs: Record<string, any>;
  researchSources: Record<string, any>;
  externalActions: Record<string, any>;
  connectorMetadata: Record<string, any>;
  rateLimitStates: Record<string, any>;
  structuredEscalations: Record<string, any>;
  events: Record<string, any>;
  eventSubscriptions: Record<string, any>;
  autonomyPolicies: Record<string, any>;
  heartbeats: Record<string, any>;
}

export class StatePersistence {
  private filePath: string;
  private type: "json" | "sqlite";
  private memoryCache: PersistedState | null = null;

  constructor(filePath?: string, type: "json" | "sqlite" = "json") {
    const config = loadConfig();
    this.filePath = filePath ?? config.persistence.path;
    this.type = type ?? config.persistence.type;
    this.ensureDir();
  }

  private ensureDir() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    } catch {}
  }

  private defaultState(): PersistedState {
    return {
      version: "4.0.0",
      objectives: {},
      tasks: {},
      agentState: AgentState.IDLE,
      lastUpdated: new Date().toISOString(),
      observations: {},
      evidence: {},
      verificationPlans: {},
      verificationResults: {},
      verificationChecks: {},
      completionDecisions: {},
      failures: {},
      diagnoses: {},
      repairs: {},
      escalations: {},
      retryAttempts: {},
      projects: {},
      projectPlans: {},
      requirements: {},
      acceptanceCriteria: {},
      assumptions: {},
      taskGraphs: {},
      projectTasks: {},
      checkpoints: {},
      engineeringReports: {},
      durableRuns: {},
      scheduledJobs: {},
      waitingStates: {},
      monitoringJobs: {},
      researchJobs: {},
      researchSources: {},
      externalActions: {},
      connectorMetadata: {},
      rateLimitStates: {},
      structuredEscalations: {},
      events: {},
      eventSubscriptions: {},
      autonomyPolicies: {},
      heartbeats: {},
    };
  }

  private migrateIfNeeded(state: any): PersistedState {
    // Migrate from v1.0.0 or v2.0.0 or v3.0.0 to v4.0.0
    if (!state.version || state.version === "1.0.0" || state.version === "2.0.0" || state.version === "3.0.0") {
      return {
        ...this.defaultState(),
        ...state,
        version: "4.0.0",
        objectives: state.objectives ?? {},
        tasks: state.tasks ?? {},
        observations: state.observations ?? {},
        evidence: state.evidence ?? {},
        verificationPlans: state.verificationPlans ?? {},
        verificationResults: state.verificationResults ?? {},
        verificationChecks: state.verificationChecks ?? {},
        completionDecisions: state.completionDecisions ?? {},
        failures: state.failures ?? {},
        diagnoses: state.diagnoses ?? {},
        repairs: state.repairs ?? {},
        escalations: state.escalations ?? {},
        retryAttempts: state.retryAttempts ?? {},
        projects: state.projects ?? {},
        projectPlans: state.projectPlans ?? {},
        requirements: state.requirements ?? {},
        acceptanceCriteria: state.acceptanceCriteria ?? {},
        assumptions: state.assumptions ?? {},
        taskGraphs: state.taskGraphs ?? {},
        projectTasks: state.projectTasks ?? {},
        checkpoints: state.checkpoints ?? {},
        engineeringReports: state.engineeringReports ?? {},
        durableRuns: state.durableRuns ?? {},
        scheduledJobs: state.scheduledJobs ?? {},
        waitingStates: state.waitingStates ?? {},
        monitoringJobs: state.monitoringJobs ?? {},
        researchJobs: state.researchJobs ?? {},
        researchSources: state.researchSources ?? {},
        externalActions: state.externalActions ?? {},
        connectorMetadata: state.connectorMetadata ?? {},
        rateLimitStates: state.rateLimitStates ?? {},
        structuredEscalations: state.structuredEscalations ?? {},
        events: state.events ?? {},
        eventSubscriptions: state.eventSubscriptions ?? {},
        autonomyPolicies: state.autonomyPolicies ?? {},
        heartbeats: state.heartbeats ?? {},
        lastUpdated: new Date().toISOString(),
      };
    }
    // Ensure all new fields exist
    return {
      ...this.defaultState(),
      ...state,
      observations: state.observations ?? {},
      evidence: state.evidence ?? {},
      verificationPlans: state.verificationPlans ?? {},
      verificationResults: state.verificationResults ?? {},
      verificationChecks: state.verificationChecks ?? {},
      completionDecisions: state.completionDecisions ?? {},
      failures: state.failures ?? {},
      diagnoses: state.diagnoses ?? {},
      repairs: state.repairs ?? {},
      escalations: state.escalations ?? {},
      retryAttempts: state.retryAttempts ?? {},
      projects: state.projects ?? {},
      projectPlans: state.projectPlans ?? {},
      requirements: state.requirements ?? {},
      acceptanceCriteria: state.acceptanceCriteria ?? {},
      assumptions: state.assumptions ?? {},
      taskGraphs: state.taskGraphs ?? {},
      projectTasks: state.projectTasks ?? {},
      checkpoints: state.checkpoints ?? {},
      engineeringReports: state.engineeringReports ?? {},
      durableRuns: state.durableRuns ?? {},
      scheduledJobs: state.scheduledJobs ?? {},
      waitingStates: state.waitingStates ?? {},
      monitoringJobs: state.monitoringJobs ?? {},
      researchJobs: state.researchJobs ?? {},
      researchSources: state.researchSources ?? {},
      externalActions: state.externalActions ?? {},
      connectorMetadata: state.connectorMetadata ?? {},
      rateLimitStates: state.rateLimitStates ?? {},
      structuredEscalations: state.structuredEscalations ?? {},
      events: state.events ?? {},
      eventSubscriptions: state.eventSubscriptions ?? {},
      autonomyPolicies: state.autonomyPolicies ?? {},
      heartbeats: state.heartbeats ?? {},
    };
  }

  load(): PersistedState {
    if (this.memoryCache) return this.memoryCache;

    if (this.type === "json") {
      try {
        if (!fs.existsSync(this.filePath)) {
          return this.defaultState();
        }
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        const migrated = this.migrateIfNeeded(parsed);
        this.memoryCache = migrated;
        return migrated;
      } catch (err) {
        console.warn(`Failed to load state from ${this.filePath}:`, err);
        return this.defaultState();
      }
    } else {
      try {
        if (!fs.existsSync(this.filePath)) {
          return this.defaultState();
        }
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        return this.migrateIfNeeded(parsed);
      } catch {
        return this.defaultState();
      }
    }
  }

  save(state: PersistedState): void {
    state.lastUpdated = new Date().toISOString();
    this.memoryCache = state;
    this.ensureDir();
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
    } catch (err) {
      console.error(`Failed to save state to ${this.filePath}:`, err);
      throw err;
    }
  }

  saveObjective(objective: Objective): void {
    const state = this.load();
    state.objectives[objective.id] = objective;
    for (const task of objective.tasks) {
      state.tasks[task.id] = task;
    }
    this.save(state);
  }

  saveTask(task: Task): void {
    const state = this.load();
    state.tasks[task.id] = task;
    if (state.objectives[task.objectiveId]) {
      const obj = state.objectives[task.objectiveId];
      const idx = obj.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        obj.tasks[idx] = task;
      } else {
        obj.tasks.push(task);
      }
      obj.updatedAt = new Date().toISOString();
    }
    this.save(state);
  }

  // Phase 4-5 persistence

  saveObservation(obs: Observation): void {
    const state = this.load();
    state.observations[obs.id] = obs;
    this.save(state);
  }

  saveEvidence(ev: Evidence): void {
    const state = this.load();
    state.evidence[ev.id] = ev;
    this.save(state);
  }

  saveVerificationPlan(plan: VerificationPlan): void {
    const state = this.load();
    state.verificationPlans[plan.id] = plan;
    this.save(state);
  }

  saveVerificationResult(result: VerificationResult): void {
    const state = this.load();
    state.verificationResults[result.id] = result;
    this.save(state);
  }

  saveVerificationCheck(check: VerificationCheckResult): void {
    const state = this.load();
    state.verificationChecks[check.checkId] = check;
    this.save(state);
  }

  saveCompletionDecision(decision: CompletionDecision): void {
    const state = this.load();
    state.completionDecisions[decision.id] = decision;
    this.save(state);
  }

  saveFailure(failure: Failure): void {
    const state = this.load();
    state.failures[failure.id] = failure;
    this.save(state);
  }

  saveDiagnosis(diagnosis: Diagnosis): void {
    const state = this.load();
    state.diagnoses[diagnosis.id] = diagnosis;
    this.save(state);
  }

  saveRepair(repair: Repair): void {
    const state = this.load();
    state.repairs[repair.id] = repair;
    this.save(state);
  }

  saveEscalation(escalation: Escalation): void {
    const state = this.load();
    state.escalations[escalation.id] = escalation;
    this.save(state);
  }

  saveRetryAttempt(attempt: any): void {
    const state = this.load();
    state.retryAttempts[attempt.id] = attempt;
    this.save(state);
  }

  getObjective(id: string): Objective | null {
    const state = this.load();
    return state.objectives[id] ?? null;
  }

  getTask(id: string): Task | null {
    const state = this.load();
    return state.tasks[id] ?? null;
  }

  getAllObjectives(): Objective[] {
    const state = this.load();
    return Object.values(state.objectives);
  }

  saveEvidenceBatch(evidences: Evidence[]): void {
    const state = this.load();
    for (const ev of evidences) {
      state.evidence[ev.id] = ev;
    }
    this.save(state);
  }

  getObservationsByObjective(objectiveId: string): Observation[] {
    const state = this.load();
    return Object.values(state.observations).filter((o) => o.objectiveId === objectiveId);
  }

  getEvidenceByObjective(objectiveId: string): Evidence[] {
    const state = this.load();
    return Object.values(state.evidence).filter((e) => (e as any).objectiveId === objectiveId || ((e as any).observationId && state.observations[(e as any).observationId]?.objectiveId === objectiveId));
  }

  getVerificationResultsByObjective(objectiveId: string): VerificationResult[] {
    const state = this.load();
    return Object.values(state.verificationResults).filter((r) => r.objectiveId === objectiveId);
  }

  getVerificationPlansByObjective(objectiveId: string): VerificationPlan[] {
    const state = this.load();
    return Object.values(state.verificationPlans).filter((p) => p.objectiveId === objectiveId);
  }

  getCompletionDecisionsByObjective(objectiveId: string): CompletionDecision[] {
    const state = this.load();
    return Object.values(state.completionDecisions).filter((d) => d.objectiveId === objectiveId);
  }

  getFailuresByObjective(objectiveId: string): Failure[] {
    const state = this.load();
    return Object.values(state.failures).filter((f) => f.objectiveId === objectiveId);
  }

  getDiagnosesByObjective(objectiveId: string): Diagnosis[] {
    const state = this.load();
    return Object.values(state.diagnoses).filter((d) => d.objectiveId === objectiveId);
  }

  getRepairsByObjective(objectiveId: string): Repair[] {
    const state = this.load();
    return Object.values(state.repairs).filter((r) => r.objectiveId === objectiveId);
  }

  getEscalationsByObjective(objectiveId: string): Escalation[] {
    const state = this.load();
    return Object.values(state.escalations).filter((e) => e.objectiveId === objectiveId);
  }

  getRetryAttemptsByObjective(objectiveId: string): any[] {
    const state = this.load();
    return Object.values(state.retryAttempts).filter((r) => r.objectiveId === objectiveId);
  }

  // Phase 6 methods
  saveProject(project: any): void {
    const state = this.load();
    state.projects[project.id] = project;
    this.save(state);
  }

  getProject(id: string): any | null {
    const state = this.load();
    return state.projects[id] ?? null;
  }

  getAllProjects(): any[] {
    const state = this.load();
    return Object.values(state.projects);
  }

  getProjectByObjective(objectiveId: string): any | null {
    const state = this.load();
    return Object.values(state.projects).find((p: any) => p.objectiveId === objectiveId) ?? null;
  }

  saveProjectPlan(plan: any): void {
    const state = this.load();
    state.projectPlans[plan.id] = plan;
    this.save(state);
  }

  saveRequirement(req: any): void {
    const state = this.load();
    state.requirements[req.id] = req;
    this.save(state);
  }

  saveRequirementsBatch(reqs: any[]): void {
    const state = this.load();
    for (const r of reqs) state.requirements[r.id] = r;
    this.save(state);
  }

  getRequirementsByProject(projectId: string): any[] {
    const state = this.load();
    return Object.values(state.requirements).filter((r: any) => r.projectId === projectId);
  }

  saveAcceptanceCriteriaBatch(criteria: any[]): void {
    const state = this.load();
    for (const c of criteria) state.acceptanceCriteria[c.id] = c;
    this.save(state);
  }

  getAcceptanceCriteriaByProject(projectId: string): any[] {
    const state = this.load();
    return Object.values(state.acceptanceCriteria).filter((c: any) => {
      // criteria may have requirementId linking to requirement with projectId
      const req = state.requirements[(c as any).requirementId];
      return req ? (req as any).projectId === projectId : false;
    });
  }

  saveAssumption(assumption: any): void {
    const state = this.load();
    state.assumptions[assumption.id] = assumption;
    this.save(state);
  }

  saveAssumptionsBatch(assumptions: any[]): void {
    const state = this.load();
    for (const a of assumptions) state.assumptions[a.id] = a;
    this.save(state);
  }

  getAssumptionsByProject(projectId: string): any[] {
    const state = this.load();
    return Object.values(state.assumptions).filter((a: any) => a.projectId === projectId);
  }

  saveTaskGraph(graph: any): void {
    const state = this.load();
    state.taskGraphs[graph.id] = graph;
    this.save(state);
  }

  getTaskGraph(id: string): any | null {
    const state = this.load();
    return state.taskGraphs[id] ?? null;
  }

  getTaskGraphByProject(projectId: string): any | null {
    const state = this.load();
    return Object.values(state.taskGraphs).find((g: any) => g.projectId === projectId) ?? null;
  }

  saveProjectTask(task: any): void {
    const state = this.load();
    state.projectTasks[task.id] = task;
    this.save(state);
  }

  getProjectTasksByProject(projectId: string): any[] {
    const state = this.load();
    return Object.values(state.projectTasks).filter((t: any) => t.projectId === projectId);
  }

  saveCheckpoint(checkpoint: any): void {
    const state = this.load();
    state.checkpoints[checkpoint.id] = checkpoint;
    this.save(state);
  }

  getCheckpoint(id: string): any | null {
    const state = this.load();
    return state.checkpoints[id] ?? null;
  }

  getCheckpointsByProject(projectId: string): any[] {
    const state = this.load();
    return Object.values(state.checkpoints).filter((c: any) => c.projectId === projectId);
  }

  getLatestCheckpointByProject(projectId: string): any | null {
    const all = this.getCheckpointsByProject(projectId).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return all[0] ?? null;
  }

  saveEngineeringReport(report: any): void {
    const state = this.load();
    state.engineeringReports[report.id] = report;
    this.save(state);
  }

  getEngineeringReport(id: string): any | null {
    const state = this.load();
    return state.engineeringReports[id] ?? null;
  }

  getEngineeringReportsByProject(projectId: string): any[] {
    const state = this.load();
    return Object.values(state.engineeringReports).filter((r: any) => r.projectId === projectId);
  }

  deleteObjective(id: string): void {
    const state = this.load();
    const obj = state.objectives[id];
    if (obj) {
      for (const task of obj.tasks) {
        delete state.tasks[task.id];
      }
      delete state.objectives[id];
      this.save(state);
    }
  }

  // Phase 8+9 methods
  saveDurableRun(run: any): void {
    const state = this.load();
    state.durableRuns[run.runId] = run;
    this.save(state);
  }

  getDurableRun(id: string): any | null {
    const state = this.load();
    return state.durableRuns[id] ?? null;
  }

  getAllDurableRuns(): any[] {
    const state = this.load();
    return Object.values(state.durableRuns);
  }

  saveScheduledJob(job: any): void {
    const state = this.load();
    state.scheduledJobs[job.id] = job;
    this.save(state);
  }

  getScheduledJobsByRun(runId: string): any[] {
    const state = this.load();
    return Object.values(state.scheduledJobs).filter((j: any) => j.runId === runId);
  }

  saveMonitoringJob(job: any): void {
    const state = this.load();
    state.monitoringJobs[job.id] = job;
    this.save(state);
  }

  getMonitoringJobsByRun(runId: string): any[] {
    const state = this.load();
    return Object.values(state.monitoringJobs).filter((j: any) => j.runId === runId);
  }

  saveResearchJob(job: any): void {
    const state = this.load();
    state.researchJobs[job.researchId] = job;
    for (const src of job.sources ?? []) {
      state.researchSources[src.id] = src;
    }
    this.save(state);
  }

  getResearchJob(id: string): any | null {
    const state = this.load();
    return state.researchJobs[id] ?? null;
  }

  saveExternalAction(action: any): void {
    const state = this.load();
    state.externalActions[action.id ?? action.timestamp] = action;
    this.save(state);
  }

  saveStructuredEscalation(esc: any): void {
    const state = this.load();
    state.structuredEscalations[esc.id] = esc;
    this.save(state);
  }

  getStructuredEscalationsByRun(runId: string): any[] {
    const state = this.load();
    return Object.values(state.structuredEscalations).filter((e: any) => e.runId === runId);
  }

  saveEvent(event: any): void {
    const state = this.load();
    state.events[event.id] = event;
    this.save(state);
  }

  saveAutonomyPolicy(policy: any): void {
    const state = this.load();
    state.autonomyPolicies[policy.level ?? "default"] = policy;
    this.save(state);
  }

  clear(): void {
    this.memoryCache = this.defaultState();
    this.save(this.memoryCache);
  }

  getFilePath(): string {
    return this.filePath;
  }
}

export const globalPersistence = new StatePersistence();
