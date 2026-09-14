# Kaira Memory Architecture — Phase 7

## Overview

Phase 7 implements durable knowledge and experience system retaining useful knowledge across executions/projects/failures/repairs/research/environments to answer "What do I already know relevant to this objective?" without uncontrolled dump.

Distinguishes:
- **Operational State**: current task/run/checkpoint/retry/scheduler/wait (in durableRuns/scheduledJobs/waitingStates/monitoringJobs/heartbeats) — ephemeral per-execution, survives restart for recovery but not long-term knowledge
- **Durable Knowledge**: architecture decisions, verified facts, patterns, repairs, env, tool behavior, conventions, research, rationale, procedures (in memories/memoryEvents/memoryContradictions) — retained across executions

## Memory Types (14)

- PROJECT_KNOWLEDGE: high-level project completion, objectives, deliverables
- TECHNICAL_FACT: verified technical facts about code, dependencies, versions
- ARCHITECTURE_DECISION: framework, database, pattern choices with rationale
- PROJECT_CONVENTION: coding style, linting, testing, directory structure conventions
- SUCCESSFUL_PATTERN: tool usage patterns that succeeded, with evidence
- FAILURE_PATTERN: failure modes observed, for avoidance
- REPAIR_PATTERN: failure→diagnosis→repair→verified success, reusable but suggest not blindly apply
- ENVIRONMENT_KNOWLEDGE: detected environment, OS, runtime, workspace layout
- TOOL_KNOWLEDGE: tool behavior, args that work, limitations
- RESEARCH_FINDING: finding/source/date/confidence/scope/validity + staleness rules
- PROCEDURE: step-by-step procedures for tasks
- CONSTRAINT: technical constraints, limits, requirements
- ASSUMPTION: assumptions with confidence and risk
- LESSON_LEARNED: distilled lessons from executions

## Record Metadata

```ts
interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  summary: string;
  scope: MemoryScope;
  projectId?: string;
  workspacePath?: string;
  source: MemoryProvenance;
  provenance: MemoryProvenance;
  createdAt: string;
  lastValidatedAt: string;
  updatedAt: string;
  confidence: number; // 0-100
  validity: MemoryValidityState;
  tags: string[];
  relatedTasks: string[];
  relatedTools: string[];
  relatedFailures: string[];
  relatedRepairs: string[];
  supersedes?: string[];
  supersededBy?: string;
  retrievalCount: number;
  useCount: number;
  successCount: number;
  contradictionCount: number;
  ignoredCount: number;
  incorrectCount: number;
  lastRetrievedAt?: string;
  relatedMemories?: string[];
  metadata?: Record<string, unknown>;
}
```

Provenance:
```ts
interface MemoryProvenance {
  source: USER_PROVIDED/VERIFIED_OBSERVATION/VERIFIED_RESEARCH/SUCCESSFUL_EXECUTION/VERIFIED_REPAIR/SYSTEM_CONFIGURATION/INFERRED;
  description: string;
  evidenceIds?: string[];
  observationIds?: string[];
  executionHistoryId?: string;
  researchSourceId?: string;
  researchSourceUrl?: string;
  retrievalDate?: string;
  verifiedBy?: string;
  timestamp: string;
  runId?: string;
  objectiveId?: string;
  taskId?: string;
}
```

## Validity Lifecycle

- CANDIDATE → VALIDATED → ACTIVE
- ACTIVE → STALE (current verified state contradicts, incorrectCount>=3, age>stalenessDays 90)
- ACTIVE → SUPERSEDED (new memory supersedes old)
- Any → INVALIDATED (explicitly invalidated or secret detected)
- STALE/SUPERSEDED → ACTIVE (re-validation possible)

Authority weights:
- SYSTEM_CONFIGURATION 95 (highest)
- USER_PROVIDED 90 (outranks memory)
- VERIFIED_OBSERVATION 85
- SUCCESSFUL_EXECUTION 85
- VERIFIED_RESEARCH 80 (can supersede old if verified external)
- VERIFIED_REPAIR 80
- INFERRED 40 lower authority capped at 70 confidence, must preserve evidence chain

## Write Policy

