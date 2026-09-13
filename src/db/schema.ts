/**
 * Kaira — persistent state schema.
 *
 * Everything Kaira knows and does lives here so execution survives
 * process restarts and can be resumed by any driver (worker or API).
 * Phase 4-5: added observations, evidence, verification, failures, diagnoses, repairs, escalations
 * Phase 6: projects, requirements, task graphs, checkpoints, reports
 * Phase 8+9: durable runs, scheduling, waiting, monitoring, research, external actions, connectors, escalations, events, autonomy
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";

/* ---------------------------------- enums --------------------------------- */

export const objectiveStatus = pgEnum("objective_status", [
  "pending",
  "active",
  "paused",
  "completed",
  "failed",
  "archived",
]);

export const runStatus = pgEnum("run_status", [
  "queued",
  "planning",
  "running",
  "verifying",
  "completed",
  "failed",
  "stopped",
]);

export const stepKind = pgEnum("step_kind", [
  "plan",
  "thought",
  "action",
  "observation",
  "critic",
  "error",
  "final",
  "note",
]);

export const memoryKind = pgEnum("memory_kind", [
  "fact",
  "procedure",
  "feedback",
  "note",
]);

export const messageRole = pgEnum("message_role", [
  "brandon",
  "kaira",
  "system",
]);

// Phase 4-5 enums
export const evidenceType = pgEnum("evidence_type", [
  "COMMAND_EXIT_CODE",
  "STDOUT",
  "STDERR",
  "FILE_EXISTS",
  "FILE_CONTENT",
  "FILE_METADATA",
  "FILE_CREATED",
  "FILE_MODIFIED",
  "FILE_DELETED",
  "TEST_RESULT",
  "COMMAND_RESULT",
  "VERIFICATION_RESULT",
]);

export const failureCategory = pgEnum("failure_category", [
  "TOOL_FAILURE",
  "COMMAND_FAILURE",
  "SYNTAX_ERROR",
  "RUNTIME_ERROR",
  "TEST_FAILURE",
  "VERIFICATION_FAILURE",
  "MISSING_FILE",
  "INVALID_OUTPUT",
  "PERMISSION_DENIED",
  "TIMEOUT",
  "RESOURCE_LIMIT",
  "SECURITY_VIOLATION",
  "UNKNOWN_FAILURE",
]);

export const verificationStatus = pgEnum("verification_status", [
  "PASSED",
  "FAILED",
  "INCONCLUSIVE",
  "BLOCKED",
  "SKIPPED",
]);

export const completionDecisionStatus = pgEnum("completion_decision_status", [
  "VERIFIED",
  "FAILED",
  "INCONCLUSIVE",
  "BLOCKED",
]);

export const projectStatus = pgEnum("project_status", [
  "PLANNING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "ESCALATED",
  "CANCELLED",
]);

export const projectType = pgEnum("project_type", [
  "PYTHON",
  "NODE",
  "TYPESCRIPT",
  "GENERIC",
]);

export const requirementCategory = pgEnum("requirement_category", [
  "FUNCTIONAL",
  "TECHNICAL",
  "QUALITY",
]);

export const requirementPriority = pgEnum("requirement_priority", [
  "MUST_HAVE",
  "SHOULD_HAVE",
  "NICE_TO_HAVE",
]);

export const requirementSource = pgEnum("requirement_source", [
  "USER_PROVIDED",
  "INFERRED",
  "ASSUMPTION",
]);

export const requirementStatus = pgEnum("requirement_status", [
  "IDENTIFIED",
  "ANALYZED",
  "IMPLEMENTED",
  "VERIFIED",
  "REJECTED",
]);

export const projectTaskStatus = pgEnum("project_task_status", [
  "PENDING",
  "READY",
  "RUNNING",
  "BLOCKED",
  "COMPLETED",
  "FAILED",
  "ESCALATED",
  "CANCELLED",
]);

