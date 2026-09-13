# Kaira — Architecture (v0.6 autonomous software engineering worker)

Kaira is a **persistent, local-first, model-agnostic autonomous AI operator** capable of multi-step software engineering from high-level objectives.
This document is the contract for how the foundation works and how it grows, updated for Phase 1-6.

## Design commitments (non-negotiable)

1. **Real work or honest failure.** No simulated capabilities. Every tool executes for real; every claim is backed by actual file existence, real command output, or a live health check. If the model backend is unreachable, the system says so and pauses safely — it never pretends to think. The model's response is NOT considered completion — completion means requested work was actually performed and verified via evidence. Model claim "I believe complete" is only CLAIM, system evaluates verification plan -> VERIFIED/FAILED/INCONCLUSIVE/BLOCKED deterministically.
2. **Model-agnostic.** The engine only sees the `ModelProvider` interface and `ModelRouter`. Swapping models/providers requires zero engine changes. Router maps task types to models without requiring all models loaded simultaneously. Reasoning→qwen3:8b, coding→qwen2.5-coder:7b, lightweight→llama3.2:3b.
3. **Local-first.** Default stack runs fully offline: Ollama + workspace sandbox (+ optional PostgreSQL for legacy). No paid API is required. Ollama base URL configurable via env.
4. **Persistence over process.** All state lives in JSON (or SQLite) and/or PostgreSQL. Processes are disposable and resumable. Task state survives crashes. Phase 4-5 adds observations, evidence, verification, failures, diagnoses, repairs, escalations with FK relationships.
5. **Modular growth.** New capabilities = new tool registrations or new providers, never engine rewrites.
6. **Safety first.** Workspace root enforced, path traversal rejected, symlink escapes checked, permission levels, timeouts, retry limits, no auto destructive ops. Repair must go through policy→tool→observation→change tracking, model proposes, agent executes. Deterministic controls state/tool/permissions/boundaries/retry/timeouts/verification/evidence/completion/persistence/logging; LLM assists understanding/planning/diagnosing/repair proposing/code gen/verification criteria selection, never bypass.
7. **Evidence-based.** Evidence must originate from real observations, not LLM fabrication. Verification plan explicit JSON executable independently from LLM. Completion based on evidence, not model claim alone. Evidence chain traceability Objective->Task->Action->Tool Execution->Observation->Evidence->Verification Check->Result->Completion Decision.

## System layers (Phase 5)

