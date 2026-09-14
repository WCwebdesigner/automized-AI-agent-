import type { Tool, ToolContext, ToolResult, ToolSpec } from "./types";
import { specOf } from "./types";
import { fsList, fsRead, fsSearch, fsWrite } from "./fs";
import { shellExec } from "./shell";
import { httpFetch } from "./http";
import { memorySave, memorySearch } from "./memory";
import { getAdaptedTools, getAdaptedTool } from "./adapter";
import "./engineering"; // Ensure engineering tools registered
import { globalToolRegistry } from "./registry";

/**
 * Tool registry — the single place capabilities are added to Kaira.
 * New capabilities = new Tool implementation + one line here. The engine,
 * the tool-bench UI and the prompt builder all read from this registry.
 * Phase 3: includes both legacy tools and new engineering tools.
 */

const registry = new Map<string, Tool>();

function register(tool: Tool): void {
  registry.set(tool.name, tool as Tool);
}

// Legacy tools (keep for backward compatibility)
register(fsWrite);
register(fsRead);
register(fsList);
register(fsSearch);
register(shellExec);
register(httpFetch);
register(memorySave);
register(memorySearch);

// Register adapted engineering tools (new registry → old interface)
// This ensures old engine can use new tools like list_directory, read_file, etc.
for (const adapted of getAdaptedTools()) {
  if (!registry.has(adapted.name)) {
    registry.set(adapted.name, adapted);
  }
}

export function listTools(): Tool[] {
  return [...registry.values()];
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name) ?? getAdaptedTool(name);
}

export function toolSpecs(): ToolSpec[] {
  return listTools().map(specOf);
}

/** Compact, readable capability list injected into model prompts. */
export function toolsPromptSection(): string {
  // Use new registry's prompt section for richer info, fallback to old
  try {
    const engSection = globalToolRegistry.getPromptSection();
    if (engSection && engSection.length > 100) {
      return engSection;
    }
  } catch {}
  return listTools()
    .map((t) => {
      const props = (t.parameters as { properties?: Record<string, { type?: string; description?: string }> })
        .properties ?? {};
      const required = new Set(
        ((t.parameters as { required?: string[] }).required ?? []) as string[],
      );
      const args = Object.entries(props)
        .map(([k, v]) => `${k}${required.has(k) ? "" : "?"}: ${v.type ?? "any"}`)
        .join(", ");
      return `- ${t.name}({ ${args} }): ${t.description}`;
    })
    .join("\n");
}

/**
 * Validate input against the tool's zod schema and execute it.
 * Never throws — failures become ToolResult{ok:false} so the agent can
 * observe and recover from its own mistakes.
 */
export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = registry.get(name) ?? getAdaptedTool(name);
  if (!tool) {
    // Try new registry directly
    const { PermissionLevel } = await import("../core/constants");
    const newResult = await globalToolRegistry.execute(name, rawInput, {
      workspaceRoot: ctx.workspaceRoot,
      permissionLevel: PermissionLevel.DESTRUCTIVE,
      runId: ctx.runId ?? undefined,
    });
    return {
      ok: newResult.status === "SUCCESS",
      output: newResult.output,
      data: newResult.data ?? {
        stdout: newResult.stdout,
        stderr: newResult.stderr,
        exitCode: newResult.exitCode,
      },
    };
  }
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      output: `Invalid input for ${name}: ${issues}. Check the tool's parameter schema and retry.`,
    };
  }
  try {
    return await tool.execute(parsed.data, ctx);
  } catch (err) {
    return {
      ok: false,
      output: `${name} threw an error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Export new registry for Phase 3 usage
export { globalToolRegistry } from "./registry";
export { getEngineeringRegistry, registerEngineeringTools } from "./engineering";
