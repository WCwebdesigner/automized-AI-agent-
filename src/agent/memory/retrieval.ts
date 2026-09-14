/**
 * Phase 7 — Retrieval — Bounded, Ranked, Scoped, Provenance-aware
 * Objective → scope → search → rank → filter stale/invalid → bounded context → planner
 * Ranking: semantic relevance, project scope, tags, recency, confidence, validity, provenance, historical usefulness
 * Project-specific outranks global, only relevant, context budget max memories/tokens/per-scope/stale/confidence
 */

import type {
  MemoryRecord,
  MemoryRetrievalQuery,
  MemoryRetrievalResult,
  MemoryScope,
} from "./types.js";
import { VALIDITY_WEIGHT, SCOPE_PRIORITY, MEMORY_TYPE_AUTHORITY } from "./types.js";
import { MemoryStore } from "./store.js";

export interface RetrievalConfig {
  maxMemories: number;
  maxTokens: number;
  maxChars: number;
  minConfidence: number;
  perScopeLimit?: Record<MemoryScope, number>;
  includeStale: boolean;
  includeSuperseded: boolean;
  includeInvalidated: boolean;
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  maxMemories: 10,
  maxTokens: 4000,
  maxChars: 12000,
  minConfidence: 30,
  perScopeLimit: {
    TASK: 3,
    PROJECT: 5,
    WORKSPACE: 3,
    TOOL: 2,
    ENVIRONMENT: 2,
    GLOBAL: 2,
  },
  includeStale: false,
  includeSuperseded: false,
  includeInvalidated: false,
};

export function determineRelevantScopes(query: MemoryRetrievalQuery): MemoryScope[] {
  const scopes: MemoryScope[] = [];
  if (query.taskId) scopes.push("TASK");
  if (query.toolName) scopes.push("TOOL");
  if (query.projectId) scopes.push("PROJECT");
  if (query.workspacePath) scopes.push("WORKSPACE");
  scopes.push("ENVIRONMENT");
  scopes.push("GLOBAL");
  // If query explicitly specifies scopes, use those
  if (query.scopes && query.scopes.length > 0) return query.scopes;
  return scopes;
}

function tokenEstimate(text: string): number {
  // Rough: 4 chars per token
  return Math.ceil(text.length / 4);
}

function semanticRelevanceScore(memory: MemoryRecord, objective: string): number {
  const objectiveTerms = objective.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const memText = (memory.summary + " " + memory.content + " " + memory.tags.join(" ")).toLowerCase();
  let score = 0;
  let matched = 0;
  for (const term of objectiveTerms) {
    if (memText.includes(term)) {
      score += 10;
      matched++;
    }
    // Exact tag match higher
    if (memory.tags.some(t => t.toLowerCase() === term)) {
      score += 20;
    } else if (memory.tags.some(t => t.toLowerCase().includes(term))) {
      score += 10;
    }
  }
  // Summary match weighted higher
  const summaryLower = memory.summary.toLowerCase();
  for (const term of objectiveTerms) {
    if (summaryLower.includes(term)) score += 15;
  }
  // Bonus for matching objective keywords density
  if (objectiveTerms.length > 0) {
    const coverage = matched / objectiveTerms.length;
    score += coverage * 20;
  }
  return Math.min(100, score);
}

function recencyScore(memory: MemoryRecord): number {
  const now = Date.now();
  const lastValidated = new Date(memory.lastValidatedAt).getTime();
  const ageMs = now - lastValidated;
  const days = ageMs / (1000 * 60 * 60 * 24);
  if (days < 1) return 100;
  if (days < 7) return 80;
  if (days < 30) return 60;
  if (days < 90) return 40;
  if (days < 180) return 20;
  return 10;
}

function historicalUsefulnessScore(memory: MemoryRecord): number {
  if (memory.retrievalCount === 0) return 50; // neutral for new
  const successRate = memory.useCount > 0 ? memory.successCount / memory.useCount : 0;
  const useRate = memory.retrievalCount > 0 ? memory.useCount / memory.retrievalCount : 0;
  let score = 50;
  score += successRate * 30;
  score += useRate * 20;
  // Penalize incorrect
  if (memory.incorrectCount > 0) {
    score -= memory.incorrectCount * 10;
  }
  if (memory.contradictionCount > 0) {
    score -= memory.contradictionCount * 5;
  }
  return Math.max(0, Math.min(100, score));
}