export const projectTaskType = pgEnum("project_task_type", [
  "INITIALIZATION",
  "ANALYSIS",
  "IMPLEMENTATION",
  "TEST",
  "VERIFICATION",
  "REPAIR",
  "DOCUMENTATION",
  "GENERIC",
]);

export const assumptionRisk = pgEnum("assumption_risk", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const assumptionStatus = pgEnum("assumption_status", [
  "ACTIVE",
  "VALIDATED",
  "INVALIDATED",
  "ESCALATED",
]);

// Phase 8+9 enums
export const durableRunState = pgEnum("durable_run_state", [
  "CREATED",
  "QUEUED",
  "RUNNING",
  "WAITING",
  "PAUSED",
  "RECOVERING",
  "ESCALATED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

export const waitReason = pgEnum("wait_reason", [
  "DEPLOYMENT",
  "EXTERNAL_API",
  "WEBSITE_CHANGE",
  "SCHEDULED_TIME",
  "APPROVAL",
  "LONG_COMMAND",
  "DEPENDENCY",
  "EXTERNAL_EVENT",
  "RETRY_AFTER",
  "MONITORING",
  "RESEARCH",
  "HEALTH_CHECK",
]);

export const scheduleType = pgEnum("schedule_type", [
  "IMMEDIATE",
  "DELAYED",
  "SCHEDULED",
  "RECURRING",
  "RETRY_AFTER",
  "WAITING_POLL",
  "HEALTH_CHECK",
  "MONITORING",
]);

export const scheduledJobState = pgEnum("scheduled_job_state", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const monitoringCheckType = pgEnum("monitoring_check_type", [
  "HTTP_STATUS",
  "FILE_EXISTS",
  "FILE_CONTENT",
  "COMMAND_OUTPUT",
  "API_RESPONSE",
  "WEBSITE_CHANGE",
  "CUSTOM",
]);

export const monitoringJobState = pgEnum("monitoring_job_state", [
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "ESCALATED",
  "CANCELLED",
]);

export const researchStage = pgEnum("research_stage", [
  "CREATED",
  "DISCOVER",
  "FETCH",
  "EXTRACT",
  "NORMALIZE",
  "COMPARE",
  "ANALYZE",
  "VERIFY",
  "SYNTHESIZE",
  "REPORT",
  "COMPLETED",
  "FAILED",
  "ESCALATED",
]);

export const claimType = pgEnum("claim_type", [
  "FACT_OBSERVED",
  "MODEL_INFERENCE",
  "UNVERIFIED_CLAIM",
]);

export const sourceType = pgEnum("source_type", [
  "WEB_PAGE",
  "API",
  "RSS",
  "DOCUMENTATION",
  "GITHUB",
  "APPROVED_SERVICE",
  "MOCK",
]);

export const connectorPermission = pgEnum("connector_permission", [
  "READ_ONLY",
  "REVERSIBLE_WRITE",
  "IRREVERSIBLE_WRITE",
  "HIGH_RISK",
]);

export const escalationReason = pgEnum("escalation_reason", [
  "INSUFFICIENT_AUTHORITY",
  "AMBIGUOUS_HIGH_RISK",
  "MISSING_CREDENTIALS",
  "DESTRUCTIVE_OPERATION",
  "UNRESOLVED_FAILURES",
  "LIMIT_EXCEEDED",
  "CONTRADICTION",
  "UNAVAILABLE_DEPENDENCY",
  "HUMAN_JUDGMENT_REQUIRED",
  "SECURITY_VIOLATION",
  "EXTERNAL_SERVICE_FAILURE",
]);

export const eventType = pgEnum("event_type", [
  "WEBHOOK",
  "REPO_EVENT",
  "DEPLOYMENT_EVENT",
  "SCHEDULED_EVENT",
  "FILE_CHANGE",
  "API_EVENT",
  "MONITORING_ALERT",
  "EXTERNAL_EVENT",
  "MANUAL",
]);

export const autonomyLevel = pgEnum("autonomy_level", [
  "SUPERVISED",
  "ASSISTED",
  "AUTONOMOUS",
  "RESTRICTED",
]);

/* --------------------------------- tables --------------------------------- */

/** A goal given to Kaira by her CEO (Brandon). */
export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: objectiveStatus("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    createdBy: text("created_by").notNull().default("brandon"),
    result: text("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("objectives_status_idx").on(t.status)],
);

/** One execution attempt of an objective. Resumable; owned by a driver via lock. */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    status: runStatus("status").notNull().default("queued"),
    plan: text("plan"),
    result: text("result"),
    error: text("error"),
    modelId: text("model_id").notNull().default(""),
    stepCount: integer("step_count").notNull().default(0),
    maxSteps: integer("max_steps").notNull().default(20),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockOwner: text("lock_owner"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("runs_status_idx").on(t.status), index("runs_objective_idx").on(t.objectiveId)],
);

/** Append-only event log of a run: plans, thoughts, tool calls, results, verdicts. */
export const steps = pgTable(
  "steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: stepKind("kind").notNull(),
    name: text("name"),
    input: jsonb("input"),
    output: jsonb("output"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("steps_run_seq_idx").on(t.runId, t.seq)],
);

/** Long-term memory. Keyword retrieval now; embedding column reserved for later. */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: memoryKind("kind").notNull().default("note"),
    content: text("content").notNull(),
    tags: text("tags").array().notNull().default([]),
    importance: integer("importance").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("memories_kind_idx").on(t.kind)],
);

/** Conversation / activity feed between Brandon and Kaira. */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    objectiveId: uuid("objective_id").references(() => objectives.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("messages_created_idx").on(t.createdAt)],
);

/** Key-value store for settings and agent runtime state (e.g. worker heartbeat). */
export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* --------------------------- Phase 4-5 tables --------------------------- */

/** Normalized observation per tool execution */
export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actionId: uuid("action_id").notNull(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull(),
    success: boolean("success").notNull(),
    failureReason: text("failure_reason"),
    exitCode: integer("exit_code"),
    stdout: text("stdout"),
    stdoutTruncated: boolean("stdout_truncated").notNull().default(false),
    stderr: text("stderr"),
    stderrTruncated: boolean("stderr_truncated").notNull().default(false),
    outputCombined: text("output_combined"),
    affectedFiles: text("affected_files").array().notNull().default([]),
    createdFiles: text("created_files").array().notNull().default([]),
    modifiedFiles: text("modified_files").array().notNull().default([]),
    deletedFiles: text("deleted_files").array().notNull().default([]),
    fileMetadata: jsonb("file_metadata").notNull().default([]),
    error: text("error"),
    totalSizeBytes: integer("total_size_bytes").notNull().default(0),
    truncated: boolean("truncated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("observations_objective_idx").on(t.objectiveId),
    index("observations_task_idx").on(t.taskId),
    index("observations_run_idx").on(t.runId),
  ]
);

/** Structured evidence originating from real observations */
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id, { onDelete: "cascade" }),
    actionId: uuid("action_id").notNull(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    type: evidenceType("type").notNull(),
    confidence: integer("confidence").notNull().default(100),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    data: jsonb("data"),
    filePath: text("file_path"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("evidence_objective_idx").on(t.objectiveId),
    index("evidence_observation_idx").on(t.observationId),
    index("evidence_task_idx").on(t.taskId),
  ]
);

