import { z } from "zod";
import fs from "node:fs/promises";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

const MAX_READ = 100_000;

export const readFileTool: ToolDefinition<{ path: string; offset?: number; limit?: number }> = {
  name: "read_file",
  description: "Read a text file from the workspace. Returns content truncated with notice if very large. Windows compatible.",
  inputSchema: z.object({
    path: z.string().min(1).describe("Workspace-relative file path"),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(MAX_READ).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative file path" },
      offset: { type: "number", description: "Character offset" },
      limit: { type: "number", description: "Max characters" },
    },
    required: ["path"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 10_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const abs = safeResolve(ctx.workspaceRoot, input.path);
      let raw: string;
      try {
        raw = await fs.readFile(abs, "utf8");
      } catch {
        return makeResult({
          tool: "read_file",
          input,
          status: ToolResultStatus.FAILURE,
          output: `File not found: ${input.path}`,
          executionTimeMs: Date.now() - start,
          error: "File not found",
        });
      }
      if (raw.length > ctx.config.safety.maxFileSizeBytes) {
        return makeResult({
          tool: "read_file",
          input,
          status: ToolResultStatus.FAILURE,
          output: `File too large: ${raw.length} bytes exceeds limit`,
          executionTimeMs: Date.now() - start,
          error: "File too large",
        });
      }
      const offset = input.offset ?? 0;
      const limit = input.limit ?? MAX_READ;
      const end = Math.min(raw.length, offset + limit);
      const slice = raw.slice(offset, end);
      const truncated = end < raw.length;
      const output = `--- ${input.path} (${raw.length} chars${truncated ? `, showing ${offset}-${end}` : ""}) ---\n${slice}${truncated ? "\n...truncated..." : ""}`;
      return makeResult({
        tool: "read_file",
        input,
        status: ToolResultStatus.SUCCESS,
        output,
        executionTimeMs: Date.now() - start,
        affectedFiles: [input.path],
        data: { path: input.path, size: raw.length, truncated },
      });
    } catch (err) {
      return makeResult({
        tool: "read_file",
        input,
        status: ToolResultStatus.FAILURE,
        output: `read_file failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
