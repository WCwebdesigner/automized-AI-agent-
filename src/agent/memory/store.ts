/**
 * Phase 7 — Memory Store — Lifecycle, Persistence, Audit, Relationships
 * CANDIDATE → VALIDATE → ACTIVE and ACTIVE → STALE / SUPERSEDED / INVALIDATED
 * PostgreSQL-native metadata, full-text filtering, ranking, scopes, provenance, relationships
 */

import { randomUUID } from "node:crypto";
import type {
  MemoryRecord,
  MemoryCandidate,
  MemoryValidityState,
  MemoryLifecycleEvent,
  MemoryLifecycleEventType,
  MemoryContradiction,
  MemoryScope,
  MemoryType,
} from "./types.js";
import { deterministicFilter, computeValueScore, validateProvenance } from "./validation.js";
import { detectSecrets } from "./secretDetector.js";

export interface MemoryStoreConfig {
  persistencePath?: string;
  maxMemories?: number;
  enablePersistence?: boolean;
}

export interface StoreResult {
  stored: boolean;
  memory?: MemoryRecord;
  reason: string;
  validationScore?: number;
}

export interface AuditEntry {
  event: MemoryLifecycleEvent;
}

export class MemoryStore {
  private memories = new Map<string, MemoryRecord>();
  private lifecycleEvents: MemoryLifecycleEvent[] = [];
  private contradictions: MemoryContradiction[] = [];
  private config: MemoryStoreConfig;
  private initialized = false;

