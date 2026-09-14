/**
 * Project Initialization — Phase 6
 * Determines when project initialization is required, uses environment detection
 */

import fs from "node:fs";
import path from "node:path";
import { ProjectType } from "./types";
import { ProjectWorkspaceManager, globalProjectWorkspaceManager } from "../workspace/projectWorkspace";
import { EnvironmentDetector, globalEnvironmentDetector } from "./environment";
import { AgentLogger, globalLogger } from "../core/logger";

export class ProjectInitializer {
  private workspaceManager: ProjectWorkspaceManager;
  private envDetector: EnvironmentDetector;
  private logger: AgentLogger;

  constructor(
    workspaceManager: ProjectWorkspaceManager = globalProjectWorkspaceManager,
    envDetector: EnvironmentDetector = globalEnvironmentDetector,
    logger: AgentLogger = globalLogger
  ) {
    this.workspaceManager = workspaceManager;
    this.envDetector = envDetector;
    this.logger = logger;
  }

  async needsInitialization(projectWorkspacePath: string, projectType: ProjectType): Promise<boolean> {
    const root = this.workspaceManager.getProjectRoot(projectWorkspacePath);
    if (!fs.existsSync(root)) return true;

    const files = this.workspaceManager.listProjectFiles(projectWorkspacePath);
    if (files.length === 0) return true;

    // Check for language-specific init files
    if (projectType === "PYTHON") {
      // Python doesn't require special init, but check if any .py exists for non-trivial projects
      return false; // Lazy init, not required upfront
    }
    if (projectType === "NODE" || projectType === "TYPESCRIPT") {
      const hasPackageJson = files.some((f) => f.includes("package.json"));
      if (!hasPackageJson) {
        // Check if objective mentions node and we need package.json
        return false; // We'll create when needed via tasks
      }
    }

    return false;
  }

  async initialize(projectWorkspacePath: string, projectType: ProjectType, objectiveText: string): Promise<string[]> {
    const created: string[] = [];

    // Ensure workspace exists
    this.workspaceManager.ensureProjectWorkspace(projectWorkspacePath);

    // Detect environment
    const env = await this.envDetector.detect(projectWorkspacePath);

    // Initialize structure
    const structureResult = this.workspaceManager.initializeStructure(projectWorkspacePath, projectType, objectiveText);
    const structure = Array.isArray(structureResult) ? structureResult : (structureResult as any).created ?? [];
    created.push(...structure);

    // Language-specific initialization via tasks rather than hard-coded templates
    // For Python: no mandatory init
    // For Node: if package.json mentioned or required, create minimal one via task later

    this.logger.info("project_initialized", `Project initialized at ${projectWorkspacePath} type ${projectType}`, {
      projectType,
      workspacePath: projectWorkspacePath,
      env: env.runtimes,
    });

    return created;
  }
}

export const globalProjectInitializer = new ProjectInitializer();
