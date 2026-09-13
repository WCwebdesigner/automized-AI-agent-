/**
 * Adapter between new engineering tool registry and old tool interface
 * Ensures existing engine.ts continues to work with new tools
 */

import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types";
import { globalToolRegistry, ToolDefinition } from "./registry";
import { PermissionLevel } from "../core/constants";
import { loadConfig } from "../config";

function toOldTool(newTool: ToolDefinition): Tool {
  return {
    name: newTool.name,
    category: mapCategory(newTool.name),
    description: newTool.description,
    schema: newTool.inputSchema as any,
    parameters: newTool.jsonSchema as any,
    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const config = loadConfig();
      const result = await globalToolRegistry.execute(newTool.name, input, {
        workspaceRoot: ctx.workspaceRoot,
        permissionLevel: PermissionLevel.DESTRUCTIVE,
        runId: ctx.runId ?? undefined,
      });

      return {
        ok: result.status === "SUCCESS",
        output: result.output,
        data: result.data ?? {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          affectedFiles: result.affectedFiles,
        },
      };
    },
  } as Tool;
}

function mapCategory(name: string): Tool["category"] {
  if (name.includes("file") || name.includes("directory") || name.includes("fs_") || name.includes("inspect")) return "fs";
  if (name.includes("run_") || name.includes("shell") || name.includes("python") || name.includes("command") || name.includes("test") || name.includes("linter") || name.includes("typecheck")) return "exec";
  if (name.includes("http") || name.includes("fetch")) return "web";
  return "memory";
}

// Import to ensure registration
import "./engineering";

export function getAdaptedTools(): Tool[] {
  return globalToolRegistry.list().map(toOldTool);
}

export function getAdaptedTool(name: string): Tool | undefined {
  const def = globalToolRegistry.get(name);
  if (!def) return undefined;
  return toOldTool(def);
}
