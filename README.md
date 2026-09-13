# KAIRA — Autonomous AI Worker/Agent

**A persistent, local-first, model-agnostic autonomous AI operator.**
Give her an objective — she plans, uses real tools, verifies her work, and reports back. No chatbot cosplay, no paid APIs required.

> v0.6 autonomous software engineering worker: transforms from single-operation executor to multi-step worker receiving high-level objective like "Create Python CLI calculator supporting + - * / with tests and verify" without user providing filenames/steps/commands/architecture. Project-level planning with objective/inferred requirements/assumptions/constraints/deliverables/tasks/dependencies/verification strategy/completion criteria/risks dynamic generation, task graph with PENDING/READY/RUNNING/BLOCKED/COMPLETED/FAILED/ESCALATED/CANCELLED, scheduler only READY, requirements extraction ID/description/category/priority/source/status/AC, assumption management risk LOW/MEDIUM/HIGH/CRITICAL escalation, orchestrator deterministic authoritative, context engineering bounded task-specific, project workspace management workspace/projects/<project-id>/, initialization detecting language, software development loop PLAN→IMPLEMENT→RUN→OBSERVE→TEST→VERIFY→DONE, code generation via router qwen2.5-coder:7b, reasoning qwen3:8b, change-aware, incremental, test generation meaningful, acceptance criteria explicit evidence-backed, project-level verification holistic, failure recovery across tasks, cross-task awareness, environment detection, checkpointing resumable, idempotency, sequential correctness>speed, git awareness no auto push, engineering report from actual history, security preserve Phase3-5, DB extend with projects/requirements/plans/decisions/task dependencies/checkpoints/acceptance criteria/reports, CLI kaira "<high-level objective>" with visibility.
> Built to grow into a multi-agent workforce — see `docs/ARCHITECTURE.md` and `docs/LOCAL_WINDOWS.md`.

## What is actually working (and tested)

### Phase 1 — Agent Core Foundation
- Model abstraction/router: qwen3:8b reasoning/planning, qwen2.5-coder:7b coding, llama3.2:3b lightweight, moondream vision
- Explicit agent states: IDLE, PLANNING, EXECUTING, OBSERVING, DIAGNOSING, REPAIRING, RETRYING, VERIFYING, WAITING, COMPLETED, FAILED, ESCALATED
- Task system, real tool system with 10+ tools, structured results, safety, logging, persistence

### Phase 2 — Autonomous Agent Core
- Objective/task system, planner via reasoning model, execution engine, failure recovery, verification layer, model routing, first real test calculator_test.py 5+7=12

### Phase 2.5 — Real Ollama Validation
- Real Ollama provider with env-configurable base URL, honest reporting when sandbox cannot reach local Ollama

### Phase 3 — Autonomous Engineering
- Engineering tool layer, workspace safety, engineering loop UNDERSTAND→INSPECT→PLAN→MODIFY→EXECUTE→TEST→OBSERVE→DIAGNOSE→REPAIR→RETRY→VERIFY→REPORT, model responsibilities, real code repair, context management, change tracking, verification expanded, engineering safety, tests A-F

### Phase 4 — Observation, Evidence & Verification (NEW)
- **Observation subsystem**: normalized observation per tool execution with actionId/objectiveId/taskId/runId/toolName/timestamp/duration/success/failure/exitCode/stdout/stderr/affectedFiles/created/modified/deleted/fileMetadata/error/env, configurable limits for stdout/stderr/fileContents/metadata/total size (KAIRA_MAX_STDOUT_BYTES etc)
- **Evidence model**: structured evidence with source/type/confidence, types COMMAND_EXIT_CODE/STDOUT/STDERR/FILE_EXISTS/FILE_CONTENT/FILE_METADATA/FILE_CREATED/FILE_MODIFIED/FILE_DELETED/TEST_RESULT/COMMAND_RESULT/VERIFICATION_RESULT, must originate from real observations not LLM (EvidenceFactory validates)
- **Verification engine**: reusable, deterministic, independent from LLM, with file checks (exists/not exists/not empty/contains/not contains/equals), command checks (exit 0/expected code/succeeds/output contains/equals), test checks (passes/fails/count), returning VerificationCheckResult checkId/type/status/expected/actual/evidence[]/message/duration/timestamp
- **Verification plans**: explicit JSON executable independently from LLM, serialize/parse, heuristic generation, deterministic execution
- **Completion decision**: model claim "I believe complete" is only CLAIM, system evaluates verification plan -> VERIFIED/FAILED/INCONCLUSIVE/BLOCKED, deterministic rules, task NOT COMPLETE on model claim alone, verifiedBy SYSTEM always
- **Evidence chain traceability**: Objective->Task->Action->Tool Execution->Observation->Evidence->Verification Check->Result->Completion Decision, fully auditable

