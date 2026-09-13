/**
 * Phase 9 — Credential Security
 * Never in prompts/logs/observations/research/memory/reports, env vars or secure abstraction, never expose to model
 */

import fs from "node:fs";
import path from "node:path";

export interface Credential {
  id: string;
  connectorName: string;
  type: "API_KEY" | "OAUTH" | "BASIC" | "BEARER";
  value: string; // encrypted or env var reference
  createdAt: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export class CredentialManager {
  private credentials: Map<string, Credential> = new Map();
  private envPrefix = "KAIRA_CREDENTIAL_";

  // Get credential — never expose raw value to model, only to authorized tool
  getCredential(connectorName: string): string | null {
    // First check env var
    const envKey = `${this.envPrefix}${connectorName.toUpperCase()}`;
    const envValue = process.env[envKey] ?? process.env[`${connectorName.toUpperCase()}_API_KEY`] ?? process.env[`${connectorName.toUpperCase()}_TOKEN`];
    if (envValue) {
      return envValue;
    }

    // Check stored credentials
    const cred = this.credentials.get(connectorName);
    if (!cred) return null;

    // Check expiration
    if (cred.expiresAt && new Date(cred.expiresAt).getTime() < Date.now()) {
      this.credentials.delete(connectorName);
      return null;
    }

    return cred.value;
  }

  setCredential(connectorName: string, value: string, type: Credential["type"] = "API_KEY", expiresAt?: string) {
    // Never log value
    const cred: Credential = {
      id: connectorName,
      connectorName,
      type,
      value,
      createdAt: new Date().toISOString(),
      expiresAt,
    };
    this.credentials.set(connectorName, cred);
  }

  deleteCredential(connectorName: string) {
    this.credentials.delete(connectorName);
  }

  hasCredential(connectorName: string): boolean {
    return this.getCredential(connectorName) !== null;
  }

  // For logging — never include value
  listCredentialMetadata(): Array<{ connectorName: string; type: string; hasValue: boolean; createdAt: string }> {
    return [...this.credentials.values()].map(c => ({
      connectorName: c.connectorName,
      type: c.type,
      hasValue: true,
      createdAt: c.createdAt,
    }));
  }

  // Sanitize any object that might contain credentials — for logs, observations, reports
  sanitizeForLogging(data: any): any {
    if (typeof data === "string") {
      // Redact patterns that look like credentials
      return data
        .replace(/(api[_-]?key["'\s:]+)(["']?)([A-Za-z0-9_\-]{20,})/gi, "$1$2***REDACTED***")
        .replace(/(token["'\s:]+)(["']?)([A-Za-z0-9_\-]{20,})/gi, "$1$2***REDACTED***")
        .replace(/(password["'\s:]+)(["']?)([^\s"']+)/gi, "$1$2***REDACTED***")
        .replace(/(secret["'\s:]+)(["']?)([A-Za-z0-9_\-]{20,})/gi, "$1$2***REDACTED***");
    }
    if (Array.isArray(data)) {
      return data.map(d => this.sanitizeForLogging(d));
    }
    if (typeof data === "object" && data !== null) {
      const sanitized: any = {};
      for (const [k, v] of Object.entries(data)) {
        const lowerKey = k.toLowerCase();
        if (lowerKey.includes("api_key") || lowerKey.includes("apikey") || lowerKey.includes("token") || lowerKey.includes("password") || lowerKey.includes("secret") || lowerKey.includes("credential")) {
          sanitized[k] = "***REDACTED***";
        } else {
          sanitized[k] = this.sanitizeForLogging(v);
        }
      }
      return sanitized;
    }
    return data;
  }

  // Check if prompt contains credential leakage attempt
  containsCredentialLeakage(text: string): boolean {
    const lower = text.toLowerCase();
    // Check if text tries to expose credentials
    const leakPatterns = [
      /show.*api.*key/i,
      /reveal.*token/i,
      /what.*is.*my.*password/i,
      /print.*credential/i,
      /display.*secret/i,
    ];
    return leakPatterns.some(p => p.test(text));
  }

  clear() {
    this.credentials.clear();
  }
}

export const globalCredentialManager = new CredentialManager();
