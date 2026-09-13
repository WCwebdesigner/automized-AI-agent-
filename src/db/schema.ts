/**
 * Kaira — persistent state schema.
 *
 * Everything Kaira knows and does lives here so execution survives
 * process restarts and can be resumed by any driver (worker or API).
 * Phase 4-5: added observations, evidence, verification, failures, diagnoses, repairs, escalations
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
    confidence: integer("confidence").notNull().default(100), // stored as 0-100
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
    confidence: integer("confidence").notNull(), // 0-100
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