```
┌─────────────────────────────────────────────────────────────┐
│  CONTROL PLANE (Next.js) — legacy + new                     │
│  Mission Control UI · Tool Bench · Memory · Settings        │
│  REST API: objectives / runs / tools / memories / settings  │
└──────────────┬──────────────────────────────┬───────────────┘
               │ drives                       │ manages
┌──────────────▼──────────────────────────────▼───────────────┐
│  AGENT CORE (src/agent/core/agentCore.ts) — Phase 1-5      │
│  OBJECTIVE → UNDERSTAND → PLAN (with verification plan) →   │
│  TASK → SELECT TOOL → EXECUTE → OBSERVE (normalized) →      │
│  EVIDENCE (from real observation) → EVALUATE →              │
│  SUCCESS → VERIFY (deterministic engine) →                  │
│  COMPLETION DECISION (VERIFIED/FAILED/INCONCLUSIVE/BLOCKED) │
│  FAILURE → CLASSIFY → DIAGNOSE (bounded context) →          │
│  REPAIR PLAN (safe, risk assessment) →                      │
│  APPLY REPAIR (policy->tool->observation) →                 │
│  RETRY → OBSERVE → VERIFY → SUCCESS/ESCALATION              │
│  Explicit state machine, structured logging, persistence    │
└───────┬──────────────────────────┬──────────────────────────┘
        │ ModelRouter              │ ToolRegistry (engineering)
┌───────▼────────┐        ┌────────▼─────────────────────────┐
│ MODEL LAYER     │        │ TOOLS (real, validated, safe)    │
│ ModelProvider   │        │ list_directory, read_file,       │
│ OllamaProvider  │        │ write_file, create_directory,    │
│ OpenAICompat    │        │ file_exists, delete_file,        │
│ ScriptedProvider│        │ move_file, run_python,           │
│ ModelRouter     │        │ run_command, get_working_directory│
│  reasoning→qwen3:8b│      │ + engineering: inspect_tree,     │
│  coding→qwen2.5-coder:7b│ │ modify_file, verify_file,        │
│  lightweight→llama3.2:3b│ │ run_test, run_linter, typecheck  │
│  vision→moondream   │    │ + legacy: fs_*, shell_exec,      │
│                     │    │ http_fetch, memory_*             │
└─────────────────┘        └────────┬──────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────┐
│ OBSERVATION & EVIDENCE (Phase 4)                             │
│ ObservationCollector: normalized per tool execution          │
│ actionId/objectiveId/taskId/runId/toolName/timestamp/        │
│ duration/success/failure/exitCode/stdout/stderr/             │
│ affectedFiles/created/modified/deleted/fileMetadata/error/env│
│ EvidenceFactory: fromObservation → structured evidence       │
│ source/type/confidence, types COMMAND_EXIT_CODE/STDOUT/etc   │
│ Limits: stdout/stderr/fileContents/metadata/total size       │
│ ObservationLimiter configurable via env                      │
└───────────────────────────────────┬──────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────┐
│ VERIFICATION (Phase 4)                                       │
│ VerificationEngine: deterministic, independent from LLM      │
│ File checks: exists/not exists/not empty/contains/not contains/equals│
│ Command checks: exit 0/expected code/succeeds/output contains/equals│
│ Test checks: passes/fails/count                              │
│ VerificationPlan: explicit JSON, executable independently    │
│ VerificationPlanParser: parse/serialize/heuristicPlan        │
│ CompletionDecisionEngine: VERIFIED/FAILED/INCONCLUSIVE/BLOCKED│
│ Model claim NEVER proof, verifiedBy SYSTEM                   │
└───────────────────────────────────┬──────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────┐
│ DIAGNOSIS & REPAIR (Phase 5)                                 │
│ FailureClassifier: TOOL_FAILURE/COMMAND_FAILURE/SYNTAX_ERROR/│
│ RUNTIME_ERROR/TEST_FAILURE/VERIFICATION_FAILURE/MISSING_FILE/│
│ INVALID_OUTPUT/PERMISSION_DENIED/TIMEOUT/RESOURCE_LIMIT/     │
│ SECURITY_VIOLATION/UNKNOWN_FAILURE                           │
│ DiagnosisEngine: bounded context, must reference evidence    │
│ RepairEngine: safe, inside workspace, riskLevel, approval    │
│ SafeguardTracker: max repair per task, max retries per obj,  │
│ max consecutive identical, no repeat identical without new evidence│
│ EscalationEngine: structured escalation, never pretend solved│
│ ContextManager: bounded contexts for planning/diagnosis/repair/verification│
│ RecoveryLoop: full loop EXECUTE->OBSERVE->VERIFY->FAIL->DIAGNOSE->REPAIR->RETRY│
└───────────────────────────────────┬──────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────┐
│ STATE & LOGGING & PERSISTENCE (Phase 1-5)                    │
│ JSON persistence v2.0.0: workspace/.kaira/agent_state.json   │
│ Contains: objectives, tasks, observations, evidence,         │
│ verificationPlans, verificationResults, completionDecisions, │
│ failures, diagnoses, repairs, escalations, retryAttempts     │
│ FK relationships, migrations safe from v1.0.0                │
│ Drizzle schema: new tables observations, evidence,           │
│ verification_plans, verification_results, completion_decisions,│
│ failures, diagnoses, repairs, escalations, retry_attempts    │
│ Structured logger: objective, plan, task, tool, result,      │
│ failure, diagnosis, repair, retry, verification, completion, │
│ escalation, observation, evidence, correlation IDs           │
└──────────────────────────────────────────────────────────────┘

PLANNING:   src/agent/planning/planner.ts — reasoning model → structured plan
EXECUTION:  src/agent/execution/executor.ts — task → tool → observe (with observation/evidence) → evaluate
OBSERVATION: src/agent/observation/ — collector, limiter, evidence factory
VERIFICATION: src/agent/verification/ — engine, plan parser, decision engine, legacy verifier
DIAGNOSIS:  src/agent/diagnosis/ — classifier, context manager, diagnosis engine, repair engine, safeguards, escalation
RECOVERY:   src/agent/recovery/recoveryLoop.ts — full recovery loop, state machine integration
CONFIG:     src/agent/config/index.ts — workspace, models, safety, observation limits, context limits, Ollama URL
```

