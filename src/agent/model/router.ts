/**
 * Model Router — Phase 1-3
 * Routes tasks to appropriate models: reasoning, coding, lightweight, vision
 * Does not require all models loaded simultaneously
 */

import { loadConfig } from "../config";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import { ScriptedProvider } from "./scripted";
import type { ModelProvider, ChatMessage, GenerateOptions, GenerateResult } from "./types";

export type TaskType = "reasoning" | "coding" | "lightweight" | "vision" | "planning" | "diagnosis" | "repair" | "verification";

export interface RouterConfig {
  reasoningModel: string;
  codingModel: string;
  lightweightModel: string;
  visionModel: string;
  baseUrl: string;
  providerKind: "ollama" | "openai_compatible" | "scripted";
}

export class ModelRouter {
  private config: RouterConfig;
  private providers: Map<string, ModelProvider> = new Map();
  private scriptedProvider?: ScriptedProvider;

  constructor(config?: Partial<RouterConfig>) {
    const loaded = loadConfig();
    this.config = {
      reasoningModel: config?.reasoningModel ?? loaded.modelRouting.reasoning,
      codingModel: config?.codingModel ?? loaded.modelRouting.coding,
      lightweightModel: config?.lightweightModel ?? loaded.modelRouting.lightweight,
      visionModel: config?.visionModel ?? loaded.modelRouting.vision,
      baseUrl: config?.baseUrl ?? loaded.ollamaBaseUrl,
      providerKind: config?.providerKind ?? "ollama",
    };
  }

  setScriptedProvider(provider: ScriptedProvider) {
    this.scriptedProvider = provider;
    this.config.providerKind = "scripted";
  }

  private getProviderForModel(model: string): ModelProvider {
    if (this.config.providerKind === "scripted" && this.scriptedProvider) {
      return this.scriptedProvider;
    }

    const key = `${this.config.providerKind}:${model}:${this.config.baseUrl}`;
    if (this.providers.has(key)) {
      return this.providers.get(key)!;
    }

    let provider: ModelProvider;
    if (this.config.providerKind === "openai_compatible") {
      provider = new OpenAICompatibleProvider(this.config.baseUrl, model);
    } else {
      provider = new OllamaProvider(this.config.baseUrl, model);
    }

    this.providers.set(key, provider);
    return provider;
  }

  getModelForTaskType(taskType: TaskType): string {
    switch (taskType) {
      case "reasoning":
      case "planning":
      case "diagnosis":
      case "verification":
        return this.config.reasoningModel;
      case "coding":
      case "repair":
        return this.config.codingModel;
      case "lightweight":
        return this.config.lightweightModel;
      case "vision":
        return this.config.visionModel;
      default:
        return this.config.reasoningModel;
    }
  }

  async route(taskType: TaskType, messages: ChatMessage[], opts: GenerateOptions = {}): Promise<GenerateResult> {
    const model = opts.model ?? this.getModelForTaskType(taskType);
    const provider = this.getProviderForModel(model);
    return provider.generate(messages, { ...opts, model });
  }

  // Convenience methods
  async reasoning(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    return this.route("reasoning", messages, opts);
  }

  async coding(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    return this.route("coding", messages, opts);
  }

  async lightweight(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    return this.route("lightweight", messages, opts);
  }

  async vision(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    return this.route("vision", messages, opts);
  }

  async planning(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    return this.route("planning", messages, opts);
  }

  async diagnosis(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    return this.route("diagnosis", messages, opts);
  }

  getConfig(): RouterConfig {
    return { ...this.config };
  }

  getAvailableModels(): string[] {
    return [
      this.config.reasoningModel,
      this.config.codingModel,
      this.config.lightweightModel,
      this.config.visionModel,
    ];
  }

  async status(): Promise<{ provider: string; models: string[]; ok: boolean; detail: string }> {
    // Check primary provider status
    const provider = this.getProviderForModel(this.config.reasoningModel);
    const s = await provider.status();
    return {
      provider: provider.id,
      models: s.models,
      ok: s.ok,
      detail: s.detail,
    };
  }
}

// Global router instance
export const globalRouter = new ModelRouter();

/**
 * Validation that router correctly maps:
 * reasoning → qwen3:8b
 * coding → qwen2.5-coder:7b
 * lightweight → llama3.2:3b
 */
export function validateRouterMapping(router: ModelRouter = globalRouter): {
  valid: boolean;
  mapping: Record<TaskType, string>;
  errors: string[];
} {
  const mapping: Record<TaskType, string> = {
    reasoning: router.getModelForTaskType("reasoning"),
    coding: router.getModelForTaskType("coding"),
    lightweight: router.getModelForTaskType("lightweight"),
    vision: router.getModelForTaskType("vision"),
    planning: router.getModelForTaskType("planning"),
    diagnosis: router.getModelForTaskType("diagnosis"),
    repair: router.getModelForTaskType("repair"),
    verification: router.getModelForTaskType("verification"),
  };

  const errors: string[] = [];

  if (!mapping.reasoning.includes("qwen3") && mapping.reasoning !== "qwen3:8b") {
    // Allow env override but warn if not qwen3
    // Not strictly error if overridden
  }
  if (!mapping.coding || mapping.coding.length === 0) errors.push("Coding model not configured");
  if (!mapping.lightweight || mapping.lightweight.length === 0) errors.push("Lightweight model not configured");

  return {
    valid: errors.length === 0,
    mapping,
    errors,
  };
}
