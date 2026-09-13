/**
 * Requirements Extractor — Phase 6
 * Converts natural-language objective into structured requirements
 * Uses heuristic + LLM (qwen3:8b) via router, deterministic fallback
 */

import { Requirement, createRequirement, RequirementCategory, RequirementPriority, RequirementSource } from "./types";
import { ModelRouter, globalRouter } from "../model/router";
import { AgentLogger, globalLogger } from "../core/logger";
import type { ChatMessage } from "../model/types";

export class RequirementsExtractor {
  private router: ModelRouter;
  private logger: AgentLogger;

  constructor(router: ModelRouter = globalRouter, logger: AgentLogger = globalLogger) {
    this.router = router;
    this.logger = logger;
  }

  async extract(objectiveText: string, objectiveId: string, projectId: string): Promise<Requirement[]> {
    // Try LLM first if available, otherwise heuristic
    if (this.router.getConfig().providerKind !== "scripted") {
      try {
        const llmReqs = await this.extractViaLLM(objectiveText, objectiveId, projectId);
        if (llmReqs.length > 0) {
          this.logger.info("requirements_extracted", `Extracted ${llmReqs.length} requirements via LLM`, { objectiveId });
          return llmReqs;
        }
      } catch (err) {
        this.logger.log("WARN", "requirements_llm_failed", `LLM extraction failed: ${(err as Error).message}`, { objectiveId });
      }
    }
    return this.extractHeuristic(objectiveText, objectiveId, projectId);
  }

