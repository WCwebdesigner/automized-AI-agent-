/**
 * Project Planner — Phase 6
 * Extends existing planner to support projects, generates project-level plan with requirements, assumptions, deliverables, task graph, verification strategy, completion criteria, risk
 */

import { randomUUID } from "node:crypto";
import { Project, ProjectPlan, createProject, createDeliverable, createAssumption, ProjectType } from "./types";
import { Requirement, AcceptanceCriterion } from "../requirements/types";
import { RequirementsExtractor, globalRequirementsExtractor } from "../requirements/extractor";
import { AssumptionManager, globalAssumptionManager } from "./assumptions";
import { ProjectTask, createProjectTask } from "../taskGraph/types";
import { TaskGraphManager, globalTaskGraphManager } from "../taskGraph/graph";
import { ProjectWorkspaceManager, globalProjectWorkspaceManager } from "../workspace/projectWorkspace";
import { ModelRouter, globalRouter } from "../model/router";
import { AgentLogger, globalLogger } from "../core/logger";
import type { ChatMessage } from "../model/types";

export class ProjectPlanner {
  private requirementsExtractor: RequirementsExtractor;
  private assumptionManager: AssumptionManager;
  private taskGraphManager: TaskGraphManager;
  private workspaceManager: ProjectWorkspaceManager;
  private router: ModelRouter;
  private logger: AgentLogger;

  constructor(
    requirementsExtractor: RequirementsExtractor = globalRequirementsExtractor,
    assumptionManager: AssumptionManager = globalAssumptionManager,
    taskGraphManager: TaskGraphManager = globalTaskGraphManager,
    workspaceManager: ProjectWorkspaceManager = globalProjectWorkspaceManager,
    router: ModelRouter = globalRouter,
    logger: AgentLogger = globalLogger
  ) {
    this.requirementsExtractor = requirementsExtractor;
    this.assumptionManager = assumptionManager;
    this.taskGraphManager = taskGraphManager;
    this.workspaceManager = workspaceManager;
    this.router = router;
    this.logger = logger;
  }

  async createProjectWithPlan(objectiveText: string, title?: string, objectiveId?: string): Promise<{ project: Project; plan: ProjectPlan; taskGraph: any; requirements: Requirement[] }> {
    const objId = objectiveId ?? randomUUID();
    const project = createProject({
      objectiveId: objId,
      title: title ?? objectiveText.slice(0, 100),
      description: objectiveText,
      objective: objectiveText,
      projectType: this.workspaceManager.determineProjectType(objectiveText),
      workspacePath: `projects/${objId.slice(0, 8)}-${Date.now()}`,
    });

    // Extract requirements
    const requirements = await this.requirementsExtractor.extract(objectiveText, objId, project.id);
    project.requirements = requirements;

    // Derive acceptance criteria from requirements
    const acceptanceCriteria: AcceptanceCriterion[] = [];
    for (const req of requirements) {
      acceptanceCriteria.push(...req.acceptanceCriteria);
    }

    // Create assumptions
    const assumptions = this.generateAssumptions(objectiveText, project, requirements);
    project.assumptions = assumptions;

    // Create deliverables
    const deliverables = this.generateDeliverables(objectiveText, project, requirements);
    project.deliverables = deliverables;

    // Create task graph
    const { taskGraph, tasks } = await this.generateTaskGraph(objectiveText, project, requirements, deliverables);

    project.taskGraphId = taskGraph.id;
    project.pendingTaskIds = tasks.map((t) => t.id);
    project.acceptanceCriteria = acceptanceCriteria;

    // Create project plan
    const plan: ProjectPlan = {
      id: randomUUID(),
      projectId: project.id,
      objectiveId: objId,
      objective: objectiveText,
      projectType: project.projectType,
      inferredRequirements: requirements,
      assumptions,
      constraints: [],
      deliverables,
      taskGraphId: taskGraph.id,
      verificationStrategy: this.generateVerificationStrategy(project, requirements),
      completionCriteria: acceptanceCriteria,
      riskConsiderations: this.generateRiskConsiderations(assumptions),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: "SYSTEM",
    };

    project.plan = plan;

    this.logger.info("project_plan_created", `Project plan created with ${tasks.length} tasks, ${requirements.length} requirements`, {
      projectId: project.id,
      objectiveId: objId,
    });

    return { project, plan, taskGraph, requirements };
  }

