/**
 * Scripted Provider — deterministic provider for tests
 * Phase 1-3: supports both old and new interfaces
 */

import type { ChatMessage, GenerateResult, ModelProvider, ProviderStatus, GenerateOptions } from "./types";

export type ScriptedResponse = string | { content: string; model?: string };

export class ScriptedProvider implements ModelProvider {
  readonly id = "scripted";
  readonly label = "Scripted (deterministic test)";
  private responses: ScriptedResponse[];
  private callCount = 0;
  private modelName: string;

  constructor(responses: ScriptedResponse[] = [], modelName = "scripted-test") {
    this.responses = responses;
    this.modelName = modelName;
  }

  async status(): Promise<ProviderStatus> {
    return {
      ok: true,
      detail: "scripted provider — deterministic",
      models: [this.modelName, "qwen3:8b", "qwen2.5-coder:7b", "llama3.2:3b", "moondream:latest"],
    };
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<GenerateResult> {
    const idx = this.callCount++;
    let content: string;
    let model = opts.model ?? this.modelName;

    if (idx < this.responses.length) {
      const r = this.responses[idx];
      if (typeof r === "string") {
        content = r;
      } else {
        content = r.content;
        if (r.model) model = r.model;
      }
    } else {
      // Default fallback: try to infer from last message if it's a planning request
      const last = messages[messages.length - 1]?.content ?? "";
      const system = messages[0]?.content ?? "";
      if (system.includes("verification critic") || last.includes("Was the objective genuinely accomplished")) {
        content = JSON.stringify({ complete: true, reason: "Scripted verification passed" });
      } else if (last.includes("Write a concrete, numbered execution plan") || system.includes("PLANNING")) {
        content = `1. Inspect workspace\n2. Create required file\n3. Execute and verify\n4. Report completion`;
      } else {
        content = JSON.stringify({
          thought: "Scripted fallback — no more responses",
          final: "Task completed via scripted provider fallback",
        });
      }
    }

    await new Promise((r) => setTimeout(r, 1));

    return {
      content,
      model,
      tokensIn: Math.ceil(JSON.stringify(messages).length / 4),
      tokensOut: Math.ceil(content.length / 4),
      latencyMs: 1,
    };
  }

  addResponse(response: ScriptedResponse) {
    this.responses.push(response);
  }

  reset() {
    this.callCount = 0;
  }

  getCallCount(): number {
    return this.callCount;
  }
}

/**
 * Factory for common test scenarios
 */
export function createCalculatorTestProvider(): ScriptedProvider {
  return new ScriptedProvider([
    // Planning
    `1. Inspect workspace
2. Create calculator_test.py that calculates sum of 5 and 7 and prints 12
3. Run the program
4. Verify output is 12
5. Report completion`,

    // Step 1: create file
    JSON.stringify({
      thought: "Create calculator_test.py with code that prints 12",
      action: {
        tool: "write_file",
        input: {
          path: "calculator_test.py",
          content: "def main():\n    result = 5 + 7\n    print(result)\n\nif __name__ == \"__main__\":\n    main()\n",
        },
      },
    }),

    // Step 2: run python
    JSON.stringify({
      thought: "Run the calculator program to verify output",
      action: {
        tool: "run_python",
        input: {
          path: "calculator_test.py",
        },
      },
    }),

    // Step 3: verify file exists and output
    JSON.stringify({
      thought: "Verify file exists and output was correct",
      action: {
        tool: "file_exists",
        input: {
          path: "calculator_test.py",
        },
      },
    }),

    // Final
    JSON.stringify({
      thought: "Program executed successfully and output 12, verified",
      final: "Created calculator_test.py, executed it, verified output 12. Objective completed.",
    }),
  ]);
}

export function createFailureRecoveryProvider(): ScriptedProvider {
  return new ScriptedProvider([
    `1. Create broken Python file
2. Run it to see error
3. Diagnose error
4. Repair file
5. Rerun and verify`,

    JSON.stringify({
      thought: "Create file with intentional syntax error",
      action: {
        tool: "write_file",
        input: {
          path: "broken_test.py",
          content: "print(\"hello\"\n",
        },
      },
    }),

    JSON.stringify({
      thought: "Run broken file to get error",
      action: {
        tool: "run_python",
        input: {
          path: "broken_test.py",
        },
      },
    }),

    // After observing error, repair
    JSON.stringify({
      thought: "Fix syntax error — missing closing paren",
      action: {
        tool: "write_file",
        input: {
          path: "broken_test.py",
          content: "print(\"hello\")\nprint(12)\n",
        },
      },
    }),

    JSON.stringify({
      thought: "Rerun fixed file",
      action: {
        tool: "run_python",
        input: {
          path: "broken_test.py",
        },
      },
    }),

    JSON.stringify({
      thought: "Verified repair succeeded",
      final: "Recovered from syntax error, repaired file, verified output. Recovery successful.",
    }),
  ]);
}
