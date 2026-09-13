/**
 * Phase 9 — Connector Registry
 * Deterministic policy checks, LLM cannot grant permission
 */

import { ConnectorDefinition, ConnectorExecutionResult, ConnectorPermission } from "./types";
import { AutonomyManager, globalAutonomyManager } from "../autonomy/policy";
import { CredentialManager, globalCredentialManager } from "./credentials";
import { RateLimiter, globalRateLimiter } from "./rateLimiter";
import { SecurityValidator, globalSecurityValidator } from "./security";

export class ConnectorRegistry {
  private connectors: Map<string, ConnectorDefinition> = new Map();
  private autonomyManager: AutonomyManager;
  private credentialManager: CredentialManager;
  private rateLimiter: RateLimiter;
  private securityValidator: SecurityValidator;
  private executionLog: Array<{ timestamp: string; connector: string; permission: ConnectorPermission; success: boolean; requiresApproval: boolean }> = [];

  constructor(
    autonomyManager: AutonomyManager = globalAutonomyManager,
    credentialManager: CredentialManager = globalCredentialManager,
    rateLimiter: RateLimiter = globalRateLimiter,
    securityValidator: SecurityValidator = globalSecurityValidator
  ) {
    this.autonomyManager = autonomyManager;
    this.credentialManager = credentialManager;
    this.rateLimiter = rateLimiter;
    this.securityValidator = securityValidator;
  }

  register(definition: ConnectorDefinition) {
    // Validate definition
    if (!definition.name) throw new Error("Connector must have name");
    if (!definition.permission) throw new Error("Connector must have permission classification");
    this.connectors.set(definition.name, definition);
  }

  get(name: string): ConnectorDefinition | null {
    return this.connectors.get(name) ?? null;
  }

  list(): ConnectorDefinition[] {
    return [...this.connectors.values()];
  }

  listByPermission(permission: ConnectorPermission): ConnectorDefinition[] {
    return [...this.connectors.values()].filter(c => c.permission === permission);
  }

  // Deterministic authorization check — LLM cannot bypass
  canExecute(connectorName: string): { allowed: boolean; requiresApproval: boolean; reason: string } {
    const connector = this.connectors.get(connectorName);
    if (!connector) {
      return { allowed: false, requiresApproval: true, reason: `Connector ${connectorName} not found` };
    }

    // Check autonomy policy
    const autonomyCheck = this.autonomyManager.checkExternalActionRisk(connector.permission);
    if (!autonomyCheck.allowed) {
      return { allowed: false, requiresApproval: autonomyCheck.requiresApproval, reason: autonomyCheck.reason };
    }

    // Check security validator
    const securityCheck = this.securityValidator.validateConnectorExecution(connectorName, connector.permission);
    if (!securityCheck.allowed) {
      return { allowed: false, requiresApproval: securityCheck.requiresApproval, reason: securityCheck.reason };
    }

    // High-risk always requires approval
    if (connector.permission === "HIGH_RISK" || connector.permission === "IRREVERSIBLE_WRITE") {
      if (connector.requiresApproval) {
        return { allowed: false, requiresApproval: true, reason: `${connector.permission} requires explicit authorization` };
      }
    }

    // Check rate limiting
    const rateCheck = this.rateLimiter.canMakeRequest(connectorName);
    if (!rateCheck.allowed) {
      return { allowed: false, requiresApproval: false, reason: `Rate limited: ${rateCheck.reason}` };
    }

    return { allowed: true, requiresApproval: false, reason: "Allowed by policy" };
  }