### Phase 5 — Diagnosis, Repair & Recovery (NEW)
- **Loop**: EXECUTE->OBSERVE->VERIFY->FAIL->DIAGNOSE->REPAIR PLAN->APPLY REPAIR->RETRY->OBSERVE->VERIFY->SUCCESS/ESCALATION
- **Failure classification**: TOOL_FAILURE/COMMAND_FAILURE/SYNTAX_ERROR/RUNTIME_ERROR/TEST_FAILURE/VERIFICATION_FAILURE/MISSING_FILE/INVALID_OUTPUT/PERMISSION_DENIED/TIMEOUT/RESOURCE_LIMIT/SECURITY_VIOLATION/UNKNOWN_FAILURE with failureId/category/message/action/observation/evidence/severity/recoverability/timestamp, deterministic
- **Diagnosis subsystem**: focused bounded context (objective/task/history/failed action/observation/stderr/stdout/verification/file contents/recent changes/previous repairs), structured output failureCategory/rootCause/confidence/affectedFiles/relevantEvidence/recommendedRepair/isRecoverable/requiresHumanDecision, must reference actual evidence
- **Repair representation**: repairId/diagnosisId/objectiveId/taskId/intendedChanges/affectedFiles/commands/reason/riskLevel/expectedOutcome/verificationPlan/approvalRequired, inside workspace/security, validation
- **Repair execution**: via existing tool system policy->tool->observation->change tracking, model proposes, agent executes via authorized tools, never direct mutation
- **Safeguards**: max repair attempts per task, max retries per objective, max consecutive identical failures, no infinite loops, no repeated identical repairs without new evidence, workspace/command/file-size/timeout enforcement, SafeguardTracker
- **Retry strategy**: repair->retry original->observe->verify, not assume success
- **Escalation**: when permissions unavailable/policy violation/unsafe/unreliable diagnosis/retry exhausted/lacks info/human decision required, structured escalation result reason/evidence/attempted repairs/failed verification/recommended human action, never pretend solved
- **Recovery state machine**: integrate into existing AgentState, protect cyclic loops, observable/auditable via stateMachine history
- **Context management**: bounded contexts for planning/diagnosis/repair/verification with configurable limits (maxFileContentBytes, maxEvidenceCount, etc)
- **Change tracking**: reuse Phase3 system associate objective/task/run/diagnosis/repair/files
- **DB persistence**: observations/evidence/verification checks/results/completion decisions/failures/diagnoses/repair attempts/retry attempts/escalations with FK to objectives/tasks/runs/actions, migrations safe, JSON persistence extended to v2.0.0 + drizzle schema with new tables
- **Model routing**: reuse existing router reasoning qwen3:8b, coding qwen2.5-coder:7b, lightweight llama3.2:3b, no hard-coded logic, deterministic controls state/tool/permissions/boundaries/retry/timeouts/verification/evidence/completion/persistence/logging, LLM assists understanding/planning/diagnosing/repair proposing/code gen/verification criteria selection, never bypass

### Testing (Phase 4-6)
- Phase 4: 61 checks — observation, evidence, verification, completion decision, limits, persistence, traceability
- Phase 5: 43 checks — failure classification, diagnosis, repair, safeguards, escalation, persistence, no infinite loops
- E2E Phase4-5: 32 checks — E2E1 success prints 12, E2E2 auto repair, E2E3 escalation, E2E4 false success 13 vs 12
- Phase 6: 56 checks — requirements, assumptions, task graph, scheduler, context, workspace, acceptance, verification, checkpoint, report, planner, environment
- E2E Phase6: 7 checks — E2E1 simple prints 12 COMPLETED, E2E2 multi-file calculator with tests, E2E3 automatic recovery from deliberate error, E2E4 cross-task dependency scheduler, E2E5 resume after interruption checkpoint, E2E6 verification prevents false completion, E2E7 escalation for unauthorized operation
- All previous phases still PASS, typecheck 0 errors, backward compatible, safe migrations v3.0.0

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
| `KAIRA_MAX_ATTEMPTS` | `3` | max retries |
| `KAIRA_MAX_STDOUT_BYTES` | `100000` | stdout limit |
| `KAIRA_MAX_STDERR_BYTES` | `100000` | stderr limit |
| `KAIRA_MAX_FILE_CONTENT_BYTES` | `500000` | file content limit |
| `KAIRA_MAX_TOTAL_OBSERVATION_BYTES` | `1000000` | total observation |
| `KAIRA_MAX_REPAIR_ATTEMPTS_PER_TASK` | `3` | repair limit per task |
| `KAIRA_MAX_RETRIES_PER_OBJECTIVE` | `10` | retries per objective |
| `KAIRA_MAX_CONSECUTIVE_IDENTICAL_FAILURES` | `3` | identical failure limit |

## Repository map (Phase 6)

