import { z } from "zod";
import * as cp from "node:child_process";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult } from "../registry";

const DEFAULT_ALLOWLIST = [
  "node","npm","npx","python","python3","py","git","ls","cat","echo","pwd","grep","find","wc","head","tail","sort","uniq","mkdir","touch","cp","mv","curl","date","shasum","pytest","cargo","go","tsc","eslint",
];

function allowlist(): Set<string> {
  const env = process.env.KAIRA_SHELL_ALLOW;
  const list = env ? env.split(",") : DEFAULT_ALLOWLIST;
  return new Set(list.map((s) => s.trim()).filter(Boolean));
}

function baseBinary(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? "";
  return first.replace(/^[\"']|[\"']$/g, "").split("/").pop()?.split("\\").pop() ?? "";
}

export const runCommandTool: ToolDefinition<{ command: string; timeoutMs?: number }> = {
  name: "run_command",
  description: "Execute a shell command inside the workspace (cwd = workspace root). Allowed binaries configurable via KAIRA_SHELL_ALLOW. Captures stdout, stderr, exit code, execution time. Supports Command Prompt/PowerShell on Windows.",
  inputSchema: z.object({
    command: z.string().min(1),
    timeoutMs: z.number().int().min(1000).max(120_000).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      timeoutMs: { type: "number" },
    },
    required: ["command"],
  },
  permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  timeoutMs: 120_000,
  async handler(input, ctx) {
    const start = Date.now();
    const bin = baseBinary(input.command);
    const allowed = allowlist();

    if (process.env.KAIRA_ALLOW_ALL_COMMANDS !== "true") {
      if (!bin || !allowed.has(bin)) {
        return makeResult({
          tool: "run_command",
          input,
          status: ToolResultStatus.PERMISSION_ERROR,
          output: `Command rejected: "${bin || input.command}" is not in allowlist. Allowed: ${[...allowed].join(", ")}. Set KAIRA_ALLOW_ALL_COMMANDS=true to bypass.`,
          executionTimeMs: Date.now() - start,
          error: `Not allowed: ${bin}`,
        });
      }
    }

    const timeout = input.timeoutMs ?? ctx.config.safety.commandTimeoutMs;

    return await new Promise<ReturnType<typeof makeResult>>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const isWin = process.platform === "win32";
      const shell = isWin ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh";
      const shellFlag = isWin ? "/c" : "-c";

      const child: any = (cp.spawn as any)(shell, [shellFlag, input.command], {
        cwd: ctx.workspaceRoot,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: ctx.workspaceRoot,
          LANG: "C.UTF-8",
          TERM: "dumb",
          NODE_ENV: process.env.NODE_ENV ?? "production",
          npm_config_fund: "false",
          npm_config_audit: "false",
        } as any,
        timeout,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGTERM"); } catch {}
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 2000);
      }, timeout);

      child.stdout?.on("data", (d: any) => {
        stdout += d.toString();
        if (stdout.length > ctx.config.safety.maxOutputBytes) stdout = stdout.slice(0, ctx.config.safety.maxOutputBytes) + "\n...truncated...";
      });
      child.stderr?.on("data", (d: any) => {
        stderr += d.toString();
        if (stderr.length > ctx.config.safety.maxOutputBytes) stderr = stderr.slice(0, ctx.config.safety.maxOutputBytes) + "\n...truncated...";
      });

      child.on("error", (err: any) => {
        clearTimeout(timer);
        resolve(
          makeResult({
            tool: "run_command",
            input,
            status: ToolResultStatus.FAILURE,
            output: `Command failed to start: ${err.message}`,
            executionTimeMs: Date.now() - start,
            error: err.message,
          })
        );
      });

      child.on("close", (code: any, signal: any) => {
        clearTimeout(timer);
        const duration = Date.now() - start;
        const combined = `$ ${input.command}\nexit=${code ?? signal} · ${duration}ms\n${stdout ? `${stdout}\n` : ""}${stderr ? `stderr:\n${stderr}` : ""}`.trim();

        if (timedOut) {
          resolve(
            makeResult({
              tool: "run_command",
              input,
              status: ToolResultStatus.TIMEOUT,
              output: `Command timed out after ${timeout}ms\n${combined}`,
              stdout,
              stderr,
              exitCode: null,
              executionTimeMs: duration,
              error: "Timeout",
            })
          );
        } else if (code === 0) {
          resolve(
            makeResult({
              tool: "run_command",
              input,
              status: ToolResultStatus.SUCCESS,
              output: combined,
              stdout,
              stderr,
              exitCode: code,
              executionTimeMs: duration,
            })
          );
        } else {
          resolve(
            makeResult({
              tool: "run_command",
              input,
              status: ToolResultStatus.FAILURE,
              output: combined,
              stdout,
              stderr,
              exitCode: code,
              executionTimeMs: duration,
              error: stderr || `Exit code ${code}`,
            })
          );
        }
      });
    });
  },
};
