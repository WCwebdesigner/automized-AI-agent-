/**
 * Phase 9 — Research Job Abstraction
 * DISCOVER→FETCH→EXTRACT→NORMALIZE→COMPARE→ANALYZE→VERIFY→SYNTHESIZE→REPORT
 */

export type ResearchStage =
  | "CREATED"
  | "DISCOVER"
  | "FETCH"
  | "EXTRACT"
  | "NORMALIZE"
  | "COMPARE"
  | "ANALYZE"
  | "VERIFY"
  | "SYNTHESIZE"
  | "REPORT"
  | "COMPLETED"
  | "FAILED"
  | "ESCALATED";

export type ClaimType = "FACT_OBSERVED" | "MODEL_INFERENCE" | "UNVERIFIED_CLAIM";

export type SourceType =
  | "WEB_PAGE"
  | "API"
  | "RSS"
  | "DOCUMENTATION"
  | "GITHUB"
  | "APPROVED_SERVICE"
  | "MOCK";

export interface ResearchSource {
  id: string;
  url: string;
  type: SourceType;
  title?: string;
  retrievedAt?: string;
  statusCode?: number;
  contentType?: string;
  contentLength?: number;
  excerpt?: string;
  rawContent?: string; // not authoritative, for extraction only
  extractionMethod?: string;
  metadata?: Record<string, unknown>;
  confidence: number; // 0-100
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "CONTRADICTED" | "OUTDATED";
}

export interface ExtractedClaim {
  id: string;
  sourceId: string;
  claim: string;
  type: ClaimType;
  confidence: number;
  timestamp: string;
  excerpt: string;
  supportingEvidence?: string[];
  contradictions?: string[]; // ids of conflicting claims
}

export interface Contradiction {
  id: string;
  claimAId: string;
  claimBId: string;
  description: string;
  sourceAId: string;
  sourceBId: string;
  type: "DIRECT_CONFLICT" | "OUTDATED" | "MISSING_EVIDENCE" | "DISAGREEMENT";
  resolved: boolean;
  resolution?: string;
}

export interface ResearchObservation {
  id: string;
  sourceId: string;
  observation: string;
  normalized: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ResearchQuestion {
  id: string;
  question: string;
  answered: boolean;
  answer?: string;
  confidence?: number;
  sourcesUsed?: string[];
}

export interface ResearchJob {
  researchId: string;
  objectiveId: string;
  runId?: string;
  projectId?: string;
  objective: string;
  questions: ResearchQuestion[];
  constraints: {
    maxSources: number;
    maxDepth: number;
    maxRequests: number;
    maxRuntimeMs: number;
    maxModelCalls: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  stage: ResearchStage;
  sources: ResearchSource[];
  fetchedContent: Array<{ sourceId: string; content: string; timestamp: string }>;
  observations: ResearchObservation[];
  claims: ExtractedClaim[];
  contradictions: Contradiction[];
  verificationState: {
    verifiedClaims: number;
    unverifiedClaims: number;
    contradictedClaims: number;
  };
  findings: {
    summary?: string;
    answers: Array<{ questionId: string; answer: string; confidence: number; sources: string[] }>;
    provenance: Array<{
      claimId: string;
      sourceUrl: string;
      sourceType: SourceType;
      retrievedAt: string;
      excerpt: string;
      method: string;
      confidence: number;
      verificationStatus: string;
    }>;
  };
  metadata: {
    totalRequests: number;
    totalModelCalls: number;
    runtimeMs: number;
    depthReached: number;
  };
  timestamps: {
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  };
  confidence: number; // overall
  status: "ACTIVE" | "COMPLETED" | "FAILED" | "ESCALATED";
  escalationReason?: string;
}