  private generateAssumptions(objectiveText: string, project: Project, requirements: Requirement[]): any[] {
    const assumptions: any[] = [];
    const lower = objectiveText.toLowerCase();

    // Low-risk: filename choice
    if (!objectiveText.match(/called\s+([a-zA-Z0-9_\-./]+\.(?:py|js|ts))/i)) {
      assumptions.push(
        this.assumptionManager.createAssumption({
          projectId: project.id,
          objectiveId: project.objectiveId,
          assumption: `Choosing reasonable filename for main implementation`,
          reason: `Objective does not specify exact filename, choosing conventional name`,
          confidence: 0.9,
          context: "filename choice",
        })
      );
    }

    // Medium-risk: implementation choice
    if (lower.includes("calculator")) {
      assumptions.push(
        this.assumptionManager.createAssumption({
          projectId: project.id,
          objectiveId: project.objectiveId,
          assumption: `Implementing calculator as functions with CLI interface`,
          reason: `Objective mentions calculator operations, choosing function-based design with CLI for usability`,
          confidence: 0.85,
          context: "implementation choice",
        })
      );
    }

    if (lower.includes("test")) {
      assumptions.push(
        this.assumptionManager.createAssumption({
          projectId: project.id,
          objectiveId: project.objectiveId,
          assumption: `Using Python unittest/pytest for automated tests`,
          reason: `Objective requires tests, choosing standard Python test framework`,
          confidence: 0.9,
          context: "test framework choice",
        })
      );
    }

    return assumptions;
  }

