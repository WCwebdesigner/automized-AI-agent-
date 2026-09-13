import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

export const inspectDirectoryTool: ToolDefinition<{ path?: string; maxDepth?: number }> = {
  name: "inspect_directory_tree",
  description: "Inspect directory tree structure recursively with file sizes and types. Useful for understanding project layout. Windows compatible.",
  inputSchema: z.object({
    path: z.string().optional(),
    maxDepth: z.number().int().min(1).max(10).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative directory" },
      maxDepth: { type: "number", description: "Max recursion depth (default 3)" },
    },
    required: [],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 15_000,
  async handler(input, ctx) {
    const start = Date.now();
    try {
      const abs = safeResolve(ctx.workspaceRoot, input.path ?? ".");
      const maxDepth = input.maxDepth ?? 3;
      const skip = new Set(["node_modules", ".git", ".next", "dist", "build", ".kaira", "__pycache__"]);
      let output = "";
      let fileCount = 0;
      let dirCount = 0;

      const walk = async (dir: string, depth: number, prefix: string) => {
        if (depth > maxDepth) return;
        if (fileCount > 500) return;
        let items;
        try {
          items = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        // Sort: dirs first, then files, alphabetical
        items.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (let i = 0; i < items.length; i++) {
          if (fileCount > 500) break;
          const item = items[i];
          if (skip.has(item.name)) continue;
          const isLast = i === items.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const full = path.join(dir, item.name);
          const rel = path.relative(ctx.workspaceRoot, full) || item.name;

          if (item.isDirectory()) {
            output += `${prefix}${connector}${item.name}/\n`;
            dirCount++;
            const newPrefix = prefix + (isLast ? "    " : "│   ");
            await walk(full, depth + 1, newPrefix);
          } else {
            const stat = await fs.stat(full).catch(() => null);
            const size = stat ? ` (${stat.size} bytes)` : "";
            output += `${prefix}${connector}${item.name}${size}\n`;
            fileCount++;
          }
        }
      };

      output += `${path.relative(ctx.workspaceRoot, abs) || "."}/\n`;
      await walk(abs, 1, "");

      return makeResult({
        tool: "inspect_directory_tree",
        input,
        status: ToolResultStatus.SUCCESS,
        output: `Directory tree for ${input.path ?? "."} (depth ${maxDepth}):\n${output}\n${dirCount} dirs, ${fileCount} files`,
        executionTimeMs: Date.now() - start,
        data: { fileCount, dirCount, tree: output },
      });
    } catch (err) {
      return makeResult({
        tool: "inspect_directory_tree",
        input,
        status: ToolResultStatus.FAILURE,
        output: `inspect_directory_tree failed: ${(err as Error).message}`,
        executionTimeMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  },
};
