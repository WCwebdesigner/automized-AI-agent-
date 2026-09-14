/**
 * Phase 7 — Memory Tools — Integrated with durable MemoryStore
 * Tools for proposing candidates and retrieving bounded relevant memories
 */

import { z } from "zod";
import { ToolResultStatus, PermissionLevel } from "../core/constants";
import { globalToolRegistry, makeResult } from "./registry";
import { getGlobalMemoryStore } from "../memory/store";
import { retrieveMemories, DEFAULT_RETRIEVAL_CONFIG } from "../memory/retrieval";
import type { MemoryCandidate, MemoryScope, MemoryType, MemoryProvenanceSource } from "../memory/types";

// Tool: propose memory candidate (model proposes, runtime decides)
globalToolRegistry.register({
  name: "memory_propose",
  description:
    "Propose a durable knowledge candidate for memory store. Runtime validates via deterministic filter (secrets blocked, noise, transient paths) and value scoring. Provenance preserved. Use for architecture decisions, conventions, successful/repair patterns, env/tool knowledge, research findings, procedures, constraints, lessons.",
  inputSchema: z.object({
    type: z.enum([
      "PROJECT_KNOWLEDGE",
      "TECHNICAL_FACT",
      "ARCHITECTURE_DECISION",
      "PROJECT_CONVENTION",
      "SUCCESSFUL_PATTERN",
      "FAILURE_PATTERN",
      "REPAIR_PATTERN",
      "ENVIRONMENT_KNOWLEDGE",
      "TOOL_KNOWLEDGE",
      "RESEARCH_FINDING",
      "PROCEDURE",
      "CONSTRAINT",
      "ASSUMPTION",
      "LESSON_LEARNED",
    ]),
    content: z.string().min(20).max(5000),
    summary: z.string().min(10).max(500),
    scope: z.enum(["GLOBAL", "PROJECT", "WORKSPACE", "TASK", "TOOL", "ENVIRONMENT"]).default("PROJECT"),
    projectId: z.string().optional(),
    confidence: z.number().int().min(0).max(100).default(60),
    tags: z.array(z.string()).max(10).default([]),
    provenanceSource: z.enum([
      "USER_PROVIDED",
      "VERIFIED_OBSERVATION",
      "VERIFIED_RESEARCH",
      "SUCCESSFUL_EXECUTION",
      "VERIFIED_REPAIR",
      "SYSTEM_CONFIGURATION",
      "INFERRED",
    ]).default("VERIFIED_OBSERVATION"),
    provenanceDescription: z.string().min(10).max(1000).default("Proposed from execution"),
    relatedTools: z.array(z.string()).optional(),
    relatedTasks: z.array(z.string()).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      type: { type: "string" },
      content: { type: "string" },
      summary: { type: "string" },
      scope: { type: "string" },
      projectId: { type: "string" },
      confidence: { type: "number" },
      tags: { type: "array", items: { type: "string" } },
      provenanceSource: { type: "string" },
      provenanceDescription: { type: "string" },
    },
    required: ["type", "content", "summary"],
  },
  permissionLevel: PermissionLevel.WORKSPACE_WRITE,
  timeoutMs: 5000,
  handler: async (input, ctx) => {
    const start = Date.now();
    try {
      const store = getGlobalMemoryStore();
      const candidate: MemoryCandidate = {
        type: input.type as MemoryType,
        content: input.content,
        summary: input.summary,
        scope: input.scope as MemoryScope,
        projectId: input.projectId,
        provenance: {
          source: input.provenanceSource as MemoryProvenanceSource,
          description: input.provenanceDescription ?? "Proposed from execution",
          timestamp: new Date().toISOString(),
          runId: ctx.runId,
          objectiveId: ctx.objectiveId,
          taskId: ctx.taskId,
        },
        confidence: input.confidence ?? 60,
        tags: input.tags ?? [],
        relatedTools: input.relatedTools,
        relatedTasks: input.relatedTasks,
      };

      const result = store.storeCandidate(candidate, {
        runId: ctx.runId,
        objectiveId: ctx.objectiveId,
        taskId: ctx.taskId,
        hasVerificationEvidence: input.provenanceSource !== "INFERRED",
        hasExternalVerification: input.provenanceSource === "VERIFIED_RESEARCH",
      });

      if (!result.stored) {
        return makeResult({
          tool: "memory_propose",
          input,
          status: ToolResultStatus.SUCCESS,
          output: `Memory candidate REJECTED: ${result.reason} (score=${result.validationScore ?? "N/A"})`,
          executionTimeMs: Date.now() - start,
          data: { stored: false, reason: result.reason },
        });
      }

      return makeResult({
        tool: "memory_propose",
        input,
        status: ToolResultStatus.SUCCESS,
        output: `Memory STORED: id=${result.memory!.id} type=${result.memory!.type} scope=${result.memory!.scope} validity=${result.memory!.validity} confidence=${result.memory!.confidence} score=${result.validationScore}`,
        executionTimeMs: Date.now() - start,
        data: { stored: true, memory: result.memory },
      });
    } catch (err) {
      return makeResult({
        tool: "memory_propose",
        input,
        status: ToolResultStatus.FAILURE,
        output: `memory_propose failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
});

// Tool: retrieve relevant memories bounded
globalToolRegistry.register({
  name: "memory_retrieve",
  description:
    "Retrieve relevant durable memories for current objective/task. Bounded retrieval: scope → search → rank → filter stale/invalid → bounded context → planner. Returns only relevant memories with ranking, why relevant, confidence, scope, provenance. Project-specific outranks global. Respects context budget.",
  inputSchema: z.object({
    objective: z.string().min(5).max(2000),
    projectId: z.string().optional(),
    taskId: z.string().optional(),
    toolName: z.string().optional(),
    tags: z.array(z.string()).optional(),
    maxMemories: z.number().int().min(1).max(20).optional(),
    maxTokens: z.number().int().min(100).max(10000).optional(),
    minConfidence: z.number().int().min(0).max(100).optional(),
    includeStale: z.boolean().optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      objective: { type: "string" },
      projectId: { type: "string" },
      taskId: { type: "string" },
      toolName: { type: "string" },
      maxMemories: { type: "number" },
      maxTokens: { type: "number" },
      minConfidence: { type: "number" },
    },
    required: ["objective"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 5000,
  handler: async (input, ctx) => {
    const start = Date.now();
    try {
      const store = getGlobalMemoryStore();
      const result = retrieveMemories(
        store,
        {
          objective: input.objective,
          projectId: input.projectId,
          taskId: input.taskId,
          toolName: input.toolName,
          tags: input.tags,
          maxMemories: input.maxMemories,
          maxTokens: input.maxTokens,
          minConfidence: input.minConfidence,
          includeStale: input.includeStale,
        },
        {
          ...DEFAULT_RETRIEVAL_CONFIG,
          maxMemories: input.maxMemories ?? DEFAULT_RETRIEVAL_CONFIG.maxMemories,
          maxTokens: input.maxTokens ?? DEFAULT_RETRIEVAL_CONFIG.maxTokens,
          minConfidence: input.minConfidence ?? DEFAULT_RETRIEVAL_CONFIG.minConfidence,
          includeStale: input.includeStale ?? DEFAULT_RETRIEVAL_CONFIG.includeStale,
        }
      );

      const formatted = result.memories.map(m => {
        const ranking = result.rankingDetails.find(r => r.memoryId === m.id);
        return `[${m.type}][${m.scope}][${m.validity}][conf:${m.confidence}][prov:${m.provenance.source}] score=${ranking?.score ?? 0}
Summary: ${m.summary}
Content: ${m.content.slice(0, 500)}
Tags: ${m.tags.join(", ")}
Why relevant: semantic=${ranking?.factors.semanticRelevance} projectScope=${ranking?.factors.projectScope} tags=${ranking?.factors.exactTags} recency=${ranking?.factors.recency} validity=${ranking?.factors.validity} provenance=${ranking?.factors.provenance}
Influenced decision: retrieved ${m.retrievalCount}x, used ${m.useCount}x, success ${m.successCount}x
---`;
      }).join("\n");

      return makeResult({
        tool: "memory_retrieve",
        input,
        status: ToolResultStatus.SUCCESS,
        output: result.memories.length > 0
          ? `Retrieved ${result.totalReturned}/${result.totalFound} memories (truncated=${result.truncated}):\n${formatted}`
          : `No relevant memories found for objective: "${input.objective}"`,
        executionTimeMs: Date.now() - start,
        data: { result },
      });
    } catch (err) {
      return makeResult({
        tool: "memory_retrieve",
        input,
        status: ToolResultStatus.FAILURE,
        output: `memory_retrieve failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
});

// Tool: list memory lifecycle events for observability
globalToolRegistry.register({
  name: "memory_audit",
  description:
    "Show memory audit trail: MEMORY_PROPOSED/REJECTED/VALIDATED/STORED/RETRIEVED/USED/STALE/SUPERSEDED/INVALIDATED with why relevant, confidence, scope, provenance, influenced decision, without sensitive content.",
  inputSchema: z.object({
    memoryId: z.string().optional(),
    projectId: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      memoryId: { type: "string" },
      projectId: { type: "string" },
      limit: { type: "number" },
    },
    required: [],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 5000,
  handler: async (input, ctx) => {
    const start = Date.now();
    try {
      const store = getGlobalMemoryStore();
      const events = store.getLifecycleEvents(input.memoryId, input.limit ?? 50);
      const memories = input.memoryId ? [store.getMemory(input.memoryId)].filter(Boolean) : store.listMemories({ projectId: input.projectId });
      const contradictions = store.getContradictions({ projectId: input.projectId, unresolvedOnly: true });

      const out = [
        `=== Memories (${memories.length}) ===`,
        ...memories.slice(0, 20).map(m => m ? `[${m!.id}] ${m!.type} ${m!.scope} ${m!.validity} conf=${m!.confidence} prov=${m!.provenance.source} summary=${m!.summary}` : ""),
        `=== Lifecycle Events (${events.length}) ===`,
        ...events.map(e => `${e.timestamp} ${e.type} mem=${e.memoryId} reason=${e.reason ?? ""}`),
        `=== Contradictions (${contradictions.length}) ===`,
        ...contradictions.map(c => `${c.id} ${c.type} ${c.memoryAId} vs ${c.memoryBId} : ${c.description} resolved=${c.resolved}`),
      ].join("\n");

      return makeResult({
        tool: "memory_audit",
        input,
        status: ToolResultStatus.SUCCESS,
        output: out || "No memory audit data",
        executionTimeMs: Date.now() - start,
        data: { events, memories: memories.slice(0, 20), contradictions },
      });
    } catch (err) {
      return makeResult({
        tool: "memory_audit",
        input,
        status: ToolResultStatus.FAILURE,
        output: `memory_audit failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
});