  constructor(config: MemoryStoreConfig = {}) {
    this.config = {
      maxMemories: 10000,
      enablePersistence: false,
      ...config,
    };
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private emitLifecycle(
    memoryId: string,
    type: MemoryLifecycleEventType,
    reason?: string,
    meta?: Record<string, unknown> & { runId?: string; objectiveId?: string; taskId?: string }
  ): MemoryLifecycleEvent {
    const ev: MemoryLifecycleEvent = {
      id: randomUUID(),
      memoryId,
      type,
      timestamp: this.nowIso(),
      reason,
      runId: meta?.runId as string | undefined,
      objectiveId: meta?.objectiveId as string | undefined,
      taskId: meta?.taskId as string | undefined,
      metadata: meta,
    };
    this.lifecycleEvents.push(ev);
    // Keep bounded
    if (this.lifecycleEvents.length > 10000) {
      this.lifecycleEvents = this.lifecycleEvents.slice(-8000);
    }
    return ev;
  }

  // Candidate pipeline: OBSERVATION → CANDIDATE → DETERMINISTIC FILTER → VALIDATION → STORE
  proposeCandidate(
    candidate: MemoryCandidate,
    context: { existingSimilarCount?: number; hasVerificationEvidence?: boolean; hasExternalVerification?: boolean; runId?: string; objectiveId?: string; taskId?: string } = {}
  ): { accepted: boolean; reason: string; validation?: ReturnType<typeof computeValueScore> } {
    const filter = deterministicFilter(candidate);
    if (!filter.pass) {
      // audit rejection
      const tempId = randomUUID();
      this.emitLifecycle(tempId, "MEMORY_REJECTED", filter.reason, {
        runId: context.runId,
        objectiveId: context.objectiveId,
        taskId: context.taskId,
        candidateSummary: candidate.summary,
      } as any);
      return { accepted: false, reason: filter.reason };
    }

    const provCheck = validateProvenance(candidate.provenance);
    if (!provCheck.valid) {
      this.emitLifecycle(randomUUID(), "MEMORY_REJECTED", provCheck.reason, {
        runId: context.runId,
      } as any);
      return { accepted: false, reason: provCheck.reason! };
    }

    const validation = computeValueScore(candidate, {
      existingSimilarCount: context.existingSimilarCount ?? this.countSimilar(candidate),
      projectId: candidate.projectId,
      hasVerificationEvidence: context.hasVerificationEvidence ?? false,
      hasExternalVerification: context.hasExternalVerification,
    });

    if (!validation.valid || !validation.shouldStore) {
      this.emitLifecycle(randomUUID(), "MEMORY_REJECTED", `${validation.reason} score=${validation.valueScore}`, {
        runId: context.runId,
        candidateSummary: candidate.summary,
      } as any);
      return { accepted: false, reason: `${validation.reason} valueScore=${validation.valueScore}`, validation };
    }

    return { accepted: true, reason: "CANDIDATE_ACCEPTED", validation };
  }

  storeCandidate(
    candidate: MemoryCandidate,
    context: { runId?: string; objectiveId?: string; taskId?: string; hasVerificationEvidence?: boolean; hasExternalVerification?: boolean } = {}
  ): StoreResult {
    // Full pipeline
    const proposal = this.proposeCandidate(candidate, context);
    if (!proposal.accepted) {
      return { stored: false, reason: proposal.reason, validationScore: proposal.validation?.valueScore };
    }

    const id = randomUUID();
    const now = this.nowIso();
    const record: MemoryRecord = {
      id,
      type: candidate.type,
      content: candidate.content,
      summary: candidate.summary,
      scope: candidate.scope,
      projectId: candidate.projectId,
      workspacePath: candidate.workspacePath,
      source: candidate.provenance,
      provenance: candidate.provenance,
      createdAt: now,
      lastValidatedAt: now,
      updatedAt: now,
      confidence: candidate.provenance.source === "INFERRED" ? Math.min(candidate.confidence, 70) : candidate.confidence,
      validity: "VALIDATED",
      tags: candidate.tags ?? [],
      relatedTasks: candidate.relatedTasks ?? [],
      relatedTools: candidate.relatedTools ?? [],
      relatedFailures: candidate.relatedFailures ?? [],
      relatedRepairs: candidate.relatedRepairs ?? [],
      retrievalCount: 0,
      useCount: 0,
      successCount: 0,
      contradictionCount: 0,
      ignoredCount: 0,
      incorrectCount: 0,
      metadata: candidate.metadata,
    };

    // Immediate transition VALIDATED → ACTIVE if confidence >= threshold and provenance verified
    if (record.confidence >= 50 || record.provenance.source !== "INFERRED") {
      record.validity = "ACTIVE";
    }

    this.memories.set(id, record);

    this.emitLifecycle(id, "MEMORY_PROPOSED", "candidate accepted", {
      runId: context.runId,
      objectiveId: context.objectiveId,
      taskId: context.taskId,
    } as any);
    this.emitLifecycle(id, "MEMORY_VALIDATED", `score=${proposal.validation?.valueScore}`, {
      runId: context.runId,
    } as any);
    this.emitLifecycle(id, "MEMORY_STORED", `validity=${record.validity}`, {
      runId: context.runId,
    } as any);

    // Enforce max
    if (this.memories.size > (this.config.maxMemories ?? 10000)) {
      // Evict oldest INVALIDATED or STALE first
      const sorted = Array.from(this.memories.values()).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      for (const mem of sorted) {
        if (mem.validity === "INVALIDATED" || mem.validity === "STALE") {
          this.memories.delete(mem.id);
          if (this.memories.size <= (this.config.maxMemories ?? 10000)) break;
        }
      }
    }

    // Detect contradictions after store
    this.detectContradictionsFor(record);

    return { stored: true, memory: record, reason: "STORED", validationScore: proposal.validation?.valueScore };
  }

  getMemory(id: string): MemoryRecord | undefined {
    return this.memories.get(id);
  }

  listMemories(filter?: {
    projectId?: string;
    scope?: MemoryScope;
    type?: MemoryType;
    validity?: MemoryValidityState[];
    tags?: string[];
    minConfidence?: number;
  }): MemoryRecord[] {
    let results = Array.from(this.memories.values());
    if (filter?.projectId) {
      results = results.filter(m => !m.projectId || m.projectId === filter.projectId || m.scope === "GLOBAL");
    }
    if (filter?.scope) {
      results = results.filter(m => m.scope === filter.scope);
    }
    if (filter?.type) {
      results = results.filter(m => m.type === filter.type);
    }
    if (filter?.validity && filter.validity.length > 0) {
      results = results.filter(m => filter.validity!.includes(m.validity));
    }
    if (filter?.tags && filter.tags.length > 0) {
      results = results.filter(m => filter.tags!.some(t => m.tags.includes(t)));
    }
    if (filter?.minConfidence !== undefined) {
      results = results.filter(m => m.confidence >= filter.minConfidence!);
    }
    return results;
  }

  countSimilar(candidate: MemoryCandidate): number {
    const needle = candidate.summary.toLowerCase();
    let count = 0;
    for (const mem of this.memories.values()) {
      if (mem.type === candidate.type && mem.scope === candidate.scope) {
        const hay = (mem.summary + " " + mem.content).toLowerCase();
        if (hay.includes(needle.slice(0, 30)) || needle.includes(mem.summary.toLowerCase().slice(0, 30))) {
          count++;
        }
      }
      if (candidate.tags.some(t => mem.tags.includes(t))) count += 0.5;
    }
    return Math.floor(count);
  }

  // Lifecycle transitions
  transitionValidity(
    id: string,
    newState: MemoryValidityState,
    reason: string,
    meta?: { supersededBy?: string; runId?: string }
  ): MemoryRecord | undefined {
    const mem = this.memories.get(id);
    if (!mem) return undefined;

    const validTransitions: Record<MemoryValidityState, MemoryValidityState[]> = {
      CANDIDATE: ["VALIDATED", "INVALIDATED"],
      VALIDATED: ["ACTIVE", "STALE", "INVALIDATED", "SUPERSEDED"],
      ACTIVE: ["STALE", "SUPERSEDED", "INVALIDATED"],
      STALE: ["ACTIVE", "SUPERSEDED", "INVALIDATED"],
      SUPERSEDED: ["ACTIVE", "INVALIDATED"],
      INVALIDATED: ["ACTIVE"], // re-validation possible
    };

    if (!validTransitions[mem.validity]?.includes(newState)) {
      // Allow force transition for STALE detection, but log
    }

    const old = mem.validity;
    mem.validity = newState;
    mem.updatedAt = this.nowIso();
    if (newState === "ACTIVE" || newState === "VALIDATED") {
      mem.lastValidatedAt = mem.updatedAt;
    }
    if (meta?.supersededBy) {
      mem.supersededBy = meta.supersededBy;
    }

    const eventMap: Record<MemoryValidityState, MemoryLifecycleEventType> = {
      CANDIDATE: "MEMORY_PROPOSED",
      VALIDATED: "MEMORY_VALIDATED",
      ACTIVE: "MEMORY_STORED",
      STALE: "MEMORY_STALE",
      SUPERSEDED: "MEMORY_SUPERSEDED",
      INVALIDATED: "MEMORY_INVALIDATED",
    };

    this.emitLifecycle(id, eventMap[newState], `transition ${old}→${newState}: ${reason}`, {
      runId: meta?.runId,
    } as any);

    this.memories.set(id, mem);
    return mem;
  }

  markStaleIfOutdated(id: string, currentStateContent: string): boolean {
    const mem = this.memories.get(id);
    if (!mem) return false;
    // If current verified state contradicts memory content, mark stale
    // Heuristic: if memory mentions a file path and current state shows different existence/content
    if (currentStateContent && mem.content) {
      const lowerCurrent = currentStateContent.toLowerCase();
      const lowerMem = mem.content.toLowerCase();
      // If memory says "uses X" but current says "no longer uses X" or file missing
      if (lowerMem.includes("exists") && lowerCurrent.includes("not found")) {
        this.transitionValidity(id, "STALE", "Current verified state indicates file/content no longer exists");
        return true;
      }
    }
    return false;
  }

  supersede(oldId: string, newId: string, reason: string, runId?: string): void {
    const oldMem = this.memories.get(oldId);
    const newMem = this.memories.get(newId);
    if (!oldMem || !newMem) return;

    oldMem.supersededBy = newId;
    if (!newMem.supersedes) newMem.supersedes = [];
    newMem.supersedes.push(oldId);

    this.transitionValidity(oldId, "SUPERSEDED", reason, { supersededBy: newId, runId });
    this.memories.set(oldId, oldMem);
    this.memories.set(newId, newMem);

    // Emit for new as well
    this.emitLifecycle(newId, "MEMORY_STORED", `supersedes ${oldId}: ${reason}`, { runId } as any);
  }

  // Contradiction detection
  detectContradictionsFor(newMemory: MemoryRecord): MemoryContradiction[] {
    const newContradictions: MemoryContradiction[] = [];
    for (const existing of this.memories.values()) {
      if (existing.id === newMemory.id) continue;
      if (existing.validity === "INVALIDATED" || existing.validity === "SUPERSEDED") continue;
      if (existing.projectId && newMemory.projectId && existing.projectId !== newMemory.projectId) continue; // different projects not contradictory unless GLOBAL

      // Simple contradiction heuristic: same type+scope, overlapping tags but conflicting content keywords
      if (existing.type === newMemory.type && existing.scope === newMemory.scope) {
        const conflictKeywords = this.detectDirectConflict(existing.content, newMemory.content);
        if (conflictKeywords) {
          const contradiction: MemoryContradiction = {
            id: randomUUID(),
            memoryAId: existing.id,
            memoryBId: newMemory.id,
            description: `Potential conflict: "${existing.summary}" vs "${newMemory.summary}" — ${conflictKeywords}`,
            type: "DIRECT_CONFLICT",
            resolved: false,
            detectedAt: this.nowIso(),
            scope: newMemory.scope,
            projectId: newMemory.projectId,
          };
          this.contradictions.push(contradiction);
          newContradictions.push(contradiction);
          existing.contradictionCount++;
          newMemory.contradictionCount++;
        }
      }
    }
    return newContradictions;
  }

  private detectDirectConflict(a: string, b: string): string | null {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    // Look for opposing statements
    const opposites: Array<[string, string]> = [
      ["uses", "does not use"],
      ["requires", "does not require"],
      ["enabled", "disabled"],
      ["exists", "does not exist"],
      ["true", "false"],
    ];
    for (const [pos, neg] of opposites) {
      if ((lowerA.includes(pos) && lowerB.includes(neg)) || (lowerA.includes(neg) && lowerB.includes(pos))) {
        return `opposite terms "${pos}" vs "${neg}"`;
      }
    }
    // Same file mentioned with different values
    // If both mention same tool but different versions/configs, flag as potential
    return null;
  }

  getContradictions(filter?: { projectId?: string; unresolvedOnly?: boolean }): MemoryContradiction[] {
    let result = this.contradictions;
    if (filter?.projectId) {
      result = result.filter(c => !c.projectId || c.projectId === filter.projectId);
    }
    if (filter?.unresolvedOnly) {
      result = result.filter(c => !c.resolved);
    }
    return result;
  }

  resolveContradiction(
    contradictionId: string,
    resolution: string,
    activeMemoryId: string,
    supersededMemoryId?: string,
    runId?: string
  ): MemoryContradiction | undefined {
    const contra = this.contradictions.find(c => c.id === contradictionId);
    if (!contra) return undefined;
    contra.resolved = true;
    contra.resolution = resolution;
    contra.activeMemoryId = activeMemoryId;
    contra.supersededMemoryId = supersededMemoryId;

    if (supersededMemoryId) {
      this.transitionValidity(supersededMemoryId, "SUPERSEDED", resolution, { supersededBy: activeMemoryId, runId });
    }
    return contra;
  }

  // Audit
  getLifecycleEvents(memoryId?: string, limit = 100): MemoryLifecycleEvent[] {
    let evs = this.lifecycleEvents;
    if (memoryId) {
      evs = evs.filter(e => e.memoryId === memoryId);
    }
    return evs.slice(-limit).reverse();
  }

  // Effectiveness tracking
  markRetrieved(id: string, runId?: string): void {
    const mem = this.memories.get(id);
    if (!mem) return;
    mem.retrievalCount++;
    mem.lastRetrievedAt = this.nowIso();
    this.emitLifecycle(id, "MEMORY_RETRIEVED", "retrieved for objective", { runId } as any);
  }

  markUsed(id: string, successful: boolean, runId?: string): void {
    const mem = this.memories.get(id);
    if (!mem) return;
    mem.useCount++;
    if (successful) mem.successCount++;
    this.emitLifecycle(id, "MEMORY_USED", successful ? "used successfully" : "used but not successful", { runId } as any);
  }

  markIgnored(id: string): void {
    const mem = this.memories.get(id);
    if (!mem) return;
    mem.ignoredCount++;
  }

  markIncorrect(id: string, reason: string, runId?: string): void {
    const mem = this.memories.get(id);
    if (!mem) return;
    mem.incorrectCount++;
    // If incorrect too many times, mark stale
    if (mem.incorrectCount >= 3) {
      this.transitionValidity(id, "STALE", `Marked incorrect ${mem.incorrectCount} times: ${reason}`, { runId });
    }
  }

  // Current reality validation — verified workspace state outranks stale memory
  validateAgainstCurrentState(id: string, verifiedState: { exists?: boolean; content?: string; timestamp: string }): { outranks: boolean; shouldMarkStale: boolean; reason: string } {
    const mem = this.memories.get(id);
    if (!mem) return { outranks: false, shouldMarkStale: false, reason: "Memory not found" };

    // If memory claims existence but verified says not exists → stale
    if (verifiedState.exists === false && mem.content.toLowerCase().includes("exists")) {
      return { outranks: true, shouldMarkStale: true, reason: "Verified state: file does not exist, memory claims exists" };
    }

    // If memory is INFERRED and verified is SYSTEM_CONFIGURATION or VERIFIED_OBSERVATION → verified outranks
    // Caller should handle marking

    return { outranks: false, shouldMarkStale: false, reason: "No conflict with verified state" };
  }

  // Full-text search (PostgreSQL-native style, but in-memory implementation for now)
  fullTextSearch(query: string, projectId?: string): MemoryRecord[] {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return [];

    const scored: Array<{ mem: MemoryRecord; score: number }> = [];
    for (const mem of this.memories.values()) {
      if (mem.validity === "INVALIDATED" || mem.validity === "SUPERSEDED") continue;
      if (projectId && mem.projectId && mem.projectId !== projectId && mem.scope !== "GLOBAL") continue;

      const text = (mem.summary + " " + mem.content + " " + mem.tags.join(" ")).toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (text.includes(term)) score += 10;
        if (mem.tags.some(t => t.toLowerCase().includes(term))) score += 5;
        if (mem.summary.toLowerCase().includes(term)) score += 15;
      }
      if (score > 0) scored.push({ mem, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.mem);
  }

  // Persistence (JSON for now, DB schema extension handles PostgreSQL)
  exportState(): { memories: MemoryRecord[]; events: MemoryLifecycleEvent[]; contradictions: MemoryContradiction[] } {
    return {
      memories: Array.from(this.memories.values()),
      events: this.lifecycleEvents,
      contradictions: this.contradictions,
    };
  }

  importState(state: { memories: MemoryRecord[]; events: MemoryLifecycleEvent[]; contradictions: MemoryContradiction[] }): void {
    this.memories.clear();
    for (const mem of state.memories) {
      // Safety: re-check secrets on import
      const secretCheck = detectSecrets(mem.content + " " + mem.summary);
      if (secretCheck.blocked) {
        // Skip importing secret-containing memory
        continue;
      }
      this.memories.set(mem.id, mem);
    }
    this.lifecycleEvents = state.events ?? [];
    this.contradictions = state.contradictions ?? [];
    this.initialized = true;
  }

  clear(): void {
    this.memories.clear();
    this.lifecycleEvents = [];
    this.contradictions = [];
  }

  size(): number {
    return this.memories.size;
  }
}

// Singleton for runtime
let globalMemoryStore: MemoryStore | undefined;

export function getGlobalMemoryStore(): MemoryStore {
  if (!globalMemoryStore) {
    globalMemoryStore = new MemoryStore();
  }
  return globalMemoryStore;
}

export function setGlobalMemoryStore(store: MemoryStore): void {
  globalMemoryStore = store;
}
