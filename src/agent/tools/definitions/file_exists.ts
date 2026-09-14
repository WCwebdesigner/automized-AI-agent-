import { z } from "zod";
import fs from "node:fs/promises";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const fileExistsTool: ToolDefinition<{ path: string }> = {
  name: "file_exists",
  description: "Check whether a file or directory exists inside the workspace. Returns existence and type. Windows compatible.",
  inputSchema: z.object({
    path: z.string().min(1).describe("Workspace-relative path"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative path" },
    },
    required: ["path"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 5_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const abs = safeResolve(ctx.workspaceRoot, input.path);
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) {
        return makeResult({
          tool: "file_exists",
          input,
          status: ToolResultStatus.SUCCESS,
          output: `Path does not exist: ${input.path}`,
          executionTimeMs: Date.now() - start,
          data: { exists: false, path: input.path },
        });
      }
      const type = stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
      return makeResult({
        tool: "file_exists",
        input,
        status: ToolResultStatus.SUCCESS,
        output: `Path exists: ${input.path} (${type}, ${stat.size} bytes)`,
        executionTimeMs: Date.now() - start,
        data: { exists: true, type, size: stat.size, path: input.path },
      });
    } catch (err) {
      return makeResult({
        tool: "file_exists",
        input,
        status: ToolResultStatus.FAILURE,
        output: `file_exists failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
