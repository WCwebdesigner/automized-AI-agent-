import { z } from "zod";
import * as cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PermissionLevel, ToolResultStatus } from "../../core/constants";
import { ToolDefinition, makeResult } from "../registry";

type TestType = "npm" | "pytest" | "cargo" | "go" | "custom";

function detectTestCommand(workspaceRoot: string): { command: string; type: TestType } | null {
  const pkgPath = path.join(workspaceRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.scripts?.test) return { command: "npm test", type: "npm" };
      if (fs.existsSync(path.join(workspaceRoot, "node_modules"))) return { command: "npm test", type: "npm" };
    } catch {}
  }
  if (fs.existsSync(path.join(workspaceRoot, "pytest.ini")) || fs.existsSync(path.join(workspaceRoot, "tests")) || fs.existsSync(path.join(workspaceRoot, "test"))) {
    const hasPy = fs.readdirSync(workspaceRoot).some((f) => f.startsWith("test_") && f.endsWith(".py")) || fs.existsSync(path.join(workspaceRoot, "requirements.txt"));
    if (hasPy || fs.existsSync(path.join(workspaceRoot, "tests"))) return { command: "pytest -v", type: "pytest" };
  }
  if (fs.existsSync(path.join(workspaceRoot, "Cargo.toml"))) return { command: "cargo test", type: "cargo" };
  if (fs.existsSync(path.join(workspaceRoot, "go.mod"))) return { command: "go test ./...", type: "go" };
  return null;
}

export const runTestTool: ToolDefinition<{ command?: string; target?: string; type?: "auto" | "npm" | "pytest" | "cargo" | "go" | "custom" }> = {
  name: "run_test",
  description: "Run project's test command (auto-detects npm test, pytest, cargo test, go test) or targeted test. Captures output, exit code, duration. Windows compatible.",
  inputSchema: z.object({
    command: z.string().optional(),
    target: z.string().optional(),
    type: z.enum(["auto","npm","pytest","cargo","go","custom"]).optional().default("auto"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      target: { type: "string" },
      type: { type: "string", enum: ["auto","npm","pytest","cargo","go","custom"] },
    },
    required: [],
  },
  permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  timeoutMs: 120_000,
  async handler(input, ctx) {
    const start = Date.now();
    let command: string;

    if (input.command) {
      command = input.command;
      if (input.target) command += ` ${input.target}`;
    } else {
      const detected = detectTestCommand(ctx.workspaceRoot);
      if (!detected) {
        return makeResult({
          tool: "run_test",
          input,
          status: ToolResultStatus.FAILURE,
          output: `No test command detected in workspace ${ctx.workspaceRoot}. Provide explicit command.`,
          executionTimeMs: Date.now() - start,
          error: "No test command found",
        });
      }
      command = detected.command;
      if (input.target) {
        if (detected.type === "npm") command = `npm test -- ${input.target}`;
        else if (detected.type === "pytest") command = `pytest -v ${input.target}`;
        else if (detected.type === "cargo") command = `cargo test ${input.target}`;
        else if (detected.type === "go") command = `go test -run ${input.target} ./...`;
        else command += ` ${input.target}`;
      }
    }

    return await new Promise<ReturnType<typeof makeResult>>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const isWin = process.platform === "win32";
      const shell = isWin ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh";
      const flag = isWin ? "/c" : "-c";

      const child: any = (cp.spawn as any)(shell, [flag, command], {
        cwd: ctx.workspaceRoot,
        env: { PATH: process.env.PATH ?? "", HOME: ctx.workspaceRoot, LANG: "C.UTF-8", TERM: "dumb", NODE_ENV: "test" } as any,
        timeout: ctx.config.safety.commandTimeoutMs,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGTERM"); } catch {}
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 2000);
      }, ctx.config.safety.commandTimeoutMs);

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
        resolve(makeResult({ tool: "run_test", input, status: ToolResultStatus.FAILURE, output: `Test command failed to start: ${err.message}`, executionTimeMs: Date.now() - start, error: err.message }));
      });

      child.on("close", (code: any) => {
        clearTimeout(timer);
        const duration = Date.now() - start;
        const combined = `$ ${command}\nexit=${code} · ${duration}ms\n${stdout}${stderr ? `\nstderr:\n${stderr}` : ""}`.trim();
        if (timedOut) {
          resolve(makeResult({ tool: "run_test", input, status: ToolResultStatus.TIMEOUT, output: `Test timed out after ${ctx.config.safety.commandTimeoutMs}ms\n${combined}`, stdout, stderr, executionTimeMs: duration, error: "Timeout" }));
        } else if (code === 0) {
          resolve(makeResult({ tool: "run_test", input, status: ToolResultStatus.SUCCESS, output: combined, stdout, stderr, exitCode: code, executionTimeMs: duration, data: { passed: true } }));
        } else {
          resolve(makeResult({ tool: "run_test", input, status: ToolResultStatus.FAILURE, output: combined, stdout, stderr, exitCode: code, executionTimeMs: duration, error: stderr || `Exit code ${code}`, data: { passed: false } }));
        }
      });
    });
  },
};