/** Verification plans — explicit JSON executable independently */
export const verificationPlans = pgTable(
  "verification_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    description: text("description").notNull(),
    checks: jsonb("checks").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("SYSTEM"),
  },
  (t) => [index("verification_plans_objective_idx").on(t.objectiveId)]
);

/** Verification check results */
export const verificationResults = pgTable(
  "verification_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => verificationPlans.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    status: verificationStatus("status").notNull(),
    passed: boolean("passed").notNull(),
    checks: jsonb("checks").notNull(),
    summary: text("summary").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("verification_results_objective_idx").on(t.objectiveId),
    index("verification_results_run_idx").on(t.runId),
  ]
);

/** Completion decisions — VERIFIED/FAILED/INCONCLUSIVE/BLOCKED */
export const completionDecisions = pgTable(
  "completion_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    status: completionDecisionStatus("status").notNull(),
    modelClaim: text("model_claim"),
    verificationResultId: uuid("verification_result_id")
      .notNull()
      .references(() => verificationResults.id, { onDelete: "cascade" }),
    evidenceChainIds: text("evidence_chain_ids").array().notNull().default([]),
    reason: text("reason").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    verifiedBy: text("verified_by").notNull().default("SYSTEM"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("completion_decisions_objective_idx").on(t.objectiveId),
    index("completion_decisions_run_idx").on(t.runId),
  ]
);

