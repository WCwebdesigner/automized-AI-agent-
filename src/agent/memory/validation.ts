/**
 * Phase 7 — Validation & Value Scoring
 * Deterministic filter + validation — model proposes, runtime decides
 * Factors: relevance, verification, recurrence, future usefulness, stability, specificity, scope, confidence
 */

import type { MemoryCandidate, MemoryValidationResult, MemoryProvenance } from "./types.js";
import { MEMORY_TYPE_AUTHORITY } from "./types.js";
import { isContentSafeForMemory } from "./secretDetector.js";

export interface ValidationContext {
  existingSimilarCount: number; // recurrence
  projectId?: string;
  hasVerificationEvidence: boolean;
  hasExternalVerification?: boolean;
}

export function deterministicFilter(candidate: MemoryCandidate): { pass: boolean; reason: string } {
  // Secret check
  const secretCheck = isContentSafeForMemory(candidate.content + " " + candidate.summary);
  if (!secretCheck.safe) {
    return { pass: false, reason: `SECRET_BLOCKED: ${secretCheck.reason}` };
  }

  // Transient paths — reject if only absolute temp paths without value
  const transientPatterns = [
    /\/tmp\/[a-z0-9_\-]+\.log/i,
    /\/var\/tmp\//,
    /node_modules\/\.cache/,
    /\.next\/cache/,
  ];
  const isOnlyTransient = transientPatterns.some(p => p.test(candidate.content)) && candidate.content.length < 100;
  if (isOnlyTransient) {
    return { pass: false, reason: "TRANSIENT_PATH: content appears to be transient filesystem artifact" };
  }

  // Noise — too short or empty
  if (candidate.content.trim().length < 20) {
    return { pass: false, reason: "NOISE: content too short (<20 chars)" };
  }
  if (candidate.summary.trim().length < 10) {
    return { pass: false, reason: "NOISE: summary too short" };
  }

  // Hallucination heuristics — generic vague content
  const vaguePhrases = [
    "this is important",
    "remember this",
    "this might be useful",
  ];
  const lowerContent = candidate.content.toLowerCase();
  if (vaguePhrases.some(v => lowerContent === v) ) {
    return { pass: false, reason: "NOISE: vague content without specificity" };
  }

  // Must have at least some specificity — not just "the project uses code"
  if (candidate.content.split(/\s+/).length < 5) {
    return { pass: false, reason: "NOISE: insufficient word count for durable knowledge" };
  }

  // Confidence threshold for INFERRED — lower authority
  if (candidate.provenance.source === "INFERRED" && candidate.confidence > 80) {
    // Cap inferred confidence, but don't reject
  }

  // Content must not be just credentials mention
  if (/\b(password|secret|credential)\b/i.test(candidate.content) && candidate.content.length < 150) {
    // Check if it's about credential handling vs containing credential
    if (/(api[_-]?key|token\s*[:=])/i.test(candidate.content)) {
      return { pass: false, reason: "SECRET_RISK: potential credential assignment" };
    }
  }

  return { pass: true, reason: "PASSED_DETERMINISTIC_FILTER" };
}

