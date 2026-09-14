# KAIRA — Autonomous AI Worker/Agent

**A persistent, local-first, model-agnostic autonomous AI operator with durable knowledge.**
Give her an objective — she recalls what she already knows, plans, uses real tools, verifies her work, learns, and reports back. No chatbot cosplay, no paid APIs required.

> v0.9 autonomous worker with durable knowledge + controlled long-running autonomy + research/web/external: memory architecture retaining useful knowledge across executions/projects/failures/repairs/research/environments to answer "What do I already know relevant to this objective?" without uncontrolled dump, distinguishes OPERATIONAL STATE (current task/run/checkpoint/retry/scheduler/wait) vs DURABLE KNOWLEDGE (architecture decisions, verified facts, patterns, repairs, env, tool behavior, conventions, research, rationale, procedures), memory types PROJECT_KNOWLEDGE/TECHNICAL_FACT/ARCHITECTURE_DECISION/PROJECT_CONVENTION/SUCCESSFUL_PATTERN/FAILURE_PATTERN/REPAIR_PATTERN/ENVIRONMENT_KNOWLEDGE/TOOL_KNOWLEDGE/RESEARCH_FINDING/PROCEDURE/CONSTRAINT/ASSUMPTION/LESSON_LEARNED with metadata id/type/content/summary/scope/projectId/source/provenance/created/lastValidated timestamps/confidence/validity/tags/related tasks/tools/failures/repairs/supersedes/superseded_by, validity CANDIDATE/VALIDATED/ACTIVE/STALE/SUPERSEDED/INVALIDATED, provenance USER_PROVIDED/VERIFIED_OBSERVATION/VERIFIED_RESEARCH/SUCCESSFUL_EXECUTION/VERIFIED_REPAIR/SYSTEM_CONFIGURATION/INFERRED with INFERRED lower authority preserve evidence, authority verified workspace state outranks stale memory user instructions outrank memory verified external can supersede old, lifecycle CANDIDATE→VALIDATE→ACTIVE and ACTIVE→STALE/SUPERSEDED/INVALIDATED, write policy NOT every observation filter transient paths/credentials/secrets/noise/hallucinations candidate OBSERVATION→CANDIDATE→DETERMINISTIC FILTER→VALIDATION→STORE model proposes runtime decides value factors relevance/verification/recurrence/usefulness/stability/specificity/scope/confidence, retrieval bounded objective→scope→search→rank→filter stale/invalid→bounded context→planner ranking semantic relevance/project scope/tags/recency/confidence/validity/provenance/usefulness project-specific outranks global, isolation scopes GLOBAL/PROJECT/WORKSPACE/TASK/TOOL/ENVIRONMENT, contradiction detection supersedes/different scope/stale/unresolved→escalate if material, current reality vs memory validation, research memory finding/source/date/confidence/scope/validity+staleness, failure/repair memory extract reusable pattern but suggest not blindly apply, no self-modification, DB PostgreSQL-native structured metadata/full-text/filtering/ranking/scopes/provenance/lifecycle/relationships optional embeddings extension usable without embedding infra, security secrets NEVER memory block/redact API keys/passwords/tokens/private keys/cookies/credentials defensive detection, auditability MEMORY_PROPOSED/REJECTED/VALIDATED/STORED/RETRIEVED/USED/STALE/SUPERSEDED/INVALIDATED, context budget max memories/tokens/per-scope/stale/confidence threshold only relevant, effectiveness tracking retrieved/used/successful/contradicted/ignored/incorrect, plus durable job/run abstraction CREATED/QUEUED/RUNNING/WAITING/PAUSED/RECOVERING/ESCALATED/COMPLETED/FAILED/CANCELLED/EXPIRED survives restart, checkpointing idempotent, scheduler immediate/delayed/scheduled/recurring/monitoring/retry-after/waiting/health with boundaries, WAIT explicit no wasteful model calls, monitoring what/how/interval/timeout/acceptable/change/escalation/completion relying on observations, heartbeat health active/stalled/lastActivity/failed/scheduler/tool/connector/resource/overdue, resource governance bounded limits → STOP/ESCALATE, research DISCOVER→REPORT with provenance FACT_OBSERVED vs MODEL_INFERENCE vs UNVERIFIED CLAIM, connectors READ_ONLY/REVERSIBLE_WRITE/IRREVERSIBLE_WRITE/HIGH_RISK, credential security never in logs, rate limiting circuit breaker, events validate→authorize→correlate→execute no shell, escalation structured, autonomy SUPERVISED/ASSISTED/AUTONOMOUS/RESTRICTED, observability extended with memory why relevant/confidence/scope/provenance/influenced decision/proposed/rejected/superseded.

Built to grow into a multi-agent workforce — see `docs/ARCHITECTURE.md`.

## What is actually working (and tested)

### Phase 1 — Agent Core Foundation
- Model abstraction/router: qwen3:8b reasoning/planning, qwen2.5-coder:7b coding, llama3.2:3b lightweight, moondream vision
- Explicit agent states, task system, real tool system 10+ tools, structured results, safety, logging, persistence

