import { z } from "zod";
import * as cp from "node:child_process";
import fs from "node:fs";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult, safeResolve } from "../registry";

function getPythonCommand(): string {
  if (process.platform === "win32") return "python";
  return "python3";
}

export const runPythonTool: ToolDefinition<{ path?: string; code?: string; args?: string[] }> = {
  name: "run_python",
  description: "Execute a Python program inside the workspace. Provide either path to a Python file or inline code. Uses installed Python environment. Windows compatible.",
  inputSchema: z.object({
    path: z.string().optional(),
    code: z.string().optional(),
    args: z.array(z.string()).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      code: { type: "string" },
      args: { type: "array", items: { type: "string" } },
    },
    required: [],
  },
  permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  timeoutMs: 60_000,
  async handler(input, ctx) {
    const start = Date.now();
    const workspaceRoot = ctx.workspaceRoot;
    let command: string;
    let cmdArgs: string[];

    if (input.path && input.code) {
      return makeResult({
        tool: "run_python",
        input,
        status: ToolResultStatus.FAILURE,
        output: "Provide either path or code, not both",
        executionTimeMs: Date.now() - start,
        error: "Ambiguous input",
      });
    }
    if (!input.path && !input.code) {
      return makeResult({
        tool: "run_python",
        input,
        status: ToolResultStatus.FAILURE,
        output: "Provide either path or code",
        executionTimeMs: Date.now() - start,
        error: "Missing input",
      });
    }

    if (input.path) {
      try {
        const abs = safeResolve(workspaceRoot, input.path);
        if (!fs.existsSync(abs)) {
          return makeResult({
            tool: "run_python",
            input,
            status: ToolResultStatus.FAILURE,
            output: `Python file not found: ${input.path}`,
            executionTimeMs: Date.now() - start,
            error: "File not found",
          });
        }
        command = getPythonCommand();
        cmdArgs = [abs, ...(input.args ?? [])];
      } catch (err) {
        return makeResult({
          tool: "run_python",
          input,
          status: ToolResultStatus.FAILURE,
          output: `Invalid path: ${(err as Error).message}`,
          executionTimeMs: Date.now() - start,
          error: (err as Error).message,
        });
      }
    } else {
      command = getPythonCommand();
      cmdArgs = ["-c", input.code!, ...(input.args ?? [])];
    }

    return await new Promise<ReturnType<typeof makeResult>>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const child: any = (cp.spawn as any)(command, cmdArgs, {
        cwd: workspaceRoot,
        env: {
          PATH: process.env.PATH,
          HOME: workspaceRoot,
          PYTHONUNBUFFERED: "1",
          LANG: "C.UTF-8",
        } as any,
        timeout: ctx.config.safety.commandTimeoutMs,
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGTERM"); } catch {}
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 2000);
      }, ctx.config.safety.commandTimeoutMs);

      child.stdout?.on("data", (d: any) => {
        stdout += d.toString();
        if (stdout.length > ctx.config.safety.maxOutputBytes) {
          stdout = stdout.slice(0, ctx.config.safety.maxOutputBytes) + "\n...output truncated...";
        }
      });
      child.stderr?.on("data", (d: any) => {
        stderr += d.toString();
        if (stderr.length > ctx.config.safety.maxOutputBytes) {
          stderr = stderr.slice(0, ctx.config.safety.maxOutputBytes) + "\n...output truncated...";
        }
      });

      child.on("error", (err: any) => {
        clearTimeout(timeout);
        resolve(
          makeResult({
            tool: "run_python",
            input,
            status: ToolResultStatus.FAILURE,
            output: `Failed to start Python (${command}): ${err.message}. Ensure Python is installed and in PATH.`,
            stdout,
            stderr,
            executionTimeMs: Date.now() - start,
            error: err.message,
          })
        );
      });

      child.on("close", (code: any, signal: any) => {
        clearTimeout(timeout);
        const duration = Date.now() - start;
        const combined = `$ ${command} ${cmdArgs.join(" ")}\nexit=${code ?? signal} · ${duration}ms\n${stdout ? `stdout:\n${stdout}\n` : ""}${stderr ? `stderr:\n${stderr}` : ""}`.trim();

        if (timedOut) {
          resolve(
            makeResult({
              tool: "run_python",
              input,
              status: ToolResultStatus.TIMEOUT,
              output: `Python execution timed out after ${ctx.config.safety.commandTimeoutMs}ms\n${combined}`,
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
              tool: "run_python",
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
              tool: "run_python",
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