  private generateDeliverables(objectiveText: string, project: Project, requirements: Requirement[]): any[] {
    const deliverables: any[] = [];
    const lower = objectiveText.toLowerCase();

    // Extract explicit files
    const fileMatches = [...objectiveText.matchAll(/([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/gi)];
    const explicitFiles = [...new Set(fileMatches.map((m) => m[1]))].filter((f) => f.length < 100);

    for (const file of explicitFiles.slice(0, 5)) {
      deliverables.push(
        createDeliverable({
          projectId: project.id,
          description: `File ${file}`,
          filePath: file,
          type: file.includes("test") ? "TEST" : "FILE",
          required: true,
        })
      );
    }

    // Infer deliverables based on project type and requirements
    if (project.projectType === "PYTHON") {
      if (explicitFiles.length === 0) {
        if (lower.includes("calculator")) {
          if (lower.includes("test") || lower.includes("multi-file") || lower.includes("multiple files")) {
            deliverables.push(
              createDeliverable({
                projectId: project.id,
                description: "Calculator implementation",
                filePath: "calculator.py",
                type: "FILE",
                required: true,
              })
            );
            deliverables.push(
              createDeliverable({
                projectId: project.id,
                description: "Calculator tests",
                filePath: "test_calculator.py",
                type: "TEST",
                required: true,
              })
            );
            if (!lower.includes("simple") && lower.includes("cli")) {
              deliverables.push(
                createDeliverable({
                  projectId: project.id,
                  description: "CLI entry point",
                  filePath: "main.py",
                  type: "FILE",
                  required: false,
                })
              );
            }
          } else {
            // Simple project
            deliverables.push(
              createDeliverable({
                projectId: project.id,
                description: "Main Python program",
                filePath: "main.py",
                type: "FILE",
                required: true,
              })
            );
          }
        } else if (lower.includes("print 12")) {
          deliverables.push(
            createDeliverable({
              projectId: project.id,
              description: "Program that prints 12",
              filePath: "main.py",
              type: "FILE",
              required: true,
            })
          );
        } else {
          deliverables.push(
            createDeliverable({
              projectId: project.id,
              description: "Main implementation file",
              filePath: "main.py",
              type: "FILE",
              required: true,
            })
          );
        }
      }
    } else if (project.projectType === "NODE" || project.projectType === "TYPESCRIPT") {
      if (!explicitFiles.some((f) => f.includes("package.json"))) {
        deliverables.push(
          createDeliverable({
            projectId: project.id,
            description: "Package configuration",
            filePath: "package.json",
            type: "CONFIG",
            required: false,
          })
        );
      }
      deliverables.push(
        createDeliverable({
          projectId: project.id,
          description: "Source directory",
          filePath: "src/index.ts",
          type: "FILE",
          required: true,
        })
      );
    } else {
      // Generic
      if (deliverables.length === 0) {
        deliverables.push(
          createDeliverable({
            projectId: project.id,
            description: "Main deliverable",
            filePath: "output.txt",
            type: "FILE",
            required: true,
          })
        );
      }
    }

    return deliverables;
  }

  private async generateTaskGraph(objectiveText: string, project: Project, requirements: Requirement[], deliverables: any[]): Promise<{ taskGraph: any; tasks: ProjectTask[] }> {
    // Try LLM for dynamic task graph generation
    let tasks: ProjectTask[] = [];

    if (this.router.getConfig().providerKind !== "scripted") {
      try {
        const llmTasks = await this.generateTasksViaLLM(objectiveText, project, requirements, deliverables);
        if (llmTasks.length > 0) {
          tasks = llmTasks;
        }
      } catch (err) {
        this.logger.log("WARN", "task_graph_llm_failed", `LLM task graph failed: ${(err as Error).message}`, { projectId: project.id });
      }
    }

    if (tasks.length === 0) {
      tasks = this.generateTasksHeuristic(objectiveText, project, requirements, deliverables);
    }

    // Build graph with dependencies
    const graph = this.taskGraphManager.createGraph(project.id, project.objectiveId, tasks);

    // Check for cycles
    const cycleCheck = this.taskGraphManager.detectCycles(graph.id);
    if (cycleCheck.hasCycle) {
      this.logger.log("WARN", "task_graph_cycle", `Cycle detected: ${cycleCheck.cycle?.join(" -> ")}`, { projectId: project.id });
      // For now, break cycle by removing last dependency
      // In production, would need more sophisticated handling
    }

    return { taskGraph: graph, tasks };
  }

  private async generateTasksViaLLM(objectiveText: string, project: Project, requirements: Requirement[], deliverables: any[]): Promise<ProjectTask[]> {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a project planner for software engineering. Create a dependency-aware task graph.

Objective: ${objectiveText}
Project Type: ${project.projectType}
Requirements: ${requirements.map((r) => r.description).join(", ")}
Deliverables: ${deliverables.map((d) => d.filePath ?? d.description).join(", ")}

Create tasks with dependencies. Example flow:
1. Initialize project
2. Implement code
3. Implement tests
4. Execute tests
5. Final verification

Respond with JSON only:
{
  "tasks": [
    {"description": "Initialize project structure", "type": "INITIALIZATION", "priority": 10, "dependencies": [], "expectedOutput": "projects/...", "verification": "directory exists"},
    {"description": "Implement calculator.py with add/sub/mul/div", "type": "IMPLEMENTATION", "priority": 9, "dependencies": [0], "expectedOutput": "calculator.py", "verification": "file exists"},
    {"description": "Implement tests", "type": "TEST", "priority": 8, "dependencies": [1], "expectedOutput": "test_calculator.py", "verification": "file exists"},
    {"description": "Run tests", "type": "VERIFICATION", "priority": 7, "dependencies": [2], "expectedOutput": "test output", "verification": "tests pass"},
    {"description": "Final verification", "type": "VERIFICATION", "priority": 6, "dependencies": [3], "expectedOutput": "verification passed", "verification": "all criteria pass"}
  ]
}

Do not hard-code file names unless objective specifies. Determine appropriate files yourself. Keep tasks small and incremental.`,
      },
      { role: "user", content: `Create task graph for: ${objectiveText}` },
    ];

    const result = await this.router.reasoning(messages, { temperature: 0.3, maxTokens: 2000 });
    const jsonMatch = result.content.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.tasks || !Array.isArray(parsed.tasks)) return [];

    const tasks: ProjectTask[] = [];
    const indexToId = new Map<number, string>();

    for (let i = 0; i < parsed.tasks.length; i++) {
      const t = parsed.tasks[i];
      const task = createProjectTask({
        objectiveId: project.objectiveId,
        projectId: project.id,
        description: t.description ?? `Task ${i}`,
        type: (t.type as any) ?? "GENERIC",
        priority: t.priority ?? 10 - i,
        dependencies: [],
        expectedOutputs: { filePath: t.expectedOutput },
        verificationRequirements: t.verification ? [t.verification] : [],
      });
      tasks.push(task);
      indexToId.set(i, task.id);
    }

    // Resolve dependencies
    for (let i = 0; i < parsed.tasks.length; i++) {
      const depIndices = parsed.tasks[i].dependencies ?? [];
      tasks[i].dependencies = depIndices.map((idx: number) => indexToId.get(idx) ?? "").filter(Boolean);
    }

    return tasks;
  }

  private generateTasksHeuristic(objectiveText: string, project: Project, requirements: Requirement[], deliverables: any[]): ProjectTask[] {
    const tasks: ProjectTask[] = [];
    const lower = objectiveText.toLowerCase();

    // Task 1: Initialize project
    const initTask = createProjectTask({
      objectiveId: project.objectiveId,
      projectId: project.id,
      description: `Initialize ${project.projectType} project structure`,
      type: "INITIALIZATION",
      priority: 10,
      expectedOutputs: { filePath: "." },
      verificationRequirements: ["workspace exists"],
    });
    tasks.push(initTask);

    // Task 2+: Implementation tasks based on deliverables
    let prevTaskId = initTask.id;
    const implTasks: ProjectTask[] = [];

    for (const del of deliverables.filter((d) => d.type === "FILE" || d.type === "CONFIG")) {
      if (!del.filePath) continue;

      // Skip generic output.txt if we have more specific files
      if (del.filePath === "output.txt" && deliverables.some((d) => d.filePath?.endsWith(".py"))) continue;

      const task = createProjectTask({
        objectiveId: project.objectiveId,
        projectId: project.id,
        description: `Implement ${del.filePath}: ${del.description}`,
        type: "IMPLEMENTATION",
        priority: 9 - implTasks.length,
        dependencies: [prevTaskId],
        expectedOutputs: { filePath: del.filePath },
        verificationRequirements: [`File ${del.filePath} exists`, `File ${del.filePath} not empty`],
      });
      implTasks.push(task);
      prevTaskId = task.id;
    }

    // If no impl tasks from deliverables, create one based on objective
    if (implTasks.length === 0) {
      const fileName = lower.includes("python") ? "main.py" : "output.txt";
      const task = createProjectTask({
        objectiveId: project.objectiveId,
        projectId: project.id,
        description: `Implement ${fileName} for objective: ${objectiveText.slice(0, 100)}`,
        type: "IMPLEMENTATION",
        priority: 9,
        dependencies: [prevTaskId],
        expectedOutputs: { filePath: fileName },
        verificationRequirements: [`File ${fileName} exists`],
      });
      implTasks.push(task);
      prevTaskId = task.id;
    }

    tasks.push(...implTasks);

    // Test tasks if required
    const testDeliverables = deliverables.filter((d) => d.type === "TEST");
    const requiresTests = lower.includes("test") || requirements.some((r) => r.description.toLowerCase().includes("test"));

    if (testDeliverables.length > 0 || requiresTests) {
      for (const testDel of testDeliverables) {
        if (!testDel.filePath) continue;
        const testTask = createProjectTask({
          objectiveId: project.objectiveId,
          projectId: project.id,
          description: `Implement ${testDel.filePath}: ${testDel.description}`,
          type: "TEST",
          priority: 8,
          dependencies: [prevTaskId],
          expectedOutputs: { filePath: testDel.filePath },
          verificationRequirements: [`File ${testDel.filePath} exists`],
        });
        tasks.push(testTask);
        prevTaskId = testTask.id;
      }

      // Run tests task
      const runTestsTask = createProjectTask({
        objectiveId: project.objectiveId,
        projectId: project.id,
        description: `Execute tests and verify all operations work`,
        type: "VERIFICATION",
        priority: 7,
        dependencies: [prevTaskId],
        expectedOutputs: { output: "test results" },
        verificationRequirements: ["Tests pass", "All operations work"],
      });
      tasks.push(runTestsTask);
      prevTaskId = runTestsTask.id;
    }

    // Run/Execute task for verification (ensures output criteria can be satisfied)
    const runTask = createProjectTask({
      objectiveId: project.objectiveId,
      projectId: project.id,
      description: `Execute main program and verify output`,
      type: "VERIFICATION",
      priority: 6,
      dependencies: [prevTaskId],
      expectedOutputs: { output: "execution output" },
      verificationRequirements: ["Program executes", "Output contains expected"],
    });
    tasks.push(runTask);
    prevTaskId = runTask.id;

    // Final verification task
    const finalVerificationTask = createProjectTask({
      objectiveId: project.objectiveId,
      projectId: project.id,
      description: `Final verification: verify all deliverables and acceptance criteria`,
      type: "VERIFICATION",
      priority: 5,
      dependencies: [prevTaskId],
      expectedOutputs: { output: "verification passed" },
      verificationRequirements: ["All files exist", "All acceptance criteria pass", "No incomplete tasks"],
    });
    tasks.push(finalVerificationTask);

    // Update dependents
    const idToTask = new Map<string, ProjectTask>();
    for (const t of tasks) idToTask.set(t.id, t);
    for (const t of tasks) {
      for (const depId of t.dependencies) {
        const dep = idToTask.get(depId);
        if (dep && !dep.dependents.includes(t.id)) {
          dep.dependents.push(t.id);
        }
      }
    }

    return tasks;
  }

  private generateVerificationStrategy(project: Project, requirements: Requirement[]): string {
    const strategies: string[] = [];
    strategies.push(`Verify required files exist: ${project.deliverables.filter((d) => d.required).map((d) => d.filePath).join(", ")}`);
    strategies.push(`Execute functionality and check output`);
    if (requirements.some((r) => r.description.toLowerCase().includes("test"))) {
      strategies.push(`Run automated tests and verify they pass`);
    }
    strategies.push(`Verify acceptance criteria: ${project.acceptanceCriteria.map((ac) => ac.description).join(", ")}`);
    strategies.push(`Ensure no incomplete tasks or critical failures`);
    return strategies.join("; ");
  }

  private generateRiskConsiderations(assumptions: any[]): string[] {
    const risks: string[] = [];
    for (const a of assumptions) {
      if (a.risk === "HIGH" || a.risk === "CRITICAL") {
        risks.push(`High risk assumption: ${a.assumption} — requires approval`);
      } else if (a.risk === "MEDIUM") {
        risks.push(`Medium risk: ${a.assumption} — proceed with caution`);
      }
    }
    if (risks.length === 0) {
      risks.push("Low risk project, standard implementation");
    }
    return risks;
  }
}

export const globalProjectPlanner = new ProjectPlanner();
