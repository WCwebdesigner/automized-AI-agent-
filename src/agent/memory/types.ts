/**
 * Phase 7 — Memory Architecture — Types
 * Durable KNOWLEDGE AND EXPERIENCE SYSTEM, distinct from operational state
 */

export type MemoryType =
  | "PROJECT_KNOWLEDGE"
  | "TECHNICAL_FACT"
  | "ARCHITECTURE_DECISION"
  | "PROJECT_CONVENTION"
  | "SUCCESSFUL_PATTERN"
  | "FAILURE_PATTERN"
  | "REPAIR_PATTERN"
  | "ENVIRONMENT_KNOWLEDGE"
  | "TOOL_KNOWLEDGE"
  | "RESEARCH_FINDING"
  | "PROCEDURE"
  | "CONSTRAINT"
  | "ASSUMPTION"
  | "LESSON_LEARNED";

export type MemoryScope =
  | "GLOBAL"
  | "PROJECT"
  | "WORKSPACE"
  | "TASK"
  | "TOOL"
  | "ENVIRONMENT";

export type MemoryValidityState =
  | "CANDIDATE"
  | "VALIDATED"
  | "ACTIVE"
  | "STALE"
  | "SUPERSEDED"
  | "INVALIDATED";

export type MemoryProvenanceSource =
  | "USER_PROVIDED"
  | "VERIFIED_OBSERVATION"
  | "VERIFIED_RESEARCH"
  | "SUCCESSFUL_EXECUTION"
  | "VERIFIED_REPAIR"
  | "SYSTEM_CONFIGURATION"
  | "INFERRED";

export type MemoryLifecycleEventType =
  | "MEMORY_PROPOSED"
  | "MEMORY_REJECTED"
  | "MEMORY_VALIDATED"
  | "MEMORY_STORED"
  | "MEMORY_RETRIEVED"
  | "MEMORY_USED"
  | "MEMORY_STALE"
  | "MEMORY_SUPERSEDED"
  | "MEMORY_INVALIDATED";

export interface MemoryProvenance {
  source: MemoryProvenanceSource;
  description: string;
  evidenceIds?: string[]; // evidence chain IDs supporting memory
  observationIds?: string[];
  executionHistoryId?: string;
  researchSourceId?: string;
  researchSourceUrl?: string;
  retrievalDate?: string;
  verifiedBy?: string; // SYSTEM or user
  timestamp: string;
  runId?: string;
  objectiveId?: string;
  taskId?: string;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  summary: string;
  scope: MemoryScope;
  projectId?: string;
  workspacePath?: string;
  source: MemoryProvenance;
  provenance: MemoryProvenance; // alias for source, explicit for backward compat
  createdAt: string;
  lastValidatedAt: string;
  updatedAt: string;
  confidence: number; // 0-100, INFERRED must not automatically same authority as verified
  validity: MemoryValidityState;
  tags: string[];
  relatedTasks: string[];
  relatedTools: string[];
  relatedFailures: string[];
  relatedRepairs: string[];
  supersedes?: string[]; // memory IDs this supersedes
  supersededBy?: string; // memory ID that supersedes this
  // Effectiveness tracking
  retrievalCount: number;
  useCount: number;
  successCount: number;
  contradictionCount: number;
  ignoredCount: number;
  incorrectCount: number;
  lastRetrievedAt?: string;
  // Relationships
  relatedMemories?: string[];
  // Scope metadata
  metadata?: Record<string, unknown>;
}

export interface MemoryCandidate {
  type: MemoryType;
  content: string;
  summary: string;
  scope: MemoryScope;
  projectId?: string;
  workspacePath?: string;
  provenance: MemoryProvenance;
  confidence: number;
  tags: string[];
  relatedTasks?: string[];
  relatedTools?: string[];
  relatedFailures?: string[];
  relatedRepairs?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryValidationResult {
  valid: boolean;
  reason: string;
  shouldStore: boolean;
  valueScore: number; // 0-100
  factors: {
    relevance: number;
    verification: number;
    recurrence: number;
    futureUsefulness: number;
    stability: number;
    specificity: number;
    projectScope: number;
    confidence: number;
  };
}

export interface MemoryRetrievalQuery {
  objective: string;
  projectId?: string;
  workspacePath?: string;
  taskId?: string;
  toolName?: string;
  tags?: string[];
  scopes?: MemoryScope[];
  maxMemories?: number;
  maxTokens?: number;
  maxChars?: number;
  minConfidence?: number;
  includeStale?: boolean;
  includeSuperseded?: boolean;
  includeInvalidated?: boolean;
}

export interface MemoryRetrievalResult {
  memories: MemoryRecord[];
  totalFound: number;
  totalReturned: number;
  query: MemoryRetrievalQuery;
  rankingDetails: Array<{
    memoryId: string;
    score: number;
    factors: {
      semanticRelevance: number;
      projectScope: number;
      exactTags: number;
      recency: number;
      confidence: number;
      validity: number;
      provenance: number;
      historicalUsefulness: number;
    };
  }>;
  truncated: boolean;
  timestamp: string;
}

export interface MemoryContradiction {
  id: string;
  memoryAId: string;
  memoryBId: string;
  description: string;
  type: "DIRECT_CONFLICT" | "OUTDATED" | "SCOPE_MISMATCH" | "UNRESOLVED";
  resolved: boolean;
  resolution?: string;
  supersededMemoryId?: string;
  activeMemoryId?: string;
  detectedAt: string;
  scope: MemoryScope;
  projectId?: string;
}

export interface MemoryLifecycleEvent {
  id: string;
  memoryId: string;
  type: MemoryLifecycleEventType;
  timestamp: string;
  reason?: string;
  runId?: string;
  objectiveId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export const MEMORY_TYPE_AUTHORITY: Record<MemoryProvenanceSource, number> = {
  USER_PROVIDED: 90,
  VERIFIED_OBSERVATION: 85,
  VERIFIED_RESEARCH: 80,
  SUCCESSFUL_EXECUTION: 85,
  VERIFIED_REPAIR: 80,
  SYSTEM_CONFIGURATION: 95,
  INFERRED: 40, // lower authority
};

export const VALIDITY_WEIGHT: Record<MemoryValidityState, number> = {
  CANDIDATE: 10,
  VALIDATED: 60,
  ACTIVE: 100,
  STALE: 20,
  SUPERSEDED: 5,
  INVALIDATED: 0,
};

export const SCOPE_PRIORITY: Record<MemoryScope, number> = {
  TASK: 100,
  PROJECT: 90,
  WORKSPACE: 80,
  TOOL: 70,
  ENVIRONMENT: 60,
  GLOBAL: 50,
};
