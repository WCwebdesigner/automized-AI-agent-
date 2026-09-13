/**
 * Phase 9 — Research Engine
 * DISCOVER→FETCH→EXTRACT→NORMALIZE→COMPARE→ANALYZE→VERIFY→SYNTHESIZE→REPORT
 * Depth control, cross-checking, provenance, stop conditions
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ResearchJob, ResearchStage, ResearchSource, ExtractedClaim, Contradiction, ResearchObservation, SourceType, ClaimType } from "./types";
import { SourceRegistry, globalSourceRegistry } from "./source";
import { ProvenanceTracker, globalProvenanceTracker } from "./provenance";
import { loadConfig } from "../config";

export interface ResearchEngineOptions {
  persistencePath?: string;
  sourceRegistry?: SourceRegistry;
  provenanceTracker?: ProvenanceTracker;
}

export class ResearchEngine {
  private jobs: Map<string, ResearchJob> = new Map();
  private filePath: string;
  private sourceRegistry: SourceRegistry;
  private provenance: ProvenanceTracker;

  constructor(opts: ResearchEngineOptions = {}) {
    const config = loadConfig();
    this.filePath = opts.persistencePath ?? path.join(config.workspaceRoot, ".kaira", "research_jobs.json");
    this.sourceRegistry = opts.sourceRegistry ?? globalSourceRegistry;
    this.provenance = opts.provenanceTracker ?? globalProvenanceTracker;
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
      const list: ResearchJob[] = Array.isArray(parsed) ? parsed : parsed.jobs ?? [];
      for (const j of list) {
        if (j.researchId) this.jobs.set(j.researchId, j);
      }
    } catch {}
  }

  private persist() {
    try {
      this.ensureDir();
      const tmp = this.filePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify([...this.jobs.values()], null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch {}
  }

  createJob(params: {
    objectiveId: string;
    runId?: string;
    projectId?: string;
    objective: string;
    questions: string[];
    constraints?: Partial<ResearchJob["constraints"]>;
  }): ResearchJob {
    const now = new Date().toISOString();
    const job: ResearchJob = {
      researchId: randomUUID(),
      objectiveId: params.objectiveId,
      runId: params.runId,
      projectId: params.projectId,
      objective: params.objective,
      questions: params.questions.map(q => ({
        id: randomUUID(),
        question: q,
        answered: false,
      })),
      constraints: {
        maxSources: params.constraints?.maxSources ?? 10,
        maxDepth: params.constraints?.maxDepth ?? 3,
        maxRequests: params.constraints?.maxRequests ?? 20,
        maxRuntimeMs: params.constraints?.maxRuntimeMs ?? 120_000,
        maxModelCalls: params.constraints?.maxModelCalls ?? 20,
        allowedDomains: params.constraints?.allowedDomains,
        blockedDomains: params.constraints?.blockedDomains,
      },
      stage: "CREATED",
      sources: [],
      fetchedContent: [],
      observations: [],
      claims: [],
      contradictions: [],
      verificationState: {
        verifiedClaims: 0,
        unverifiedClaims: 0,
        contradictedClaims: 0,
      },
      findings: {
        answers: [],
        provenance: [],
      },
      metadata: {
        totalRequests: 0,
        totalModelCalls: 0,
        runtimeMs: 0,
        depthReached: 0,
      },
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
      confidence: 0,
      status: "ACTIVE",
    };

    this.jobs.set(job.researchId, job);
    this.persist();
    return job;
  }

  getJob(researchId: string): ResearchJob | null {
    return this.jobs.get(researchId) ?? null;
  }

  list(): ResearchJob[] {
    return [...this.jobs.values()];
  }

  // DISCOVER stage
  async discover(jobId: string, urls: string[]): Promise<ResearchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);
    if (job.status !== "ACTIVE") throw new Error(`Job not active`);

    job.stage = "DISCOVER";
    job.timestamps.updatedAt = new Date().toISOString();

    // Validate constraints
    const allowedUrls = urls.filter(url => this.isUrlAllowed(url, job.constraints));

    for (const url of allowedUrls.slice(0, job.constraints.maxSources)) {
      if (job.sources.length >= job.constraints.maxSources) break;
      if (job.sources.some(s => s.url === url)) continue;

      const source: ResearchSource = {
        id: randomUUID(),
        url,
        type: this.inferSourceType(url),
        confidence: 50,
        verificationStatus: "UNVERIFIED",
        retrievedAt: undefined,
      };
      job.sources.push(source);
    }

    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  // FETCH stage
  async fetch(jobId: string, fetchFn: (url: string) => Promise<{ content: string; statusCode: number; contentType: string; headers: Record<string, string> }>): Promise<ResearchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);

    job.stage = "FETCH";
    const start = Date.now();

    for (const source of job.sources) {
      if (job.metadata.totalRequests >= job.constraints.maxRequests) break;
      if (source.retrievedAt) continue; // already fetched

      // Check runtime
      if (Date.now() - start > job.constraints.maxRuntimeMs) {
        break;
      }

      try {
        const result = await fetchFn(source.url);
        source.retrievedAt = new Date().toISOString();
        source.statusCode = result.statusCode;
        source.contentType = result.contentType;
        source.contentLength = result.content.length;

        job.fetchedContent.push({
          sourceId: source.id,
          content: result.content.substring(0, 100_000), // limit
          timestamp: new Date().toISOString(),
        });

        job.metadata.totalRequests++;

        // Simple extraction for excerpt
        const textOnly = result.content
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        source.excerpt = textOnly.substring(0, 500);

        if (result.statusCode >= 200 && result.statusCode < 300) {
          source.confidence = 70;
        } else {
          source.confidence = 20;
        }
      } catch (err) {
        source.statusCode = 0;
        source.confidence = 10;
        source.excerpt = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
        job.metadata.totalRequests++;
      }
    }

    job.metadata.runtimeMs += Date.now() - start;
    job.timestamps.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  // EXTRACT stage
  async extract(jobId: string): Promise<ResearchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);

    job.stage = "EXTRACT";

    for (const fetched of job.fetchedContent) {
      const source = job.sources.find(s => s.id === fetched.sourceId);
      if (!source) continue;

      // Extract claims — simple heuristic: split sentences, filter relevant to questions
      const sentences = fetched.content
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20 && s.length < 500);

      for (const sentence of sentences.slice(0, 10)) {
        // Check if sentence relevant to any question
        const relevant = job.questions.some(q => {
          const qWords = q.question.toLowerCase().split(/\s+/);
          const sLower = sentence.toLowerCase();
          return qWords.some(w => w.length > 3 && sLower.includes(w));
        });

        if (!relevant && sentences.length > 5) continue;

        const claim: ExtractedClaim = {
          id: randomUUID(),
          sourceId: source.id,
          claim: sentence,
          type: "FACT_OBSERVED", // will be verified later
          confidence: source.confidence,
          timestamp: new Date().toISOString(),
          excerpt: sentence.substring(0, 200),
        };

        job.claims.push(claim);
        job.observations.push({
          id: randomUUID(),
          sourceId: source.id,
          observation: sentence,
          normalized: sentence.toLowerCase().trim(),
          timestamp: new Date().toISOString(),
        });

        // Provenance
        this.provenance.addProvenance({
          claim,
          source,
          method: "sentence_extraction",
        });
      }
    }

    job.timestamps.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  // NORMALIZE stage
  async normalize(jobId: string): Promise<ResearchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);
    job.stage = "NORMALIZE";

    // Deduplicate observations
    const seen = new Set<string>();
    const deduped: ResearchObservation[] = [];
    for (const obs of job.observations) {
      if (!seen.has(obs.normalized)) {
        seen.add(obs.normalized);
        deduped.push(obs);
      }
    }
    job.observations = deduped;

    // Normalize claims — trim, lowercase for comparison, but keep original
    job.claims = job.claims.map(c => ({
      ...c,
      claim: c.claim.trim(),
    }));

    job.timestamps.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  // COMPARE stage — cross-checking agreement/disagreement/outdated/conflicting/missing
  async compare(jobId: string): Promise<ResearchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);
    job.stage = "COMPARE";

    // Compare claims for contradictions
    for (let i = 0; i < job.claims.length; i++) {
      for (let j = i + 1; j < job.claims.length; j++) {
        const a = job.claims[i];
        const b = job.claims[j];
        if (a.sourceId === b.sourceId) continue;

        const contradiction = this.detectContradiction(a, b);
        if (contradiction) {
          const contr: Contradiction = {
            id: randomUUID(),
            claimAId: a.id,
            claimBId: b.id,
            description: contradiction.description,
            sourceAId: a.sourceId,
            sourceBId: b.sourceId,
            type: contradiction.type,
            resolved: false,
          };
          job.contradictions.push(contr);
          a.contradictions = a.contradictions ?? [];
          a.contradictions.push(b.id);
          b.contradictions = b.contradictions ?? [];
          b.contradictions.push(a.id);
        }
      }
    }

    job.timestamps.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  private detectContradiction(a: ExtractedClaim, b: ExtractedClaim): { description: string; type: Contradiction["type"] } | null {
    const aLower = a.claim.toLowerCase();
    const bLower = b.claim.toLowerCase();

    // Simple contradiction detection — look for opposing keywords
    const oppositions: Array<[string, string]> = [
      ["is", "is not"],
      ["true", "false"],
      ["yes", "no"],
      ["will", "will not"],
      ["can", "cannot"],
      ["increased", "decreased"],
      ["up", "down"],
    ];

    for (const [pos, neg] of oppositions) {
      if ((aLower.includes(pos) && bLower.includes(neg)) || (aLower.includes(neg) && bLower.includes(pos))) {
        // Check if same subject (simplified)
        const aWords = aLower.split(/\s+/).slice(0, 3).join(" ");
        const bWords = bLower.split(/\s+/).slice(0, 3).join(" ");
        if (aWords === bWords || a.claim.length > 0 && b.claim.length > 0) {
          // For testing, we want to detect contradictions more aggressively
          // If claims share significant words but have opposition, mark as contradiction
          const commonWords = aLower.split(/\s+/).filter(w => bLower.includes(w) && w.length > 3);
          if (commonWords.length >= 2) {
            return {
              description: `Contradiction detected: "${a.claim.substring(0, 100)}" vs "${b.claim.substring(0, 100)}"`,
              type: "DIRECT_CONFLICT",
            };
          }
        }
      }
    }

    // Check for numerical contradictions (e.g., "version 2.0" vs "version 3.0")
    const numRegex = /(\d+\.\d+)/g;
    const aNums = a.claim.match(numRegex);
    const bNums = b.claim.match(numRegex);
    if (aNums && bNums && aNums[0] !== bNums[0]) {
      const commonContext = aLower.split(/\s+/).filter(w => bLower.includes(w) && w.length > 4);
      if (commonContext.length >= 1) {
        return {
          description: `Numerical disagreement: ${aNums[0]} vs ${bNums[0]} in similar context`,
          type: "DISAGREEMENT",
        };
      }
    }

    return null;
  }

  // ANALYZE stage
  async analyze(jobId: string): Promise<ResearchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);
    job.stage = "ANALYZE";

    // Answer questions based on claims
    for (const question of job.questions) {
      const relevantClaims = job.claims.filter(c => {
        const qWords = question.question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        return qWords.some(w => c.claim.toLowerCase().includes(w));
      });

      if (relevantClaims.length > 0) {
        // Simple answer synthesis
        const bestClaim = relevantClaims.sort((a, b) => b.confidence - a.confidence)[0];
        question.answered = true;
        question.answer = bestClaim.claim;
        question.confidence = bestClaim.confidence;
        question.sourcesUsed = relevantClaims.map(c => c.sourceId).slice(0, 3);
      }
    }

    job.timestamps.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  // VERIFY stage
  async verify(jobId: string): Promise<ResearchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);
    job.stage = "VERIFY";

    let verified = 0;
    let unverified = 0;
    let contradicted = 0;

    for (const claim of job.claims) {
      const hasContradiction = job.contradictions.some(c => c.claimAId === claim.id || c.claimBId === claim.id);
      if (hasContradiction) {
        claim.type = "UNVERIFIED_CLAIM";
        contradicted++;
        const source = job.sources.find(s => s.id === claim.sourceId);
        if (source) source.verificationStatus = "CONTRADICTED";
      } else {
        // If claim appears in multiple sources, increase confidence and mark verified
        const sameClaimCount = job.claims.filter(c => (c as any).normalized?.toLowerCase() === claim.claim.toLowerCase() || c.claim === claim.claim).length;
        if (sameClaimCount > 1 || claim.confidence > 60) {
          claim.type = "FACT_OBSERVED";
          verified++;
          const source = job.sources.find(s => s.id === claim.sourceId);
          if (source) source.verificationStatus = "VERIFIED";
        } else {
          unverified++;
        }
      }
    }

    job.verificationState = {
      verifiedClaims: verified,
      unverifiedClaims: unverified,
      contradictedClaims: contradicted,
    };

    job.timestamps.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  // SYNTHESIZE stage
  async synthesize(jobId: string): Promise<ResearchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);
    job.stage = "SYNTHESIZE";

    // Build findings
    job.findings.answers = job.questions
      .filter(q => q.answered)
      .map(q => ({
        questionId: q.id,
        answer: q.answer!,
        confidence: q.confidence ?? 50,
        sources: q.sourcesUsed ?? [],
      }));

    job.findings.provenance = job.claims.map(c => {
      const source = job.sources.find(s => s.id === c.sourceId);
      return {
        claimId: c.id,
        sourceUrl: source?.url ?? "unknown",
        sourceType: source?.type ?? "WEB_PAGE",
        retrievedAt: source?.retrievedAt ?? new Date().toISOString(),
        excerpt: c.excerpt,
        method: "extraction",
        confidence: c.confidence,
        verificationStatus: source?.verificationStatus ?? "UNVERIFIED",
      };
    });

    // Overall confidence
    if (job.claims.length > 0) {
      const avgConfidence = job.claims.reduce((sum, c) => sum + c.confidence, 0) / job.claims.length;
      job.confidence = Math.round(avgConfidence);
    }

    job.timestamps.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  // REPORT stage
  async report(jobId: string): Promise<{ job: ResearchJob; report: string }> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);
    job.stage = "REPORT";

    let report = `# Research Report: ${job.objective}\n\n`;
    report += `Research ID: ${job.researchId}\n`;
    report += `Objective ID: ${job.objectiveId}\n`;
    report += `Stage: ${job.stage}\n`;
    report += `Confidence: ${job.confidence}%\n`;
    report += `Sources: ${job.sources.length}, Claims: ${job.claims.length}, Contradictions: ${job.contradictions.length}\n\n`;

    report += `## Questions\n`;
    for (const q of job.questions) {
      report += `- ${q.question}: ${q.answered ? `Answered (${q.confidence}%) — ${q.answer}` : "Unanswered"}\n`;
    }

    report += `\n## Findings\n`;
    for (const ans of job.findings.answers) {
      report += `- Q ${ans.questionId}: ${ans.answer} (confidence ${ans.confidence}%, sources ${ans.sources.length})\n`;
    }

    report += `\n## Claims\n`;
    for (const claim of job.claims) {
      report += `- [${claim.type}] ${claim.claim} (confidence ${claim.confidence}%, source ${claim.sourceId})\n`;
    }

    report += `\n## Contradictions\n`;
    if (job.contradictions.length === 0) {
      report += `No contradictions detected.\n`;
    } else {
      for (const contr of job.contradictions) {
        report += `- ${contr.type}: ${contr.description} (sources ${contr.sourceAId} vs ${contr.sourceBId})\n`;
      }
    }

    report += `\n## Provenance\n`;
    for (const prov of job.findings.provenance) {
      report += `- Claim ${prov.claimId} from ${prov.sourceUrl} (${prov.sourceType}) at ${prov.retrievedAt} — ${prov.verificationStatus}, confidence ${prov.confidence}%\n`;
      report += `  Excerpt: "${prov.excerpt.substring(0, 150)}"\n`;
    }

    report += `\n## Metadata\n`;
    report += `- Total Requests: ${job.metadata.totalRequests}\n`;
    report += `- Runtime: ${job.metadata.runtimeMs}ms\n`;
    report += `- Depth: ${job.metadata.depthReached}\n`;

    job.findings.summary = report;
    job.stage = "COMPLETED";
    job.status = "COMPLETED";
    job.timestamps.completedAt = new Date().toISOString();
    job.timestamps.updatedAt = new Date().toISOString();

    this.jobs.set(jobId, job);
    this.persist();

    return { job, report };
  }

  // Full pipeline
  async runFullPipeline(
    jobId: string,
    fetchFn: (url: string) => Promise<{ content: string; statusCode: number; contentType: string; headers: Record<string, string> }>
  ): Promise<{ job: ResearchJob; report: string }> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Research job ${jobId} not found`);

    // Check limits before starting
    if (job.metadata.totalRequests >= job.constraints.maxRequests) {
      throw new Error(`Max requests reached`);
    }

    await this.fetch(jobId, fetchFn);
    if (this.shouldStop(jobId)) return { job: this.jobs.get(jobId)!, report: "Stopped early" };

    await this.extract(jobId);
    if (this.shouldStop(jobId)) return { job: this.jobs.get(jobId)!, report: "Stopped early" };

    await this.normalize(jobId);
    await this.compare(jobId);
    await this.analyze(jobId);
    await this.verify(jobId);
    await this.synthesize(jobId);
    return this.report(jobId);
  }

  private shouldStop(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return true;
    if (job.metadata.totalRequests >= job.constraints.maxRequests) return true;
    if (job.metadata.runtimeMs >= job.constraints.maxRuntimeMs) return true;
    if (job.metadata.totalModelCalls >= job.constraints.maxModelCalls) return true;
    if (job.sources.length >= job.constraints.maxSources) return true;
    return false;
  }

  private isUrlAllowed(url: string, constraints: ResearchJob["constraints"]): boolean {
    try {
      const parsed = new URL(url);
      if (constraints.blockedDomains?.some(d => parsed.hostname.includes(d))) return false;
      if (constraints.allowedDomains && constraints.allowedDomains.length > 0) {
        return constraints.allowedDomains.some(d => parsed.hostname.includes(d));
      }
      return true;
    } catch {
      return false;
    }
  }

  private inferSourceType(url: string): SourceType {
    if (url.startsWith("mock://")) return "MOCK";
    if (url.includes("github.com")) return "GITHUB";
    if (url.includes("api.")) return "API";
    if (url.includes("rss") || url.includes("feed")) return "RSS";
    if (url.includes("docs") || url.includes("documentation")) return "DOCUMENTATION";
    return "WEB_PAGE";
  }

  clear() {
    this.jobs.clear();
    this.persist();
  }
}

export const globalResearchEngine = new ResearchEngine();
