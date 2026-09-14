/**
 * Assumption Management — Phase 6
 * Classify assumptions by risk, record decisions, escalate high-risk
 */

import { Assumption, AssumptionRisk, createAssumption } from "./types";
import { AgentLogger, globalLogger } from "../core/logger";

export interface AssumptionDecision {
  assumption: Assumption;
  canProceed: boolean;
  requiresApproval: boolean;
  reason: string;
}

export class AssumptionManager {
  private logger: AgentLogger;
  private assumptions: Map<string, Assumption> = new Map();

  constructor(logger: AgentLogger = globalLogger) {
    this.logger = logger;
  }

  classifyRisk(assumptionText: string, context: string): AssumptionRisk {
    const lower = (assumptionText + " " + context).toLowerCase();

    // CRITICAL: destructive operations
    if (
      lower.includes("delete") && (lower.includes("user data") || lower.includes("existing") || lower.includes("all files")) ||
      lower.includes("drop database") ||
      lower.includes("rm -rf") ||
      lower.includes("format") ||
      lower.includes("overwrite") && lower.includes("without backup")
    ) {
      return "CRITICAL";
    }

    // HIGH: deleting, security, permissions, data loss
    if (
      lower.includes("delete") ||
      lower.includes("remove") && lower.includes("existing") ||
      lower.includes("security") ||
      lower.includes("permission") ||
      lower.includes("publish") ||
      lower.includes("push to remote") ||
      lower.includes("outside workspace") ||
      lower.includes("install") && lower.includes("package") && lower.includes("global")
    ) {
      return "HIGH";
    }

    // MEDIUM: choosing between implementations, file structure
    if (
      lower.includes("choose") ||
      lower.includes("implementation") ||
      lower.includes("architecture") ||
      lower.includes("framework") ||
      lower.includes("library") ||
      lower.includes("structure")
    ) {
      return "MEDIUM";
    }

    // LOW: filename, variable naming, minor formatting
    return "LOW";
  }

  createAssumption(params: {
    projectId: string;
    objectiveId: string;
    assumption: string;
    reason: string;
    confidence?: number;
    affectedTasks?: string[];
    context?: string;
  }): Assumption {
    const risk = this.classifyRisk(params.assumption, params.context ?? params.reason);
    const assumption = createAssumption({
      projectId: params.projectId,
      objectiveId: params.objectiveId,
      assumption: params.assumption,
      reason: params.reason,
      confidence: params.confidence,
      risk,
      affectedTasks: params.affectedTasks,
    });

    this.assumptions.set(assumption.id, assumption);
    this.logger.info("assumption_created", `Assumption [${risk}] ${assumption.assumption}`, {
      assumptionId: assumption.id,
      risk,
      projectId: params.projectId,
    });

    return assumption;
  }

  decide(assumption: Assumption): AssumptionDecision {
    if (assumption.risk === "CRITICAL") {
      return {
        assumption,
        canProceed: false,
        requiresApproval: true,
        reason: `CRITICAL risk assumption requires human approval: ${assumption.assumption}`,
      };
    }
    if (assumption.risk === "HIGH") {
      return {
        assumption,
        canProceed: false,
        requiresApproval: true,
        reason: `HIGH risk assumption requires approval: ${assumption.assumption}`,
      };
    }
    // LOW and MEDIUM can proceed but record
    return {
      assumption,
      canProceed: true,
      requiresApproval: false,
      reason: `Proceeding with ${assumption.risk} risk assumption: ${assumption.assumption}`,
    };
  }

  getAssumptions(projectId: string): Assumption[] {
    return Array.from(this.assumptions.values()).filter((a) => a.projectId === projectId);
  }

  getHighRiskAssumptions(projectId: string): Assumption[] {
    return this.getAssumptions(projectId).filter((a) => a.risk === "HIGH" || a.risk === "CRITICAL");
  }

  validate(assumptionId: string, status: Assumption["status"]): void {
    const existing = this.assumptions.get(assumptionId);
    if (existing) {
      existing.status = status;
      this.assumptions.set(assumptionId, existing);
    }
  }

  clear(projectId?: string): void {
    if (projectId) {
      for (const [id, a] of this.assumptions) {
        if (a.projectId === projectId) this.assumptions.delete(id);
      }
    } else {
      this.assumptions.clear();
    }
  }
}

export const globalAssumptionManager = new AssumptionManager();
