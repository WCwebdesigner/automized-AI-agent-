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

export interface AgentConfig {
  workspaceRoot: string;
  ollamaBaseUrl: string;
  openaiCompatibleBaseUrl?: string;
  modelRouting: ModelRoutingConfig;
  safety: SafetyConfig;
  observation: ObservationConfig;
  context: ContextConfig;
  project: ProjectConfig;
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
