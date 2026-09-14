/**
 * Observation & Evidence Types — Phase 4
 * Normalized observation per tool execution, structured evidence
 */

import { randomUUID } from "node:crypto";

export type EvidenceType =
  | "COMMAND_EXIT_CODE"
  | "STDOUT"
  | "STDERR"
  | "FILE_EXISTS"
  | "FILE_CONTENT"
  | "FILE_METADATA"
  | "FILE_CREATED"
  | "FILE_MODIFIED"
  | "FILE_DELETED"
  | "TEST_RESULT"
  | "COMMAND_RESULT"
  | "VERIFICATION_RESULT";

export type EvidenceSource = "TOOL_EXECUTION" | "FILE_SYSTEM" | "COMMAND" | "VERIFICATION" | "SYSTEM";

export interface FileMetadata {
  path: string;
  exists: boolean;
  size?: number;
  isFile?: boolean;
  isDirectory?: boolean;
  mtime?: string;
  contentHash?: string;
}

export interface Observation {
  id: string; // observationId
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
  rawResult?: unknown;
  // Size tracking
  originalStdoutBytes?: number;
  originalStderrBytes?: number;
  totalSizeBytes: number;
  truncated: boolean;
}

export interface Evidence {
  id: string;
  observationId: string;
  actionId: string;
  objectiveId: string;
  taskId: string;
  runId: string;
  source: EvidenceSource;
  type: EvidenceType;
  confidence: number; // 0-1
  timestamp: string;
  data: unknown;
  // Typed payload helpers
  filePath?: string;
  content?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  exists?: boolean;
  metadata?: FileMetadata;
  message: string;
}

export interface ObservationLimits {
  maxStdoutBytes: number;
  maxStderrBytes: number;
  maxFileContentBytes: number;
  maxMetadataEntries: number;
  maxTotalBytes: number;
  maxAffectedFiles: number;
}

export const DEFAULT_OBSERVATION_LIMITS: ObservationLimits = {
  maxStdoutBytes: 100_000, // 100KB
  maxStderrBytes: 100_000,
  maxFileContentBytes: 500_000,
  maxMetadataEntries: 100,
  maxTotalBytes: 1_000_000, // 1MB total
  maxAffectedFiles: 50,
};

export interface EvidenceChain {
  objectiveId: string;
  taskId: string;
  actionId: string;
  observation: Observation;
  evidence: Evidence[];
  verificationCheckId?: string;
  verificationResultId?: string;
  completionDecisionId?: string;
}

export function createObservationId(): string {
  return randomUUID();
}

export function createEvidenceId(): string {
  return randomUUID();
}
