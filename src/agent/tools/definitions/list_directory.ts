import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const listDirectoryTool: ToolDefinition<{ path?: string; recursive?: boolean }> = {
  name: "list_directory",
  description: "List files and directories in the workspace. Use to see what already exists before creating or modifying files. Windows compatible.",
  inputSchema: z.object({
    path: z.string().optional().describe("Workspace-relative directory (default: root)"),
    recursive: z.boolean().optional().describe("Recurse into subdirectories"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative directory (default: root)" },
      recursive: { type: "boolean", description: "Recurse into subdirectories" },
    },
    required: [],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 10_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const abs = safeResolve(ctx.workspaceRoot, input.path ?? ".");
      const entries: Array<{ path: string; type: "file" | "dir"; size: number }> = [];
      const maxDepth = input.recursive ? 5 : 1;
      const skip = new Set(["node_modules", ".git", ".next", "dist", "build", ".kaira"]);

      const walk = async (dir: string, depth: number) => {
        if (entries.length >= 500) return;
        let items;
        try {
          items = await fs.readdir(dir, { withFileTypes: true });
        } catch (e) {
          throw new Error(`Cannot read directory ${dir}: ${(e as Error).message}`);
        }
        for (const item of items) {
          if (entries.length >= 500) break;
          if (skip.has(item.name)) continue;
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            entries.push({ path: path.relative(ctx.workspaceRoot, full) || ".", type: "dir", size: 0 });
            if (depth < maxDepth) await walk(full, depth + 1);
          } else {
            const stat = await fs.stat(full).catch(() => null);
            entries.push({
              path: path.relative(ctx.workspaceRoot, full),
              type: "file",
              size: stat?.size ?? 0,
            });
          }
        }
      };

      await walk(abs, 1);
      const listing = entries.map((e) => `${e.type === "dir" ? "dir " : "file"}\t${e.size}\t${e.path}`).join("\n");
      const output = listing ? `${entries.length} entries:\n${listing}` : "Directory is empty.";

      return makeResult({
        tool: "list_directory",
        input,
        status: ToolResultStatus.SUCCESS,
        output,
        executionTimeMs: Date.now() - start,
        data: { entries },
      });
    } catch (err) {
      return makeResult({
        tool: "list_directory",
        input,
        status: ToolResultStatus.FAILURE,
        output: `list_directory failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
