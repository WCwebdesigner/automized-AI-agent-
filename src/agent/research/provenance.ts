/**
 * Phase 9 — Provenance Tracking
 * Distinguish FACT OBSERVED vs MODEL INFERENCE vs UNVERIFIED CLAIM
 */

import { ExtractedClaim, ResearchSource, ClaimType, SourceType } from "./types";

export interface ProvenanceRecord {
  claimId: string;
  sourceUrl: string;
  sourceType: SourceType;
  retrievedAt: string;
  excerpt: string;
  method: string;
  claim: string;
  claimType: ClaimType;
  confidence: number;
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "CONTRADICTED" | "OUTDATED";
  timestamp: string;
}

export class ProvenanceTracker {
  private records: Map<string, ProvenanceRecord> = new Map();

  addProvenance(params: {
    claim: ExtractedClaim;
    source: ResearchSource;
    method: string;
  }): ProvenanceRecord {
    const record: ProvenanceRecord = {
      claimId: params.claim.id,
      sourceUrl: params.source.url,
      sourceType: params.source.type,
      retrievedAt: params.source.retrievedAt ?? new Date().toISOString(),
      excerpt: params.claim.excerpt,
      method: params.method,
      claim: params.claim.claim,
      claimType: params.claim.type,
      confidence: params.claim.confidence,
      verificationStatus: params.source.verificationStatus,
      timestamp: new Date().toISOString(),
    };
    this.records.set(params.claim.id, record);
    return record;
  }

  getProvenance(claimId: string): ProvenanceRecord | null {
    return this.records.get(claimId) ?? null;
  }

  list(): ProvenanceRecord[] {
    return [...this.records.values()];
  }

  // Verify distinction between observed vs inferred
  classifyClaim(sourceContent: string, extracted: string, modelGenerated: boolean): ClaimType {
    if (modelGenerated) {
      return "MODEL_INFERENCE";
    }
    // If extracted verbatim from source, FACT_OBSERVED
    if (sourceContent.includes(extracted.substring(0, Math.min(50, extracted.length)))) {
      return "FACT_OBSERVED";
    }
    return "UNVERIFIED_CLAIM";
  }

  // Build report with provenance
  buildProvenanceReport(claims: ExtractedClaim[], sources: ResearchSource[]): string {
    let report = "# Research Provenance Report\n\n";
    report += `Total Claims: ${claims.length}\n`;
    report += `Total Sources: ${sources.length}\n\n`;

    const factObserved = claims.filter(c => c.type === "FACT_OBSERVED");
    const modelInference = claims.filter(c => c.type === "MODEL_INFERENCE");
    const unverified = claims.filter(c => c.type === "UNVERIFIED_CLAIM");

    report += `## Claim Types\n`;
    report += `- FACT_OBSERVED: ${factObserved.length}\n`;
    report += `- MODEL_INFERENCE: ${modelInference.length}\n`;
    report += `- UNVERIFIED_CLAIM: ${unverified.length}\n\n`;

    report += `## Sources\n`;
    for (const src of sources) {
      report += `- [${src.type}] ${src.url} — ${src.verificationStatus} (confidence ${src.confidence}%) — retrieved ${src.retrievedAt}\n`;
      if (src.excerpt) {
        report += `  Excerpt: "${src.excerpt.substring(0, 200)}"\n`;
      }
    }

    report += `\n## Claims with Provenance\n`;
    for (const claim of claims) {
      const prov = this.records.get(claim.id);
      report += `\n### Claim ${claim.id} (${claim.type}, confidence ${claim.confidence}%)\n`;
      report += `${claim.claim}\n`;
      if (prov) {
        report += `- Source: ${prov.sourceUrl} (${prov.sourceType})\n`;
        report += `- Method: ${prov.method}\n`;
        report += `- Excerpt: "${prov.excerpt.substring(0, 200)}"\n`;
        report += `- Verification: ${prov.verificationStatus}\n`;
      }
      if (claim.contradictions && claim.contradictions.length > 0) {
        report += `- Contradictions: ${claim.contradictions.join(", ")}\n`;
      }
    }

    return report;
  }
}

export const globalProvenanceTracker = new ProvenanceTracker();