## Core Agent Loop (Phase 5)

```
OBJECTIVE
↓
UNDERSTAND (reasoning model qwen3:8b, bounded context)
↓
PLAN (reasoning model → structured tasks + verification plan JSON explicit, executable independently)
↓
TASK (create Task objects with dependencies, priority, maxAttempts)
↓
SELECT TOOL (heuristic + reasoning model)
↓
EXECUTE (real tool execution via ToolRegistry, policy check)
↓
OBSERVE (normalized Observation per tool execution: actionId/objectiveId/taskId/runId/toolName/timestamp/duration/success/failure/exitCode/stdout/stderr/affectedFiles/created/modified/deleted/fileMetadata/error/env, with configurable limits)
↓
EVIDENCE (structured Evidence from real Observation, source/type/confidence, types COMMAND_EXIT_CODE/STDOUT/STDERR/FILE_EXISTS/etc, must originate from real observations not LLM)
↓
EVALUATE (SUCCESS → VERIFY, FAILURE → CLASSIFY)
↓
VERIFY (VerificationEngine deterministic, independent from LLM, executes VerificationPlan: file exists/not exists/not empty/contains/not contains/equals, command exit 0/expected code/succeeds/output contains/equals, test passes/fails/count → VerificationCheckResult checkId/type/status/expected/actual/evidence[]/message/duration/timestamp → VerificationResult)
↓
COMPLETION DECISION (CompletionDecisionEngine deterministic: model claim "I believe complete" is only CLAIM, system evaluates verification plan -> VERIFIED/FAILED/INCONCLUSIVE/BLOCKED, task NOT COMPLETE on model claim alone, verifiedBy SYSTEM)
↓
IF VERIFIED → COMPLETE with evidence chain traceability
↓
IF FAILED:
  CLASSIFY FAILURE (FailureClassifier deterministic: TOOL_FAILURE/COMMAND_FAILURE/SYNTAX_ERROR/RUNTIME_ERROR/TEST_FAILURE/VERIFICATION_FAILURE/MISSING_FILE/INVALID_OUTPUT/PERMISSION_DENIED/TIMEOUT/RESOURCE_LIMIT/SECURITY_VIOLATION/UNKNOWN_FAILURE with failureId/category/message/action/observation/evidence/severity/recoverability/timestamp)
  ↓
  DIAGNOSE (DiagnosisEngine with bounded focused context: objective/task/history/failed action/observation/stderr/stdout/verification/file contents/recent changes/previous repairs, structured output failureCategory/rootCause/confidence/affectedFiles/relevantEvidence/recommendedRepair/isRecoverable/requiresHumanDecision, must reference actual evidence)
  ↓
  REPAIR PLAN (RepairEngine: model proposes, deterministic validation inside workspace/security, repairId/diagnosisId/objectiveId/taskId/intendedChanges/affectedFiles/commands/reason/riskLevel/expectedOutcome/verificationPlan/approvalRequired)
  ↓
  SAFEGUARDS CHECK (SafeguardTracker: max repair attempts per task, max retries per objective, max consecutive identical failures, no infinite loops, no repeated identical repairs without new evidence)
  ↓
  APPLY REPAIR (via existing tool system policy->tool->observation->change tracking, model proposes, agent executes, never direct mutation)
  ↓
  RETRY (retry original task, observe, verify, not assume success)
  ↓
  OBSERVE → VERIFY → SUCCESS (VERIFIED) or ESCALATION
↓
ESCALATION (EscalationEngine: when permissions unavailable/policy violation/unsafe/unreliable diagnosis/retry exhausted/lacks info/human decision required, structured escalation result reason/evidence/attempted repairs/failed verification/recommended human action, never pretend solved)
↓
COMPLETE/FAILED/ESCALATED with full persistence and audit trail
```