/** Failures with classification */
export const failures = pgTable(
  "failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: failureCategory("category").notNull(),
    message: text("message").notNull(),
    actionId: uuid("action_id").notNull(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id, { onDelete: "cascade" }),
    evidence: jsonb("evidence").notNull().default([]),
    severity: text("severity").notNull(),
    recoverability: text("recoverability").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    toolName: text("tool_name"),
    exitCode: integer("exit_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("failures_objective_idx").on(t.objectiveId),
    index("failures_task_idx").on(t.taskId),
  ]
);

/** Diagnoses */
export const diagnoses = pgTable(
  "diagnoses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    failureId: uuid("failure_id")
      .notNull()
      .references(() => failures.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    failureCategory: failureCategory("failure_category").notNull(),
    rootCause: text("root_cause").notNull(),
    confidence: integer("confidence").notNull(),
    affectedFiles: text("affected_files").array().notNull().default([]),
    relevantEvidence: jsonb("relevant_evidence").notNull().default([]),
    recommendedRepair: text("recommended_repair").notNull(),
    isRecoverable: boolean("is_recoverable").notNull(),
    requiresHumanDecision: boolean("requires_human_decision").notNull().default(false),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    contextSummary: text("context_summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("diagnoses_objective_idx").on(t.objectiveId),
    index("diagnoses_failure_idx").on(t.failureId),
  ]
);

/** Repair attempts */
export const repairs = pgTable(
  "repairs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    diagnosisId: uuid("diagnosis_id")
      .notNull()
      .references(() => diagnoses.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    intendedChanges: text("intended_changes").notNull(),
    affectedFiles: text("affected_files").array().notNull().default([]),
    commands: text("commands").array().notNull().default([]),
    reason: text("reason").notNull(),
    riskLevel: text("risk_level").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    verificationPlan: jsonb("verification_plan"),
    approvalRequired: boolean("approval_required").notNull().default(false),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    executed: boolean("executed").notNull().default(false),
    executionResult: jsonb("execution_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("repairs_objective_idx").on(t.objectiveId),
    index("repairs_diagnosis_idx").on(t.diagnosisId),
  ]
);

/** Escalations */
export const escalations = pgTable(
  "escalations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    failureId: uuid("failure_id")
      .notNull()
      .references(() => failures.id, { onDelete: "cascade" }),
    diagnosisId: uuid("diagnosis_id").references(() => diagnoses.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").notNull().default([]),
    attemptedRepairs: jsonb("attempted_repairs").notNull().default([]),
    failedVerificationResults: jsonb("failed_verification_results").notNull().default([]),
    recommendedHumanAction: text("recommended_human_action").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    severity: text("severity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("escalations_objective_idx").on(t.objectiveId),
    index("escalations_run_idx").on(t.runId),
  ]
);

/** Retry attempts */
export const retryAttempts = pgTable(
  "retry_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    repairId: uuid("repair_id").references(() => repairs.id, { onDelete: "set null" }),
    failureId: uuid("failure_id").references(() => failures.id, { onDelete: "set null" }),
    observationId: uuid("observation_id").references(() => observations.id, { onDelete: "set null" }),
    success: boolean("success").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("retry_attempts_objective_idx").on(t.objectiveId),
    index("retry_attempts_task_idx").on(t.taskId),
  ]
);

/* --------------------------- Phase 6 tables --------------------------- */

/** Projects — high-level objectives with plan */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    objective: text("objective").notNull(),
    status: projectStatus("status").notNull().default("PLANNING"),
    projectType: projectType("project_type").notNull().default("GENERIC"),
    workspacePath: text("workspace_path").notNull(),
    taskGraphId: uuid("task_graph_id"),
    currentTaskId: text("current_task_id"),
    completedTaskIds: text("completed_task_ids").array().notNull().default([]),
    failedTaskIds: text("failed_task_ids").array().notNull().default([]),
    pendingTaskIds: text("pending_task_ids").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("projects_objective_idx").on(t.objectiveId),
    index("projects_status_idx").on(t.status),
  ]
);

