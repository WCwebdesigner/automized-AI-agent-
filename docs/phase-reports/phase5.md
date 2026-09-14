# Phase 5 Report — Diagnosis, Repair & Recovery

## Implemented

### 5.1 Failure classification
- File: `src/agent/diagnosis/types.ts` — FailureCategory TOOL_FAILURE/COMMAND_FAILURE/SYNTAX_ERROR/RUNTIME_ERROR/TEST_FAILURE/VERIFICATION_FAILURE/MISSING_FILE/INVALID_OUTPUT/PERMISSION_DENIED/TIMEOUT/RESOURCE_LIMIT/SECURITY_VIOLATION/UNKNOWN_FAILURE, Failure with failureId/category/message/action/observation/evidence/severity/recoverability/timestamp, toolName/exitCode/stdout/stderr/filePath/verificationResultId
- File: `src/agent/diagnosis/classifier.ts` — FailureClassifier.classify deterministic based on lowerOutput, exitCode, toolName, verificationResult, handles security violation, permission denied, timeout, syntax error, missing file, test failure, verification failure, command failure, runtime error, invalid output, resource limit, isRecoverable, requiresHuman

### 5.2 Diagnosis subsystem
- File: `src/agent/diagnosis/context.ts` — ContextManager with DEFAULT_CONTEXT_LIMITS maxFileContentBytes/maxEvidenceCount/maxRecentChanges/maxStdoutBytes/maxStderrBytes/maxHistoryEntries, buildDiagnosisContext bounded, buildPlanningContext, buildRepairContext, buildVerificationContext, truncates stdout/stderr/file contents, limits evidence/recent changes
- File: `src/agent/diagnosis/diagnosis.ts` — DiagnosisEngine.diagnose deterministic classification + LLM assistance for root cause, heuristicDiagnosis per category must reference evidence types (Evidence: ...), extractAffectedFiles includes observation.affectedFiles, fileContents, evidence.filePath, failedAction regex, selectRelevantEvidence prioritizes STDERR/COMMAND_EXIT_CODE etc, ensures evidence referenced, logs diagnosis
- Types: Diagnosis with failureCategory/rootCause/confidence/affectedFiles/relevantEvidence/recommendedRepair/isRecoverable/requiresHumanDecision/contextSummary/previousRepairCount