## Agent States (explicit, Phase 5)

```
IDLE → PLANNING → EXECUTING → OBSERVING → VERIFYING → COMPLETED
                              ↘ DIAGNOSING → REPAIRING → RETRYING → EXECUTING → OBSERVING → VERIFYING → COMPLETED
                              ↘ WAITING
                              → FAILED / ESCALATED → IDLE
```

All transitions logged, observable/auditable, protected against cyclic loops.

## Observation & Evidence

### Observation
```ts
interface Observation {
  id: string;
  actionId: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  toolName: string;
  timestamp: string;
  durationMs: number;
  success: boolean;
  failureReason?: string;
  exitCode?: number | null;
  stdout?: string;
  stdoutTruncated: boolean;
  stderr?: string;
  stderrTruncated: boolean;
  outputCombined?: string;
  affectedFiles: string[];
  createdFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  fileMetadata: FileMetadata[];
  error?: string;
  env?: Record<string, string>;
  totalSizeBytes: number;
  truncated: boolean;
}
```

### Evidence
```ts
type EvidenceType = COMMAND_EXIT_CODE | STDOUT | STDERR | FILE_EXISTS | FILE_CONTENT | FILE_METADATA | FILE_CREATED | FILE_MODIFIED | FILE_DELETED | TEST_RESULT | COMMAND_RESULT | VERIFICATION_RESULT;
type EvidenceSource = TOOL_EXECUTION | FILE_SYSTEM | COMMAND | VERIFICATION | SYSTEM;

interface Evidence {
  id: string;
  observationId: string;
  actionId: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  source: EvidenceSource;
  type: EvidenceType;
  confidence: number;
  timestamp: string;
  data: unknown;
  filePath?: string;
  message: string;
}
```

EvidenceFactory ensures evidence originates from real observations, validates chain.

### Limits
Configurable via env:
- KAIRA_MAX_STDOUT_BYTES, KAIRA_MAX_STDERR_BYTES, KAIRA_MAX_FILE_CONTENT_BYTES, KAIRA_MAX_METADATA_ENTRIES, KAIRA_MAX_TOTAL_OBSERVATION_BYTES, KAIRA_MAX_AFFECTED_FILES
- Enforced deterministically, no LLM bypass, truncation with markers.

## Verification

### Checks
- FILE_EXISTS, FILE_NOT_EXISTS, FILE_NOT_EMPTY, FILE_CONTAINS, FILE_NOT_CONTAINS, FILE_EQUALS
- COMMAND_EXIT_ZERO, COMMAND_EXIT_CODE, COMMAND_SUCCEEDS, COMMAND_OUTPUT_CONTAINS, COMMAND_OUTPUT_EQUALS
- TEST_PASSES, TEST_FAILS, TEST_COUNT

### Result
```ts
interface VerificationCheckResult {
  checkId: string;
  type: VerificationCheckType;
  status: PASSED | FAILED | INCONCLUSIVE | BLOCKED | SKIPPED;
  expected: string;
  actual: string;
  evidence: Evidence[];
  message: string;
  durationMs: number;
  timestamp: string;
}
```