/** Project plans */
export const projectPlans = pgTable(
  "project_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    objective: text("objective").notNull(),
    projectType: projectType("project_type").notNull().default("GENERIC"),
    verificationStrategy: text("verification_strategy").notNull(),
    completionCriteria: jsonb("completion_criteria").notNull().default([]),
    riskConsiderations: text("risk_considerations").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("SYSTEM"),
  },
  (t) => [index("project_plans_project_idx").on(t.projectId)]
);

/** Requirements */
export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    category: requirementCategory("category").notNull(),
    priority: requirementPriority("priority").notNull(),
    source: requirementSource("source").notNull(),
    status: requirementStatus("status").notNull().default("IDENTIFIED"),
    acceptanceCriteria: jsonb("acceptance_criteria").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("requirements_project_idx").on(t.projectId),
    index("requirements_objective_idx").on(t.objectiveId),
  ]
);

/** Acceptance criteria */
export const acceptanceCriteria = pgTable(
  "acceptance_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    expected: text("expected").notNull(),
    verificationMethod: text("verification_method").notNull(),
    status: verificationStatus("status").notNull().default("SKIPPED"),
    passed: boolean("passed"),
    evidence: jsonb("evidence").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [index("acceptance_criteria_requirement_idx").on(t.requirementId)]
);

/** Assumptions */
export const assumptions = pgTable(
  "assumptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    assumption: text("assumption").notNull(),
    reason: text("reason").notNull(),
    confidence: integer("confidence").notNull(),
    risk: assumptionRisk("risk").notNull(),
    affectedTasks: text("affected_tasks").array().notNull().default([]),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    status: assumptionStatus("status").notNull().default("ACTIVE"),
    validatedBy: text("validated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
  },
  (t) => [
    index("assumptions_project_idx").on(t.projectId),
    index("assumptions_risk_idx").on(t.risk),
  ]
);

/** Task graphs */
export const taskGraphs = pgTable(
  "task_graphs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    tasks: jsonb("tasks").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_graphs_project_idx").on(t.projectId)]
);

