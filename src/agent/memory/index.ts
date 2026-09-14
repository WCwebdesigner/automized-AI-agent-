/**
 * Phase 7 — Memory — Public API
 */

export * from "./types.js";
export * from "./store.js";
export * from "./retrieval.js";
export * from "./validation.js";
export * from "./secretDetector.js";

import { MemoryStore, getGlobalMemoryStore, setGlobalMemoryStore } from "./store.js";
import type { MemoryCandidate, MemoryRetrievalQuery, MemoryRecord } from "./types.js";
import { retrieveMemories, DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfig } from "./retrieval.js";

// Integrated lifecycle helpers for orchestrator

export interface MemoryIntegration {
  store: MemoryStore;
  retrieveForObjective: (query: MemoryRetrievalQuery, config?: RetrievalConfig) => ReturnType<typeof retrieveMemories>;
  proposeAndStore: (candidate: MemoryCandidate, context?: { runId?: string; objectiveId?: string; taskId?: string; hasVerificationEvidence?: boolean; hasExternalVerification?: boolean }) => ReturnType<MemoryStore["storeCandidate"]>;
  extractFromExecution: (params: {
    objective: string;
    projectId?: string;
    taskId?: string;
    toolName?: string;
    success: boolean;
    observation: string;
    summary: string;
    runId?: string;
    evidenceIds?: string[];
  }) => void;
  extractRepairPattern: (params: {
    failureId: string;
    failureDescription: string;
    repairDescription: string;
    repairSuccess: boolean;
    projectId?: string;
    runId?: string;
    evidenceIds?: string[];
  }) => void;
  extractResearchFinding: (params: {
    finding: string;
    summary: string;
    sourceUrl?: string;
    sourceId?: string;
    confidence: number;
    projectId?: string;
    runId?: string;
  }) => void;
}

export function createMemoryIntegration(store?: MemoryStore): MemoryIntegration {
  const memStore = store ?? getGlobalMemoryStore();

  return {
    store: memStore,
    retrieveForObjective: (query, config) => retrieveMemories(memStore, query, config ?? DEFAULT_RETRIEVAL_CONFIG),
    proposeAndStore: (candidate, context) => memStore.storeCandidate(candidate, context ?? {}),
    extractFromExecution: (params) => {
      // Only extract if success and useful pattern
      if (!params.success) return;
      if (params.observation.length < 30) return;

      const candidate: MemoryCandidate = {
        type: "SUCCESSFUL_PATTERN",
        content: params.observation.slice(0, 2000),
        summary: params.summary,
        scope: params.projectId ? "PROJECT" : "GLOBAL",
        projectId: params.projectId,
        provenance: {
          source: "SUCCESSFUL_EXECUTION",
          description: `Successful execution for objective: ${params.objective}`,
          evidenceIds: params.evidenceIds,
          timestamp: new Date().toISOString(),
          runId: params.runId,
          taskId: params.taskId,
        },
        confidence: 70,
        tags: [params.toolName ?? "execution", "pattern"],
        relatedTasks: params.taskId ? [params.taskId] : [],
        relatedTools: params.toolName ? [params.toolName] : [],
        metadata: { objective: params.objective },
      };
      memStore.storeCandidate(candidate, {
        runId: params.runId,
        taskId: params.taskId,
        hasVerificationEvidence: !!params.evidenceIds && params.evidenceIds.length > 0,
      });
    },
    extractRepairPattern: (params) => {
      if (!params.repairSuccess) return;
      const candidate: MemoryCandidate = {
        type: "REPAIR_PATTERN",
        content: `Failure: ${params.failureDescription}\nRepair: ${params.repairDescription}\nOutcome: successful repair`,
        summary: `Repair pattern for ${params.failureDescription.slice(0, 100)}`,
        scope: params.projectId ? "PROJECT" : "GLOBAL",
        projectId: params.projectId,
        provenance: {
          source: "VERIFIED_REPAIR",
          description: `Verified repair for failure ${params.failureId}`,
          evidenceIds: params.evidenceIds,
          timestamp: new Date().toISOString(),
          runId: params.runId,
        },
        confidence: 75,
        tags: ["repair", "failure", "pattern"],
        relatedFailures: [params.failureId],
        metadata: { failureId: params.failureId },
      };
      memStore.storeCandidate(candidate, {
        runId: params.runId,
        hasVerificationEvidence: true,
      });
    },
    extractResearchFinding: (params) => {
      const candidate: MemoryCandidate = {
        type: "RESEARCH_FINDING",
        content: params.finding,
        summary: params.summary,
        scope: params.projectId ? "PROJECT" : "GLOBAL",
        projectId: params.projectId,
        provenance: {
          source: "VERIFIED_RESEARCH",
          description: `Research finding from ${params.sourceUrl ?? params.sourceId ?? "unknown source"}`,
          timestamp: new Date().toISOString(),
          runId: params.runId,
          researchSourceUrl: params.sourceUrl,
          researchSourceId: params.sourceId,
          retrievalDate: new Date().toISOString(),
        },
        confidence: params.confidence,
        tags: ["research", "finding"],
        metadata: { sourceUrl: params.sourceUrl },
      };
      memStore.storeCandidate(candidate, {
        runId: params.runId,
        hasExternalVerification: true,
        hasVerificationEvidence: true,
      });
    },
  };
}

export { MemoryStore, getGlobalMemoryStore, setGlobalMemoryStore };