### Plan
Explicit JSON, executable independently from LLM, heuristic fallback, parse/serialize.

### Completion Decision
```ts
type CompletionDecisionStatus = VERIFIED | FAILED | INCONCLUSIVE | BLOCKED;

interface CompletionDecision {
  id: string;
  objectiveId: string;
  runId: string;
  status: CompletionDecisionStatus;
  modelClaim?: string;
  verificationResultId: string;
  evidenceChainIds: string[];
  reason: string;
  verifiedBy: "SYSTEM";
}
```

Model claim NEVER proof. Deterministic rules. Task NOT COMPLETE on model claim alone.

## Diagnosis & Repair

### Failure
```ts
type FailureCategory = TOOL_FAILURE | COMMAND_FAILURE | SYNTAX_ERROR | RUNTIME_ERROR | TEST_FAILURE | VERIFICATION_FAILURE | MISSING_FILE | INVALID_OUTPUT | PERMISSION_DENIED | TIMEOUT | RESOURCE_LIMIT | SECURITY_VIOLATION | UNKNOWN_FAILURE;

interface Failure {
  id: string;
  category: FailureCategory;
  message: string;
  actionId: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  observationId: string;
  evidence: Evidence[];
  severity: LOW | MEDIUM | HIGH | CRITICAL;
  recoverability: RECOVERABLE | NON_RECOVERABLE | REQUIRES_HUMAN;
  timestamp: string;
}
```

### Diagnosis
Bounded context, must reference evidence.
```ts
interface Diagnosis {
  id: string;
  failureId: string;
  failureCategory: FailureCategory;
  rootCause: string; // must mention evidence types
  confidence: number;
  affectedFiles: string[];
  relevantEvidence: Evidence[];
  recommendedRepair: string;
  isRecoverable: boolean;
  requiresHumanDecision: boolean;
  contextSummary: string;
}
```

### Repair
Safe, inside workspace, risk assessment.
```ts
interface Repair {
  id: string;
  diagnosisId: string;
  objectiveId: string;
  taskId: string;
  intendedChanges: string;
  affectedFiles: string[];
  commands: string[];
  reason: string;
  riskLevel: LOW | MEDIUM | HIGH | CRITICAL;
  expectedOutcome: string;
  verificationPlan?: VerificationPlan;
  approvalRequired: boolean;
  executed: boolean;
  executionResult?: { success, observationId, evidenceIds, message };
}
```

Execution via policy->tool->observation->change tracking, model proposes, agent executes.

### Safeguards
- maxRepairAttemptsPerTask (default 3)
- maxRetriesPerObjective (default 10)
- maxConsecutiveIdenticalFailures (default 3)
- noRepeatIdenticalRepairWithoutNewEvidence
- workspace/command/file-size/timeout enforcement
- SafeguardTracker observable

### Escalation
Structured, never pretend solved.
```ts
interface Escalation {
  id: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  failureId: string;
  reason: string;
  evidence: Evidence[];
  attemptedRepairs: Repair[];
  failedVerificationResults: VerificationResult[];
  recommendedHumanAction: string;
  severity: FailureSeverity;
}
```

Triggers: permissions unavailable, policy violation, unsafe, unreliable diagnosis, retry exhausted, lacks info, human decision required.

### Recovery Loop
`src/agent/recovery/recoveryLoop.ts` implements full loop with state machine integration, observable/auditable, protects cyclic loops.

## Context Management

Bounded contexts with configurable limits:
- maxFileContentBytes, maxEvidenceCount, maxRecentChanges, maxStdoutBytes, maxStderrBytes, maxHistoryEntries
- Env: KAIRA_CONTEXT_MAX_*

Ensures no blind repo dump, focused relevant context.

## Persistence (Phase 5)

