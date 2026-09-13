import { db } from "@/db";
import { kv } from "@/db/schema";
import { eq } from "drizzle-orm";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import { ScriptedProvider } from "./scripted";
import { ModelRouter, globalRouter, validateRouterMapping } from "./router";
import type { ModelConfig, ModelProvider, ProviderKind } from "./types";
import { loadConfig } from "../config";

export * from "./types";
export { OllamaProvider, OpenAICompatibleProvider, ScriptedProvider, ModelRouter, globalRouter, validateRouterMapping };

const SETTINGS_KEY = "kaira.settings";

export const PROVIDER_DEFAULTS: Record<
  ProviderKind,
  { baseUrl: string; label: string }
> = {
  ollama: { baseUrl: "http://localhost:11434", label: "Ollama (local)" },
  openai_compatible: {
    baseUrl: "http://localhost:1234/v1",
    label: "OpenAI-compatible endpoint",
  },
};

/** Read the persisted model configuration, merged over environment defaults. */
export async function resolveModelConfig(): Promise<ModelConfig> {
  let saved: Partial<ModelConfig> = {};
  try {
    const rows = await db.select().from(kv).where(eq(kv.key, SETTINGS_KEY));
    if (rows[0] && typeof rows[0].value === "object" && rows[0].value) {
      saved = rows[0].value as Partial<ModelConfig>;
    }
  } catch {
    // settings table not migrated yet — fall back to env defaults
  }
  const provider = (saved.provider ??
    (process.env.KAIRA_PROVIDER as ProviderKind) ??
    "ollama") as ProviderKind;

  // Support OLLAMA_BASE_URL env as well as KAIRA_MODEL_BASE_URL
  const envBaseUrl = process.env.OLLAMA_BASE_URL ?? process.env.KAIRA_MODEL_BASE_URL ?? process.env.KAIRA_OLLAMA_URL;

  return {
    provider,
    model: saved.model ?? process.env.KAIRA_MODEL ?? "",
    baseUrl:
      saved.baseUrl ??
      envBaseUrl ??
      PROVIDER_DEFAULTS[provider]?.baseUrl ??
      PROVIDER_DEFAULTS.ollama.baseUrl,
    apiKey: saved.apiKey ?? process.env.KAIRA_MODEL_API_KEY ?? undefined,
  };
}

/** Persist model configuration ( Brandon's Settings UI writes here). */
export async function saveModelConfig(cfg: ModelConfig): Promise<void> {
  const now = new Date();
  await db
    .insert(kv)
    .values({ key: SETTINGS_KEY, value: cfg, updatedAt: now })
    .onConflictDoUpdate({
      target: kv.key,
      set: { value: cfg, updatedAt: now },
    });
}

/** Instantiate the provider described by a config. */
export function getProvider(cfg: ModelConfig): ModelProvider {
  switch (cfg.provider) {
    case "openai_compatible":
      return new OpenAICompatibleProvider(cfg.baseUrl, cfg.model, cfg.apiKey);
    case "ollama":
    default:
      return new OllamaProvider(cfg.baseUrl, cfg.model);
  }
}

/** Config + live status, used by the status API and the Settings UI. */
export async function getModelStack() {
  const config = await resolveModelConfig();
  const provider = getProvider(config);
  const status = await provider.status();
  // If no explicit model is configured, auto-select the first available one
  // so a fresh Ollama install "just works" once a model is pulled.
  const effectiveModel =
    config.model || (status.ok && status.models[0]) || "";
  return {
    config: { ...config, model: effectiveModel },
    provider,
    status,
  };
}

/**
 * Get router configured for Phase 1-3 model mapping
 * reasoning → qwen3:8b
 * coding → qwen2.5-coder:7b
 * lightweight → llama3.2:3b
 * vision → moondream:latest
 */
export function getModelRouter(): ModelRouter {
  const cfg = loadConfig();
  // Check if we have env for Ollama base URL
  const baseUrl = cfg.ollamaBaseUrl;
  return new ModelRouter({
    reasoningModel: cfg.modelRouting.reasoning,
    codingModel: cfg.modelRouting.coding,
    lightweightModel: cfg.modelRouting.lightweight,
    visionModel: cfg.modelRouting.vision,
    baseUrl,
    providerKind: "ollama",
  });
}

/**
 * Test helper: get router with scripted provider for deterministic tests
 */
export function getTestRouter(responses: Array<string | { content: string; model?: string }> = []): ModelRouter {
  const router = new ModelRouter({
    reasoningModel: "qwen3:8b",
    codingModel: "qwen2.5-coder:7b",
    lightweightModel: "llama3.2:3b",
    visionModel: "moondream:latest",
    baseUrl: "http://localhost:11434",
    providerKind: "scripted",
  });
  const scripted = new ScriptedProvider(responses as any);
  router.setScriptedProvider(scripted);
  return router;
}