### Phase 2 — Autonomous Agent Core
- Objective/task system, planner via reasoning model, execution engine, failure recovery, verification layer, model routing, first real test calculator_test.py 5+7=12

### Phase 2.5 — Real Ollama Validation
- Real Ollama provider with env-configurable base URL, honest reporting when sandbox cannot reach local Ollama

### Phase 3 — Autonomous Engineering
- Engineering tool layer, workspace safety, engineering loop UNDERSTAND→INSPECT→PLAN→MODIFY→EXECUTE→TEST→OBSERVE→DIAGNOSE→REPAIR→RETRY→VERIFY→REPORT, real code repair, context management, change tracking, verification expanded, engineering safety, tests A-F

### Phase 4 — Observation, Evidence & Verification
- Observation subsystem normalized per tool execution, configurable limits
- Evidence model must originate from real observations not LLM
- Verification engine deterministic independent from LLM
- Verification plans explicit JSON executable independently
- Completion decision VERIFIED/FAILED/INCONCLUSIVE/BLOCKED, model claim NEVER proof
- Evidence chain traceability

### Phase 5 — Diagnosis, Repair & Recovery
- Loop EXECUTE->OBSERVE->VERIFY->FAIL->DIAGNOSE->REPAIR PLAN->APPLY REPAIR->RETRY->OBSERVE->VERIFY->SUCCESS/ESCALATION
- Failure classification deterministic, diagnosis bounded context must reference evidence
- Repair safe inside workspace, via policy->tool->observation
- Safeguards max repair per task, max retries per objective, max consecutive identical, no infinite loops
- Escalation structured never pretend solved
- Recovery state machine, context management, change tracking, DB persistence, model routing

### Phase 6 — Autonomous Software Engineering
- Project abstractions, task graph PENDING/READY/RUNNING/BLOCKED/COMPLETED/FAILED/ESCALATED/CANCELLED, scheduler only READY, requirements extraction, assumption management risk LOW/MEDIUM/HIGH/CRITICAL, orchestrator deterministic authoritative, context engineering bounded, project workspace management workspace/projects/<id>/, initialization detecting language, software development loop PLAN→IMPLEMENT→RUN→OBSERVE→TEST→VERIFY→DONE, code generation via router, change-aware incremental, test generation meaningful, acceptance criteria explicit evidence-backed, project-level verification holistic, failure recovery across tasks, cross-task awareness, environment detection, checkpointing resumable idempotency sequential correctness>speed git awareness no auto push engineering report from actual history security preserve DB extend CLI kaira