  async execute(
    connectorName: string,
    input: unknown,
    options?: { bypassApprovalCheck?: boolean; authorizedBy?: string }
  ): Promise<ConnectorExecutionResult> {
    const start = Date.now();
    const connector = this.connectors.get(connectorName);
    if (!connector) {
      return {
        success: false,
        error: `Connector ${connectorName} not found`,
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        connectorName,
        permission: "HIGH_RISK",
        riskLevel: "CRITICAL",
        sideEffect: "NONE",
      };
    }

    // Deterministic authorization — LLM cannot grant itself permission
    if (!options?.bypassApprovalCheck) {
      const authCheck = this.canExecute(connectorName);
      if (!authCheck.allowed) {
        if (authCheck.requiresApproval && !options?.authorizedBy) {
          this.executionLog.push({
            timestamp: new Date().toISOString(),
            connector: connectorName,
            permission: connector.permission,
            success: false,
            requiresApproval: true,
          });
          return {
            success: false,
            error: `Unauthorized: ${authCheck.reason}. Requires explicit authorization.`,
            executionTimeMs: Date.now() - start,
            timestamp: new Date().toISOString(),
            connectorName,
            permission: connector.permission,
            riskLevel: connector.riskLevel,
            sideEffect: connector.sideEffect,
          };
        }
        if (!authCheck.allowed && !authCheck.requiresApproval) {
          return {
            success: false,
            error: `Blocked: ${authCheck.reason}`,
            executionTimeMs: Date.now() - start,
            timestamp: new Date().toISOString(),
            connectorName,
            permission: connector.permission,
            riskLevel: connector.riskLevel,
            sideEffect: connector.sideEffect,
          };
        }
      }
    }

    // Validate input
    const parsed = connector.inputSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      return {
        success: false,
        error: `Invalid input: ${issues}`,
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        connectorName,
        permission: connector.permission,
        riskLevel: connector.riskLevel,
        sideEffect: connector.sideEffect,
      };
    }

    // Security validation of input (prompt injection, etc)
    const securityInputCheck = this.securityValidator.validateInput(parsed.data);
    if (!securityInputCheck.allowed) {
      return {
        success: false,
        error: `Security blocked: ${securityInputCheck.reason}`,
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        connectorName,
        permission: connector.permission,
        riskLevel: connector.riskLevel,
        sideEffect: connector.sideEffect,
      };
    }

    // Rate limit
    const rateResult = this.rateLimiter.recordRequest(connectorName);
    if (!rateResult.allowed) {
      return {
        success: false,
        error: `Rate limited: ${rateResult.reason}`,
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        connectorName,
        permission: connector.permission,
        riskLevel: connector.riskLevel,
        sideEffect: connector.sideEffect,
      };
    }

    // For Phase 9, we simulate connector execution with safety
    // Real implementation would call actual external service via credential manager
    try {
      // Check credential if required
      if (connector.authRequired) {
        const cred = this.credentialManager.getCredential(connectorName);
        if (!cred && connector.authType !== "NONE") {
          return {
            success: false,
            error: `Missing credentials for ${connectorName}`,
            executionTimeMs: Date.now() - start,
            timestamp: new Date().toISOString(),
            connectorName,
            permission: connector.permission,
            riskLevel: connector.riskLevel,
            sideEffect: connector.sideEffect,
          };
        }
      }

      // Simulate successful execution for READ_ONLY connectors
      // For WRITE connectors, require authorizedBy
      if (connector.permission !== "READ_ONLY" && !options?.authorizedBy && connector.requiresApproval) {
        return {
          success: false,
          error: `Write operation requires authorization`,
          executionTimeMs: Date.now() - start,
          timestamp: new Date().toISOString(),
          connectorName,
          permission: connector.permission,
          riskLevel: connector.riskLevel,
          sideEffect: connector.sideEffect,
        };
      }

      const result: ConnectorExecutionResult = {
        success: true,
        data: { message: `Executed ${connectorName} with input`, input: parsed.data, mock: true },
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        connectorName,
        permission: connector.permission,
        riskLevel: connector.riskLevel,
        sideEffect: connector.sideEffect,
        verification: {
          verified: true,
          method: connector.verificationStrategy,
          evidence: { status: "mock_success" },
        },
      };

      this.executionLog.push({
        timestamp: new Date().toISOString(),
        connector: connectorName,
        permission: connector.permission,
        success: true,
        requiresApproval: false,
      });

      this.rateLimiter.recordSuccess(connectorName);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.rateLimiter.recordFailure(connectorName);
      return {
        success: false,
        error: msg,
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        connectorName,
        permission: connector.permission,
        riskLevel: connector.riskLevel,
        sideEffect: connector.sideEffect,
      };
    }
  }

  getExecutionLog() {
    return [...this.executionLog];
  }

  clear() {
    this.connectors.clear();
    this.executionLog = [];
  }
}

