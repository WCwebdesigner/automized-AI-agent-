import { z } from "zod";
import fs from "node:fs/promises";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const createDirectoryTool: ToolDefinition<{ path: string }> = {
  name: "create_directory",
  description: "Create a directory inside the workspace. Creates parent directories as needed. Windows compatible.",
  inputSchema: z.object({
    path: z.string().min(1).describe("Workspace-relative directory path"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative directory path" },
    },
    required: ["path"],
  },
  permissionLevel: PermissionLevel.WORKSPACE_WRITE,
  timeoutMs: 10_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const abs = safeResolve(ctx.workspaceRoot, input.path);
      await fs.mkdir(abs, { recursive: true });
      return makeResult({
        tool: "create_directory",
        input,
        status: ToolResultStatus.SUCCESS,
        output: `Created directory ${input.path}`,
        executionTimeMs: Date.now() - start,
        affectedFiles: [input.path],
      });
    } catch (err) {
      return makeResult({
        tool: "create_directory",
        input,
        status: ToolResultStatus.FAILURE,
        output: `create_directory failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
