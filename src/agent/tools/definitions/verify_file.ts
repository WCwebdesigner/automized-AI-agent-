import { z } from "zod";
import fs from "node:fs/promises";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const verifyFileTool: ToolDefinition<{
  path: string;
  shouldExist?: boolean;
  contains?: string;
  minSize?: number;
}> = {
  name: "verify_file",
  description: "Verify file existence, content, size. Used for objective verification. Windows compatible.",
  inputSchema: z.object({
    path: z.string().min(1),
    shouldExist: z.boolean().optional().default(true),
    contains: z.string().optional().describe("Expected substring in file"),
    minSize: z.number().int().min(0).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      shouldExist: { type: "boolean" },
      contains: { type: "string" },
      minSize: { type: "number" },
    },
    required: ["path"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 10_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const abs = safeResolve(ctx.workspaceRoot, input.path);
      const shouldExist = input.shouldExist ?? true;

      const stat = await fs.stat(abs).catch(() => null);
      const exists = !!stat;

      if (shouldExist && !exists) {
        return makeResult({
          tool: "verify_file",
          input,
          status: ToolResultStatus.FAILURE,
          output: `Verification FAILED: file ${input.path} should exist but does not`,
          executionTimeMs: Date.now() - start,
          data: { exists: false, passed: false },
        });
      }

      if (!shouldExist && exists) {
        return makeResult({
          tool: "verify_file",
          input,
          status: ToolResultStatus.FAILURE,
          output: `Verification FAILED: file ${input.path} should NOT exist but does`,
          executionTimeMs: Date.now() - start,
          data: { exists: true, passed: false },
        });
      }

      if (!shouldExist && !exists) {
        return makeResult({
          tool: "verify_file",
          input,
          status: ToolResultStatus.SUCCESS,
          output: `Verification PASSED: file ${input.path} correctly does not exist`,
          executionTimeMs: Date.now() - start,
          data: { exists: false, passed: true },
        });
      }

      // File exists and should exist — check additional criteria
      const checks: Array<{ name: string; passed: boolean; details: string }> = [];
      checks.push({ name: "exists", passed: true, details: `File exists: ${input.path}` });

      if (input.minSize !== undefined) {
        const sizeOk = (stat!.size ?? 0) >= input.minSize;
        checks.push({
          name: "minSize",
          passed: sizeOk,
          details: `Size ${stat!.size} >= ${input.minSize}: ${sizeOk ? "PASS" : "FAIL"}`,
        });
        if (!sizeOk) {
          return makeResult({
            tool: "verify_file",
            input,
            status: ToolResultStatus.FAILURE,
            output: `Verification FAILED: file ${input.path} size ${stat!.size} < min ${input.minSize}`,
            executionTimeMs: Date.now() - start,
            data: { passed: false, checks },
          });
        }
      }

      if (input.contains) {
        const content = await fs.readFile(abs, "utf8").catch(() => "");
        const containsOk = content.includes(input.contains);
        checks.push({
          name: "contains",
          passed: containsOk,
          details: `File ${containsOk ? "contains" : "does NOT contain"}: "${input.contains.slice(0, 100)}"`,
        });
        if (!containsOk) {
          return makeResult({
            tool: "verify_file",
            input,
            status: ToolResultStatus.FAILURE,
            output: `Verification FAILED: file ${input.path} does not contain expected text "${input.contains.slice(0, 200)}"`,
            executionTimeMs: Date.now() - start,
            data: { passed: false, checks },
          });
        }
      }

      return makeResult({
        tool: "verify_file",
        input,
        status: ToolResultStatus.SUCCESS,
        output: `Verification PASSED: ${input.path} exists and meets criteria (${checks.map((c) => c.name).join(", ")})`,
        executionTimeMs: Date.now() - start,
        data: { passed: true, checks, size: stat!.size },
      });
    } catch (err) {
      return makeResult({
        tool: "verify_file",
        input,
        status: ToolResultStatus.FAILURE,
        output: `verify_file failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
