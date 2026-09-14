/**
 * Observation Limits — Phase 4.1
 * Configurable limits for stdout/stderr/fileContents/metadata/total size
 * Deterministic enforcement, no LLM bypass
 */

import { ObservationLimits, DEFAULT_OBSERVATION_LIMITS } from "./types";
import { loadConfig } from "../config";

export class ObservationLimiter {
  private limits: ObservationLimits;

  constructor(limits?: Partial<ObservationLimits>) {
    const config = loadConfig();
    // Derive from safety config if not explicitly provided
    this.limits = {
      maxStdoutBytes: limits?.maxStdoutBytes ?? Math.min(DEFAULT_OBSERVATION_LIMITS.maxStdoutBytes, config.safety.maxOutputBytes),
      maxStderrBytes: limits?.maxStderrBytes ?? Math.min(DEFAULT_OBSERVATION_LIMITS.maxStderrBytes, config.safety.maxOutputBytes),
      maxFileContentBytes: limits?.maxFileContentBytes ?? Math.min(DEFAULT_OBSERVATION_LIMITS.maxFileContentBytes, config.safety.maxFileSizeBytes),
      maxMetadataEntries: limits?.maxMetadataEntries ?? DEFAULT_OBSERVATION_LIMITS.maxMetadataEntries,
      maxTotalBytes: limits?.maxTotalBytes ?? Math.min(DEFAULT_OBSERVATION_LIMITS.maxTotalBytes, config.safety.maxOutputBytes * 2),
      maxAffectedFiles: limits?.maxAffectedFiles ?? DEFAULT_OBSERVATION_LIMITS.maxAffectedFiles,
    };
  }

  getLimits(): ObservationLimits {
    return { ...this.limits };
  }

  updateLimits(patch: Partial<ObservationLimits>) {
    this.limits = { ...this.limits, ...patch };
  }

  truncateString(content: string, maxBytes: number): { truncated: string; wasTruncated: boolean; originalBytes: number } {
    const originalBytes = Buffer.byteLength(content, "utf8");
    if (originalBytes <= maxBytes) {
      return { truncated: content, wasTruncated: false, originalBytes };
    }
    // Handle very small limits safely
    const safeMax = Math.max(0, maxBytes - 100);
    const ratio = safeMax > 0 ? safeMax / originalBytes : 0;
    const approxChars = Math.max(0, Math.floor(content.length * ratio * 0.9));
    let truncated = content.slice(0, approxChars);
    // Ensure byte length within safeMax, with iteration limit to prevent infinite loop
    let iterations = 0;
    while (Buffer.byteLength(truncated, "utf8") > safeMax && truncated.length > 0 && iterations < 20) {
      truncated = truncated.slice(0, Math.floor(truncated.length * 0.9));
      iterations++;
    }
    if (truncated.length === 0 && maxBytes > 50) {
      truncated = content.slice(0, Math.min(50, content.length));
    }
    truncated += `\n...[truncated ${originalBytes - Buffer.byteLength(truncated, "utf8")} bytes]...`;
    return { truncated, wasTruncated: true, originalBytes };
  }

  enforceStdoutLimit(stdout: string): { content: string; truncated: boolean; originalBytes: number } {
    const res = this.truncateString(stdout, this.limits.maxStdoutBytes);
    return { content: res.truncated, truncated: res.wasTruncated, originalBytes: res.originalBytes };
  }

  enforceStderrLimit(stderr: string): { content: string; truncated: boolean; originalBytes: number } {
    const res = this.truncateString(stderr, this.limits.maxStderrBytes);
    return { content: res.truncated, truncated: res.wasTruncated, originalBytes: res.originalBytes };
  }

  enforceFileContentLimit(content: string): { content: string; truncated: boolean; originalBytes: number } {
    const res = this.truncateString(content, this.limits.maxFileContentBytes);
    return { content: res.truncated, truncated: res.wasTruncated, originalBytes: res.originalBytes };
  }

  enforceTotalLimit(observation: { stdout?: string; stderr?: string; outputCombined?: string; fileMetadata?: unknown[] }): boolean {
    let total = 0;
    if (observation.stdout) total += Buffer.byteLength(observation.stdout, "utf8");
    if (observation.stderr) total += Buffer.byteLength(observation.stderr, "utf8");
    if (observation.outputCombined) total += Buffer.byteLength(observation.outputCombined, "utf8");
    return total <= this.limits.maxTotalBytes;
  }

  enforceAffectedFilesLimit(files: string[]): { files: string[]; truncated: boolean } {
    if (files.length <= this.limits.maxAffectedFiles) {
      return { files, truncated: false };
    }
    return { files: files.slice(0, this.limits.maxAffectedFiles), truncated: true };
  }

  enforceMetadataLimit(metadata: any[]): { metadata: any[]; truncated: boolean } {
    if (metadata.length <= this.limits.maxMetadataEntries) {
      return { metadata, truncated: false };
    }
    return { metadata: metadata.slice(0, this.limits.maxMetadataEntries), truncated: true };
  }
}

export const globalObservationLimiter = new ObservationLimiter();
