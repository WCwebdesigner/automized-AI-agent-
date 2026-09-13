import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const deleteFileTool: ToolDefinition<{ path: string; recursive?: boolean }> = {
  name: "delete_file",
  description: "Delete a file or directory inside the workspace. Use recursive for directories. Prevents accidental recursive deletion of root. Windows compatible.",
  inputSchema: z.object({
    path: z.string().min(1).describe("Workspace-relative path"),
    recursive: z.boolean().optional().describe("Delete directories recursively"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative path" },
      recursive: { type: "boolean", description: "Delete directories recursively" },
    },
    required: ["path"],
  },
  permissionLevel: PermissionLevel.WORKSPACE_WRITE,
  timeoutMs: 10_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const abs = safeResolve(ctx.workspaceRoot, input.path);

      // Prevent deletion of workspace root
      if (abs === ctx.workspaceRoot) {
        return makeResult({
          tool: "delete_file",
          input,
          status: ToolResultStatus.PERMISSION_ERROR,
          output: `Refusing to delete workspace root`,
          executionTimeMs: Date.now() - start,
          error: "Cannot delete workspace root",
        });
      }

      // Prevent accidental recursive deletion of large trees without explicit flag
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) {
        return makeResult({
          tool: "delete_file",
          input,
          status: ToolResultStatus.FAILURE,
          output: `Path does not exist: ${input.path}`,
          executionTimeMs: Date.now() - start,
          error: "Not found",
        });
      }

      if (stat.isDirectory() && !input.recursive) {
        return makeResult({
          tool: "delete_file",
          input,
          status: ToolResultStatus.FAILURE,
          output: `Path is a directory, use recursive=true to delete: ${input.path}`,
          executionTimeMs: Date.now() - start,
          error: "Directory requires recursive",
        });
      }

      if (stat.isDirectory()) {
        await fs.rm(abs, { recursive: true, force: true });
      } else {
        await fs.unlink(abs);
      }

      return makeResult({
        tool: "delete_file",
        input,
        status: ToolResultStatus.SUCCESS,
        output: `Deleted ${input.path}`,
        executionTimeMs: Date.now() - start,
        affectedFiles: [input.path],
      });
    } catch (err) {
      return makeResult({
        tool: "delete_file",
        input,
        status: ToolResultStatus.FAILURE,
        output: `delete_file failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
