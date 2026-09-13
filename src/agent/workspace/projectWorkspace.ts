/**
 * Project Workspace Management — Phase 6
 * Creates project workspace inside authorized workspace: workspace/projects/<project-id>/
 * Determines appropriate structure based on objective
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";
import { ProjectType } from "../project/types";
import { AgentLogger, globalLogger } from "../core/logger";

export interface WorkspaceCreationResult {
  path: string;
  absPath: string;
  created: boolean;
  success: boolean;
}

export class ProjectWorkspaceManager {
  private baseConfig = loadConfig();
  private config: ReturnType<typeof loadConfig>;
  private logger: AgentLogger;

  constructor(workspaceRootOrLogger?: string | AgentLogger, logger?: AgentLogger) {
    this.baseConfig = loadConfig();
    if (typeof workspaceRootOrLogger === "string") {
      this.config = { ...this.baseConfig, workspaceRoot: workspaceRootOrLogger };
      this.logger = logger ?? globalLogger;
    } else {
      this.config = this.baseConfig;
      this.logger = (workspaceRootOrLogger as AgentLogger) ?? globalLogger;
    }
  }

  determineProjectType(objectiveText: string): ProjectType {
    const lower = objectiveText.toLowerCase();
    if (lower.includes("python") && (lower.includes("node") || lower.includes("typescript") || lower.includes("javascript"))) {
      return "MIXED";
    }
    if (lower.includes("python") || lower.includes(".py")) return "PYTHON";
    if (lower.includes("typescript") || lower.includes(".ts") || lower.includes("tsx")) return "TYPESCRIPT";
    if (lower.includes("node") || lower.includes("javascript") || lower.includes(".js") || lower.includes("npm") || lower.includes("package.json")) return "NODE";
    return "GENERIC";
  }

  getProjectRoot(projectWorkspacePath: string): string {
    return path.resolve(this.config.workspaceRoot, projectWorkspacePath);
  }

  ensureProjectWorkspace(projectWorkspacePath: string): WorkspaceCreationResult {
    const abs = this.getProjectRoot(projectWorkspacePath);
    const normalizedRoot = path.resolve(this.config.workspaceRoot);
    const normalizedAbs = path.resolve(abs);
    if (!normalizedAbs.startsWith(normalizedRoot)) {
      throw new Error(`Project workspace escapes authorized workspace: ${projectWorkspacePath}`);
    }

    const existed = fs.existsSync(abs);
    fs.mkdirSync(abs, { recursive: true });
    try {
      this.logger.info("project_workspace_created", `Project workspace created at ${abs}`, { workspacePath: projectWorkspacePath } as any);
    } catch {}
    return { path: projectWorkspacePath, absPath: abs, created: !existed, success: true } as any;
  }

  initializeStructure(projectWorkspacePath: string, projectType: ProjectType, objectiveText?: string): { success: boolean; created: string[] } {
    const result = this.ensureProjectWorkspace(projectWorkspacePath);
    const root = (result as any).absPath ?? this.getProjectRoot(projectWorkspacePath);
    const created: string[] = [];
    const lower = (objectiveText ?? "").toLowerCase();

    if (projectType === "PYTHON") {
      const dirs = ["source", "tests"];
      if (lower.includes("calculator") && (lower.includes("multi-file") || lower.includes("multiple files") || lower.includes("with tests") || lower.includes("automated tests"))) {
        for (const dir of dirs) {
          const dirPath = path.join(root, dir);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            created.push(path.join(projectWorkspacePath, dir));
          }
        }
      } else {
        if (lower.includes("test")) {
          const testsPath = path.join(root, "tests");
          if (!fs.existsSync(testsPath)) {
            fs.mkdirSync(testsPath, { recursive: true });
            created.push(path.join(projectWorkspacePath, "tests"));
          }
        }
      }
    } else if (projectType === "NODE" || projectType === "TYPESCRIPT") {
      const dirs = ["src", "tests"];
      for (const dir of dirs) {
        const dirPath = path.join(root, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          created.push(path.join(projectWorkspacePath, dir));
        }
      }
    } else {
      if (lower.includes("source") || lower.includes("src")) {
        const srcPath = path.join(root, "src");
        if (!fs.existsSync(srcPath)) {
          fs.mkdirSync(srcPath, { recursive: true });
          created.push(path.join(projectWorkspacePath, "src"));
        }
      }
      if (lower.includes("test")) {
        const testsPath = path.join(root, "tests");
        if (!fs.existsSync(testsPath)) {
          fs.mkdirSync(testsPath, { recursive: true });
          created.push(path.join(projectWorkspacePath, "tests"));
        }
      }
    }

    try {
      this.logger.info("project_structure_initialized", `Initialized ${projectType} structure with ${created.length} dirs`, {
        projectType,
        workspacePath: projectWorkspacePath,
      } as any);
    } catch {}

    return { success: true, created };
  }

  listProjectFiles(projectWorkspacePath: string): string[] {
    const root = this.getProjectRoot(projectWorkspacePath);
    if (!fs.existsSync(root)) return [];

    const files: string[] = [];
    const walk = (dir: string, base: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = path.join(base, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".kaira") continue;
            walk(full, rel);
          } else {
            files.push(rel);
          }
        }
      } catch {}
    };
    walk(root, "");
    return files;
  }

  getFileContent(projectWorkspacePath: string, filePath: string, maxBytes = 100000): string | null {
    const root = this.getProjectRoot(projectWorkspacePath);
    const abs = path.resolve(root, filePath);
    const normalizedRoot = path.resolve(root);
    if (!path.resolve(abs).startsWith(normalizedRoot)) {
      throw new Error(`File path escapes project workspace: ${filePath}`);
    }
    if (!fs.existsSync(abs)) return null;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile()) return null;
      if (stat.size > maxBytes) {
        return fs.readFileSync(abs, "utf8").slice(0, maxBytes) + `\n...[truncated]`;
      }
      return fs.readFileSync(abs, "utf8");
    } catch {
      return null;
    }
  }

  fileExists(projectWorkspacePath: string, filePath: string): boolean {
    const root = this.getProjectRoot(projectWorkspacePath);
    const abs = path.resolve(root, filePath);
    return fs.existsSync(abs);
  }

  getGitInfo(projectWorkspacePath: string): { isGitRepo: boolean; isRepo: boolean; branch?: string; modifiedFiles?: string[]; untrackedFiles?: string[]; recentChanges?: string } {
    const root = this.getProjectRoot(projectWorkspacePath);
    try {
      const { execSync } = require("node:child_process");
      let gitRoot = root;
      try {
        const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: root, encoding: "utf8" }).trim();
        gitRoot = repoRoot;
      } catch {
        try {
          const globalRoot = execSync("git rev-parse --show-toplevel", { cwd: this.config.workspaceRoot, encoding: "utf8" }).trim();
          gitRoot = globalRoot;
        } catch {
          return { isGitRepo: false, isRepo: false };
        }
      }

      const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();
      const modifiedFiles = execSync("git diff --name-only", { cwd: gitRoot, encoding: "utf8" }).trim().split("\n").filter(Boolean);
      const untrackedFiles = execSync("git ls-files --others --exclude-standard", { cwd: gitRoot, encoding: "utf8" }).trim().split("\n").filter(Boolean);
      let recentChanges = "";
      try {
        recentChanges = execSync("git log --oneline -5", { cwd: gitRoot, encoding: "utf8" }).trim().slice(0, 1000);
      } catch {}

      return { isGitRepo: true, isRepo: true, branch, modifiedFiles, untrackedFiles, recentChanges };
    } catch {
      return { isGitRepo: false, isRepo: false };
    }
  }
}

export const globalProjectWorkspaceManager = new ProjectWorkspaceManager();
