import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const modifyFileTool: ToolDefinition<{
  path: string;
  oldContent?: string;
  newContent: string;
  operation?: "replace" | "append" | "prepend" | "overwrite";
}> = {
  name: "modify_file",
  description: "Modify an existing file in the workspace. Supports replace (oldContent→newContent), append, prepend, overwrite. Tracks before/after for auditing. Windows compatible.",
  inputSchema: z.object({
    path: z.string().min(1),
    oldContent: z.string().optional().describe("Content to replace (for replace operation)"),
    newContent: z.string().describe("New content"),
    operation: z.enum(["replace", "append", "prepend", "overwrite"]).optional().default("overwrite"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      oldContent: { type: "string", description: "Content to replace" },
      newContent: { type: "string", description: "New content" },
      operation: { type: "string", enum: ["replace", "append", "prepend", "overwrite"] },
    },
    required: ["path", "newContent"],
  },
  permissionLevel: PermissionLevel.WORKSPACE_WRITE,
  timeoutMs: 15_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const abs = safeResolve(ctx.workspaceRoot, input.path);
      const op = input.operation ?? "overwrite";

      let before = "";
      try {
        before = await fs.readFile(abs, "utf8");
      } catch {
        if (op !== "overwrite" && op !== "append" && op !== "prepend") {
          return makeResult({
            tool: "modify_file",
            input: { ...input, newContent: `[${input.newContent.length} chars]` },
            status: ToolResultStatus.FAILURE,
            output: `File not found for ${op}: ${input.path}`,
            executionTimeMs: Date.now() - start,
            error: "File not found",
          });
        }
      }

      let after: string;
      switch (op) {
        case "replace":
          if (!input.oldContent) {
            return makeResult({
              tool: "modify_file",
              input: { ...input, newContent: `[${input.newContent.length} chars]` },
              status: ToolResultStatus.FAILURE,
              output: `oldContent required for replace operation`,
              executionTimeMs: Date.now() - start,
              error: "Missing oldContent",
            });
          }
          if (!before.includes(input.oldContent)) {
            return makeResult({
              tool: "modify_file",
              input: { ...input, newContent: `[${input.newContent.length} chars]` },
              status: ToolResultStatus.FAILURE,
              output: `oldContent not found in file ${input.path}`,
              executionTimeMs: Date.now() - start,
              error: "oldContent not found",
            });
          }
          after = before.replace(input.oldContent, input.newContent);
          break;
        case "append":
          after = before + input.newContent;
          break;
        case "prepend":
          after = input.newContent + before;
          break;
        case "overwrite":
        default:
          after = input.newContent;
          break;
      }

      if (Buffer.byteLength(after, "utf8") > ctx.config.safety.maxFileSizeBytes) {
        return makeResult({
          tool: "modify_file",
          input: { ...input, newContent: `[${input.newContent.length} chars]` },
          status: ToolResultStatus.FAILURE,
          output: `Result too large: exceeds ${ctx.config.safety.maxFileSizeBytes} bytes`,
          executionTimeMs: Date.now() - start,
          error: "Too large",
        });
      }

      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, after, "utf8");

      return makeResult({
        tool: "modify_file",
        input: { ...input, newContent: `[${input.newContent.length} chars]`, oldContent: input.oldContent ? `[${input.oldContent.length} chars]` : undefined },
        status: ToolResultStatus.SUCCESS,
        output: `Modified ${input.path} via ${op}: ${before.length} → ${after.length} chars`,
        executionTimeMs: Date.now() - start,
        affectedFiles: [input.path],
        data: { path: input.path, operation: op, beforeLength: before.length, afterLength: after.length, before: before.slice(0, 2000), after: after.slice(0, 2000) },
      });
    } catch (err) {
      return makeResult({
        tool: "modify_file",
        input: { ...input, newContent: `[${input.newContent.length} chars]` },
        status: ToolResultStatus.FAILURE,
        output: `modify_file failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