```
src/agent/core/            Agent Core + state machine with Phase6 transitions
src/agent/requirements/    Requirements extraction: types, extractor (heuristic + LLM)
src/agent/project/         Project abstractions: types, assumptions, acceptance, initialization, environment, projectPlanner
src/agent/taskGraph/       Task graph: types, graph, scheduler
src/agent/context/         Project context engineering: bounded task-specific context
src/agent/workspace/       Project workspace management: workspace/projects/<id>/
src/agent/orchestrator/    Orchestrator: deterministic authoritative loop, checkpointing
src/agent/verification/    Verification: engine + projectVerification holistic
src/agent/report/          Engineering report from actual history
src/agent/observation/     Observation subsystem: types, limits, collector, evidence
src/agent/diagnosis/       Diagnosis: types, classifier, context, diagnosis, repair, safeguards, escalation
src/agent/recovery/        Recovery loop
src/agent/execution/       Executor enhanced with observation/evidence
src/agent/state/           Persistence v3.0.0 with projects/requirements/plans/decisions/checkpoints/reports + Phase4-5 entities
src/db/schema.ts           Drizzle schema extended with projects, project_plans, requirements, acceptance_criteria, assumptions, task_graphs, project_tasks, checkpoints, engineering_reports + Phase4-5 tables
scripts/kaira.ts           CLI kaira "<high-level objective>" with visibility
scripts/test-phase6.ts     Phase 6 unit/integration/security tests 56 checks
scripts/test-e2e-phase6.ts E2E1-7 mandatory 7 checks
docs/phase-reports/        Phase reports including phase6.md
```

## Definition of Done (Phase 6)

Autonomous Software Engineering Worker can take high-level objective like "Create Python CLI calculator supporting + - * / with tests and verify" without filenames/steps/commands/architecture:

```
HIGH-LEVEL OBJECTIVE (e.g. "Create Python CLI calculator supporting + - * / with tests and verify")
↓ EXTRACT REQUIREMENTS (ID/description/category/priority/source/status/AC, distinguish USER_PROVIDED/INFERRED)
↓ PROJECT PLANNING (objective/inferred requirements/assumptions/constraints/deliverables/tasks/dependencies/verification strategy/completion criteria/risks, dynamic generation via qwen3:8b + heuristic fallback)
↓ TASK GRAPH (unique ID/objective ID/description/type/status PENDING/READY/RUNNING/BLOCKED/COMPLETED/FAILED/ESCALATED/CANCELLED/priority/dependencies/dependents/inputs/expected outputs/verification requirements/attempts/timestamps/result/failure, scheduler only READY)
↓ ASSUMPTION MANAGEMENT (assumption/reason/confidence/risk LOW/MEDIUM/HIGH/CRITICAL/affected tasks/approval required, high-risk escalate)
↓ ORCHESTRATOR LOOP (deterministic authoritative, LLM not directly controlling state machine):
  PLAN→IMPLEMENT→RUN→OBSERVE→TEST→VERIFY→DONE
  For each READY task:
    - Build bounded task-specific context (objective, requirements, current task, dependencies, relevant files, recent changes, previous attempts, verification, errors) with configurable limits
    - Select model/tool (reasoning qwen3:8b, coding qwen2.5-coder:7b, lightweight llama3.2:3b via router abstraction)
    - Execute via authorized tool layer (real tools, workspace safety)
    - Observe normalized observation, evidence from real observation
    - Verify task (file exists, not empty, tests pass)
    - Mark status, unlock dependents, checkpoint
    - On failure: failure classification → diagnosis (bounded context, must reference evidence) → repair plan (safe, risk assessment) → apply repair via policy→tool→observation → retry → verify
  Cross-task awareness current workspace authoritative, change-aware, incremental, idempotency, sequential correctness>speed, git awareness no auto push
↓ PROJECT-LEVEL VERIFICATION HOLISTIC (required files exist, functionality works, tests pass, commands succeed, acceptance criteria pass, no incomplete tasks, no critical failures, deterministic completion, LLM cannot declare complete alone, prevents false completion)
↓ ENGINEERING REPORT FROM ACTUAL HISTORY (objective/requirements/assumptions/tasks/files created/modified/tests/verification/repairs/retries/unresolved/final status)
↓ COMPLETED/FAILED/ESCALATED with checkpoint resumable, persistence v3.0.0, full audit trail

CLI: kaira "<high-level objective>" with visibility Objective/Project/Current task/Progress/State/Tool/Verification/Recovery/Final result
```

Verified via:
- `npm run typecheck` — 0 errors
- `npm run test:all-phases` — PASS 4/4
- `npm run test:phase4` — PASS 61/61
- `npm run test:phase5` — PASS 43/43
- `npm run test:e2e-phase4-5` — PASS 32/32
- `npm run test:phase6` — PASS 56/56
- `npm run test:e2e-phase6` — PASS 7/7 (E2E1-7 mandatory)
- E2E1 simple prints 12 COMPLETED, E2E2 multi-file calculator with tests, E2E3 automatic recovery, E2E4 cross-task dependency scheduler, E2E5 resume after interruption checkpoint, E2E6 verification prevents false completion, E2E7 escalation for unauthorized operation
- No hard-coded plans, no fake tool exec, no simulated verification, no model-only completion, no unrestricted shell/fs, no ignoring failed tasks, no infinite loops, no losing state, preserves Phase1-5 arch
- Architecture configured for real Ollama (qwen3:8b, qwen2.5-coder:7b, llama3.2:3b via router), but live Ollama execution could not be verified from the Base44 sandbox (expected, Ollama runs locally on user machine, configurable via OLLAMA_BASE_URL)
