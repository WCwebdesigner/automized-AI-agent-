/**
 * Environment Detection — Phase 6
 * Determines installed runtimes, package managers, available commands, project tools
 * Reuses existing tooling-detection, does not assume runtime exists
 */

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";
import { AgentLogger, globalLogger } from "../core/logger";

export interface RuntimeInfo {
  name: string;
  version?: string;
  available: boolean;
  path?: string;
}

export interface EnvironmentInfo {
  runtimes: RuntimeInfo[];
  packageManagers: RuntimeInfo[];
  commands: Record<string, boolean>;
  projectTools: string[];
  workspacePath: string;
}

export class EnvironmentDetector {
  private config = loadConfig();
  private logger: AgentLogger;

  constructor(logger: AgentLogger = globalLogger) {
    this.logger = logger;
  }

  async detect(projectWorkspacePath?: string): Promise<EnvironmentInfo> {
    const workspacePath = projectWorkspacePath ? path.resolve(this.config.workspaceRoot, projectWorkspacePath) : this.config.workspaceRoot;

    const runtimes: RuntimeInfo[] = [];
    const packageManagers: RuntimeInfo[] = [];

    // Detect Python
    runtimes.push(this.checkCommand("python3", "python3 --version"));
    runtimes.push(this.checkCommand("python", "python --version"));
    
    // Detect Node
    runtimes.push(this.checkCommand("node", "node --version"));
    runtimes.push(this.checkCommand("npm", "npm --version"));
    runtimes.push(this.checkCommand("npx", "npx --version"));
    
    // Detect other tools
    const commandsToCheck = ["pip", "pip3", "pytest", "tsc", "eslint", "git"];
    const commands: Record<string, boolean> = {};
    for (const cmd of commandsToCheck) {
      const info = this.checkCommand(cmd, `${cmd} --version`);
      commands[cmd] = info.available;
      if (cmd === "pip" || cmd === "pip3" || cmd === "npm" || cmd === "npx") {
        packageManagers.push(info);
      }
    }

    // Project tools based on files
    const projectTools: string[] = [];
    try {
      if (fs.existsSync(workspacePath)) {
        const files = fs.readdirSync(workspacePath);
        if (files.includes("package.json")) projectTools.push("npm");
        if (files.includes("requirements.txt") || files.some((f) => f.endsWith(".py"))) projectTools.push("pip");
        if (files.includes("pyproject.toml")) projectTools.push("pip");
      }
    } catch {}

    const env: EnvironmentInfo = {
      runtimes: runtimes.filter((r) => r.available),
      packageManagers: packageManagers.filter((r) => r.available),
      commands,
      projectTools,
      workspacePath,
    };

    this.logger.info("environment_detected", `Detected runtimes: ${env.runtimes.map((r) => r.name).join(", ")}`, {
      workspacePath,
    });

    return env;
  }

  private checkCommand(name: string, versionCmd: string): RuntimeInfo {
    try {
      const result = spawnSync(versionCmd, { shell: true, encoding: "utf8", timeout: 5000 });
      const available = result.status === 0;
      const version = available ? (result.stdout || result.stderr || "").trim().slice(0, 100) : undefined;
      return { name, version, available };
    } catch {
      return { name, available: false };
    }
  }

  isRuntimeAvailable(runtime: string): boolean {
    try {
      const result = spawnSync(`${runtime} --version`, { shell: true, encoding: "utf8", timeout: 3000 });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  // Check if tooling can be installed safely — for Phase 6, we escalate if missing and required
  canInstallSafely(tool: string): { can: boolean; reason: string } {
    // For now, we do NOT auto-install outside permissions, we escalate
    // This preserves security
    return { can: false, reason: `Auto-install of ${tool} requires explicit permission, escalate` };
  }
}

export const globalEnvironmentDetector = new EnvironmentDetector();