NOT every observation — filter:
- Transient paths: /tmp/*.log, /var/tmp/, node_modules/.cache, .next/cache
- Credentials/secrets/noise/hallucinations

Pipeline: OBSERVATION → CANDIDATE → DETERMINISTIC FILTER → VALIDATION → STORE
- Model proposes, runtime decides
- deterministicFilter checks: secret patterns BLOCK, transient paths, noise too short (<20 chars summary <10), vague content, insufficient word count (<5), credential risk
- computeValueScore factors: relevance (tags, length, metadata) 0.2, verification (evidenceIds, external verification) 0.2, recurrence (existing similar count) 0.1, futureUsefulness (type) 0.2, stability (type) 0.1, specificity (length>200, relatedTools, metadata) 0.1, projectScope 0.05, confidence 0.05
- Threshold: valid if valueScore>=40 and verification>=30, shouldStore if >=50

## Retrieval Bounded

```
Objective → scope → search → rank → filter stale/invalid → bounded context → planner
```

- Scope determination: TASK if taskId, TOOL if toolName, PROJECT if projectId, WORKSPACE if workspacePath, always ENVIRONMENT/GLOBAL, or explicit scopes filter
- Search: fullTextSearch over summary+content+tags with project isolation (GLOBAL always allowed, PROJECT must match or be GLOBAL), fallback to listMemories
- Filtering: confidence>=minConfidence (default 30), validity not INVALIDATED/SUPERSEDED unless include flags, STALE only if includeStale, scope in relevantScopes, project isolation
- Ranking: semantic relevance 0.3 + projectScope 0.15 + exactTags 0.1 + recency 0.1 + confidence 0.1 + validity 0.1 + provenance 0.1 + historicalUsefulness 0.05
  - semanticRelevance: keyword matching in content/summary/tags, summary weighted higher (15 vs 10), coverage bonus (matched terms / total terms *20)
  - projectScope: SCOPE_PRIORITY TASK 100/PROJECT 90/WORKSPACE 80/TOOL 70/ENVIRONMENT 60/GLOBAL 50 + 20 bonus exact projectId match
  - exactTags: query tags matching memory tags *25
  - recency: days since lastValidated: <1 100, <7 80, <30 60, <90 40, <180 20, else 10
  - confidence: memory confidence
  - validity: VALIDITY_WEIGHT CANDIDATE 10/VALIDATED 60/ACTIVE 100/STALE 20/SUPERSEDED 5/INVALIDATED 0
  - provenance: MEMORY_TYPE_AUTHORITY
  - historicalUsefulness: neutral 50 for new, +successRate*30 +useRate*20 -incorrect*10 -contradiction*5 capped 0-100
- Bounded context: per-scope limits TASK 3/PROJECT 5/WORKSPACE 3/TOOL 2/ENVIRONMENT 2/GLOBAL 2, maxMemories 10, maxTokens 4000, maxChars 12000
- Only relevant: no uncontrolled dumps, bounded by objective relevance

## Isolation Scopes

- GLOBAL: cross-project knowledge
- PROJECT: project-specific isolated by projectId
- WORKSPACE: workspace path specific
- TASK: task-specific
- TOOL: tool-specific
- ENVIRONMENT: environment-specific

Project isolation ensures PROJECT scoped memories not leaked across projects unless GLOBAL.

## Contradiction Detection

- Detect same type+scope overlapping tags opposing keywords: uses vs does not use, requires vs does not require, enabled vs disabled, exists vs does not exist, true vs false
- Types DIRECT_CONFLICT/OUTDATED/SCOPE_MISMATCH/UNRESOLVED
- Record contradiction increment contradictionCount, if material escalate via structured escalation reason CONTRADICTION
- Resolution: supersedes (old→SUPERSEDED new ACTIVE), different scope (keep both but different scope), stale (mark old STALE), unresolved→escalate

## Current Reality vs Memory Validation

- Verified workspace state outranks stale memory
- validateAgainstCurrentState checks exists false but memory claims exists → outranks true shouldMarkStale true
- Transition to STALE excluded from retrieval unless includeStale=true

## Research Memory

- Finding/source/date/confidence/scope/validity + staleness
- Provenance includes researchSourceUrl/researchSourceId/retrievalDate
- Staleness age>stalenessDays 90 recency score decreases
- Research findings may become memory with provenance VERIFIED_RESEARCH

## Failure/Repair Memory

- Extract reusable pattern failure description/diagnosis root cause/repair intendedChanges/outcome successful repair
- Suggest not blindly apply includes context failure category/affected files/evidence
- Stored as REPAIR_PATTERN with relatedFailures/relatedRepairs/relatedTasks
- Effectiveness tracking successCount increments if used successful

## Security

- Secrets NEVER memory: block/redact API keys/passwords/tokens/private keys/cookies/credentials
- Patterns: PRIVATE_KEY_PEM, AWS_ACCESS_KEY, API_KEY_ASSIGNMENT, GENERIC_API_KEY sk-*, GITHUB_TOKEN, STRIPE_KEY, PASSWORD_ASSIGNMENT, PASSWORD_URL user:pass@, BEARER_TOKEN, JWT_TOKEN, TOKEN_ASSIGNMENT, SESSION_COOKIE, COOKIE_HEADER, ENV_SECRET, LONG_SECRET_HEX, ENV_FILE
- Defensive detection: detectSecrets scans content+summary returns blocked=true if BLOCK severity
- On store: isContentSafeForMemory rejects SECRET_BLOCKED
- On import: re-check secrets skip importing
- Redaction for non-blocked but sensitive

## Auditability

- MEMORY_PROPOSED: candidate accepted
- MEMORY_REJECTED: candidate rejected with reason
- MEMORY_VALIDATED: candidate validated with score
- MEMORY_STORED: memory stored with validity
- MEMORY_RETRIEVED: memory retrieved for objective
- MEMORY_USED: memory used successfully or not
- MEMORY_STALE: memory marked stale
- MEMORY_SUPERSEDED: memory superseded by new memory
- MEMORY_INVALIDATED: memory invalidated
- All events with id/memoryId/type/timestamp/reason/runId/objectiveId/taskId/metadata
- CLI shows relevant memories why relevant/confidence/scope/provenance/influenced decision/proposed/rejected/superseded without sensitive content

## Context Budget

- Max memories per objective 10 (KAIRA_MEMORY_MAX_PER_OBJECTIVE)
- Max tokens per objective 4000 (KAIRA_MEMORY_MAX_TOKENS_PER_OBJECTIVE)
- Max chars per objective 12000 (KAIRA_MEMORY_MAX_CHARS_PER_OBJECTIVE)
- Per-scope limits TASK 3/PROJECT 5/WORKSPACE 3/TOOL 2/ENVIRONMENT 2/GLOBAL 2 (KAIRA_MEMORY_PER_SCOPE_*)
- Stale handling includeStale false by default stalenessDays 90 (KAIRA_MEMORY_STALENESS_DAYS)
- Confidence threshold minConfidence 30 (KAIRA_MEMORY_MIN_CONFIDENCE)
- Only relevant no uncontrolled dumps

## Effectiveness Tracking

- retrieved: count times retrieved
- used: count times used (influenced decision)
- successful: count times used successfully
- contradicted: count contradictions detected
- ignored: count times retrieved but not used
- incorrect: count times marked incorrect if >=3 mark STALE
- Historical usefulness score neutral 50 for new +successRate*30 +useRate*20 -incorrect*10 -contradiction*5 capped 0-100

## DB Schema

- PostgreSQL-native structured metadata/full-text/filtering/ranking/scopes/provenance/lifecycle/relationships optional embeddings extension usable without embedding infra
- Tables durable_memories/memory_lifecycle_events/memory_contradictions
- Enums memory_type/memory_scope/memory_validity/memory_provenance/memory_lifecycle_event_type
- Indexes on type/scope/projectId/validity/provenance/confidence/memoryId
- searchVector text column (real DB would use tsvector generated column), embedding jsonb + embeddingModel text optional

## Integration

- Orchestrator lifecycle OBJECTIVE→REQUIREMENTS→RETRIEVE RELEVANT MEMORY→PLAN→EXECUTE→OBSERVE→VERIFY→DIAGNOSE/REPAIR→VERIFY→EXTRACT LEARNING→VALIDATE MEMORY→STORE
- Research memory with finding/source/date/confidence/scope/validity+staleness
- Failure/repair memory reusable
- Verification current reality outranks stale
- Durable-run memory distinct from operational state
- Survives restart via JSON+DB persistence
- CLI observability

## Tools

- memory_propose: model proposes candidate, runtime validates via deterministic filter + value scoring, provenance preserved, returns stored true/false with reason and validationScore
- memory_retrieve: retrieve relevant durable memories bounded, returns memories with ranking why relevant confidence scope provenance influenced decision, project-specific outranks global, respects context budget
- memory_audit: show memory audit trail MEMORY_PROPOSED/REJECTED/VALIDATED/STORED/RETRIEVED/USED/STALE/SUPERSEDED/INVALIDATED with why relevant confidence scope provenance influenced decision without sensitive content, shows contradictions

## CLI Observability

CLI shows:
- Total memories for project
- Relevant retrieved (from total found, truncated flag)
- Extracted this run
- Contradictions count
- For each relevant memory: type, scope, validity, confidence, provenance source, score, summary, why relevant (semantic/scope/recency/validity), influenced (retrieved/use/success)
- Contradictions detected: type, memoryA vs memoryB, description
- Recent lifecycle events: timestamp, type, memoryId, reason
- Without sensitive content: summary and content truncated, no secrets (blocked at store)

## Testing

- Unit: 27 checks (20 required)
- E2E: 18 checks covering 9 scenarios (9 required): convention reuse, repair pattern reuse, contradiction detection, stale vs current state, project isolation, credential rejection, bounded retrieval hundreds, restart persistence, inferred lower authority
- All previous phases still PASS
