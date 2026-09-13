import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const moveFileTool: ToolDefinition<{ from: string; to: string }> = {
  name: "move_file",
  description: "Move or rename a file/directory inside the workspace. Windows compatible.",
  inputSchema: z.object({
    from: z.string().min(1).describe("Source workspace-relative path"),
    to: z.string().min(1).describe("Destination workspace-relative path"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Source path" },
      to: { type: "string", description: "Destination path" },
    },
    required: ["from", "to"],
  },
  permissionLevel: PermissionLevel.WORKSPACE_WRITE,
  timeoutMs: 10_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const absFrom = safeResolve(ctx.workspaceRoot, input.from);
      const absTo = safeResolve(ctx.workspaceRoot, input.to);
      await fs.mkdir(path.dirname(absTo), { recursive: true });
      await fs.rename(absFrom, absTo);
      return makeResult({
        tool: "move_file",
        input,
        status: ToolResultStatus.SUCCESS,
        output: `Moved ${input.from} → ${input.to}`,
        executionTimeMs: Date.now() - start,
        affectedFiles: [input.from, input.to],
      });
    } catch (err) {
      return makeResult({
        tool: "move_file",
        input,
        status: ToolResultStatus.FAILURE,
        output: `move_file failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