### Phase 7 — Durable Knowledge and Experience System (NEW)
- **Durable knowledge distinct from operational state**: operational = current task/run/checkpoint/retry/scheduler/wait (durableRuns/scheduledJobs), durable = architecture decisions/verified facts/patterns/repairs/env/tool behavior/conventions/research/rationale/procedures (memories)
- **Memory types 14**: PROJECT_KNOWLEDGE, TECHNICAL_FACT, ARCHITECTURE_DECISION, PROJECT_CONVENTION, SUCCESSFUL_PATTERN, FAILURE_PATTERN, REPAIR_PATTERN, ENVIRONMENT_KNOWLEDGE, TOOL_KNOWLEDGE, RESEARCH_FINDING, PROCEDURE, CONSTRAINT, ASSUMPTION, LESSON_LEARNED
- **Record metadata**: id/type/content/summary/scope/projectId/source/provenance/created/lastValidated timestamps/confidence/validity/tags/related tasks/tools/failures/repairs/supersedes/superseded_by/relatedMemories/metadata/retrievalCount/useCount/successCount/contradictionCount/ignoredCount/incorrectCount/lastRetrievedAt/optional embedding/searchVector
- **Validity lifecycle**: CANDIDATE→VALIDATED→ACTIVE and ACTIVE→STALE/SUPERSEDED/INVALIDATED, transitionValidity enforces, re-validation possible STALE→ACTIVE, idempotent checkpointing for memory
- **Provenance & authority**: USER_PROVIDED (90), SYSTEM_CONFIGURATION (95), VERIFIED_OBSERVATION (85), SUCCESSFUL_EXECUTION (85), VERIFIED_RESEARCH (80), VERIFIED_REPAIR (80), INFERRED (40) lower authority capped at 70 confidence, preserve evidence chain, authority verified workspace state outranks stale memory user instructions outrank memory verified external can supersede old
- **Write policy**: NOT every observation, filter transient paths (/tmp/*.log, .next/cache, node_modules/.cache)/credentials/secrets/noise/hallucinations, candidate pipeline OBSERVATION→CANDIDATE→DETERMINISTIC FILTER→VALIDATION→STORE model proposes runtime decides, value factors relevance/verification/recurrence/futureUsefulness/stability/specificity/projectScope/confidence weighted scoring threshold valid if valueScore>=40 and verification>=30 shouldStore if >=50
- **Retrieval bounded**: objective→scope→search→rank→filter stale/invalid→bounded context→planner, scope determination TASK/PROJECT/WORKSPACE/TOOL/ENVIRONMENT/GLOBAL or explicit, search full-text over summary+content+tags with project isolation (GLOBAL always allowed, PROJECT must match or be GLOBAL), filtering confidence>=minConfidence validity not INVALIDATED/SUPERSEDED unless include flags STALE only if includeStale, ranking semantic relevance 0.3 + projectScope 0.15 + exactTags 0.1 + recency 0.1 + confidence 0.1 + validity 0.1 + provenance 0.1 + historicalUsefulness 0.05, project-specific outranks global via SCOPE_PRIORITY TASK 100/PROJECT 90/WORKSPACE 80/TOOL 70/ENVIRONMENT 60/GLOBAL 50 plus 20 bonus exact projectId match, bounded context per-scope limits TASK 3/PROJECT 5/WORKSPACE 3/TOOL 2/ENVIRONMENT 2/GLOBAL 2 maxMemories 10 maxTokens 4000 maxChars 12000, only relevant no uncontrolled dumps, markRetrieved for effectiveness tracking
- **Isolation scopes**: GLOBAL/PROJECT/WORKSPACE/TASK/TOOL/ENVIRONMENT, project isolation ensures PROJECT scoped memories not leaked across projects unless GLOBAL
- **Contradiction detection**: same type+scope overlapping tags opposing keywords (uses vs does not use, requires vs does not require, enabled vs disabled, exists vs does not exist, true vs false), types DIRECT_CONFLICT/OUTDATED/SCOPE_MISMATCH/UNRESOLVED, record contradiction increment contradictionCount if material escalate via structured escalation reason CONTRADICTION, resolution supersede/different scope/stale/unresolved→escalate
- **Current reality vs memory validation**: verified workspace state outranks stale memory, if memory claims exists but verified not exists → mark STALE, excluded from retrieval unless includeStale=true, example file src/oldModule.ts memory says exists but file_exists tool returns not found → STALE
- **Research memory**: finding/source/date/confidence/scope/validity+staleness, provenance includes researchSourceUrl/researchSourceId/retrievalDate, staleness age>stalenessDays 90 → recency score decreases, research findings may become memory with provenance VERIFIED_RESEARCH
- **Failure/repair memory**: extract reusable pattern failure description/diagnosis root cause/repair intendedChanges/outcome successful repair, suggest not blindly apply includes context failure category/affected files/evidence, stored as REPAIR_PATTERN with relatedFailures/relatedRepairs/relatedTasks, effectiveness tracking if used successful successCount increments
- **Security**: secrets NEVER memory block/redact API keys/passwords/tokens/private keys/cookies/credentials defensive detection patterns PRIVATE_KEY_PEM/AWS_ACCESS_KEY/API_KEY_ASSIGNMENT/GENERIC_API_KEY sk-*/GITHUB_TOKEN/STRIPE_KEY/PASSWORD_ASSIGNMENT/PASSWORD_URL user:pass@/BEARER_TOKEN/JWT_TOKEN/TOKEN_ASSIGNMENT/SESSION_COOKIE/COOKIE_HEADER/ENV_SECRET/LONG_SECRET_HEX/ENV_FILE, detectSecrets scans content+summary returns blocked=true if BLOCK severity, on store isContentSafeForMemory checks blocked rejects SECRET_BLOCKED, on import re-check secrets skip secret-containing, redaction for non-blocked but sensitive
- **Auditability**: MEMORY_PROPOSED/REJECTED/VALIDATED/STORED/RETRIEVED/USED/STALE/SUPERSEDED/INVALIDATED all events with id/memoryId/type/timestamp/reason/runId/objectiveId/taskId/metadata, CLI shows relevant memories why relevant/confidence/scope/provenance/influenced decision/proposed/rejected/superseded without sensitive content
- **Context budget**: max memories/tokens/per-scope/stale/confidence threshold only relevant, effectiveness tracking retrieved/used/successful/contradicted/ignored/incorrect, CLI observability shows relevant memories retrieved why relevant confidence scope provenance influenced decision proposed/rejected/superseded without sensitive content
- **DB PostgreSQL-native**: structured metadata/full-text/filtering/ranking/scopes/provenance/lifecycle/relationships optional embeddings extension usable without embedding infra, tables durable_memories/memory_lifecycle_events/memory_contradictions, enums memory_type/memory_scope/memory_validity/memory_provenance/memory_lifecycle_event_type, indexes on type/scope/projectId/validity/provenance/confidence/memoryId, searchVector text column (real DB would use tsvector generated column), embedding jsonb + embeddingModel text optional
- **Integration**: orchestrator lifecycle OBJECTIVE→REQUIREMENTS→RETRIEVE RELEVANT MEMORY→PLAN→EXECUTE→OBSERVE→VERIFY→DIAGNOSE/REPAIR→VERIFY→EXTRACT LEARNING→VALIDATE MEMORY→STORE, research memory with finding/source/date/confidence/scope/validity+staleness, failure/repair memory reusable, verification current reality outranks stale, durable-run memory distinct from operational state, survives restart via JSON+DB persistence, CLI observability
- **Testing**: 20 unit + 9 E2E: convention reuse, repair pattern reuse, contradiction detection, stale vs current state, project isolation, credential rejection, bounded retrieval hundreds, restart persistence, inferred lower authority

### Phase 8+9 — Controlled Long-Running Autonomy + Research/Web/External
- **Durable job/run abstraction**: states CREATED/QUEUED/RUNNING/WAITING/PAUSED/RECOVERING/ESCALATED/COMPLETED/FAILED/CANCELLED/EXPIRED with fields runId/objectiveId/projectId/state/currentTask/taskGraph/start/lastActivity/nextScheduled/checkpoint/retry/waitingReason/externalDeps/failures/escalations/verification/completion/cancellation, survives restart
- **Checkpointing**: idempotent, validateCheckpoint checks id/timestamp/objectiveId/runId/future timestamp, resumeFromCheckpoint idempotent, recoverStaleRuns detects RUNNING with no activity → RECOVERING
- **Scheduler**: immediate/delayed/scheduled/recurring/monitoring/retry-after/waiting/health checks with boundaries intervalMs>=1000 timeout max 300s scheduled max 30 days future, no infinite loop, atomic file writes, survives restart
- **Wait states**: explicit WAIT states deployment/API/website change/scheduled time/approval/long command/dependency/external event/retry-after/monitoring/research/health check, reason/description/waitingSince/expectedUntil/retryAfterMs/externalDependencyId/escalationAfterMs/checkIntervalMs/attempts/maxAttempts, no wasteful model calls, polling via scheduler deterministic
- **Monitoring jobs**: what/how/polling interval/timeout/acceptable state/change detection/escalation/completion relying on observations, types HTTP_STATUS/FILE_EXISTS/FILE_CONTENT/COMMAND_OUTPUT/API_RESPONSE/WEBSITE_CHANGE/CUSTOM, acceptableStates exact/contains:/regex:, changeDetection previous/current/changed/description, escalationConditions maxFailures/failureCount/escalateAfterMs, completionConditions onState/onChange/maxChecks, recordCheck based on observation
- **Heartbeat health**: active runs/stalled runs/lastActivity/failed jobs/scheduler health/tool health/external connector health/resource exhaustion/overdue work, detect stalled execution not silently remain RUNNING forever, checkRunHealth stalled detection, getSystemHealth overall, recoverStalledRuns transitions STALLED→RECOVERING
- **Resource governance**: max runtime/task attempts/repair attempts/external requests/model calls/concurrent jobs/shell duration/downloaded data/research depth/spending/consecutive failures → STOP/ESCALATE never bypass, DEFAULT_LIMITS runtime 600s taskAttempts 30 repair 10 external 50 modelCalls 100 concurrent 5 shell 300s downloaded 50MB researchDepth 5 consecutiveFailures 5, checkRun/checkConcurrent/enforce deterministic, tracking via incrementResource
- **Research system**: DISCOVER→FETCH→EXTRACT→NORMALIZE→COMPARE→ANALYZE→VERIFY→SYNTHESIZE→REPORT with research job abstraction researchId/objective/questions/constraints/sources/fetched/observations/claims/metadata/timestamps/confidence/contradictions/verification/findings, depth control max sources/recursion/requests/runtime/model calls stop when sufficient/AC met/limits/diminishing/escalation
- **Source architecture**: extensible adapters SourceAdapter interface name/supportedTypes/canHandle/fetch/extract, BaseSourceAdapter http/https, MockSourceAdapter mock:// for tests, SourceRegistry register/getAdapterForUrl/list, normalized observations raw not authoritative
- **Web access**: GET/page retrieval/extraction/links/metadata/status/content-type/timestamps via tool abstraction web_fetch and web_search (mock for testing with explicit note), SSRF protection BLOCKED_HOSTS localhost/127.0.0.1/0.0.0.0/::1/.internal/.local/metadata.google.internal/169.254.169.254 only http/https no credentials in URL maxResponseBytes 5MB timeout 15s response-size limits redirect follow truncated handling document if unavailable not fake
- **Provenance**: source URL/type/timestamp/excerpt/method/claim/confidence/verification status, FACT OBSERVED if verbatim from source MODEL INFERENCE if model generated UNVERIFIED_CLAIM otherwise, ProvenanceTracker addProvenance/getProvenance/classifyClaim/buildProvenanceReport
- **Cross-checking**: agreement/disagreement/outdated/conflicting/missing explicit not LLM preference, detectContradiction via opposition keywords and numerical disagreement, contradictions represented explicitly
- **Connector architecture**: name/capability/input/output/permissions/auth/risk/side-effect/timeout/retry/rate limits/reversibility/verification strategy classify READ_ONLY/REVERSIBLE_WRITE/IRREVERSIBLE_WRITE/HIGH_RISK, ConnectorDefinition, ConnectorRegistry deterministic policy checks canExecute checks autonomy policy + security validator + rate limiting high-risk always requires approval execution via execute with bypassApprovalCheck only for authorized system input validation security validation rate limiting credential check returns ConnectorExecutionResult
- **External safety**: READ auto if authorized MEDIUM/HIGH require deterministic policy checks high-risk require explicit authorization LLM cannot grant permission, default connectors web_fetch READ_ONLY github_read READ_ONLY github_write REVERSIBLE_WRITE requires approval deploy_production IRREVERSIBLE_WRITE requires approval delete_repository HIGH_RISK requires approval
- **Credential security**: never in prompts/logs/observations/research/memory/reports env/secure abstraction never expose to model, CredentialManager env KAIRA_CREDENTIAL_<CONNECTOR> or <CONNECTOR>_API_KEY/_TOKEN setCredential with expiration sanitizeForLogging redacts api_key/token/password/secret/credential containsCredentialLeakage detects leakage attempts
- **Rate limiting/network safety**: timeouts/retries with backoff/rate limiting/circuit breaking/response-size limits/download limits/domain policy no request storms, RateLimiter per connector requestsInWindow/windowStart/lastRequestAt/failures/consecutiveFailures/circuitBreaker CLOSED/OPEN/HALF_OPEN/circuitOpenUntil/totalRequests/totalFailures configs requestsPerMinute/burstLimit/failureThreshold/circuitOpenMs canMakeRequest checks circuit breaker window rate burst recordRequest/recordSuccess/recordFailure getBackoffMs exponential+jitter getCircuitBreakersOpen
- **Event-driven**: webhook/repo/deployment/scheduled/file change/API/monitoring → validate/authorize/correlate/create-resume/execute/verify/record no arbitrary shell, EventType WEBHOOK/REPO_EVENT/DEPLOYMENT_EVENT/SCHEDULED_EVENT/FILE_CHANGE/API_EVENT/MONITORING_ALERT/EXTERNAL_EVENT/MANUAL, Event status RECEIVED/VALIDATED/AUTHORIZED/CORRELATED/EXECUTING/COMPLETED/FAILED/REJECTED, EventBus receiveEvent structured validate (security) → authorize (no arbitrary shell block payloads with command/shell) → correlate (source:type:date) → execute via handlers → verify → record persistence registerHandler/subscribe
- **Escalation**: structured reason/objective/current state/attempted actions/evidence/options/recommended action/decision required actionable, StructuredEscalation id/runId/objectiveId/projectId/researchId/reason/description/objective/currentState/attemptedActions/evidence/options/recommendedAction/decisionRequired/status/resolution/createdAt/updatedAt/severity, reasons INSUFFICIENT_AUTHORITY/AMBIGUOUS_HIGH_RISK/MISSING_CREDENTIALS/DESTRUCTIVE_OPERATION/UNRESOLVED_FAILURES/LIMIT_EXCEEDED/CONTRADICTION/UNAVAILABLE_DEPENDENCY/HUMAN_JUDGMENT_REQUIRED/SECURITY_VIOLATION/EXTERNAL_SERVICE_FAILURE, options id/description/risk/requiresApproval recommendedAction optionId/reason/confidence decisionRequired question/deadline/approvers, convenience creators escalateInsufficientAuthority/escalateLimitExceeded/escalateContradiction
- **Autonomy policy**: SUPERVISED/ASSISTED/AUTONOMOUS/RESTRICTED determines authority without unlimited inference, allowedActions read/workspaceWrite/commandExecution/destructive/externalRead/externalWrite/highRisk/research/monitoring/scheduling requiresApproval externalWrite/highRisk/destructive/spending/publish maxAutonomousSteps maxExternalRequests, checkExternalActionRisk deterministic
- **Observability extended**: OBJECTIVE→PROJECT→TASK→ACTION→TOOL→OBSERVATION→EVIDENCE→VERIFICATION→RESULT + EXTERNAL SOURCE→EXTERNAL ACTION→SCHEDULE→WAIT→RESUME→ESCALATION + MEMORY_PROPOSED/REJECTED/VALIDATED/STORED/RETRIEVED/USED/STALE/SUPERSEDED/INVALIDATED, CLI visibility what doing why last observed waiting for next plan attempts external accessed verified why stopped + memory why relevant/confidence/scope/provenance/influenced decision/proposed/rejected/superseded
- **DB extended**: PostgreSQL schema for long-running jobs/schedules/waits/checkpoints/monitoring/research/sources/external actions/connector metadata/rate-limit/escalations/events/history with FK/indexes no duplication, enums durable_run_state/wait_reason/schedule_type/scheduled_job_state/monitoring_check_type/monitoring_job_state/research_stage/claim_type/source_type/connector_permission/escalation_reason/event_type/autonomy_level/memory_type/memory_scope/memory_validity/memory_provenance/memory_lifecycle_event_type, tables durable_runs/scheduled_jobs/monitoring_jobs/research_jobs/research_sources/external_actions/structured_escalations/events/connector_metadata/durable_memories/memory_lifecycle_events/memory_contradictions
- **Security external as attack surface**: protect prompt injection/malicious content/tool-output injection/unauthorized commands/SSRF/arbitrary URL/malicious downloads/credential leakage/redirects/oversized/external overriding instructions external content is DATA never instruction

### Testing (Phase 7+8+9)
- Phase 4: 61 checks — observation, evidence, verification, completion decision, limits, persistence, traceability
- Phase 5: 43 checks — failure classification, diagnosis, repair, safeguards, escalation, persistence, no infinite loops
- E2E Phase4-5: 32 checks — E2E1 success prints 12, E2E2 auto repair, E2E3 escalation, E2E4 false success 13 vs 12
- Phase 6: 56 checks — requirements, assumptions, task graph, scheduler, context, workspace, acceptance, verification, checkpoint, report, planner, environment
- E2E Phase6: 7 checks — E2E1 simple prints 12 COMPLETED, E2E2 multi-file calculator with tests, E2E3 automatic recovery from deliberate error, E2E4 cross-task dependency scheduler, E2E5 resume after interruption checkpoint, E2E6 verification prevents false completion, E2E7 escalation for unauthorized operation
- Phase 7: 27 checks — secret detection blocks API key/password, deterministic filter rejects noise/secret, valid candidate stored, all 14 types, lifecycle VALIDATED→ACTIVE→STALE→ACTIVE, INFERRED lower authority capped, provenance preserved, project isolation relevant/other not leaked, bounded retrieval maxMemories/token budget/project-specific outranks global, current reality outranks stale, contradiction detection mechanism, superseded handling, effectiveness tracking retrieved/used/successful, research memory provenance validity + staleness, value scoring factors, per-scope limits, auditability, confidence threshold, operational vs durable distinction
- E2E Phase7: 18 checks — convention reuse, repair pattern reuse, contradiction detection + resolution via supersede, stale vs current state outranks + excluded, project isolation Alpha doesn't get Beta, credential rejection secrets NEVER stored + env file blocked, bounded retrieval 500 respects max + not uncontrolled dump, restart persistence survives + retrieval works + persistence layer, inferred lower authority capped + verified outranks inferred
- Phase 8+9: 56 checks — durable run model, checkpointing, scheduler, wait states, monitoring, heartbeat, resource governance, research system, connectors, credential security, rate limiting, security, events, escalation, autonomy policy, observability
- E2E Phase8+9: 15 checks — resume from checkpoint, monitoring waits for state change, research provenance report, conflicting sources contradiction detection, unauthorized write blocked, malicious prompt injection blocked, event trigger without bypass, service outage bounded backoff escalation, multiple jobs isolation, limit exceeded stops
- All previous phases still PASS, typecheck 0 errors, backward compatible, safe migrations v4.0.0 + memory extension

## Quickstart

```bash
npm install

# Ollama
ollama serve
ollama pull qwen3:8b
ollama pull qwen2.5-coder:7b
ollama pull llama3.2:3b
ollama pull moondream:latest

npm run typecheck
npm run test:phase1
npm run test:phase2
npm run test:ollama
npm run test:engineering
npm run test:phase4
npm run test:phase5
npm run test:e2e-phase4-5
npm run test:phase6
npm run test:e2e-phase6
npm run test:phase7
npm run test:e2e-phase7
npm run test:phase8-9
npm run test:e2e-phase8-9
npm run test:all-phases
npm run kaira -- "Create Python program that prints 12"
```

## Configuration

| var | default | purpose |
|-----|---------|---------|
| `KAIRA_WORKSPACE` | `./workspace` | sandbox root |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `KAIRA_REASONING_MODEL` | `qwen3:8b` | reasoning |
| `KAIRA_CODING_MODEL` | `qwen2.5-coder:7b` | coding |
| `KAIRA_LIGHTWEIGHT_MODEL` | `llama3.2:3b` | lightweight |
| `KAIRA_AUTONOMY_LEVEL` | `ASSISTED` | autonomy SUPERVISED/ASSISTED/AUTONOMOUS/RESTRICTED |
| `KAIRA_MAX_ATTEMPTS` | `3` | max retries |
| `KAIRA_MAX_STDOUT_BYTES` | `100000` | stdout limit |
| `KAIRA_MEMORY_MAX_MEMORIES` | `10000` | max memories |
| `KAIRA_MEMORY_MAX_PER_OBJECTIVE` | `10` | max memories per objective |
| `KAIRA_MEMORY_MAX_TOKENS_PER_OBJECTIVE` | `4000` | max tokens per objective |
| `KAIRA_MEMORY_MAX_CHARS_PER_OBJECTIVE` | `12000` | max chars per objective |
| `KAIRA_MEMORY_MIN_CONFIDENCE` | `30` | min confidence |
| `KAIRA_MEMORY_PER_SCOPE_PROJECT` | `5` | per-scope limit PROJECT |
| `KAIRA_MEMORY_STALENESS_DAYS` | `90` | staleness days |
| `KAIRA_DURABLE_MAX_RUNTIME_MS` | `600000` | max runtime per durable run |
| `KAIRA_DURABLE_MAX_EXTERNAL_REQUESTS` | `50` | max external requests |
| `KAIRA_DURABLE_MAX_MODEL_CALLS` | `100` | max model calls |
| `KAIRA_DURABLE_MAX_CONCURRENT_JOBS` | `5` | max concurrent jobs |
| `KAIRA_RESEARCH_MAX_SOURCES` | `10` | max research sources |
| `KAIRA_RESEARCH_MAX_REQUESTS` | `20` | max research requests |
| `KAIRA_CONNECTOR_RATE_LIMIT` | `30` | connector rate limit per minute |
| `KAIRA_CREDENTIAL_<NAME>` | — | credential for connector |
| `KAIRA_ALLOW_DESTRUCTIVE` | `false` | allow destructive ops |

## Repository map (Phase 7+8+9)

```
src/agent/core/            Agent Core + state machine
src/agent/requirements/    Requirements extraction
src/agent/project/         Project abstractions: types, assumptions, acceptance, initialization, environment, projectPlanner
src/agent/taskGraph/       Task graph: types, graph, scheduler
src/agent/context/         Project context engineering
src/agent/workspace/       Project workspace management: workspace/projects/<id>/
src/agent/orchestrator/    Orchestrator: deterministic authoritative loop with memory integration OBJECTIVE→RETRIEVE→PLAN→EXECUTE→OBSERVE→VERIFY→EXTRACT→STORE, checkpointing
src/agent/verification/    Verification: engine + projectVerification holistic
src/agent/report/          Engineering report from actual history
src/agent/observation/     Observation subsystem
src/agent/diagnosis/       Diagnosis: classifier, context, diagnosis, repair, safeguards, escalation
src/agent/recovery/        Recovery loop
src/agent/execution/       Executor enhanced with observation/evidence
src/agent/state/           Persistence v4.0.0 + memory extension with durableRuns/scheduledJobs/monitoringJobs/researchJobs + memories/memoryEvents/memoryContradictions + Phase4-6 entities
src/agent/runtime/         Durable runtime: durableRun, scheduler, waitState, monitoring, heartbeat, resourceGovernance, orchestratorExtension, types
src/agent/research/        Research: types, source, engine, webAccess, provenance
src/agent/connectors/      Connectors: types, registry, credentials, rateLimiter, security
src/agent/events/          Event-driven: types, eventBus
src/agent/autonomy/        Autonomy policy: SUPERVISED/ASSISTED/AUTONOMOUS/RESTRICTED
src/agent/escalation/      Structured escalation: actionable escalations
src/agent/memory/          Memory Phase 7: types, secretDetector, validation, store, retrieval, index integration
src/agent/tools/           Tool registry + engineering tools + memoryPhase7 tools memory_propose/memory_retrieve/memory_audit
src/db/schema.ts           Drizzle schema extended with durable_runs, scheduled_jobs, monitoring_jobs, research_jobs, research_sources, external_actions, structured_escalations, events, connector_metadata, durable_memories, memory_lifecycle_events, memory_contradictions + Phase6 + Phase4-5 tables
scripts/kaira.ts           CLI kaira "<high-level objective>" with Phase 7+8+9 visibility: durable runs, scheduling, waiting, monitoring, research, connectors, escalation, observability, memory relevant why relevant/confidence/scope/provenance/influenced decision
scripts/test-phase7.ts     Phase 7 unit tests 27 checks (20 required)
scripts/test-e2e-phase7.ts E2E 9 scenarios 18 checks (9 required)
scripts/test-phase8-9.ts   Phase 8+9 unit/integration/security tests 56 checks
scripts/test-e2e-phase8-9.ts E2E 10 scenarios 15 checks
docs/phase-reports/        Phase reports including phase7.md and phase8-9.md
```

## Definition of Done (Phase 7+8+9)

Durable Knowledge + Controlled Long-Running Autonomy + Research/Web/External:

```
HIGH-LEVEL OBJECTIVE
↓ RETRIEVE RELEVANT MEMORY (objective→scope→search→rank→filter stale/invalid→bounded context→planner, ranking semantic relevance/project scope/tags/recency/confidence/validity/provenance/usefulness, project-specific outranks global, only relevant, bounded)
↓ CREATE DURABLE RUN (CREATED/QUEUED/RUNNING with autonomy policy, expiration, resource limits, survives restart, distinct from durable knowledge)
↓ PLANNING (requirements, assumptions, task graph, research questions, using memory context: conventions, architecture decisions, successful patterns, tool knowledge, env knowledge, constraints)
↓ SCHEDULER (immediate/delayed/scheduled/recurring/monitoring/retry-after/waiting/health checks, bounded, persistent, no infinite loop)
↓ TASK EXECUTION (bounded context, model/tool selection using memory, governance check STOP/ESCALATE, real tools with credential abstraction/rate limiting/security)
↓ OBSERVE/EVIDENCE/VERIFY (evidence chain traceable)
↓ IF RESEARCH NEEDED: DISCOVER→FETCH (web_fetch with SSRF protection, size limits, timeouts, provenance)→EXTRACT→NORMALIZE→COMPARE (contradictions)→ANALYZE→VERIFY (FACT OBSERVED vs MODEL INFERENCE vs UNVERIFIED CLAIM)→SYNTHESIZE→REPORT (provenance), depth control, research findings may become memory with finding/source/date/confidence/scope/validity+staleness
↓ IF WAITING: explicit WAIT states deployment/API/website change/scheduled time/approval/long command/dependency/external event, no wasteful model calls, polling deterministic, wakeup explicit
↓ IF MONITORING: what/how/polling interval/timeout/acceptable state/change detection/escalation/completion relying on observations
↓ VERIFY/COMPLETION DECISION (model claim NEVER proof, verified workspace state outranks stale memory)
↓ IF FAILED: CLASSIFY→DIAGNOSE→REPAIR→SAFEGUARDS→APPLY REPAIR→RETRY→OBSERVE→VERIFY, on successful repair EXTRACT REPAIR PATTERN→VALIDATE→STORE as REPAIR_PATTERN (suggest not blindly apply)
↓ EXTRACT LEARNING→VALIDATE MEMORY→STORE (NOT every observation, filter transient paths/credentials/secrets/noise/hallucinations, OBSERVATION→CANDIDATE→DETERMINISTIC FILTER→VALIDATION→STORE model proposes runtime decides value factors relevance/verification/recurrence/usefulness/stability/specificity/scope/confidence, types 14, metadata id/type/content/summary/scope/projectId/source/provenance/created/lastValidated/confidence/validity/tags/related tasks/tools/failures/repairs/supersedes/superseded_by, validity CANDIDATE/VALIDATED/ACTIVE/STALE/SUPERSEDED/INVALIDATED, provenance USER_PROVIDED/VERIFIED_OBSERVATION/VERIFIED_RESEARCH/SUCCESSFUL_EXECUTION/VERIFIED_REPAIR/SYSTEM_CONFIGURATION/INFERRED lower authority preserve evidence, authority verified workspace state outranks stale memory user instructions outrank memory verified external can supersede old, security secrets NEVER memory block/redact API keys/passwords/tokens/private keys/cookies/credentials, auditability MEMORY_PROPOSED/REJECTED/VALIDATED/STORED/RETRIEVED/USED/STALE/SUPERSEDED/INVALIDATED, context budget max memories/tokens/per-scope/stale/confidence threshold only relevant, effectiveness tracking retrieved/used/successful/contradicted/ignored/incorrect)
↓ CONTRADICTION DETECTION supersedes/different scope/stale/unresolved→escalate if material
↓ CHECKPOINT (idempotent creation/persistence/validation/loading/resume/recovery survives restart)
↓ HEARTBEAT (detect stalled RUNNING not silently remain RUNNING)
↓ RESOURCE GOVERNANCE (bounded limits → STOP/ESCALATE never bypass)
↓ EXTERNAL ACTIONS (connector registry deterministic policy checks READ auto if authorized MEDIUM/HIGH require checks high-risk require explicit authorization LLM cannot grant, credential security never in prompts/logs/observations/research/memory/reports, rate limiting)
↓ EVENTS (webhook/repo/deployment/scheduled/file change/API/monitoring → validate/authorize/correlate/create-resume/execute/verify/record no arbitrary shell)
↓ ESCALATION (structured reason/objective/state/attempted/evidence/options/recommended/decision required actionable)
↓ COMPLETED/FAILED/ESCALATED/CANCELLED/EXPIRED with full persistence and audit trail + memories survive restart

CLI: kaira "<high-level objective>" with visibility what doing, why, last observed, waiting for, next plan, attempts, external accessed, verified, why stopped + memory relevant why relevant/confidence/scope/provenance/influenced decision/proposed/rejected/superseded without sensitive content
```

Verified via:
- `npm run typecheck` — 0 errors
- `npm run test:all-phases` — PASS 4/4
- `npm run test:phase4` — PASS 61/61
- `npm run test:phase5` — PASS 43/43
- `npm run test:e2e-phase4-5` — PASS 32/32
- `npm run test:phase6` — PASS 56/56
- `npm run test:e2e-phase6` — PASS 7/7
- `npm run test:phase7` — PASS 27/27 (20 required: convention reuse, repair pattern reuse, contradiction detection, stale vs current state, project isolation, credential rejection, bounded retrieval hundreds, restart persistence, inferred lower authority)
- `npm run test:e2e-phase7` — PASS 18/18 (9 scenarios required)
- `npm run test:phase8-9` — PASS 56/56
- `npm run test:e2e-phase8-9` — PASS 15/15
- No hard-coded plans, no fake tool exec, no simulated verification, no model-only completion, no unrestricted shell/fs, no ignoring failed tasks, no infinite loops, no losing state, no fake browsing/fabricated results/simulated external success (mock only in marked test env), preserves Phase1-6 arch, external content is DATA never instruction, secrets NEVER memory
- Architecture configured for real Ollama (qwen3:8b, qwen2.5-coder:7b, llama3.2:3b via router), but live Ollama execution could not be verified from the Base44 sandbox (expected, Ollama runs locally on user machine, configurable via OLLAMA_BASE_URL)
