/**
 * Kaira Agent Core — Configuration
 * Phase 1-5: configurable workspace, models, safety limits, Ollama endpoint, observation/diagnosis limits
 */

import path from "node:path";
import { PermissionLevel } from "../core/constants";
export { PermissionLevel };

export interface ModelRoutingConfig {
  reasoning: string; // qwen3:8b
  coding: string; // qwen2.5-coder:7b
  lightweight: string; // llama3.2:3b
  vision: string; // moondream:latest
}

export interface SafetyConfig {
  maxAttempts: number;
  maxExecutionTimeMs: number;
  maxRepairCycles: number;
  maxSteps: number;
  commandTimeoutMs: number;
  maxOutputBytes: number;
  maxFileSizeBytes: number;
  allowDestructive: boolean;
  maxRepairAttemptsPerTask: number;
  maxRetriesPerObjective: number;
  maxConsecutiveIdenticalFailures: number;
}

export interface ObservationConfig {
  maxStdoutBytes: number;
  maxStderrBytes: number;
  maxFileContentBytes: number;
  maxMetadataEntries: number;
  maxTotalBytes: number;
  maxAffectedFiles: number;
}

export interface ContextConfig {
  maxFileContentBytes: number;
  maxEvidenceCount: number;
  maxRecentChanges: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  maxHistoryEntries: number;
  maxRelevantFiles: number;
}

export interface ProjectConfig {
  maxTasks: number;
  maxProjectExecutionTimeMs: number;
  checkpointInterval: number;
  maxRetriesPerTask: number;
  enableGitAwareness: boolean;
}

export interface DurableConfig {
  maxRuntimeMs: number;
  maxTaskAttempts: number;
  maxRepairAttempts: number;
  maxExternalRequests: number;
  maxModelCalls: number;
  maxConcurrentJobs: number;
  maxShellDurationMs: number;
  maxDownloadedBytes: number;
  maxResearchDepth: number;
  maxConsecutiveFailures: number;
  stalledThresholdMs: number;
  overdueThresholdMs: number;
  checkpointIntervalMs: number;
}

export interface ResearchConfig {
  maxSources: number;
  maxDepth: number;
  maxRequests: number;
  maxRuntimeMs: number;
  maxModelCalls: number;
  defaultTimeoutMs: number;
  maxResponseBytes: number;
  allowedDomains: string[];
  blockedDomains: string[];
}

export interface ConnectorConfig {
  defaultTimeoutMs: number;
  defaultRateLimitPerMinute: number;
  circuitBreakerThreshold: number;
  circuitBreakerOpenMs: number;
  maxResponseBytes: number;
  enableWebFetch: boolean;
  enableMockSources: boolean;
}

export interface AutonomyConfig {
  defaultLevel: "SUPERVISED" | "ASSISTED" | "AUTONOMOUS" | "RESTRICTED";
  requireApprovalForHighRisk: boolean;
  requireApprovalForIrreversible: boolean;
}

export interface MemoryConfig {
  maxMemories: number;
  maxMemoriesPerObjective: number;
  maxTokensPerObjective: number;
  maxCharsPerObjective: number;
  minConfidence: number;
  enablePersistence: boolean;
  persistencePath: string;
  perScopeLimit: Record<string, number>;
  includeStale: boolean;
  stalenessDays: number;
}

export interface AgentConfig {
  workspaceRoot: string;
  ollamaBaseUrl: string;
  openaiCompatibleBaseUrl?: string;
  modelRouting: ModelRoutingConfig;
  safety: SafetyConfig;
  observation: ObservationConfig;
  context: ContextConfig;
  project: ProjectConfig;
  durable: DurableConfig;
  research: ResearchConfig;
  connectors: ConnectorConfig;
  autonomy: AutonomyConfig;
  memory: MemoryConfig;
  permission: {
    defaultLevel: PermissionLevel;
    allowedLevels: PermissionLevel[];
  };
  persistence: {
    type: "json" | "sqlite";
    path: string;
  };
}