/** Project tasks */
export const projectTasks = pgTable(
  "project_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskGraphId: uuid("task_graph_id")
      .notNull()
      .references(() => taskGraphs.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    type: projectTaskType("type").notNull().default("GENERIC"),
    status: projectTaskStatus("status").notNull().default("PENDING"),
    priority: integer("priority").notNull().default(5),
    dependencies: text("dependencies").array().notNull().default([]),
    dependents: text("dependents").array().notNull().default([]),
    inputs: jsonb("inputs").notNull().default({}),
    expectedOutputs: jsonb("expected_outputs").notNull().default({}),
    verificationRequirements: text("verification_requirements").array().notNull().default([]),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    selectedTool: text("selected_tool"),
    toolArguments: jsonb("tool_arguments"),
    result: jsonb("result"),
    failureInfo: jsonb("failure_info"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("project_tasks_project_idx").on(t.projectId),
    index("project_tasks_status_idx").on(t.status),
    index("project_tasks_graph_idx").on(t.taskGraphId),
  ]
);

/** Checkpoints */
export const checkpoints = pgTable(
  "checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    projectData: jsonb("project_data").notNull(),
    taskGraphData: jsonb("task_graph_data").notNull(),
    requirements: jsonb("requirements").notNull().default([]),
    observations: jsonb("observations").notNull().default([]),
    evidence: jsonb("evidence").notNull().default([]),
    verificationResults: jsonb("verification_results").notNull().default([]),
    currentTaskId: text("current_task_id"),
    completedTaskIds: text("completed_task_ids").array().notNull().default([]),
    failedTaskIds: text("failed_task_ids").array().notNull().default([]),
    pendingTaskIds: text("pending_task_ids").array().notNull().default([]),
    reason: text("reason").notNull().default("Periodic checkpoint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("checkpoints_project_idx").on(t.projectId),
    index("checkpoints_created_idx").on(t.createdAt),
  ]
);

/** Engineering reports */
export const engineeringReports = pgTable(
  "engineering_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    objective: text("objective").notNull(),
    title: text("title").notNull(),
    status: projectStatus("status").notNull(),
    reportData: jsonb("report_data").notNull(),
    reportText: text("report_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("engineering_reports_project_idx").on(t.projectId)]
);

/* --------------------------- Phase 8+9 tables --------------------------- */

/** Durable runs — long-running job abstraction */
export const durableRuns = pgTable(
  "durable_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: text("run_id").notNull().unique(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    state: durableRunState("state").notNull().default("CREATED"),
    previousState: durableRunState("previous_state"),
    currentTaskId: text("current_task_id"),
    taskGraphId: uuid("task_graph_id"),
    objective: text("objective").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull().defaultNow(),
    lastActivityTime: timestamp("last_activity_time", { withTimezone: true }).notNull().defaultNow(),
    nextScheduledAction: timestamp("next_scheduled_action", { withTimezone: true }),
    checkpointRef: jsonb("checkpoint_ref"),
    retryInfo: jsonb("retry_info").notNull().default({}),
    waitingState: jsonb("waiting_state"),
    externalDependencies: jsonb("external_dependencies").notNull().default([]),
    failureCount: integer("failure_count").notNull().default(0),
    failures: jsonb("failures").notNull().default([]),
    escalationCount: integer("escalation_count").notNull().default(0),
    escalations: jsonb("escalations").notNull().default([]),
    verificationState: jsonb("verification_state"),
    completionState: jsonb("completion_state"),
    cancellationState: jsonb("cancellation_state"),
    expirationState: jsonb("expiration_state"),
    resourceUsage: jsonb("resource_usage").notNull().default({}),
    autonomyPolicy: autonomyLevel("autonomy_policy").notNull().default("ASSISTED"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("durable_runs_objective_idx").on(t.objectiveId),
    index("durable_runs_state_idx").on(t.state),
    index("durable_runs_run_id_idx").on(t.runId),
  ]
);

/** Scheduled jobs */
export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("job_id").notNull().unique(),
    runId: text("run_id").notNull(),
    objectiveId: uuid("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    type: scheduleType("type").notNull(),
    state: scheduledJobState("state").notNull().default("PENDING"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    intervalMs: integer("interval_ms"),
    maxExecutions: integer("max_executions"),
    executionCount: integer("execution_count").notNull().default(0),
    lastExecutionAt: timestamp("last_execution_at", { withTimezone: true }),
    nextExecutionAt: timestamp("next_execution_at", { withTimezone: true }),
    payload: jsonb("payload"),
    retryPolicy: jsonb("retry_policy"),
    timeoutMs: integer("timeout_ms").notNull().default(30000),
    cancellationRequested: boolean("cancellation_requested").notNull().default(false),
    result: jsonb("result"),
    error: text("error"),
    observability: jsonb("observability").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scheduled_jobs_run_idx").on(t.runId),
    index("scheduled_jobs_state_idx").on(t.state),
  ]
);

/** Monitoring jobs */
export const monitoringJobs = pgTable(
  "monitoring_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("job_id").notNull().unique(),
    runId: text("run_id").notNull(),
    objectiveId: uuid("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    what: text("what").notNull(),
    how: monitoringCheckType("how").notNull(),
    description: text("description").notNull(),
    target: text("target").notNull(),
    pollingIntervalMs: integer("polling_interval_ms").notNull().default(30000),
    timeoutMs: integer("timeout_ms").notNull().default(300000),
    acceptableStates: text("acceptable_states").array().notNull().default([]),
    changeDetection: jsonb("change_detection").notNull().default({}),
    escalationConditions: jsonb("escalation_conditions").notNull().default({}),
    completionConditions: jsonb("completion_conditions").notNull().default({}),
    state: monitoringJobState("state").notNull().default("ACTIVE"),
    checks: jsonb("checks").notNull().default([]),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    result: text("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("monitoring_jobs_run_idx").on(t.runId),
    index("monitoring_jobs_state_idx").on(t.state),
  ]
);

/** Research jobs */
export const researchJobs = pgTable(
  "research_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    researchId: text("research_id").notNull().unique(),
    objectiveId: uuid("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    runId: text("run_id"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    objective: text("objective").notNull(),
    questions: jsonb("questions").notNull().default([]),
    constraints: jsonb("constraints").notNull(),
    stage: researchStage("stage").notNull().default("CREATED"),
    sources: jsonb("sources").notNull().default([]),
    fetchedContent: jsonb("fetched_content").notNull().default([]),
    observations: jsonb("observations").notNull().default([]),
    claims: jsonb("claims").notNull().default([]),
    contradictions: jsonb("contradictions").notNull().default([]),
    verificationState: jsonb("verification_state").notNull().default({}),
    findings: jsonb("findings").notNull().default({}),
    metadata: jsonb("metadata").notNull().default({}),
    confidence: integer("confidence").notNull().default(0),
    status: text("status").notNull().default("ACTIVE"),
    escalationReason: text("escalation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("research_jobs_objective_idx").on(t.objectiveId),
    index("research_jobs_research_id_idx").on(t.researchId),
  ]
);

/** Research sources with provenance */
export const researchSources = pgTable(
  "research_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id").notNull().unique(),
    researchId: text("research_id").notNull(),
    url: text("url").notNull(),
    type: sourceType("type").notNull(),
    title: text("title"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    statusCode: integer("status_code"),
    contentType: text("content_type"),
    contentLength: integer("content_length"),
    excerpt: text("excerpt"),
    extractionMethod: text("extraction_method"),
    metadata: jsonb("metadata"),
    confidence: integer("confidence").notNull().default(50),
    verificationStatus: text("verification_status").notNull().default("UNVERIFIED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("research_sources_research_idx").on(t.researchId),
    index("research_sources_url_idx").on(t.url),
  ]
);

/** External actions */
export const externalActions = pgTable(
  "external_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actionId: text("action_id").notNull().unique(),
    runId: text("run_id").notNull(),
    objectiveId: uuid("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    connectorName: text("connector_name").notNull(),
    permission: connectorPermission("permission").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    success: boolean("success").notNull(),
    error: text("error"),
    executionTimeMs: integer("execution_time_ms").notNull(),
    riskLevel: text("risk_level").notNull(),
    verification: jsonb("verification"),
    authorizedBy: text("authorized_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("external_actions_run_idx").on(t.runId),
    index("external_actions_connector_idx").on(t.connectorName),
  ]
);

/** Structured escalations */
export const structuredEscalations = pgTable(
  "structured_escalations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escalationId: text("escalation_id").notNull().unique(),
    runId: text("run_id").notNull(),
    objectiveId: uuid("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    researchId: text("research_id"),
    reason: escalationReason("reason").notNull(),
    description: text("description").notNull(),
    objective: text("objective").notNull(),
    currentState: jsonb("current_state").notNull(),
    attemptedActions: jsonb("attempted_actions").notNull().default([]),
    evidence: jsonb("evidence").notNull().default([]),
    options: jsonb("options").notNull(),
    recommendedAction: jsonb("recommended_action").notNull(),
    decisionRequired: jsonb("decision_required").notNull(),
    status: text("status").notNull().default("PENDING"),
    resolution: jsonb("resolution"),
    severity: text("severity").notNull().default("MEDIUM"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("structured_escalations_run_idx").on(t.runId),
    index("structured_escalations_reason_idx").on(t.reason),
  ]
);

/** Events */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull().unique(),
    type: eventType("type").notNull(),
    source: text("source").notNull(),
    payload: jsonb("payload").notNull(),
    metadata: jsonb("metadata"),
    status: text("status").notNull().default("RECEIVED"),
    validationResult: jsonb("validation_result"),
    authorizationResult: jsonb("authorization_result"),
    correlationId: text("correlation_id"),
    runId: text("run_id"),
    objectiveId: uuid("objective_id").references(() => objectives.id, { onDelete: "set null" }),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_type_idx").on(t.type),
    index("events_source_idx").on(t.source),
    index("events_correlation_idx").on(t.correlationId),
  ]
);

/** Connector metadata & rate limiting */
export const connectorMetadata = pgTable(
  "connector_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorName: text("connector_name").notNull().unique(),
    capability: text("capability").notNull(),
    permission: connectorPermission("permission").notNull(),
    riskLevel: text("risk_level").notNull(),
    sideEffect: text("side_effect").notNull(),
    rateLimit: jsonb("rate_limit").notNull(),
    circuitBreaker: jsonb("circuit_breaker").notNull().default({}),
    totalRequests: integer("total_requests").notNull().default(0),
    totalFailures: integer("total_failures").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("connector_metadata_name_idx").on(t.connectorName)]
);

/* ---------------------------------- types --------------------------------- */

export type Objective = typeof objectives.$inferSelect;
export type NewObjective = typeof objectives.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Step = typeof steps.$inferSelect;
export type NewStep = typeof steps.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Observation = typeof observations.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type VerificationPlan = typeof verificationPlans.$inferSelect;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type CompletionDecision = typeof completionDecisions.$inferSelect;
export type Failure = typeof failures.$inferSelect;
export type Diagnosis = typeof diagnoses.$inferSelect;
export type Repair = typeof repairs.$inferSelect;
export type Escalation = typeof escalations.$inferSelect;
export type RetryAttempt = typeof retryAttempts.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectPlan = typeof projectPlans.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type AcceptanceCriterion = typeof acceptanceCriteria.$inferSelect;
export type Assumption = typeof assumptions.$inferSelect;
export type TaskGraph = typeof taskGraphs.$inferSelect;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type Checkpoint = typeof checkpoints.$inferSelect;
export type EngineeringReport = typeof engineeringReports.$inferSelect;
export type DurableRun = typeof durableRuns.$inferSelect;
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type MonitoringJob = typeof monitoringJobs.$inferSelect;
export type ResearchJob = typeof researchJobs.$inferSelect;
export type ResearchSource = typeof researchSources.$inferSelect;
export type ExternalAction = typeof externalActions.$inferSelect;
export type StructuredEscalation = typeof structuredEscalations.$inferSelect;
export type AgentEvent = typeof events.$inferSelect;
export type ConnectorMetadata = typeof connectorMetadata.$inferSelect;