- JSON v2.0.0 with migration from v1.0.0, contains all Phase 4-5 entities with FK relationships
- Drizzle schema extended with tables observations, evidence, verification_plans, verification_results, completion_decisions, failures, diagnoses, repairs, escalations, retry_attempts, all with FK to objectives/tasks/runs/actions, indexes
- Methods saveObservation, saveEvidenceBatch, saveVerificationPlan, saveVerificationResult, saveCompletionDecision, saveFailure, saveDiagnosis, saveRepair, saveEscalation, saveRetryAttempt, getters by objective/task/observation

## Model Routing & Deterministic vs LLM

- Deterministic controls: state transitions, tool execution, permissions, workspace boundaries, retry limits, timeouts, verification execution, evidence collection, completion decisions, persistence, audit logging
- LLM assists: understanding, planning, diagnosing, repair proposing, code gen, verification criteria selection
- Router: reasoning→qwen3:8b, coding→qwen2.5-coder:7b, lightweight→llama3.2:3b, vision→moondream, env-configurable, no hard-coded logic, does not require all models loaded simultaneously
- Never allow LLM to bypass deterministic controls

## Testing (Phase 5)

- Phase 1: PASS
- Phase 2: PASS
- Phase 2.5 Ollama: PASS (architecture validated)
- Phase 3 engineering A-F: PASS (37 checks)
- Phase 4: PASS (61 checks) — observation, evidence, verification, completion decision, limits, persistence, traceability
- Phase 5: PASS (43 checks) — failure classification, diagnosis, repair, safeguards, escalation, persistence, no infinite loops
- E2E 1-4: PASS (32 checks) — E2E1 success with evidence, E2E2 auto repair, E2E3 escalation, E2E4 false success caught
- All phases: PASS (7/7)
- Typecheck: 0 errors

## Phase 6 — Autonomous Software Engineering

### Project Abstractions
- Project: id/objectiveId/title/description/objective/status/projectType/workspacePath/requirements/plan/taskGraphId/currentTaskId/completed/failed/pending/acceptanceCriteria/assumptions/deliverables/checkpoints
- ProjectPlan: objective/inferredRequirements/assumptions/constraints/deliverables/taskGraphId/verificationStrategy/completionCriteria/riskConsiderations
- Requirement: ID/description/category FUNCTIONAL/TECHNICAL/QUALITY/priority/source USER_PROVIDED/INFERRED/status/acceptance criteria
- Assumption: assumption/reason/confidence/risk LOW/MEDIUM/HIGH/CRITICAL/affected tasks/approval required, high-risk escalation
- Deliverable: description/filePath/type FILE/DIRECTORY/TEST/CONFIG/DOCUMENTATION/required/status

### Task Graph
- ProjectTask: unique ID/objectiveId/projectId/description/type/status PENDING/READY/RUNNING/BLOCKED/COMPLETED/FAILED/ESCALATED/CANCELLED/priority/dependencies/dependents/inputs/expected outputs/verification requirements/attempts/timestamps/result/failure
- TaskGraphManager: dependency model, dependents auto-built, READY detection (deps COMPLETED), BLOCKED when failed dep, cycle detection DFS, idempotency check file exists, serialize/deserialize
- TaskScheduler: only READY execution, sequential correctness>speed, getNextReadyTask/canExecute/markRunning/Completed/Failed/Escalated/getProgress, designed for future parallelism

### Orchestrator
- Deterministic authoritative, LLM not directly controlling state machine
- Loads objective/requirements/plan, ensures workspace/projects/<project-id>/, initialization detecting language, environment detection via spawnSync, assumption high-risk escalation
- Loop: identify READY -> select tool (heuristic + LLM coding qwen2.5-coder:7b) -> execute via authorized tool layer -> observe -> verify -> mark -> unlock dependents -> recover via Phase5 loop -> checkpoint -> final holistic verification -> engineering report
- Software development loop PLAN→IMPLEMENT→RUN→OBSERVE→TEST→VERIFY→DONE and failure loop
- Change-aware via observation created/modified files, cross-task awareness current workspace authoritative
- Idempotency, checkpointing resumable, Git awareness without auto push, security preserved

