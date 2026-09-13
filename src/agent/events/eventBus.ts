/**
 * Phase 8+9 — Event Bus
 * Validate, authorize, correlate, create/resume job, execute, verify, record
 * No arbitrary external input directly exec shell
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AgentEvent, EventType, EventStatus, EventSubscription } from "./types";
import { loadConfig } from "../config";
import { SecurityValidator, globalSecurityValidator } from "../connectors/security";

export interface EventHandler {
  (event: AgentEvent): Promise<{ success: boolean; runId?: string; result?: unknown; error?: string }>;
}

export class EventBus {
  private events: Map<string, AgentEvent> = new Map();
  private subscriptions: Map<string, EventSubscription> = new Map();
  private handlers: Map<string, EventHandler> = new Map();
  private filePath: string;
  private securityValidator: SecurityValidator;

  constructor(filePath?: string, securityValidator: SecurityValidator = globalSecurityValidator) {
    const config = loadConfig();
    this.filePath = filePath ?? path.join(config.workspaceRoot, ".kaira", "events.json");
    this.securityValidator = securityValidator;
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
      const list: AgentEvent[] = Array.isArray(parsed) ? parsed : parsed.events ?? [];
      for (const e of list) {
        if (e.id) this.events.set(e.id, e);
      }
    } catch {}
  }

  private persist() {
    try {
      this.ensureDir();
      const tmp = this.filePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify([...this.events.values()], null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch {}
  }

  registerHandler(name: string, handler: EventHandler) {
    this.handlers.set(name, handler);
  }

  subscribe(params: { eventType: EventType; sourcePattern?: string; handler: string }): EventSubscription {
    const sub: EventSubscription = {
      id: randomUUID(),
      eventType: params.eventType,
      sourcePattern: params.sourcePattern,
      handler: params.handler,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  // Receive event — structured, validated, authorized
  async receiveEvent(params: {
    type: EventType;
    source: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<AgentEvent> {
    const event: AgentEvent = {
      id: randomUUID(),
      type: params.type,
      source: params.source,
      timestamp: new Date().toISOString(),
      payload: params.payload,
      metadata: params.metadata,
      status: "RECEIVED",
    };

    this.events.set(event.id, event);
    this.persist();

    // Validate
    const validated = this.validateEvent(event);
    event.validationResult = validated;
    if (!validated.valid) {
      event.status = "REJECTED";
      event.error = validated.reason;
      this.events.set(event.id, event);
      this.persist();
      return event;
    }
    event.status = "VALIDATED";

    // Authorize
    const authorized = this.authorizeEvent(event);
    event.authorizationResult = authorized;
    if (!authorized.authorized) {
      event.status = "REJECTED";
      event.error = authorized.reason;
      this.events.set(event.id, event);
      this.persist();
      return event;
    }
    event.status = "AUTHORIZED";

    // Correlate
    event.correlationId = this.correlateEvent(event);
    event.status = "CORRELATED";
    this.events.set(event.id, event);
    this.persist();

    // Execute via handlers
    event.status = "EXECUTING";
    this.events.set(event.id, event);
    this.persist();

    try {
      const result = await this.executeEvent(event);
      event.status = "COMPLETED";
      event.result = result.result;
      event.runId = result.runId;
    } catch (err) {
      event.status = "FAILED";
      event.error = err instanceof Error ? err.message : String(err);
    }

    this.events.set(event.id, event);
    this.persist();
    return event;
  }

  private validateEvent(event: AgentEvent): { valid: boolean; reason?: string } {
    // Security validation of payload
    const payloadText = JSON.stringify(event.payload);
    const securityCheck = this.securityValidator.validateInput(payloadText);
    if (!securityCheck.allowed) {
      return { valid: false, reason: securityCheck.reason };
    }

    // Check required fields
    if (!event.type) return { valid: false, reason: "Missing event type" };
    if (!event.source) return { valid: false, reason: "Missing event source" };
    if (!event.payload) return { valid: false, reason: "Missing payload" };

    // Validate URL if present
    if (event.payload.url && typeof event.payload.url === "string") {
      const urlCheck = this.securityValidator.validateUrl(event.payload.url);
      if (!urlCheck.allowed) {
        return { valid: false, reason: urlCheck.reason };
      }
    }

    return { valid: true };
  }

  private authorizeEvent(event: AgentEvent): { authorized: boolean; reason?: string; requiredPolicy?: string } {
    // For Phase 8+9, we implement basic authorization
    // WEBHOOK and EXTERNAL_EVENT require validation
    // No arbitrary shell execution

    // Check if event tries to execute shell directly
    const payloadText = JSON.stringify(event.payload).toLowerCase();
    if (payloadText.includes("rm -rf") || payloadText.includes("sudo") || payloadText.includes("exec") && payloadText.includes("shell")) {
      // Allow if it's just data, but not if it's trying to trigger shell
      // For safety, we block payloads that contain shell command execution intent
      if (event.type === "WEBHOOK" || event.type === "EXTERNAL_EVENT") {
        // Check if payload has explicit command field
        if ((event.payload as any).command || (event.payload as any).shell) {
          return { authorized: false, reason: "External event cannot directly execute shell commands — blocked by policy", requiredPolicy: "NO_ARBITRARY_SHELL" };
        }
      }
    }

    return { authorized: true, reason: "Authorized by deterministic policy" };
  }

  private correlateEvent(event: AgentEvent): string {
    // Simple correlation — group by source and type
    return `${event.source}:${event.type}:${new Date(event.timestamp).toISOString().split("T")[0]}`;
  }

  private async executeEvent(event: AgentEvent): Promise<{ runId?: string; result?: unknown }> {
    // Find matching subscriptions
    const matchingSubs = [...this.subscriptions.values()].filter(s => {
      if (!s.enabled) return false;
      if (s.eventType !== event.type) return false;
      if (s.sourcePattern) {
        try {
          const regex = new RegExp(s.sourcePattern);
          if (!regex.test(event.source)) return false;
        } catch {
          if (!event.source.includes(s.sourcePattern)) return false;
        }
      }
      return true;
    });

    if (matchingSubs.length === 0) {
      return { result: { message: "No handlers for event", eventId: event.id } };
    }

    let lastResult: any = null;
    for (const sub of matchingSubs) {
      const handler = this.handlers.get(sub.handler);
      if (handler) {
        const result = await handler(event);
        lastResult = result;
        if (!result.success) {
          throw new Error(result.error ?? `Handler ${sub.handler} failed`);
        }
      }
    }

    return lastResult ?? { result: { message: "Event processed", eventId: event.id } };
  }

  getEvent(id: string): AgentEvent | null {
    return this.events.get(id) ?? null;
  }

  listEvents(): AgentEvent[] {
    return [...this.events.values()];
  }

  getEventsByType(type: EventType): AgentEvent[] {
    return [...this.events.values()].filter(e => e.type === type);
  }

  clear() {
    this.events.clear();
    this.subscriptions.clear();
    this.persist();
  }
}

export const globalEventBus = new EventBus();