export function computeValueScore(
  candidate: MemoryCandidate,
  context: ValidationContext
): MemoryValidationResult {
  // Relevance — based on specificity and tags
  let relevance = 50;
  if (candidate.tags.length >= 2) relevance += 10;
  if (candidate.content.length > 100) relevance += 10;
  if (candidate.metadata && Object.keys(candidate.metadata).length > 0) relevance += 5;
  relevance = Math.min(100, relevance);

  // Verification — evidence presence
  let verification = 30;
  if (context.hasVerificationEvidence) verification += 30;
  if (context.hasExternalVerification) verification += 20;
  if (candidate.provenance.source !== "INFERRED") verification += 10;
  if (candidate.provenance.evidenceIds && candidate.provenance.evidenceIds.length > 0) verification += 20;
  verification = Math.min(100, verification);

  // Recurrence — how many times similar observed
  let recurrence = Math.min(100, 20 + context.existingSimilarCount * 20);

  // Future usefulness — based on type
  const usefulTypes = ["ARCHITECTURE_DECISION", "PROJECT_CONVENTION", "REPAIR_PATTERN", "TOOL_KNOWLEDGE", "ENVIRONMENT_KNOWLEDGE", "SUCCESSFUL_PATTERN"];
  let futureUsefulness = usefulTypes.includes(candidate.type) ? 80 : 50;
  if (candidate.scope === "PROJECT" || candidate.scope === "WORKSPACE") futureUsefulness += 10;
  futureUsefulness = Math.min(100, futureUsefulness);

  // Stability — architecture decisions, conventions more stable than assumptions
  const stableTypes = ["ARCHITECTURE_DECISION", "PROJECT_CONVENTION", "ENVIRONMENT_KNOWLEDGE", "CONSTRAINT", "PROCEDURE"];
  let stability = stableTypes.includes(candidate.type) ? 80 : 50;
  if (candidate.type === "ASSUMPTION") stability = 30;

  // Specificity — longer, more detailed, with metadata
  let specificity = 40;
  if (candidate.content.length > 200) specificity += 20;
  if (candidate.content.length > 500) specificity += 10;
  if (candidate.relatedTools && candidate.relatedTools.length > 0) specificity += 10;
  if (candidate.metadata) specificity += 10;
  specificity = Math.min(100, specificity);

  // Project scope — PROJECT/WORKSPACE scoped more valuable than GLOBAL generic
  let projectScope = 50;
  if (candidate.scope === "PROJECT" && context.projectId) projectScope = 90;
  else if (candidate.scope === "WORKSPACE") projectScope = 80;
  else if (candidate.scope === "TOOL" || candidate.scope === "ENVIRONMENT") projectScope = 70;
  else if (candidate.scope === "GLOBAL") projectScope = 50;
  else if (candidate.scope === "TASK") projectScope = 60;

  // Confidence — provenance authority
  let confidenceFactor = candidate.confidence;
  const authority = MEMORY_TYPE_AUTHORITY[candidate.provenance.source] ?? 50;
  // If INFERRED with high confidence, downgrade
  if (candidate.provenance.source === "INFERRED") {
    confidenceFactor = Math.min(candidate.confidence, authority);
  } else {
    confidenceFactor = Math.min(100, (candidate.confidence + authority) / 2);
  }

  // Weighted value score
  const valueScore =
    relevance * 0.2 +
    verification * 0.2 +
    recurrence * 0.1 +
    futureUsefulness * 0.2 +
    stability * 0.1 +
    specificity * 0.1 +
    projectScope * 0.05 +
    confidenceFactor * 0.05;

  const valid = valueScore >= 40 && verification >= 30;
  const shouldStore = valid && valueScore >= 50;

  return {
    valid,
    reason: valid ? (shouldStore ? "MEETS_THRESHOLD" : "LOW_VALUE") : "FAILS_VALIDATION",
    shouldStore,
    valueScore: Math.round(valueScore),
    factors: {
      relevance: Math.round(relevance),
      verification: Math.round(verification),
      recurrence: Math.round(recurrence),
      futureUsefulness: Math.round(futureUsefulness),
      stability: Math.round(stability),
      specificity: Math.round(specificity),
      projectScope: Math.round(projectScope),
      confidence: Math.round(confidenceFactor),
    },
  };
}

export function validateProvenance(provenance: MemoryProvenance): { valid: boolean; reason?: string } {
  if (!provenance.source) return { valid: false, reason: "Missing provenance source" };
  if (!provenance.timestamp) return { valid: false, reason: "Missing timestamp" };
  if (!provenance.description || provenance.description.trim().length < 10) {
    return { valid: false, reason: "Provenance description too short" };
  }
  // INFERRED must preserve evidence chain
  if (provenance.source === "INFERRED" && !provenance.evidenceIds && !provenance.description.includes("evidence")) {
    // Allow but flag lower authority — not reject
  }
  // VERIFIED_* must have evidence
  if ((provenance.source === "VERIFIED_OBSERVATION" || provenance.source === "VERIFIED_RESEARCH") && !provenance.evidenceIds && !provenance.researchSourceId) {
    // For research, need source; for observation, evidenceIds expected but allow description
    if (provenance.source === "VERIFIED_RESEARCH" && !provenance.researchSourceUrl && !provenance.researchSourceId) {
      return { valid: false, reason: "Verified research requires source URL or ID" };
    }
  }
  return { valid: true };
}