### 5.3 Repair representation
- File: `src/agent/diagnosis/types.ts` — Repair with repairId/diagnosisId/objectiveId/taskId/intendedChanges/affectedFiles/commands/reason/riskLevel/expectedOutcome/verificationPlan/approvalRequired/timestamp/executed/executionResult
- File: `src/agent/diagnosis/repair.ts` — RepairEngine.createRepair model proposes, deterministic validation via validateAffectedFiles (workspace boundary, symlink escape check), validateCommands (reject dangerous), risk assessment HIGH/CRITICAL approvalRequired true, heuristicRepair per category with verificationPlan, llmRepair via coding model, executeRepair via existing tool system policy->tool->observation->change tracking, heuristic fixes for broken print("12, print(13) vs 12, syntax errors, generic print(12) fallback, scans workspace for py files if affected is output.txt

### 5.4 Repair execution
- Same file: executeRepair uses globalToolRegistry.execute write_file/run_command with PermissionLevel, creates Observation via ObservationCollector, EvidenceFactory, logs, returns repair with executed true and executionResult success/observationId/evidenceIds/message

### 5.5 Safeguards
- File: `src/agent/diagnosis/safeguards.ts` — SafeguardTracker with config maxRepairAttemptsPerTask/maxRetriesPerObjective/maxConsecutiveIdenticalFailures/maxTotalRepairAttempts/noRepeatIdenticalRepairWithoutNewEvidence, tracks per task/per objective, hashFailure/hashRepair/hashEvidence, canAttemptRepair checks limits and no repeat identical without new evidence, recordRepairAttempt, checkConsecutiveFailures, isInfiniteLoop, getStats, clear, globalSafeguardTracker
- Enforcement: workspace/command/file-size/timeout via config and tool registry

### 5.6 Retry strategy
- File: `src/agent/recovery/recoveryLoop.ts` — executeWithRecovery loop: EXECUTE->OBSERVE->VERIFY->FAIL->DIAGNOSE->REPAIR PLAN->APPLY REPAIR->RETRY->OBSERVE->VERIFY, repair->retry original->observe->verify not assume success, collects observations/evidence/failures/diagnoses/repairs/retryAttempts/verificationResults, resetConsecutiveFailures on success

### 5.7 Escalation
- File: `src/agent/diagnosis/escalation.ts` — EscalationEngine.shouldEscalate deterministic rules: permission denied, security violation, retry exhausted (3 failed repairs), unreliable diagnosis confidence <0.3, requiresHumanDecision, lacks info evidence empty, failed verification after repairs >=2, escalate creates structured Escalation with reason/evidence/attempted repairs/failed verification/recommended human action, never pretends solved, determineHumanAction per category

### 5.8 Recovery state machine
- File: `src/agent/core/constants.ts` already had states DIAGNOSING/REPAIRING/RETRYING, transitions defined: EXECUTING->OBSERVING, OBSERVING->EXECUTING/VERIFYING/DIAGNOSING/WAITING, DIAGNOSING->REPAIRING/FAILED/ESCALATED, REPAIRING->RETRYING/FAILED, RETRYING->EXECUTING/OBSERVING/FAILED, VERIFYING->COMPLETED/FAILED/DIAGNOSING/EXECUTING
- File: `src/agent/recovery/recoveryLoop.ts` integrates stateMachine transitions for each phase, observable/auditable via logger and stateMachine.getHistory()

### 5.9 Context management
- File: `src/agent/diagnosis/context.ts` as above, bounded contexts for planning/diagnosis/repair/verification with configurable limits via env vars KAIRA_CONTEXT_*

### 5.10 Change tracking
- Reuse Phase3: `src/agent/execution/executor.ts` onTaskUpdate collects filesCreated and changeTracking with objectiveId/taskId/fileChanged/operation/timestamp/modelResponsible, persisted via globalPersistence.saveTask, associated with objective/task/run/diagnosis/repair/files

### 5.11 DB persistence
- File: `src/agent/state/persistence.ts` extended to v2.0.0 with migration from v1.0.0, fields observations/evidence/verificationPlans/verificationResults/completionDecisions/failures/diagnoses/repairs/escalations/retryAttempts as Record<string, T>, methods saveObservation/saveEvidence/saveEvidenceBatch/saveVerificationPlan/saveVerificationResult/saveCompletionDecision/saveFailure/saveDiagnosis/saveRepair/saveEscalation/saveRetryAttempt, getters by objective/task/observation with FK filtering, deleteObjective cleans related FK data, clear, getState
- File: `src/db/schema.ts` extended with enums evidence_type, failure_category, verification_status, completion_decision_status, tables observations (FK objectives.id, runs.id), evidence (FK observations.id, objectives.id, runs.id), verification_plans (FK objectives.id), verification_results (FK verification_plans.id, objectives.id, runs.id), completion_decisions (FK objectives.id, runs.id, verification_results.id), failures (FK objectives.id, runs.id, observations.id), diagnoses (FK failures.id, objectives.id, runs.id), repairs (FK diagnoses.id, objectives.id, runs.id), escalations (FK objectives.id, runs.id, failures.id, diagnoses.id), retry_attempts (FK objectives.id, runs.id, repairs.id, failures.id, observations.id), indexes for FK

### 5.12 Model routing
- Reuse existing router: `src/agent/model/router.ts` reasoning qwen3:8b, coding qwen2.5-coder:7b, lightweight llama3.2:3b, vision moondream, methods reasoning/coding/lightweight/vision/planning/diagnosis, providerKind scripted vs ollama, no hard-coded logic

### 5.13 Deterministic vs LLM
- Deterministic controls: state transitions, tool execution, permissions, workspace boundaries, retry limits, timeouts, verification execution, evidence collection, completion decisions, persistence, audit logging — all in AgentStateMachine, ToolRegistry, ObservationCollector, VerificationEngine, CompletionDecisionEngine, FailureClassifier, SafeguardTracker, EscalationEngine, StatePersistence, AgentLogger
- LLM assists: understanding/planning/diagnosing/repair proposing/code gen/verification criteria selection via ModelRouter, with heuristic fallback when providerKind scripted or Ollama unreachable, never bypass deterministic controls

## Tests
- `scripts/test-phase5.ts` — 43 checks, PASS
- `scripts/test-e2e-phase4-5.ts` — 32 checks, PASS covering:
  - E2E1 success create Python prints 12 -> PLAN->EXECUTE->OBSERVE->VERIFY->COMPLETE with evidence, state transitions, evidence chain
  - E2E2 automatic repair broken print("12 -> repair -> complete, uses RecoveryLoop
  - E2E3 repair failure escalation, security violation triggers escalation, no infinite loop
  - E2E4 verification catches false success 13 vs 12 -> VERIFICATION_FAILED mandatory, model claim is only CLAIM, task NOT COMPLETE on model claim alone

## Integration
- `src/agent/core/agentCore.ts` rewritten for Phase 4-5: generates verification plan explicit JSON, executes tasks with observation/evidence, uses RecoveryLoop for failed tasks, verifies via VerificationEngine, decides completion via CompletionDecisionEngine deterministic, builds evidenceChain, persists all, handles escalation to ESCALATED state, returns ExecutionReport with Phase 4-5 extensions
- `src/agent/execution/executor.ts` enhanced: executeTask now creates normalized observation per tool execution with limits, evidence, persists via globalPersistence, executeTaskWithVerification for Phase 5 retry strategy
- `src/agent/config/index.ts` extended with safety maxRepairAttemptsPerTask/maxRetriesPerObjective/maxConsecutiveIdenticalFailures, observation limits, context limits
- Backward compat: Phase 1-3 tests still PASS, typecheck 0 errors, migrations safe

## Safeguards verified
- Max repair attempts per task, max retries per objective, max consecutive identical failures, no infinite loops, no repeated identical repairs without new evidence, workspace/command/file-size/timeout enforcement, all via SafeguardTracker and tested