export const runLinterTool: ToolDefinition<{ command?: string }> = {
  name: "run_linter",
  description: "Run linter if available (npm run lint, eslint, etc). Windows compatible.",
  inputSchema: z.object({ command: z.string().optional() }),
  jsonSchema: { type: "object", properties: { command: { type: "string" } }, required: [] },
  permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  timeoutMs: 60_000,
  async handler(input, ctx) {
    const start = Date.now();
    const pkgPath = path.join(ctx.workspaceRoot, "package.json");
    let command = input.command;
    if (!command) {
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          if (pkg.scripts?.lint) command = "npm run lint";
          else if (fs.existsSync(path.join(ctx.workspaceRoot, "node_modules", ".bin", "eslint"))) command = "npx eslint .";
        } catch {}
      }
      if (!command) return makeResult({ tool: "run_linter", input, status: ToolResultStatus.FAILURE, output: "No linter detected. Provide explicit command.", executionTimeMs: Date.now() - start, error: "No linter" });
    }
    return await new Promise<ReturnType<typeof makeResult>>((resolve) => {
      let stdout = ""; let stderr = "";
      const isWin = process.platform === "win32";
      const shell = isWin ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh";
      const flag = isWin ? "/c" : "-c";
      const child: any = (cp.spawn as any)(shell, [flag, command!], { cwd: ctx.workspaceRoot, env: { PATH: process.env.PATH ?? "", HOME: ctx.workspaceRoot, LANG: "C.UTF-8" } as any, timeout: ctx.config.safety.commandTimeoutMs });
      child.stdout?.on("data", (d: any) => (stdout += d.toString()));
      child.stderr?.on("data", (d: any) => (stderr += d.toString()));
      child.on("close", (code: any) => {
        const duration = Date.now() - start;
        const combined = `$ ${command}\nexit=${code} · ${duration}ms\n${stdout}${stderr ? `\nstderr:\n${stderr}` : ""}`.trim();
        resolve(makeResult({ tool: "run_linter", input, status: code === 0 ? ToolResultStatus.SUCCESS : ToolResultStatus.FAILURE, output: combined, stdout, stderr, exitCode: code, executionTimeMs: duration }));
      });
      child.on("error", (err: any) => resolve(makeResult({ tool: "run_linter", input, status: ToolResultStatus.FAILURE, output: `Linter failed to start: ${err.message}`, executionTimeMs: Date.now() - start, error: err.message })));
    });
  },
};

export const runTypecheckTool: ToolDefinition<{ command?: string }> = {
  name: "run_typecheck",
  description: "Run type checker if available (tsc, npm run typecheck, etc). Windows compatible.",
  inputSchema: z.object({ command: z.string().optional() }),
  jsonSchema: { type: "object", properties: { command: { type: "string" } }, required: [] },
  permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  timeoutMs: 60_000,
  async handler(input, ctx) {
    const start = Date.now();
    let command = input.command;
    if (!command) {
      const pkgPath = path.join(ctx.workspaceRoot, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          if (pkg.scripts?.typecheck) command = "npm run typecheck";
          else if (pkg.scripts?.build) command = "npx tsc --noEmit";
        } catch {}
      }
      if (!command && fs.existsSync(path.join(ctx.workspaceRoot, "tsconfig.json"))) command = "npx tsc --noEmit";
      if (!command) return makeResult({ tool: "run_typecheck", input, status: ToolResultStatus.FAILURE, output: "No typecheck detected. Provide explicit command.", executionTimeMs: Date.now() - start, error: "No typecheck" });
    }
    return await new Promise<ReturnType<typeof makeResult>>((resolve) => {
      let stdout = ""; let stderr = "";
      const isWin = process.platform === "win32";
      const shell = isWin ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh";
      const flag = isWin ? "/c" : "-c";
      const child: any = (cp.spawn as any)(shell, [flag, command!], { cwd: ctx.workspaceRoot, env: { PATH: process.env.PATH ?? "", HOME: ctx.workspaceRoot, LANG: "C.UTF-8" } as any, timeout: ctx.config.safety.commandTimeoutMs });
      child.stdout?.on("data", (d: any) => (stdout += d.toString()));
      child.stderr?.on("data", (d: any) => (stderr += d.toString()));
      child.on("close", (code: any) => {
        const duration = Date.now() - start;
        const combined = `$ ${command}\nexit=${code} · ${duration}ms\n${stdout}${stderr ? `\nstderr:\n${stderr}` : ""}`.trim();
        resolve(makeResult({ tool: "run_typecheck", input, status: code === 0 ? ToolResultStatus.SUCCESS : ToolResultStatus.FAILURE, output: combined, stdout, stderr, exitCode: code, executionTimeMs: duration }));
      });
      child.on("error", (err: any) => resolve(makeResult({ tool: "run_typecheck", input, status: ToolResultStatus.FAILURE, output: `Typecheck failed to start: ${err.message}`, executionTimeMs: Date.now() - start, error: err.message })));
    });
  },
};