  private async extractViaLLM(objectiveText: string, objectiveId: string, projectId: string): Promise<Requirement[]> {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a requirements analyst. Extract structured requirements from a software objective.

Categories: FUNCTIONAL (what system does), TECHNICAL (language, runtime, CLI), QUALITY (tested, verified, executable), CONSTRAINT (limits), DELIVERABLE (files expected)

For objective: "${objectiveText}"

Respond with JSON only:
{
  "requirements": [
    {
      "description": "addition support",
      "category": "FUNCTIONAL",
      "priority": "CRITICAL",
      "source": "USER_PROVIDED",
      "acceptance": [{"description": "2+3 produces 5", "expected": "5", "verificationMethod": "COMMAND_OUTPUT"}]
    }
  ]
}

Do not invent unnecessary requirements. Distinguish user-provided vs inferred. Keep descriptions concise.`,
      },
      { role: "user", content: `Extract requirements for: ${objectiveText}` },
    ];

    const result = await this.router.reasoning(messages, { temperature: 0.2, maxTokens: 1500 });
    const jsonMatch = result.content.match(/\{[\s\S]*"requirements"[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.requirements || !Array.isArray(parsed.requirements)) return [];

    const reqs: Requirement[] = [];
    for (const r of parsed.requirements) {
      if (!r.description) continue;
      const category = (r.category as RequirementCategory) ?? "FUNCTIONAL";
      const priority = (r.priority as RequirementPriority) ?? "MEDIUM";
      const source = (r.source as RequirementSource) ?? "USER_PROVIDED";
      reqs.push(
        createRequirement({
          objectiveId,
          projectId,
          description: r.description,
          category,
          priority,
          source,
          acceptanceCriteria: (r.acceptance ?? []).map((ac: any) => ({
            description: ac.description ?? r.description,
            expected: ac.expected ?? "",
            verificationMethod: ac.verificationMethod ?? "COMMAND_OUTPUT",
          })),
          inferredFrom: r.inferredFrom,
        })
      );
    }
    return reqs;
  }

  extractHeuristic(objectiveText: string, objectiveId: string, projectId: string): Requirement[] {
    const lower = objectiveText.toLowerCase();
    const reqs: Requirement[] = [];

    // Functional requirements detection
    const functionalKeywords: Array<{ keywords: string[]; desc: string; ac: string; expected: string }> = [
      { keywords: ["addition", "add", "sum", "plus"], desc: "Calculator supports addition", ac: "2 + 3 produces 5", expected: "5" },
      { keywords: ["subtraction", "subtract", "minus"], desc: "Calculator supports subtraction", ac: "5 - 3 produces 2", expected: "2" },
      { keywords: ["multiplication", "multiply", "times"], desc: "Calculator supports multiplication", ac: "2 * 3 produces 6", expected: "6" },
      { keywords: ["division", "divide"], desc: "Calculator supports division", ac: "6 / 3 produces 2", expected: "2" },
      { keywords: ["print 12", "prints 12", "output is 12", "produces 12"], desc: "Program prints 12", ac: "Program output contains 12", expected: "12" },
      { keywords: ["cli", "command-line", "command line"], desc: "CLI interface", ac: "CLI executable", expected: "executable" },
      { keywords: ["test", "tested"], desc: "Automated tests", ac: "Tests pass", expected: "pass" },
    ];

    for (const fk of functionalKeywords) {
      if (fk.keywords.some((k) => lower.includes(k))) {
        const isUserProvided = lower.includes(fk.keywords[0]);
        reqs.push(
          createRequirement({
            objectiveId,
            projectId,
            description: fk.desc,
            category: fk.desc.includes("CLI") ? "TECHNICAL" : fk.desc.includes("test") ? "QUALITY" : "FUNCTIONAL",
            priority: fk.desc.includes("addition") || fk.desc.includes("12") ? "CRITICAL" : "HIGH",
            source: isUserProvided ? "USER_PROVIDED" : "INFERRED",
            acceptanceCriteria: [
              {
                description: fk.ac,
                expected: fk.expected,
                verificationMethod: fk.desc.includes("test") ? "TEST_PASS" : fk.desc.includes("CLI") ? "COMMAND_OUTPUT" : "COMMAND_OUTPUT",
              },
            ],
          })
        );
      }
    }

    // Technical requirements
    if (lower.includes("python")) {
      reqs.push(
        createRequirement({
          objectiveId,
          projectId,
          description: "Python implementation",
          category: "TECHNICAL",
          priority: "CRITICAL",
          source: "USER_PROVIDED",
          acceptanceCriteria: [{ description: "Python file exists", expected: "main.py", verificationMethod: "FILE_EXISTS" }],
        })
      );
    }
    if (lower.includes("node") || lower.includes("typescript") || lower.includes("javascript")) {
      reqs.push(
        createRequirement({
          objectiveId,
          projectId,
          description: "Node/TypeScript implementation",
          category: "TECHNICAL",
          priority: "CRITICAL",
          source: "USER_PROVIDED",
          acceptanceCriteria: [{ description: "Package.json exists", expected: "package.json", verificationMethod: "FILE_EXISTS" }],
        })
      );
    }

    // Quality requirements — inferred
    if (!reqs.some((r) => r.description.includes("tested")) && (lower.includes("calculator") || lower.includes("python"))) {
      // Infer testing if objective mentions verify or is non-trivial
      if (lower.includes("verify") || lower.includes("test") || lower.includes("calculator")) {
        reqs.push(
          createRequirement({
            objectiveId,
            projectId,
            description: "Executable and verified",
            category: "QUALITY",
            priority: "HIGH",
            source: "INFERRED",
            inferredFrom: "Objective mentions verification or is non-trivial",
            acceptanceCriteria: [
              { description: "Program executes successfully", expected: "exit 0", verificationMethod: "COMMAND_OUTPUT" },
            ],
          })
        );
      }
    }

    // Deliverable requirements
    const fileMatches = [...objectiveText.matchAll(/([a-zA-Z0-9_\-./]+\.(?:py|js|ts|txt|md|json))/gi)];
    const files = [...new Set(fileMatches.map((m) => m[1]))].filter((f) => f.length < 100);
    for (const file of files.slice(0, 5)) {
      if (!reqs.some((r) => r.description.includes(file))) {
        reqs.push(
          createRequirement({
            objectiveId,
            projectId,
            description: `Deliverable file ${file}`,
            category: "DELIVERABLE",
            priority: "HIGH",
            source: "USER_PROVIDED",
            acceptanceCriteria: [{ description: `File ${file} exists`, expected: file, verificationMethod: "FILE_EXISTS" }],
          })
        );
      }
    }

    // Ensure at least one requirement
    if (reqs.length === 0) {
      reqs.push(
        createRequirement({
          objectiveId,
          projectId,
          description: objectiveText.slice(0, 200),
          category: "FUNCTIONAL",
          priority: "CRITICAL",
          source: "USER_PROVIDED",
          acceptanceCriteria: [{ description: "Objective completed", expected: "completed", verificationMethod: "MANUAL" }],
        })
      );
    }

    this.logger.info("requirements_extracted_heuristic", `Heuristic extracted ${reqs.length} requirements`, { objectiveId });
    return reqs;
  }
}

export const globalRequirementsExtractor = new RequirementsExtractor();
