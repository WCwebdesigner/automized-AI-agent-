import { z } from "zod";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult } from "../registry";

export const getWorkingDirectoryTool: ToolDefinition<{}> = {
  name: "get_working_directory",
  description: "Get the current workspace root directory. Returns absolute path. Windows compatible.",
  inputSchema: z.object({}),
  jsonSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 5_000,
  async handler(_input, ctx) {
    const start = Date.now();
    return makeResult({
      tool: "get_working_directory",
      input: {},
      status: ToolResultStatus.SUCCESS,
      output: `Workspace root: ${ctx.workspaceRoot}`,
      executionTimeMs: Date.now() - start,
      data: { workspaceRoot: ctx.workspaceRoot },
    });
  },
};
