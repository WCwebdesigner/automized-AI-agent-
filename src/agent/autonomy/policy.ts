/**
 * Phase 8 — Autonomy Policy
 * SUPERVISED, ASSISTED, AUTONOMOUS, RESTRICTED
 * Determines authority without unlimited inference
 */

export type AutonomyLevel = "SUPERVISED" | "ASSISTED" | "AUTONOMOUS" | "RESTRICTED";

export interface AutonomyPolicy {
  level: AutonomyLevel;
  description: string;
  allowedActions: {
    read: boolean;
    workspaceWrite: boolean;
    commandExecution: boolean;
    destructive: boolean;
    externalRead: boolean;
    externalWrite: boolean;
    highRisk: boolean;
    research: boolean;
    monitoring: boolean;
    scheduling: boolean;
  };
  requiresApproval: {
    externalWrite: boolean;
    highRisk: boolean;
    destructive: boolean;
    spending: boolean;
    publish: boolean;
  };
  maxAutonomousSteps: number;
  maxExternalRequests: number;
}

export const AUTONOMY_POLICIES: Record<AutonomyLevel, AutonomyPolicy> = {
  SUPERVISED: {
    level: "SUPERVISED",
    description: "Human approves each significant action, agent suggests",
    allowedActions: {
      read: true,
      workspaceWrite: false,
      commandExecution: false,
      destructive: false,
      externalRead: false,
      externalWrite: false,
      highRisk: false,
      research: false,
      monitoring: false,
      scheduling: false,
    },
    requiresApproval: {
      externalWrite: true,
      highRisk: true,
      destructive: true,
      spending: true,
      publish: true,
    },
    maxAutonomousSteps: 1,
    maxExternalRequests: 0,
  },
  ASSISTED: {
    level: "ASSISTED",
    description: "Agent acts within workspace, human approves external/high-risk",
    allowedActions: {
      read: true,
      workspaceWrite: true,
      commandExecution: true,
      destructive: false,
      externalRead: true,
      externalWrite: false,
      highRisk: false,
      research: true,
      monitoring: true,
      scheduling: true,
    },
    requiresApproval: {
      externalWrite: true,
      highRisk: true,
      destructive: true,
      spending: true,
      publish: true,
    },
    maxAutonomousSteps: 10,
    maxExternalRequests: 20,
  },
  AUTONOMOUS: {
    level: "AUTONOMOUS",
    description: "Agent acts autonomously within defined limits, escalates on ambiguity",
    allowedActions: {
      read: true,
      workspaceWrite: true,
      commandExecution: true,
      destructive: false,
      externalRead: true,
      externalWrite: true,
      highRisk: false,
      research: true,
      monitoring: true,
      scheduling: true,
    },
    requiresApproval: {
      externalWrite: false,
      highRisk: true,
      destructive: true,
      spending: true,
      publish: true,
    },
    maxAutonomousSteps: 50,
    maxExternalRequests: 50,
  },
  RESTRICTED: {
    level: "RESTRICTED",
    description: "Minimal autonomy, read-only, no external access",
    allowedActions: {
      read: true,
      workspaceWrite: false,
      commandExecution: false,
      destructive: false,
      externalRead: false,
      externalWrite: false,
      highRisk: false,
      research: false,
      monitoring: false,
      scheduling: false,
    },
    requiresApproval: {
      externalWrite: true,
      highRisk: true,
      destructive: true,
      spending: true,
      publish: true,
    },
    maxAutonomousSteps: 0,
    maxExternalRequests: 0,
  },
};

export class AutonomyManager {
  private currentPolicy: AutonomyPolicy;

  constructor(level: AutonomyLevel = "ASSISTED") {
    this.currentPolicy = AUTONOMY_POLICIES[level];
  }

  setLevel(level: AutonomyLevel) {
    this.currentPolicy = AUTONOMY_POLICIES[level];
  }

  getPolicy(): AutonomyPolicy {
    return this.currentPolicy;
  }

  canPerform(action: keyof AutonomyPolicy["allowedActions"]): boolean {
    return this.currentPolicy.allowedActions[action];
  }

  requiresApproval(action: keyof AutonomyPolicy["requiresApproval"]): boolean {
    return this.currentPolicy.requiresApproval[action];
  }

  // Deterministic check — does LLM need approval for this external action?
  checkExternalActionRisk(risk: "READ_ONLY" | "REVERSIBLE_WRITE" | "IRREVERSIBLE_WRITE" | "HIGH_RISK"): { allowed: boolean; requiresApproval: boolean; reason: string } {
    const policy = this.currentPolicy;

    if (risk === "READ_ONLY") {
      if (!policy.allowedActions.externalRead) {
        return { allowed: false, requiresApproval: true, reason: `External READ not allowed under ${policy.level}` };
      }
      return { allowed: true, requiresApproval: false, reason: "READ allowed" };
    }

    if (risk === "REVERSIBLE_WRITE") {
      if (!policy.allowedActions.externalWrite) {
        return { allowed: false, requiresApproval: true, reason: `External WRITE not allowed under ${policy.level}` };
      }
      if (policy.requiresApproval.externalWrite) {
        return { allowed: false, requiresApproval: true, reason: `External WRITE requires approval under ${policy.level}` };
      }
      return { allowed: true, requiresApproval: false, reason: "Reversible write allowed" };
    }

    if (risk === "IRREVERSIBLE_WRITE" || risk === "HIGH_RISK") {
      if (!policy.allowedActions.highRisk && risk === "HIGH_RISK") {
        return { allowed: false, requiresApproval: true, reason: `HIGH_RISK not allowed under ${policy.level}` };
      }
      if (!policy.allowedActions.externalWrite) {
        return { allowed: false, requiresApproval: true, reason: `External WRITE not allowed under ${policy.level}` };
      }
      // Always requires approval for irreversible/high risk
      return { allowed: false, requiresApproval: true, reason: `${risk} requires explicit authorization` };
    }

    return { allowed: false, requiresApproval: true, reason: "Unknown risk level" };
  }
}

export const globalAutonomyManager = new AutonomyManager();