function resolveWorkspace(): string {
  const raw =
    process.env.KAIRA_WORKSPACE ??
    process.env.AGENT_WORKSPACE ??
    path.join(process.cwd(), "workspace");
  return path.resolve(raw);
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): AgentConfig {
  const workspaceRoot = resolveWorkspace();

  // Ollama base URL: support multiple env names for compatibility
  // Priority: OLLAMA_BASE_URL > KAIRA_MODEL_BASE_URL > KAIRA_OLLAMA_URL > default
  const ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL ??
    process.env.KAIRA_MODEL_BASE_URL ??
    process.env.KAIRA_OLLAMA_URL ??
    "http://localhost:11434";

  return {
    workspaceRoot,
    ollamaBaseUrl: ollamaBaseUrl.replace(/\/$/, ""),
    openaiCompatibleBaseUrl: process.env.KAIRA_OPENAI_BASE_URL,
    modelRouting: {
      reasoning: process.env.KAIRA_REASONING_MODEL ?? "qwen3:8b",
      coding: process.env.KAIRA_CODING_MODEL ?? "qwen2.5-coder:7b",
      lightweight: process.env.KAIRA_LIGHTWEIGHT_MODEL ?? "llama3.2:3b",
      vision: process.env.KAIRA_VISION_MODEL ?? "moondream:latest",
    },
    safety: {
      maxAttempts: envInt("KAIRA_MAX_ATTEMPTS", 3),
      maxExecutionTimeMs: envInt("KAIRA_MAX_EXECUTION_TIME_MS", 300_000),
      maxRepairCycles: envInt("KAIRA_MAX_REPAIR_CYCLES", 3),
      maxSteps: envInt("KAIRA_MAX_STEPS", 30),
      commandTimeoutMs: envInt("KAIRA_COMMAND_TIMEOUT_MS", 60_000),
      maxOutputBytes: envInt("KAIRA_MAX_OUTPUT_BYTES", 1_000_000),
      maxFileSizeBytes: envInt("KAIRA_MAX_FILE_SIZE_BYTES", 5_000_000),
      allowDestructive: process.env.KAIRA_ALLOW_DESTRUCTIVE === "true",
      maxRepairAttemptsPerTask: envInt("KAIRA_MAX_REPAIR_ATTEMPTS_PER_TASK", 3),
      maxRetriesPerObjective: envInt("KAIRA_MAX_RETRIES_PER_OBJECTIVE", 10),
      maxConsecutiveIdenticalFailures: envInt("KAIRA_MAX_CONSECUTIVE_IDENTICAL_FAILURES", 3),
    },
    observation: {
      maxStdoutBytes: envInt("KAIRA_MAX_STDOUT_BYTES", 100_000),
      maxStderrBytes: envInt("KAIRA_MAX_STDERR_BYTES", 100_000),
      maxFileContentBytes: envInt("KAIRA_MAX_FILE_CONTENT_BYTES", 500_000),
      maxMetadataEntries: envInt("KAIRA_MAX_METADATA_ENTRIES", 100),
      maxTotalBytes: envInt("KAIRA_MAX_TOTAL_OBSERVATION_BYTES", 1_000_000),
      maxAffectedFiles: envInt("KAIRA_MAX_AFFECTED_FILES", 50),
    },
    context: {
      maxFileContentBytes: envInt("KAIRA_CONTEXT_MAX_FILE_CONTENT_BYTES", 100_000),
      maxEvidenceCount: envInt("KAIRA_CONTEXT_MAX_EVIDENCE_COUNT", 20),
      maxRecentChanges: envInt("KAIRA_CONTEXT_MAX_RECENT_CHANGES", 10),
      maxStdoutBytes: envInt("KAIRA_CONTEXT_MAX_STDOUT_BYTES", 10_000),
      maxStderrBytes: envInt("KAIRA_CONTEXT_MAX_STDERR_BYTES", 10_000),
      maxHistoryEntries: envInt("KAIRA_CONTEXT_MAX_HISTORY_ENTRIES", 20),
      maxRelevantFiles: envInt("KAIRA_CONTEXT_MAX_RELEVANT_FILES", 10),
    },
    project: {
      maxTasks: envInt("KAIRA_MAX_PROJECT_TASKS", 30),
      maxProjectExecutionTimeMs: envInt("KAIRA_MAX_PROJECT_EXECUTION_TIME_MS", 600_000),
      checkpointInterval: envInt("KAIRA_CHECKPOINT_INTERVAL", 3),
      maxRetriesPerTask: envInt("KAIRA_MAX_RETRIES_PER_TASK", 3),
      enableGitAwareness: process.env.KAIRA_ENABLE_GIT_AWARENESS !== "false",
    },
    durable: {
      maxRuntimeMs: envInt("KAIRA_DURABLE_MAX_RUNTIME_MS", 600_000),
      maxTaskAttempts: envInt("KAIRA_DURABLE_MAX_TASK_ATTEMPTS", 30),
      maxRepairAttempts: envInt("KAIRA_DURABLE_MAX_REPAIR_ATTEMPTS", 10),
      maxExternalRequests: envInt("KAIRA_DURABLE_MAX_EXTERNAL_REQUESTS", 50),
      maxModelCalls: envInt("KAIRA_DURABLE_MAX_MODEL_CALLS", 100),
      maxConcurrentJobs: envInt("KAIRA_DURABLE_MAX_CONCURRENT_JOBS", 5),
      maxShellDurationMs: envInt("KAIRA_DURABLE_MAX_SHELL_DURATION_MS", 300_000),
      maxDownloadedBytes: envInt("KAIRA_DURABLE_MAX_DOWNLOADED_BYTES", 50 * 1024 * 1024),
      maxResearchDepth: envInt("KAIRA_DURABLE_MAX_RESEARCH_DEPTH", 5),
      maxConsecutiveFailures: envInt("KAIRA_DURABLE_MAX_CONSECUTIVE_FAILURES", 5),
      stalledThresholdMs: envInt("KAIRA_STALLED_THRESHOLD_MS", 5 * 60 * 1000),
      overdueThresholdMs: envInt("KAIRA_OVERDUE_THRESHOLD_MS", 30 * 60 * 1000),
      checkpointIntervalMs: envInt("KAIRA_CHECKPOINT_INTERVAL_MS", 30_000),
    },
    research: {
      maxSources: envInt("KAIRA_RESEARCH_MAX_SOURCES", 10),
      maxDepth: envInt("KAIRA_RESEARCH_MAX_DEPTH", 3),
      maxRequests: envInt("KAIRA_RESEARCH_MAX_REQUESTS", 20),
      maxRuntimeMs: envInt("KAIRA_RESEARCH_MAX_RUNTIME_MS", 120_000),
      maxModelCalls: envInt("KAIRA_RESEARCH_MAX_MODEL_CALLS", 20),
      defaultTimeoutMs: envInt("KAIRA_RESEARCH_TIMEOUT_MS", 15_000),
      maxResponseBytes: envInt("KAIRA_RESEARCH_MAX_RESPONSE_BYTES", 5 * 1024 * 1024),
      allowedDomains: (process.env.KAIRA_RESEARCH_ALLOWED_DOMAINS ?? "").split(",").filter(Boolean),
      blockedDomains: (process.env.KAIRA_RESEARCH_BLOCKED_DOMAINS ?? "localhost,127.0.0.1,0.0.0.0").split(",").filter(Boolean),
    },
    connectors: {
      defaultTimeoutMs: envInt("KAIRA_CONNECTOR_TIMEOUT_MS", 15_000),
      defaultRateLimitPerMinute: envInt("KAIRA_CONNECTOR_RATE_LIMIT", 30),
      circuitBreakerThreshold: envInt("KAIRA_CONNECTOR_CB_THRESHOLD", 5),
      circuitBreakerOpenMs: envInt("KAIRA_CONNECTOR_CB_OPEN_MS", 60_000),
      maxResponseBytes: envInt("KAIRA_CONNECTOR_MAX_BYTES", 5 * 1024 * 1024),
      enableWebFetch: process.env.KAIRA_ENABLE_WEB_FETCH !== "false",
      enableMockSources: process.env.KAIRA_ENABLE_MOCK_SOURCES !== "false",
    },
    autonomy: {
      defaultLevel: (process.env.KAIRA_AUTONOMY_LEVEL as any) ?? "ASSISTED",
      requireApprovalForHighRisk: process.env.KAIRA_REQUIRE_APPROVAL_HIGH_RISK !== "false",
      requireApprovalForIrreversible: process.env.KAIRA_REQUIRE_APPROVAL_IRREVERSIBLE !== "false",
    },
    memory: {
      maxMemories: envInt("KAIRA_MEMORY_MAX_MEMORIES", 10000),
      maxMemoriesPerObjective: envInt("KAIRA_MEMORY_MAX_PER_OBJECTIVE", 10),
      maxTokensPerObjective: envInt("KAIRA_MEMORY_MAX_TOKENS_PER_OBJECTIVE", 4000),
      maxCharsPerObjective: envInt("KAIRA_MEMORY_MAX_CHARS_PER_OBJECTIVE", 12000),
      minConfidence: envInt("KAIRA_MEMORY_MIN_CONFIDENCE", 30),
      enablePersistence: process.env.KAIRA_MEMORY_PERSISTENCE !== "false",
      persistencePath:
        process.env.KAIRA_MEMORY_PERSISTENCE_PATH ??
        path.join(workspaceRoot, ".kaira", "memory.json"),
      perScopeLimit: {
        TASK: envInt("KAIRA_MEMORY_PER_SCOPE_TASK", 3),
        PROJECT: envInt("KAIRA_MEMORY_PER_SCOPE_PROJECT", 5),
        WORKSPACE: envInt("KAIRA_MEMORY_PER_SCOPE_WORKSPACE", 3),
        TOOL: envInt("KAIRA_MEMORY_PER_SCOPE_TOOL", 2),
        ENVIRONMENT: envInt("KAIRA_MEMORY_PER_SCOPE_ENV", 2),
        GLOBAL: envInt("KAIRA_MEMORY_PER_SCOPE_GLOBAL", 2),
      },
      includeStale: process.env.KAIRA_MEMORY_INCLUDE_STALE === "true",
      stalenessDays: envInt("KAIRA_MEMORY_STALENESS_DAYS", 90),
    },
    permission: {
      defaultLevel: (process.env.KAIRA_PERMISSION_LEVEL as PermissionLevel) ?? PermissionLevel.WORKSPACE_WRITE,
      allowedLevels: [
        PermissionLevel.READ_ONLY,
        PermissionLevel.WORKSPACE_WRITE,
        PermissionLevel.COMMAND_EXECUTION,
        PermissionLevel.DESTRUCTIVE,
      ],
    },
    persistence: {
      type: (process.env.KAIRA_PERSISTENCE_TYPE as "json" | "sqlite") ?? "json",
      path:
        process.env.KAIRA_PERSISTENCE_PATH ??
        path.join(workspaceRoot, ".kaira", "agent_state.json"),
    },
  };
}

export const defaultConfig = loadConfig();
