/**
 * Tool Registry — Phase 1-3
 * Modular registry with permission levels, timeout, structured results
 */

import { z } from "zod";
import { PermissionLevel, ToolResultStatus } from "../core/constants";
import { loadConfig } from "../config";
import { resolveInWorkspace, ensureWorkspace, workspaceRoot, displayPath } from "../workspace";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { exec, spawn } from "node:child_process";

export interface StructuredToolResult {
  status: ToolResultStatus;
  tool: string;
  input: unknown;
  stdout?: string;
  stderr?: string;
  output: string; // combined human readable
  exitCode?: number | null;
  executionTimeMs: number;
  affectedFiles?: string[];
  error?: string;
  data?: unknown;
  timestamp: string;
}

export interface ToolDefinition<I = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  jsonSchema: Record<string, unknown>; // for prompt advertisement
  permissionLevel: PermissionLevel;
  timeoutMs: number;
  handler: (input: I, context: ToolContext) => Promise<StructuredToolResult>;
}

export interface ToolContext {
  workspaceRoot: string;
  permissionLevel: PermissionLevel;
  config: ReturnType<typeof loadConfig>;
  runId?: string;
  objectiveId?: string;
  taskId?: string;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register<I>(tool: ToolDefinition<I>) {
    this.tools.set(tool.name, tool as ToolDefinition);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  listByPermission(level: PermissionLevel): ToolDefinition[] {
    const order: PermissionLevel[] = [
      PermissionLevel.READ_ONLY,
      PermissionLevel.WORKSPACE_WRITE,
      PermissionLevel.COMMAND_EXECUTION,
      PermissionLevel.DESTRUCTIVE,
    ];
    const maxIdx = order.indexOf(level);
    return this.list().filter((t) => order.indexOf(t.permissionLevel) <= maxIdx);
  }

  async execute(
    name: string,
    rawInput: unknown,
    context: Partial<ToolContext> = {}
  ): Promise<StructuredToolResult> {
    const tool = this.tools.get(name);
    const config = loadConfig();
    const fullContext: ToolContext = {
      workspaceRoot: context.workspaceRoot ?? config.workspaceRoot,
      permissionLevel: context.permissionLevel ?? config.permission.defaultLevel,
      config,
      runId: context.runId,
      objectiveId: context.objectiveId,
      taskId: context.taskId,
    };

    if (!tool) {
      return {
        status: ToolResultStatus.FAILURE,
        tool: name,
        input: rawInput,
        output: `Unknown tool "${name}". Available: ${[...this.tools.keys()].join(", ")}`,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
        error: `Unknown tool`,
      };
    }

    // Permission check
    const order: PermissionLevel[] = [
      PermissionLevel.READ_ONLY,
      PermissionLevel.WORKSPACE_WRITE,
      PermissionLevel.COMMAND_EXECUTION,
      PermissionLevel.DESTRUCTIVE,
    ];
    const requiredIdx = order.indexOf(tool.permissionLevel);
    const providedIdx = order.indexOf(fullContext.permissionLevel);
    if (providedIdx < requiredIdx) {
      return {
        status: ToolResultStatus.PERMISSION_ERROR,
        tool: name,
        input: rawInput,
        output: `Permission denied: tool "${name}" requires ${tool.permissionLevel}, but current level is ${fullContext.permissionLevel}`,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
        error: `Permission denied`,
      };
    }

    // Special check for destructive
    if (tool.permissionLevel === PermissionLevel.DESTRUCTIVE && !config.safety.allowDestructive) {
      return {
        status: ToolResultStatus.PERMISSION_ERROR,
        tool: name,
        input: rawInput,
        output: `Destructive operation "${name}" is not allowed. Set KAIRA_ALLOW_DESTRUCTIVE=true to enable.`,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
        error: `Destructive not allowed`,
      };
    }

    // Validate input
    const parsed = tool.inputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return {
        status: ToolResultStatus.FAILURE,
        tool: name,
        input: rawInput,
        output: `Invalid input for ${name}: ${issues}`,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
        error: issues,
      };
    }

    const start = Date.now();
    try {
      const result = await Promise.race([
        tool.handler(parsed.data, fullContext),
        new Promise<StructuredToolResult>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${tool.timeoutMs}ms`)), tool.timeoutMs)
        ),
      ]);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("Timeout");
      return {
        status: isTimeout ? ToolResultStatus.TIMEOUT : ToolResultStatus.FAILURE,
        tool: name,
        input: rawInput,
        output: `${name} failed: ${msg}`,
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        error: msg,
      };
    }
  }

  getPromptSection(): string {
    return this.list()
      .map((t) => {
        const props = (t.jsonSchema as any).properties ?? {};
        const required = new Set((t.jsonSchema as any).required ?? []);
        const args = Object.entries(props)
          .map(([k, v]: any) => `${k}${required.has(k) ? "" : "?"}: ${v.type ?? "any"}`)
          .join(", ");
        return `- ${t.name}({ ${args} }): ${t.description} [perm: ${t.permissionLevel}]`;
      })
      .join("\n");
  }
}

// Singleton
export const globalToolRegistry = new ToolRegistry();

// Engineering tools are registered via explicit imports in core modules
// (agentCore, executor, recovery, etc) to avoid circular dependency issues
// Also ensure registration when this module is used directly
let engineeringRegistered = false;
export function ensureEngineeringTools() {
  if (engineeringRegistered) return;
  engineeringRegistered = true;
  try {
    // Dynamic import for ESM
    import("./engineering").catch(() => {});
  } catch {}
}

/**
 * Helper to create structured result
 */
export function makeResult(params: {
  tool: string;
  input: unknown;
  status: ToolResultStatus;
  output: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  executionTimeMs: number;
  affectedFiles?: string[];
  error?: string;
  data?: unknown;
}): StructuredToolResult {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Workspace safety helpers — prevent path traversal, absolute escapes, symlink escapes
 */
export function safeResolve(workspaceRoot: string, rel: string): string {
  // Normalize and reject traversal
  if (rel.includes("..") && (rel.includes("../") || rel === ".." || rel.startsWith("../") || rel.endsWith("/.."))) {
    // Still allow but check resolved path
  }

  // Reject absolute paths outside workspace (except we resolve them)
  const resolved = path.resolve(workspaceRoot, rel);

  // Ensure inside workspace
  if (resolved !== workspaceRoot && !resolved.startsWith(workspaceRoot + path.sep)) {
    throw new Error(`Path escapes workspace: ${rel} → ${resolved} not in ${workspaceRoot}`);
  }

  // Check symlink escape where practical (if file exists, check realpath)
  try {
    if (fsSync.existsSync(resolved)) {
      const real = fsSync.realpathSync(resolved);
      const realRoot = fsSync.realpathSync(workspaceRoot);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
        throw new Error(`Path symlink escapes workspace: ${rel} → realpath ${real}`);
      }
    } else {
      // Check parent dir realpath
      const parent = path.dirname(resolved);
      if (fsSync.existsSync(parent)) {
        const realParent = fsSync.realpathSync(parent);
        const realRoot = fsSync.realpathSync(workspaceRoot);
        if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
          throw new Error(`Parent symlink escapes workspace: ${rel}`);
        }
      }
    }
  } catch (e) {
    if ((e as Error).message.includes("escapes workspace")) throw e;
    // Ignore other errors (file doesn't exist yet)
  }

  return resolved;
}