export const globalConnectorRegistry = new ConnectorRegistry();

// Register default connectors
import { z } from "zod";

globalConnectorRegistry.register({
  name: "web_fetch",
  capability: "Fetch public web pages",
  description: "Read-only web page fetching with SSRF protection",
  inputSchema: z.object({ url: z.string().url() }),
  outputSchema: z.object({ content: z.string(), statusCode: z.number() }),
  permission: "READ_ONLY",
  riskLevel: "LOW",
  sideEffect: "READ",
  timeoutMs: 15_000,
  retryPolicy: { maxRetries: 2, backoffMs: 1000, retryableErrors: ["timeout", "network"] },
  rateLimit: { requestsPerMinute: 30, burstLimit: 5 },
  reversibility: "NONE",
  verificationStrategy: "HTTP status code check",
  authRequired: false,
  authType: "NONE",
  requiresApproval: false,
});

globalConnectorRegistry.register({
  name: "github_read",
  capability: "Read GitHub repositories",
  description: "Read-only GitHub access",
  inputSchema: z.object({ repo: z.string(), path: z.string().optional() }),
  outputSchema: z.object({ content: z.any() }),
  permission: "READ_ONLY",
  riskLevel: "LOW",
  sideEffect: "READ",
  timeoutMs: 10_000,
  retryPolicy: { maxRetries: 2, backoffMs: 1000, retryableErrors: ["timeout"] },
  rateLimit: { requestsPerMinute: 30, burstLimit: 10 },
  reversibility: "NONE",
  verificationStrategy: "GitHub API response validation",
  authRequired: true,
  authType: "API_KEY",
  requiresApproval: false,
});

globalConnectorRegistry.register({
  name: "github_write",
  capability: "Write to GitHub repositories",
  description: "Create branches, issues, PRs",
  inputSchema: z.object({ repo: z.string(), action: z.string(), data: z.any() }),
  outputSchema: z.object({ success: z.boolean() }),
  permission: "REVERSIBLE_WRITE",
  riskLevel: "MEDIUM",
  sideEffect: "WRITE",
  timeoutMs: 15_000,
  retryPolicy: { maxRetries: 1, backoffMs: 2000, retryableErrors: [] },
  rateLimit: { requestsPerMinute: 10, burstLimit: 3 },
  reversibility: "REVERSIBLE",
  verificationStrategy: "GitHub API verification",
  authRequired: true,
  authType: "API_KEY",
  requiresApproval: true,
});

globalConnectorRegistry.register({
  name: "deploy_production",
  capability: "Deploy to production",
  description: "Irreversible production deployment",
  inputSchema: z.object({ environment: z.string(), version: z.string() }),
  outputSchema: z.object({ deployed: z.boolean() }),
  permission: "IRREVERSIBLE_WRITE",
  riskLevel: "HIGH",
  sideEffect: "DESTRUCTIVE",
  timeoutMs: 60_000,
  retryPolicy: { maxRetries: 0, backoffMs: 0, retryableErrors: [] },
  rateLimit: { requestsPerMinute: 2, burstLimit: 1 },
  reversibility: "IRREVERSIBLE",
  verificationStrategy: "Deployment status check",
  authRequired: true,
  authType: "API_KEY",
  requiresApproval: true,
});

globalConnectorRegistry.register({
  name: "delete_repository",
  capability: "Delete repository",
  description: "HIGH_RISK destructive operation",
  inputSchema: z.object({ repo: z.string() }),
  outputSchema: z.object({ deleted: z.boolean() }),
  permission: "HIGH_RISK",
  riskLevel: "CRITICAL",
  sideEffect: "DESTRUCTIVE",
  timeoutMs: 30_000,
  retryPolicy: { maxRetries: 0, backoffMs: 0, retryableErrors: [] },
  rateLimit: { requestsPerMinute: 1, burstLimit: 1 },
  reversibility: "IRREVERSIBLE",
  verificationStrategy: "Manual verification required",
  authRequired: true,
  authType: "API_KEY",
  requiresApproval: true,
});
