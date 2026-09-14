/**
 * Phase 9 — Connector Architecture
 * name, capability, input/output schema, permissions, auth, risk, side-effect, timeout, retry, rate limits, reversibility, verification
 */

import { z } from "zod";

export type ConnectorPermission = "READ_ONLY" | "REVERSIBLE_WRITE" | "IRREVERSIBLE_WRITE" | "HIGH_RISK";

export type ConnectorRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SideEffectLevel = "NONE" | "READ" | "WRITE" | "DESTRUCTIVE";

export interface ConnectorDefinition {
  name: string;
  capability: string;
  description: string;
  inputSchema: z.ZodType<any>;
  outputSchema: z.ZodType<any>;
  permission: ConnectorPermission;
  riskLevel: ConnectorRiskLevel;
  sideEffect: SideEffectLevel;
  timeoutMs: number;
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
    retryableErrors: string[];
  };
  rateLimit: {
    requestsPerMinute: number;
    burstLimit: number;
  };
  reversibility: "REVERSIBLE" | "IRREVERSIBLE" | "NONE";
  verificationStrategy: string;
  authRequired: boolean;
  authType?: "API_KEY" | "OAUTH" | "BASIC" | "BEARER" | "NONE";
  allowedDomains?: string[];
  blockedDomains?: string[];
  requiresApproval: boolean;
}

export interface ConnectorExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
  executionTimeMs: number;
  timestamp: string;
  connectorName: string;
  permission: ConnectorPermission;
  riskLevel: ConnectorRiskLevel;
  sideEffect: SideEffectLevel;
  verification?: {
    verified: boolean;
    method: string;
    evidence?: unknown;
  };
}

export function classifyRisk(permission: ConnectorPermission): ConnectorRiskLevel {
  switch (permission) {
    case "READ_ONLY":
      return "LOW";
    case "REVERSIBLE_WRITE":
      return "MEDIUM";
    case "IRREVERSIBLE_WRITE":
      return "HIGH";
    case "HIGH_RISK":
      return "CRITICAL";
    default:
      return "HIGH";
  }
}
