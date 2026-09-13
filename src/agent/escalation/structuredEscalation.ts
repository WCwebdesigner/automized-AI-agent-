/**
 * Phase 8+9 — Structured Escalation
 * reason/objective/current state/attempted actions/evidence/options/recommended action/decision required
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";

export type EscalationReason =
  | "INSUFFICIENT_AUTHORITY"
  | "AMBIGUOUS_HIGH_RISK"
  | "MISSING_CREDENTIALS"
  | "DESTRUCTIVE_OPERATION"
  | "UNRESOLVED_FAILURES"
  | "LIMIT_EXCEEDED"
  | "CONTRADICTION"
  | "UNAVAILABLE_DEPENDENCY"
  | "HUMAN_JUDGMENT_REQUIRED"
  | "SECURITY_VIOLATION"
  | "EXTERNAL_SERVICE_FAILURE";

export interface StructuredEscalation {
  id: string;
  runId: string;
  objectiveId: string;
  projectId?: string;
  researchId?: string;
  reason: EscalationReason;
  description: string;
  objective: string;
  currentState: {
    runState: string;
    taskId?: string;
    waitingState?: any;
    resourceUsage?: any;
    lastActivity: string;
  };
  attemptedActions: Array<{
    action: string;
    timestamp: string;
    result: string;
    error?: string;
  }>;
  evidence: Array<{
    type: string;
    content: string;
    source: string;
    timestamp: string;
  }>;
  options: Array<{
    id: string;
    description: string;
    risk: "LOW" | "MEDIUM" | "HIGH";
    requiresApproval: boolean;
  }>;
  recommendedAction: {
    optionId: string;
    reason: string;
    confidence: number;
  };
  decisionRequired: {
    question: string;
    deadline?: string;
    approvers?: string[];
  };
  status: "PENDING" | "RESOLVED" | "REJECTED";
  resolution?: {
    resolvedAt: string;
    resolvedBy: string;
    decision: string;
    actionTaken: string;
  };
  createdAt: string;
  updatedAt: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export class StructuredEscalationManager {
  private escalations: Map<string, StructuredEscalation> = new Map();
  private filePath: string;

  constructor(filePath?: string) {
    const config = loadConfig();
    this.filePath = filePath ?? path.join(config.workspaceRoot, ".kaira", "structured_escalations.json");
    this.ensureDir();
    this.loadFromDisk();
  }

  private ensureDir() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    } catch {}
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const list: StructuredEscalation[] = Array.isArray(parsed) ? parsed : parsed.escalations ?? [];
      for (const e of list) {
        if (e.id) this.escalations.set(e.id, e);
      }
    } catch {}
  }

  private persist() {
    try {
      this.ensureDir();
      const tmp = this.filePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify([...this.escalations.values()], null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch {}
  }

  createEscalation(params: {
    runId: string;
    objectiveId: string;
    projectId?: string;
    researchId?: string;
    reason: EscalationReason;
    description: string;
    objective: string;
    currentState: StructuredEscalation["currentState"];
    attemptedActions?: StructuredEscalation["attemptedActions"];
    evidence?: StructuredEscalation["evidence"];
    options: StructuredEscalation["options"];
    recommendedAction: StructuredEscalation["recommendedAction"];
    decisionRequired: StructuredEscalation["decisionRequired"];
    severity?: StructuredEscalation["severity"];
  }): StructuredEscalation {
    const now = new Date().toISOString();
    const escalation: StructuredEscalation = {
      id: randomUUID(),
      runId: params.runId,
      objectiveId: params.objectiveId,
      projectId: params.projectId,
      researchId: params.researchId,
      reason: params.reason,
      description: params.description,
      objective: params.objective,
      currentState: params.currentState,
      attemptedActions: params.attemptedActions ?? [],
      evidence: params.evidence ?? [],
      options: params.options,
      recommendedAction: params.recommendedAction,
      decisionRequired: params.decisionRequired,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
      severity: params.severity ?? "MEDIUM",
    };

    this.escalations.set(escalation.id, escalation);
    this.persist();
    return escalation;
  }

  // Convenience creators for each reason type
  escalateInsufficientAuthority(params: {
    runId: string;
    objectiveId: string;
    objective: string;
    currentState: StructuredEscalation["currentState"];
    action: string;
    requiredPermission: string;
  }): StructuredEscalation {
    return this.createEscalation({
      runId: params.runId,
      objectiveId: params.objectiveId,
      objective: params.objective,
      reason: "INSUFFICIENT_AUTHORITY",
      description: `Insufficient authority for action: ${params.action}. Required: ${params.requiredPermission}`,
      currentState: params.currentState,
      attemptedActions: [{ action: params.action, timestamp: new Date().toISOString(), result: "BLOCKED", error: `Requires ${params.requiredPermission}` }],
      evidence: [{ type: "POLICY", content: `Action ${params.action} requires ${params.requiredPermission}`, source: "autonomy_policy", timestamp: new Date().toISOString() }],
      options: [
        { id: "approve", description: `Approve ${params.action} with ${params.requiredPermission}`, risk: "HIGH", requiresApproval: true },
        { id: "deny", description: "Deny and stop", risk: "LOW", requiresApproval: false },
        { id: "alternative", description: "Find alternative low-risk approach", risk: "LOW", requiresApproval: false },
      ],
      recommendedAction: { optionId: "alternative", reason: "Prefer low-risk alternative", confidence: 70 },
      decisionRequired: { question: `Approve ${params.action}? Requires ${params.requiredPermission}`, deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      severity: "HIGH",
    });
  }

  escalateLimitExceeded(params: {
    runId: string;
    objectiveId: string;
    objective: string;
    currentState: StructuredEscalation["currentState"];
    limitName: string;
    current: number;
    limit: number;
  }): StructuredEscalation {
    return this.createEscalation({
      runId: params.runId,
      objectiveId: params.objectiveId,
      objective: params.objective,
      reason: "LIMIT_EXCEEDED",
      description: `Limit exceeded: ${params.limitName} — current ${params.current} > limit ${params.limit}`,
      currentState: params.currentState,
      attemptedActions: [],
      evidence: [{ type: "RESOURCE", content: `${params.limitName}: ${params.current}/${params.limit}`, source: "resource_governance", timestamp: new Date().toISOString() }],
      options: [
        { id: "increase_limit", description: `Increase ${params.limitName} limit`, risk: "MEDIUM", requiresApproval: true },
        { id: "stop", description: "Stop execution", risk: "LOW", requiresApproval: false },
        { id: "escalate", description: "Escalate to human for decision", risk: "LOW", requiresApproval: false },
      ],
      recommendedAction: { optionId: "stop", reason: "Limit reached, stop to prevent unbounded execution", confidence: 90 },
      decisionRequired: { question: `Limit ${params.limitName} exceeded. Increase limit or stop?` },
      severity: "MEDIUM",
    });
  }

  escalateContradiction(params: {
    runId: string;
    objectiveId: string;
    objective: string;
    currentState: StructuredEscalation["currentState"];
    contradiction: string;
    sources: string[];
  }): StructuredEscalation {
    return this.createEscalation({
      runId: params.runId,
      objectiveId: params.objectiveId,
      objective: params.objective,
      reason: "CONTRADICTION",
      description: `Contradiction detected: ${params.contradiction}`,
      currentState: params.currentState,
      attemptedActions: [],
      evidence: params.sources.map(s => ({ type: "SOURCE", content: s, source: "research", timestamp: new Date().toISOString() })),
      options: [
        { id: "use_most_recent", description: "Use most recent source", risk: "MEDIUM", requiresApproval: false },
        { id: "use_high_confidence", description: "Use highest confidence source", risk: "LOW", requiresApproval: false },
        { id: "human_decision", description: "Require human to resolve contradiction", risk: "LOW", requiresApproval: true },
      ],
      recommendedAction: { optionId: "human_decision", reason: "Contradiction requires human judgment", confidence: 60 },
      decisionRequired: { question: `Resolve contradiction: ${params.contradiction}` },
      severity: "MEDIUM",
    });
  }

  getEscalation(id: string): StructuredEscalation | null {
    return this.escalations.get(id) ?? null;
  }

  getEscalationsByRun(runId: string): StructuredEscalation[] {
    return [...this.escalations.values()].filter(e => e.runId === runId);
  }

  getPendingEscalations(): StructuredEscalation[] {
    return [...this.escalations.values()].filter(e => e.status === "PENDING");
  }

  resolve(id: string, resolvedBy: string, decision: string, actionTaken: string): StructuredEscalation {
    const esc = this.escalations.get(id);
    if (!esc) throw new Error(`Escalation ${id} not found`);
    esc.status = "RESOLVED";
    esc.resolution = {
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      decision,
      actionTaken,
    };
    esc.updatedAt = new Date().toISOString();
    this.escalations.set(id, esc);
    this.persist();
    return esc;
  }

  list(): StructuredEscalation[] {
    return [...this.escalations.values()];
  }

  clear() {
    this.escalations.clear();
    this.persist();
  }
}

export const globalStructuredEscalationManager = new StructuredEscalationManager();