export function rankMemories(
  memories: MemoryRecord[],
  query: MemoryRetrievalQuery
): MemoryRetrievalResult["rankingDetails"] {
  const details: MemoryRetrievalResult["rankingDetails"] = [];

  for (const mem of memories) {
    const semanticRelevance = semanticRelevanceScore(mem, query.objective);
    // Project scope: project-specific outranks global
    let projectScopeScore = SCOPE_PRIORITY[mem.scope] ?? 50;
    if (query.projectId && mem.projectId === query.projectId) {
      projectScopeScore += 20; // exact project match bonus
    } else if (mem.scope === "GLOBAL") {
      projectScopeScore = Math.max(10, projectScopeScore - 10); // global slightly lower
    }
    projectScopeScore = Math.min(100, projectScopeScore);

    const exactTags = query.tags && query.tags.length > 0
      ? query.tags.filter(t => mem.tags.includes(t)).length * 25
      : mem.tags.length > 0 ? 10 : 0;

    const recency = recencyScore(mem);
    const confidence = mem.confidence;
    const validity = VALIDITY_WEIGHT[mem.validity] ?? 0;
    const provenance = MEMORY_TYPE_AUTHORITY[mem.provenance.source] ?? 50;
    const historicalUsefulness = historicalUsefulnessScore(mem);

    // Weighted total
    const total =
      semanticRelevance * 0.3 +
      projectScopeScore * 0.15 +
      Math.min(100, exactTags) * 0.1 +
      recency * 0.1 +
      confidence * 0.1 +
      validity * 0.1 +
      provenance * 0.1 +
      historicalUsefulness * 0.05;

    details.push({
      memoryId: mem.id,
      score: Math.round(total),
      factors: {
        semanticRelevance: Math.round(semanticRelevance),
        projectScope: Math.round(projectScopeScore),
        exactTags: Math.round(Math.min(100, exactTags)),
        recency: Math.round(recency),
        confidence: Math.round(confidence),
        validity: Math.round(validity),
        provenance: Math.round(provenance),
        historicalUsefulness: Math.round(historicalUsefulness),
      },
    });
  }

  details.sort((a, b) => b.score - a.score);
  return details;
}

export function retrieveMemories(
  store: MemoryStore,
  query: MemoryRetrievalQuery,
  config: RetrievalConfig = DEFAULT_RETRIEVAL_CONFIG
): MemoryRetrievalResult {
  const effectiveConfig: RetrievalConfig = {
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...config,
    maxMemories: query.maxMemories ?? config.maxMemories,
    maxTokens: query.maxTokens ?? config.maxTokens,
    maxChars: query.maxChars ?? config.maxChars ?? query.maxChars,
    minConfidence: query.minConfidence ?? config.minConfidence,
  };

  // Step 1: determine scopes
  const relevantScopes = determineRelevantScopes(query);

  // Step 2: search — full-text + filtering
  let candidates = store.fullTextSearch(query.objective, query.projectId);

  // If full-text returns nothing, fall back to all filtered by project
  if (candidates.length === 0) {
    candidates = store.listMemories({
      projectId: query.projectId,
      minConfidence: effectiveConfig.minConfidence,
    });
  }

  // Step 3: filter by validity, confidence, scope
  candidates = candidates.filter(mem => {
    if (mem.confidence < effectiveConfig.minConfidence) return false;
    if (!effectiveConfig.includeInvalidated && mem.validity === "INVALIDATED") return false;
    if (!effectiveConfig.includeSuperseded && mem.validity === "SUPERSEDED") return false;
    if (!effectiveConfig.includeStale && mem.validity === "STALE") {
      if (query.includeStale !== true) return false;
    }
    // Scope filtering — only relevant scopes
    if (!relevantScopes.includes(mem.scope)) return false;
    // Project isolation — GLOBAL always allowed, PROJECT must match or be GLOBAL
    if (mem.scope === "PROJECT" && mem.projectId && query.projectId && mem.projectId !== query.projectId) {
      return false;
    }
    // TASK scope — must match task if specified
    if (mem.scope === "TASK" && query.taskId && mem.relatedTasks.length > 0 && !mem.relatedTasks.includes(query.taskId)) {
      // Allow if no task filter, but if query has taskId, prefer matching — don't strictly filter out for now
    }
    return true;
  });

  const totalFound = candidates.length;

  // Step 4: rank
  const rankingDetails = rankMemories(candidates, query);

  // Step 5: bounded context — per-scope limits, max memories, max tokens/chars
  const perScopeCount: Record<string, number> = {};
  const selected: MemoryRecord[] = [];
  let totalChars = 0;
  let totalTokens = 0;

  for (const ranked of rankingDetails) {
    const mem = candidates.find(m => m.id === ranked.memoryId);
    if (!mem) continue;

    // Per-scope limit
    const scopeLimit = effectiveConfig.perScopeLimit?.[mem.scope] ?? 10;
    const currentScopeCount = perScopeCount[mem.scope] ?? 0;
    if (currentScopeCount >= scopeLimit) continue;

    const memChars = mem.content.length + mem.summary.length;
    const memTokens = tokenEstimate(mem.content + mem.summary);

    if (selected.length >= effectiveConfig.maxMemories) break;
    if (totalChars + memChars > effectiveConfig.maxChars) break;
    if (totalTokens + memTokens > effectiveConfig.maxTokens) break;

    selected.push(mem);
    perScopeCount[mem.scope] = currentScopeCount + 1;
    totalChars += memChars;
    totalTokens += memTokens;
  }

  // Mark retrieved for effectiveness tracking
  for (const mem of selected) {
    store.markRetrieved(mem.id);
  }

  const truncated = selected.length < totalFound;

  return {
    memories: selected,
    totalFound,
    totalReturned: selected.length,
    query,
    rankingDetails: rankingDetails.filter(r => selected.some(s => s.id === r.memoryId)),
    truncated,
    timestamp: new Date().toISOString(),
  };
}
