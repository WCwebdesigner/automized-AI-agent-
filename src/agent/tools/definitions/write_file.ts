import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const writeFileTool: ToolDefinition<{ path: string; content: string }> = {
  name: "write_file",
  description: "Write text to a file inside the workspace. Creates parent directories and overwrites existing content. Use for creating source code, documents, notes. Windows compatible.",
  inputSchema: z.object({
    path: z.string().min(1).describe("Workspace-relative file path"),
    content: z.string().describe("Full file content to write"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative file path" },
      content: { type: "string", description: "Full file content to write" },
    },
    required: ["path", "content"],
  },
  permissionLevel: PermissionLevel.WORKSPACE_WRITE,
  timeoutMs: 15_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      if (Buffer.byteLength(input.content, "utf8") > ctx.config.safety.maxFileSizeBytes) {
        return makeResult({
          tool: "write_file",
          input: { path: input.path, content: `[${input.content.length} chars]` },
          status: ToolResultStatus.FAILURE,
          output: `Content too large: exceeds ${ctx.config.safety.maxFileSizeBytes} bytes`,
          executionTimeMs: Date.now() - start,
          error: "Content too large",
        });
      }
      const abs = safeResolve(ctx.workspaceRoot, input.path);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, input.content, "utf8");
      return makeResult({
        tool: "write_file",
        input: { path: input.path, content: `[${input.content.length} chars]` },
        status: ToolResultStatus.SUCCESS,
        output: `Wrote ${Buffer.byteLength(input.content, "utf8")} bytes to ${input.path}`,
        executionTimeMs: Date.now() - start,
        affectedFiles: [input.path],
        data: { path: input.path, bytes: Buffer.byteLength(input.content, "utf8") },
      });
    } catch (err) {
      return makeResult({
        tool: "write_file",
        input: { path: input.path, content: `[${input.content.length} chars]` },
        status: ToolResultStatus.FAILURE,
        output: `write_file failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