### Context Engineering
- Task-specific bounded context with configurable limits objective/requirements/current task/dependencies/relevant files/recent changes/previous attempts/verification/errors
- Limits from config.context maxFileContentBytes/maxEvidenceCount/maxRecentChanges/maxStdoutBytes/maxStderrBytes/maxHistoryEntries/maxRelevantFiles, not entire project dump
- formatForPrompt for LLM

### Workspace Management
- workspace/projects/<project-id>/ with source/tests/config etc, structure determined by objective, determineProjectType PYTHON/NODE/TYPESCRIPT/GENERIC/MIXED via keywords
- Security: normalizedRoot startsWith, traversal blocked, symlink escape checked
- initializeStructure, listProjectFiles, getFileContent, fileExists, getGitInfo via git commands, no auto push

### Verification Holistic
- ProjectVerificationEngine: required files exist, functionality works (hasSuccess observation), tests pass, commands succeed, acceptance criteria pass, no incomplete tasks, no critical failures, deterministic completion, LLM cannot declare complete alone, prevents false completion
- AcceptanceCriteriaManager deriveFromRequirements, verify FILE_EXISTS/COMMAND_OUTPUT/TEST_PASS/MANUAL with evidence-backed

### Checkpointing & Report
- CheckpointManager persist objective/plan/requirements/task graph/current/completed/pending/attempts/verification/failures/repairs/changes, canResume, resumeFromCheckpoint
- EngineeringReportGenerator from actual history objective/requirements/assumptions/tasks/files created/modified/tests/verification/repairs/retries/unresolved/final status, formatAsText

### Persistence v3.0.0
- Migration safe from v1.0.0/v2.0.0, adds projects/projectPlans/requirements/acceptanceCriteria/assumptions/taskGraphs/projectTasks/checkpoints/engineeringReports with FK relationships
- Drizzle schema extends with enums project_status/project_type/requirement_category/priority/source/status/project_task_status/type/assumption_risk/status and tables projects/project_plans/requirements/acceptance_criteria/assumptions/task_graphs/project_tasks/checkpoints/engineering_reports

### CLI
- scripts/kaira.ts kaira "<high-level objective>" with visibility Objective/Project/Current task/Progress/State/Tool/Verification/Recovery/Final result, progress interval, engineering report, exit codes

### Testing Phase 6
- Unit/integration/security: test-phase6.ts 56 checks PASS
- E2E: test-e2e-phase6.ts 7 checks PASS covering E2E1 simple prints 12 COMPLETED, E2E2 multi-file calculator with tests, E2E3 recovery from deliberate error, E2E4 cross-task dependency scheduler, E2E5 resume after interruption checkpoint, E2E6 verification prevents false completion, E2E7 escalation for unauthorized operation

## Safety & Observability (Phase 6)

- Permission levels, workspace boundaries, symlink protection, command timeout, output size limits, file size limits, max patch size, prevent recursive deletion, destructive config KAIRA_ALLOW_DESTRUCTIVE
- Structured logger with correlation IDs objectiveId/projectId/taskId/runId/actionId, no secrets, includes project_verification/assumption_created/task_graph_created/checkpoint_created/project_task_execution
- State machine history auditable, evidence chain traceable Objective->Task->Action->Tool Execution->Observation->Evidence->Verification Check->Result->Completion Decision->Project Verification
- No infinite loops via SafeguardTracker and maxIterations tasks.size*5
- Change tracking with objective/task/run/diagnosis/repair/files, Git info if available, no auto push
- Honest reporting when Ollama unreachable: Architecture configured for real Ollama, but live Ollama execution could not be verified from the Base44 sandbox
- Assumption escalation for high-risk operations (delete data) must escalate, tool security blocks path escapes
